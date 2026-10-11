import base64
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db.session import SessionLocal
from app.models import User, AdvisorAssignment, AssignedExam, AssignedExamSheet, Activity, StudyReport, Notification, WeeklyPlan

pytestmark = pytest.mark.usefixtures('subscribed_demo_student')


def login(client, phone, role):
    response = client.post('/api/v1/auth/verify-otp', json={'phone':phone, 'role':role, 'code':'123456', 'mfa_code':'654321'})
    assert response.status_code == 200, response.text
    client.headers['X-CSRF-Token'] = response.json()['data']['csrf_token']
    return response.json()['data']['user']['id']


def test_draft_resume_volume_publish_and_admin_delete():
    with TestClient(app) as advisor, TestClient(app) as student, TestClient(app) as admin:
        login(advisor,'09120000002','advisor')
        sid=login(student,'09120000001','student')
        login(admin,'09120000003','super_admin')
        snapshot={'items':[{'title':'ناتمام','start':'','end':''}], 'mode':'volume'}
        draft={'student_id':sid,'title':'پیش‌نویس آزمون','plan_mode':'volume','draft_state':snapshot}
        created=advisor.post('/api/v1/plan-drafts',json=draft)
        assert created.status_code==200,created.text
        pid=created.json()['data']['id']
        assert student.get(f'/api/v1/plans/{pid}').status_code==403
        assert not any(p['id']==pid for p in student.get('/api/v1/plans').json()['data'])
        assert advisor.get(f'/api/v1/plans/{pid}').json()['data']['draft_state']==snapshot
        draft['title']='پیش‌نویس ویرایش‌شده'
        assert advisor.put(f'/api/v1/plan-drafts/{pid}',json=draft).status_code==200
        assert student.put(f'/api/v1/plan-drafts/{pid}',json=draft).status_code==403
        assert advisor.post(f'/api/v1/plans/{pid}/publish').status_code==422
        payload={'student_id':sid,'title':draft['title'],'week_label':'هفته آزمایشی','plan_mode':'volume',
            'days':[{'label':'شنبه','date':'۱۴۰۵/۰۷/۱۸'}], 'activities':[
                {'day':'شنبه','title':'مطالعه ریاضی','planned_minutes':90},
                {'day':'شنبه','title':'مرور فیزیک','planned_minutes':45}]}
        completed=advisor.put(f'/api/v1/plans/{pid}',json=payload)
        assert completed.status_code==200,completed.text
        saved=advisor.get(f'/api/v1/plans/{pid}').json()['data']
        assert [(a['start_time'],a['end_time']) for a in saved['activities']]==[('00:00','01:30'),('01:30','02:15')]
        assert advisor.post(f'/api/v1/plans/{pid}/publish').status_code==200
        assert student.get(f'/api/v1/plans/{pid}').json()['data']['plan_mode']=='volume'
        assert advisor.put(f'/api/v1/plan-drafts/{pid}',json=draft).status_code==409
        assert advisor.put(f'/api/v1/plans/{pid}',json=payload).status_code==409
        with SessionLocal() as db:
            db.add(StudyReport(plan_id=pid,scope='day:شنبه'));db.commit()
        assert advisor.delete(f'/api/v1/plans/{pid}?confirmed=true').status_code==403
        assert admin.delete(f'/api/v1/plans/{pid}').status_code==422
        assert admin.delete(f'/api/v1/plans/{pid}?confirmed=true').status_code==200
        assert student.get(f'/api/v1/plans/{pid}').status_code==404
        assert advisor.get(f'/api/v1/plans/{pid}').status_code==404
        with SessionLocal() as db:
            assert not db.scalars(select(Activity).where(Activity.plan_id==pid)).all()
            assert not db.scalars(select(StudyReport).where(StudyReport.plan_id==pid)).all()
            assert not db.scalars(select(Notification).where(Notification.related_id==pid)).all()


def test_external_results_shared_history_permissions_and_conflicts():
    with TestClient(app) as advisor, TestClient(app) as student:
        login(advisor,'09120000002','advisor');sid=login(student,'09120000001','student')
        path=f'/api/v1/students/{sid}/external-results'
        value={'title':'آزمون مؤسسه','exam_date':'1405/07/18','score':17,'max_score':20,'scaled_score':6500,'rank':12,
            'subjects':[{'name':'ریاضی','percent':75}]}
        created=student.post(path,json=value)
        assert created.status_code==200,created.text
        row=created.json()['data'];rid=row['id']
        assert any(x['id']==rid for x in advisor.get(path).json()['data'])
        changed=advisor.put(path+'/'+rid,json={**value,'score':18,'version':1})
        assert changed.status_code==200,changed.text
        assert changed.json()['data']['version']==2
        assert student.put(path+'/'+rid,json=value).status_code==409
        assert student.get('/api/v1/students/not-mine/external-results').status_code==403
        assert advisor.post('/api/v1/students/not-assigned/external-results',json=value).status_code==403
        assert student.post(path,json={**value,'score':21}).status_code==422
        assert student.post(path,json={**value,'exam_date':'1405/13/40'}).status_code==422
        assert student.delete(path+'/'+rid+'?version=1').status_code==409
        assert student.delete(path+'/'+rid+'?version=2').status_code==200
        assert not any(x['id']==rid for x in advisor.get(path).json()['data'])


def test_group_exam_atomic_permissions_and_idempotent_retry():
    with TestClient(app) as advisor:
        aid=login(advisor,'09120000002','advisor')
        sid=advisor.get('/api/v1/advisors/group-exam-students').json()['data'][0]['id']
        with SessionLocal() as db:
            second=User(phone='09'+str(int(uuid4().hex[:12],16))[-9:].zfill(9),full_name='دانش‌آموز گروه آزمایشی',role='student')
            db.add(second);db.flush();second_id=second.id
            db.add(AdvisorAssignment(student_id=second_id,advisor_id=aid,active=True,approval_status='approved'));db.commit()
        batch=str(uuid4())
        payload={'student_ids':[sid,second_id], 'batch_id':batch, 'title':'آزمون گروهی آزمایشی',
            'question_file':{'filename':'exam.pdf','content_base64':base64.b64encode(b'%PDF-1.4\n%%EOF').decode()},
            'online_sheet':{'sections':[{'title':'ریاضی','correct_answers':[1,2]}],'negative_marking':True}}
        denied=advisor.post('/api/v1/advisors/group-exams',json={**payload,'student_ids':[sid,'unassigned']})
        assert denied.status_code==403
        with SessionLocal() as db:
            assert not db.scalars(select(AssignedExam).where(AssignedExam.batch_id==batch)).all()
        result=advisor.post('/api/v1/advisors/group-exams',json=payload)
        assert result.status_code==200,result.text
        assert result.json()['data']['count']==2
        retry=advisor.post('/api/v1/advisors/group-exams',json=payload)
        assert set(retry.json()['data']['ids'])==set(result.json()['data']['ids'])
        with SessionLocal() as db:
            rows=db.scalars(select(AssignedExam).where(AssignedExam.batch_id==batch)).all()
            assert len(rows)==2
            assert all(db.get(AssignedExamSheet,r.id).negative_marking for r in rows)
            assert len(db.scalars(select(Notification).where(Notification.related_id.in_([r.id for r in rows]))).all())==2


def test_volume_invalid_duration_is_rejected():
    with TestClient(app) as advisor:
        login(advisor,'09120000002','advisor')
        sid=advisor.get('/api/v1/advisors/group-exam-students').json()['data'][0]['id']
        base={'student_id':sid,'title':'برنامه حجمی','week_label':'هفته جدید','plan_mode':'volume','days':[{'label':'شنبه'}]}
        for duration in [0,-2,1500,1.5]:
            response=advisor.post('/api/v1/plans',json={**base,'activities':[{'day':'شنبه','title':'تمرین','planned_minutes':duration}]})
            assert response.status_code==422,response.text
