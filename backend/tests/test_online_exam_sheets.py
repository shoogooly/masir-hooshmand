import base64
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.api import exam_files
from app.db.session import SessionLocal
from app.models import AssignedExam, AssignedExamSheet, Notification
from app.exam_scoring import grade_sheet

PDF = {"filename":"questions.pdf","content_type":"application/pdf","content_base64":base64.b64encode(b"%PDF-1.4\n%%EOF").decode()}
SECTIONS = [{"title":"ریاضی","correct_answers":[2,3,1,4]},{"title":"فیزیک","correct_answers":[3,2]}]


def login(client, phone, role):
    payload={"phone":phone,"role":role,"code":"123456"}
    if role=="super_admin":
        payload["mfa_code"]="654321"
    data=client.post("/api/v1/auth/verify-otp",json=payload).json()["data"]
    return data["user"], {"X-CSRF-Token":data["csrf_token"]}


@pytest.mark.usefixtures("subscribed_demo_student")
def test_online_exam_end_to_end_key_privacy_scoring_and_finality(monkeypatch):
    with TestClient(app) as student, TestClient(app) as advisor, TestClient(app) as outsider:
        user, student_headers=login(student,"09120000001","student")
        advisor_user, advisor_headers=login(advisor,"09120000002","advisor")
        outsider_user, outsider_headers=login(outsider,"09120000003","super_admin")
        created=advisor.post(f"/api/v1/advisors/students/{user['id']}/assigned-exams",headers=advisor_headers,
            json={"title":"آزمون پاسخنامه آنلاین","question_file":PDF,"duration_minutes":10,"online_sheet":{"sections":SECTIONS,"negative_marking":True}})
        assert created.status_code==200, created.text
        assert created.json()["data"]["has_online_sheet"] is True
        eid=created.json()["data"]["id"]
        path=f"/api/v1/assigned-exams/{eid}/online-sheet"
        blank=student.get(path).json()["data"]
        assert blank["result"] is None and "answer_key" not in blank
        assert "correct_answers" not in str(blank)
        assert blank["sections"][1]["start_number"]==5
        assert advisor.get(path).json()["data"]["answer_key"]==[2,3,1,4,3,2]
        answers={"answers":[2,1,None,4,3,4],"version":0}
        assert student.put(path,headers=student_headers,json=answers).status_code==409
        assert student.post(path+"/finish",headers=student_headers,json=answers).status_code==409
        assert student.post(path+"/finish",json=answers).status_code==403
        assert advisor.post(path+"/finish",headers=advisor_headers,json=answers).status_code==403
        assert advisor.patch(f"/api/v1/assigned-exams/{eid}/analysis",headers=advisor_headers,json={"analysis_text":"early"}).status_code==409
        start=datetime(2026,9,12,10,0,tzinfo=timezone.utc)
        monkeypatch.setattr(exam_files,"utcnow",lambda:start)
        assert student.get(f"/api/v1/assigned-exams/{eid}/question-file").status_code==200
        monkeypatch.setattr(exam_files,"utcnow",lambda:start+timedelta(minutes=12,seconds=30))
        student.get(f"/api/v1/assigned-exams/{eid}/question-file")
        with SessionLocal() as db:
            original=db.get(AssignedExam,eid).question_downloaded_at
            assert original.replace(tzinfo=timezone.utc)==start
        for invalid in [[5,None,None,None,None,None],[True,None,None,None,None,None],["2",None,None,None,None,None],[1]]:
            assert student.put(path,headers=student_headers,json={"answers":invalid,"version":0}).status_code==422
        saved=student.put(path,headers=student_headers,json=answers)
        assert saved.status_code==200, saved.text
        assert saved.json()["data"]["version"]==1
        assert "answer_key" not in saved.json()["data"]
        assert student.put(path,headers=student_headers,json=answers).status_code==409
        assert student.post(f"/api/v1/assigned-exams/{eid}/answer",headers=student_headers,json={"answer_file":PDF}).status_code==409
        with TestClient(app) as returning:
            login(returning,"09120000001","student")
            assert returning.get(path).json()["data"]["answers"]==answers["answers"]
        assert student.get("/api/v1/assigned-exams").json()["data"][0].get("answer_key") is None
        finished=student.post(path+"/finish",headers=student_headers,json={**answers,"version":1})
        assert finished.status_code==200, finished.text
        result=finished.json()["data"]["result"]
        assert (result["correct"],result["wrong"],result["unanswered"])==(3,2,1)
        assert result["percentage"]==38.89
        assert result["sections"][0]["percentage"]==41.67
        assert result["sections"][1]["percentage"]==33.33
        assert result["elapsed_seconds"]==750 and result["overtime_seconds"]==150
        assert result["questions"][2]["status"]=="unanswered"
        assert result["questions"][1]["correct_answer"]==3
        assert advisor.get(path).json()["data"]["result"]==result
        assert student.put(path,headers=student_headers,json={"answers":[2,3,1,4,3,2],"version":2}).status_code==409
        replay=student.post(path+"/finish",headers=student_headers,json={"answers":[2,3,1,4,3,2],"version":2})
        assert replay.json()["data"]["result"]==result
        with SessionLocal() as db:
            assert len(db.scalars(select(Notification).where(Notification.related_id==eid,Notification.kind=="exam_answered")).all())==1
            item=db.get(AssignedExam,eid)
            item.student_id=outsider_user["id"]
            db.commit()
        assert student.get(path).status_code==403
        assert student.put(path,headers=student_headers,json=answers).status_code==403
        assert student.post(path+"/finish",headers=student_headers,json=answers).status_code==403
        with SessionLocal() as db:
            db.get(AssignedExam,eid).student_id=user["id"]
            db.commit()
        analysis=advisor.patch(f"/api/v1/assigned-exams/{eid}/analysis",headers=advisor_headers,json={"analysis_text":"مرور فیزیک","resource_links":["https://example.com/lesson"],"lesson_file":PDF})
        assert analysis.status_code==200
        assert student.get(f"/api/v1/assigned-exams/{eid}/lesson-file").status_code==200
        assert student.get(path).json()["data"]["result"]==result


@pytest.mark.parametrize("answers,negative,percent", [([None]*6,True,0),([1,1,2,1,1,1],True,-33.33),([2,3,1,4,3,2],True,100),([2,1,None,4,3,4],False,50)])
def test_scoring_edges(answers,negative,percent):
    result=grade_sheet(SECTIONS,answers,negative)
    assert result["percentage"]==percent
    assert result["correct"]+result["wrong"]+result["unanswered"]==6


def test_invalid_answer_keys_rejected():
    from app.api.exam_files import OnlineSheetCreate
    from pydantic import ValidationError
    for sections in [[],[{"title":"  ","correct_answers":[1]}],[{"title":"درس","correct_answers":[None]}],[{"title":"درس","correct_answers":[5]}],[SECTIONS[0],SECTIONS[0]]]:
        with pytest.raises(ValidationError):
            OnlineSheetCreate(sections=sections)
