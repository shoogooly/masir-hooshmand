import json
from datetime import timedelta
import pytest
from app import ai_service as ai, ai_jobs
from app.book_service import inventory
from app.models import WeeklyPlan,Activity,StudyReport,utcnow
from app.db.session import SessionLocal
from test_ai import env

def make_book(m,mh,title="فیزیک خیلی سبز",count=100):
    r=m.post("/api/v1/books",headers=mh,json={"title":title,"publication_year":1405})
    assert r.status_code==200,r.text
    bid=r.json()["data"]["id"]
    r=m.post(f"/api/v1/books/{bid}/topics",headers=mh,json={"title":"حرکت‌شناسی","question_type":"test","question_count":count})
    assert r.status_code==200,r.text
    return bid,r.json()["data"]["id"]

def test_weekly_reviews_default_off_and_only_admin_enables(env,monkeypatch):
    s,a,m,sh,ah,mh,sid,aid=env
    assert not s.get("/api/v1/ai/chat").json()["data"]["usage"]["weekly_auto_enabled"]
    calls=[]
    monkeypatch.setattr(ai_jobs,"run_analysis",lambda *args:calls.append(args))
    ai_jobs.weekly_tick()
    assert not calls
    path=f"/api/v1/ai/students/{sid}/weekly-review"
    assert a.put(path,headers=ah,json={"enabled":True}).status_code==403
    assert s.put(path,headers=sh,json={"enabled":True}).status_code==403
    assert m.put(path,headers=mh,json={"enabled":True}).status_code==200
    ai_jobs.weekly_tick()
    assert any(args[1]==sid for args in calls)
    calls.clear()
    m.put(path,headers=mh,json={"enabled":False})
    ai_jobs.weekly_tick()
    assert not calls

def test_books_reports_inventory_and_idempotency(env):
    s,a,m,sh,ah,mh,sid,aid=env
    bid,tid=make_book(m,mh)
    assert s.post("/api/v1/books",headers=sh,json={"title":"x","publication_year":1405}).status_code==403
    assert a.get("/api/v1/advisors/students/not-owned/books").status_code in (403,404)
    assert s.put(f"/api/v1/books/{bid}/ownership",headers=sh,json={"owned":True}).status_code==200
    with SessionLocal() as db:
        assert any(b["id"]==bid for b in ai.student_context(db,sid,advisor_id=aid)[0]["available_books"])
    payload={"student_id":sid,"title":"تمرین کتاب","week_label":"هفته آزمون","days":[{"label":"شنبه"}],
        "activities":[{"day":"شنبه","title":"حل ۳۰ تست حرکت‌شناسی","subject":"فیزیک","start_time":"08:00","end_time":"09:00","book_topic_id":tid,"book_question_count":30}]}
    r=a.post("/api/v1/plans",headers=ah,json=payload)
    assert r.status_code==200,r.text
    pid=r.json()["data"]["id"]
    assert a.post(f"/api/v1/plans/{pid}/publish",headers=ah).status_code==200
    plan=s.get(f"/api/v1/plans/{pid}").json()["data"]
    activity=plan["activities"][0]
    assert activity["book_topic_id"]==tid and activity["book_question_count"]==30
    def topic():
        data=s.get("/api/v1/books").json()["data"]
        return next(b for b in data if b["id"]==bid)["topics"][0]
    assert topic()["available"]==70 and topic()["reserved"]==30
    report=f"/api/v1/plans/{pid}/study-reports/activities/{activity['id']}"
    r=s.put(report,headers=sh,json={"version":0,"status":"done"})
    assert r.status_code==200,r.text
    assert topic()["completed"]==30 and topic()["remaining"]==70
    assert s.put(report,headers=sh,json={"version":0,"status":"done"}).status_code==409
    assert topic()["completed"]==30
    assert s.put(report,headers=sh,json={"version":1,"status":"done"}).status_code==200
    assert topic()["completed"]==30
    assert s.put(report,headers=sh,json={"version":2,"status":"done","question_count":20}).status_code==200
    assert topic()["completed"]==20 and topic()["remaining"]==80
    s.put(f"/api/v1/books/{bid}/ownership",headers=sh,json={"owned":False})
    s.put(f"/api/v1/books/{bid}/ownership",headers=sh,json={"owned":True})
    assert topic()["completed"]==20
    assert s.put(report,headers=sh,json={"version":3,"status":"not_done"}).status_code==200
    assert topic()["completed"]==0
    assert s.put(report,headers=sh,json={"version":4,"status":"done","question_count":100}).status_code==200
    assert topic()["remaining"]==0
    assert a.post("/api/v1/plans",headers=ah,json=payload).status_code==422
    books=a.get(f"/api/v1/advisors/students/{sid}/books").json()["data"]
    assert next(b for b in books if b["id"]==bid)["topics"][0]["remaining"]==0

def test_ai_draft_uses_owned_topic_and_rejects_exhausted_or_foreign_id(env,monkeypatch):
    from app.api.ai_planner import DraftResult
    s,a,m,sh,ah,mh,sid,aid=env
    bid,tid=make_book(m,mh,count=30)
    s.put(f"/api/v1/books/{bid}/ownership",headers=sh,json={"owned":True})
    def fake(config,prompt,data,schema,max_tokens):
        book=next(b for b in data["student_context"]["available_books"] if b["id"]==bid)
        assert book["topics"][0]["available"]==30
        return DraftResult(title="تمرین",rationale="بر اساس کتاب",weekly_mission="",cautions=[],
            activities=[{"day":"شنبه","title":"تمرین","start_time":"08:00","end_time":"09:00","book_topic_id":tid,"book_question_count":30}])
    monkeypatch.setattr(ai,"complete",fake)
    r=a.post(f"/api/v1/ai/students/{sid}/plan-draft",headers=ah,json={"start_date":"1405/06/21","day_start_time":"08:00","day_end_time":"22:00"})
    assert r.status_code==200,r.text
    row=r.json()["data"]["activities"][0]
    assert row["book_topic_id"]==tid and "فیزیک خیلی سبز" in row["title"] and "30" in row["title"]
    from app.book_service import validate_allocations
    with SessionLocal() as db:
        with pytest.raises(Exception):validate_allocations(db,sid,[{"book_topic_id":tid,"book_question_count":31}])
        with pytest.raises(Exception):validate_allocations(db,"someone-else",[{"book_topic_id":tid,"book_question_count":1}])
