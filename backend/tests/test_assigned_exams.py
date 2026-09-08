import base64

from fastapi.testclient import TestClient

from app.main import app


PDF = {
    "filename": "exam.pdf",
    "content_type": "application/pdf",
    "content_base64": base64.b64encode(b"%PDF-1.4\n%%EOF").decode(),
}


def test_advisor_student_pdf_exam_workflow():
    with TestClient(app) as advisor:
        login = advisor.post("/api/v1/auth/verify-otp", json={
            "phone": "09120000002", "code": "123456", "role": "advisor",
        })
        assert login.status_code == 200
        csrf = login.json()["data"]["csrf_token"]
        dashboard = advisor.get("/api/v1/advisors/dashboard").json()["data"]
        student_id = dashboard["students"][0]["id"]
        created = advisor.post(
            f"/api/v1/advisors/students/{student_id}/assigned-exams",
            headers={"X-CSRF-Token": csrf},
            json={"title": "آزمون PDF آزمایشی", "duration_minutes": 76, "instructions": "در محیط آرام اجرا شود", "question_file": PDF},
        )
        assert created.status_code == 200
        exam_id = created.json()["data"]["id"]
        optional = advisor.post(f"/api/v1/advisors/students/{student_id}/assigned-exams", headers={"X-CSRF-Token": csrf}, json={"title": "آزمون بدون زمان", "question_file": PDF})
        assert optional.status_code == 200
        assert optional.json()["data"]["duration_minutes"] == 0

    with TestClient(app) as student:
        login = student.post("/api/v1/auth/verify-otp", json={
            "phone": "09120000001", "code": "123456", "role": "student",
        })
        csrf = login.json()["data"]["csrf_token"]
        assert login.status_code == 200
        summary = student.get("/api/v1/notifications/summary")
        assert summary.status_code == 200
        assert summary.json()["data"]["unseen_exams"] >= 1
        seen = student.post("/api/v1/notifications/exams/read", headers={"X-CSRF-Token": csrf})
        assert seen.status_code == 200
        assert student.get("/api/v1/notifications/summary").json()["data"]["unseen_exams"] == 0
        question = student.get(f"/api/v1/assigned-exams/{exam_id}/question-file")
        assert question.status_code == 200
        assert question.json()["data"]["downloaded_at"] is not None
        answer = student.post(
            f"/api/v1/assigned-exams/{exam_id}/answer",
            headers={"X-CSRF-Token": csrf},
            json={"notes": "سؤال سوم دشوار بود", "answer_file": {**PDF, "filename": "answer.pdf"}},
        )
        assert answer.status_code == 200
        assert answer.json()["data"]["answer_uploaded_at"] is not None

    with TestClient(app) as advisor:
        login = advisor.post("/api/v1/auth/verify-otp", json={
            "phone": "09120000002", "code": "123456", "role": "advisor",
        })
        csrf = login.json()["data"]["csrf_token"]
        items = advisor.get(f"/api/v1/assigned-exams?student_id={student_id}").json()["data"]
        item = next(row for row in items if row["id"] == exam_id)
        assert item["student_notes"] == "سؤال سوم دشوار بود"
        assert item["question_downloaded_at"] and item["answer_uploaded_at"]
        assert advisor.get(f"/api/v1/assigned-exams/{exam_id}/answer-file").status_code == 200
        assert isinstance(item["elapsed_minutes"], int)
        analysis = advisor.patch(f"/api/v1/assigned-exams/{exam_id}/analysis", headers={"X-CSRF-Token": csrf}, json={
            "analysis_text": "مبحث حرکت یکنواخت مرور شود",
            "resource_links": ["https://example.com/lesson"],
            "lesson_file": {**PDF, "filename": "lesson.pdf"},
        })
        assert analysis.status_code == 200
        assert analysis.json()["data"]["status"] == "analyzed"
        assert analysis.json()["data"]["resource_links"] == ["https://example.com/lesson"]
