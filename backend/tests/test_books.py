import json
from datetime import timedelta
from uuid import uuid4
import pytest
from app import ai_service as ai, ai_jobs
from app.book_service import inventory
from app.book_service import catalog
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

def test_advisor_manages_student_books_and_private_catalog(env):
    s,a,m,sh,ah,mh,sid,aid=env
    global_id,_=make_book(m,mh,title="کتاب عمومی")
    path=f"/api/v1/advisors/students/{sid}/books"
    rows=a.get(path,headers=ah).json()["data"]
    assert next(row for row in rows if row["id"]==global_id)["owned"] is False
    assert a.put(f"{path}/{global_id}/ownership",headers=ah,json={"owned":True}).status_code==200
    assert next(row for row in s.get("/api/v1/books",headers=sh).json()["data"] if row["id"]==global_id)["owned"]
    assert a.put(f"{path}/{global_id}/ownership",headers=ah,json={"owned":False}).status_code==200
    assert not next(row for row in s.get("/api/v1/books",headers=sh).json()["data"] if row["id"]==global_id)["owned"]
    assert a.put(f"/api/v1/books/{global_id}",headers=ah,json={
        "title":"غیرمجاز","subject":"فیزیک","publication_year":1405}).status_code==403

    created=a.post(path,headers=ah,json={"title":"کتاب اختصاصی","subject":"فیزیک","publication_year":1405})
    assert created.status_code==200,created.text
    private_id=created.json()["data"]["id"]
    assert next(row for row in a.get(path,headers=ah).json()["data"] if row["id"]==private_id)["owned"]
    assert private_id not in {row["id"] for row in m.get("/api/v1/books",headers=mh).json()["data"]}
    assert private_id in {row["id"] for row in s.get("/api/v1/books",headers=sh).json()["data"]}
    with SessionLocal() as db:
        assert private_id not in {row["id"] for row in catalog(db,"another-student")}
    topic=a.post(f"/api/v1/books/{private_id}/topics",headers=ah,json={
        "title":"حرکت","question_type":"test","question_count":40})
    assert topic.status_code==200,topic.text
    assert next(row for row in a.get(path,headers=ah).json()["data"] if row["id"]==private_id)["topics"][0]["question_count"]==40
    assert a.put(f"{path}/{private_id}/ownership",headers=ah,json={"owned":False}).status_code==200
    assert not next(row for row in s.get("/api/v1/books",headers=sh).json()["data"] if row["id"]==private_id)["owned"]

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
    assert topic()["available"]==70 and topic()["reserved"]==30 and topic()["assigned_count"]==1
    report=f"/api/v1/plans/{pid}/study-reports/activities/{activity['id']}"
    r=s.put(report,headers=sh,json={"version":0,"status":"done"})
    assert r.status_code==200,r.text
    assert topic()["completed"]==30 and topic()["remaining"]==70 and topic()["assigned_count"]==1
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

def test_book_topic_automatically_links_calendar_topic_in_published_plan(env,monkeypatch):
    s,a,m,sh,ah,mh,sid,aid=env
    student_calendar=a.get(f"/api/v1/students/{sid}/academic-calendar",headers=ah).json()["data"]
    root_id,topic_id=str(uuid4()),str(uuid4())
    made=m.post("/api/v1/academic-calendars",headers=mh,json={
        "title":"تقویم فیزیک کتاب","grade":student_calendar["grade"],"major":student_calendar["major"],
        "nodes":[{"id":root_id,"subject":"فیزیک","title":"فیزیک"},
                 {"id":topic_id,"parent_id":root_id,"subject":"فیزیک","title":"حرکت‌شناسی","month":8,"day":15}]})
    assert made.status_code==200,made.text
    assert a.put(f"/api/v1/students/{sid}/academic-calendar/{made.json()['data']['id']}",headers=ah).status_code==200
    book=m.post("/api/v1/books",headers=mh,json={"title":"فیزیک مرتبط","subject":"فیزیک","publication_year":1405})
    assert book.status_code==200,book.text
    book_id=book.json()["data"]["id"]
    linked=m.post(f"/api/v1/books/{book_id}/topics",headers=mh,json={
        "title":"حرکت‌شناسی","calendar_topic_id":topic_id,"question_type":"test","question_count":40})
    assert linked.status_code==200,linked.text
    book_topic_id=linked.json()["data"]["id"]
    assert s.put(f"/api/v1/books/{book_id}/ownership",headers=sh,json={"owned":True}).status_code==200
    plan=a.post("/api/v1/plans",headers=ah,json={"student_id":sid,"title":"تمرین فیزیک","week_label":"هفته آزمون",
        "days":[{"label":"شنبه"}],"activities":[{"day":"شنبه","title":"حل تست حرکت‌شناسی",
        "subject":"فیزیک","start_time":"08:00","end_time":"09:00","book_topic_id":book_topic_id,
        "book_question_count":10}]})
    assert plan.status_code==200,plan.text
    assert a.post(f"/api/v1/plans/{plan.json()['data']['id']}/publish",headers=ah).status_code==200
    saved=s.get(f"/api/v1/plans/{plan.json()['data']['id']}",headers=sh).json()["data"]
    assert saved["activities"][0]["calendar_topic_ids"]==[topic_id]
    with SessionLocal() as db:
        context,_=ai.student_context(db,sid,advisor_id=aid)
        assert topic_id in context["plans"][0]["activities"][0]["calendar_topic_ids"]
    from app.api.ai_planner import DraftResult
    def fake_plan(config,prompt,data,schema,max_tokens):
        calendar=data["student_context"]["academic_calendar"]
        assert calendar["requested_academic_year_start"]==1404
        assert calendar["requested_academic_year_end"]==1405
        assert next(node for node in calendar["nodes"] if node["id"]==topic_id)["jalali_year_for_requested_week"]==1404
        return DraftResult(title="مرور فیزیک",weekly_mission="تمرین",rationale="بر اساس تقویم",cautions=[],
            activities=[{"day":"شنبه","title":"تمرین حرکت‌شناسی","start_time":"08:00","end_time":"09:00",
                         "book_topic_id":book_topic_id,"book_question_count":5}])
    monkeypatch.setattr(ai,"complete",fake_plan)
    draft=a.post(f"/api/v1/ai/students/{sid}/plan-draft",headers=ah,json={
        "start_date":"1405/06/21","day_start_time":"08:00","day_end_time":"22:00"})
    assert draft.status_code==200,draft.text
    assert draft.json()["data"]["activities"][0]["calendar_topic_ids"]==[topic_id]
    again=a.post("/api/v1/plans",headers=ah,json={"student_id":sid,"title":"مرور دوباره","week_label":"هفته بعد",
        "days":[{"label":"شنبه"}],"activities":[{"day":"شنبه","title":"مرور حرکت‌شناسی",
        "subject":"فیزیک","start_time":"09:00","end_time":"10:00","book_topic_id":book_topic_id,
        "book_question_count":5}]})
    assert again.status_code==200,again.text
    assert a.post(f"/api/v1/plans/{again.json()['data']['id']}/publish",headers=ah).status_code==200
    listed=a.get(f"/api/v1/students/{sid}/planner-topics",headers=ah).json()["data"]
    assert next(row for row in listed if row["id"]==topic_id)["used_count"]==2
    books=a.get(f"/api/v1/advisors/students/{sid}/books",headers=ah).json()["data"]
    assert next(row for row in books if row["id"]==book_id)["topics"][0]["assigned_count"]==2

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
