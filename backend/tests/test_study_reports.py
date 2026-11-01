import json
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db.session import SessionLocal
from app.models import User, WeeklyPlan, Activity, StudyReport
from app import study_reporting
from app.api import study_reports

def login(client,phone,role):
    payload={'phone':phone,'role':role,'code':'123456'}
    if role=='super_admin': payload['mfa_code']='654321'
    data=client.post('/api/v1/auth/verify-otp',json=payload).json()['data']
    return {'X-CSRF-Token':data['csrf_token']}

@pytest.fixture
def report_setup(subscribed_demo_student,monkeypatch):
    now=datetime(2026,9,14,12,tzinfo=timezone.utc)
    monkeypatch.setattr(study_reporting,'utcnow',lambda:now)
    monkeypatch.setattr(study_reports,'utcnow',lambda:now)
    with TestClient(app) as student, TestClient(app) as advisor:
        sh=login(student,'09120000001','student')
        ah=login(advisor,'09120000002','advisor')
        with SessionLocal() as db:
            sid=db.scalar(select(User.id).where(User.phone=='09120000001'))
            aid=db.scalar(select(User.id).where(User.phone=='09120000002'))
            plan=WeeklyPlan(student_id=sid,advisor_id=aid,title='گزارش هفته',week_label='۲۱ تا ۲۷ شهریور',
                status='published',published_at=now,schedule_days_json=json.dumps([{'label':'شنبه','date':'۱۴۰۵/۰۶/۲۱'},{'label':'جمعه','date':'۱۴۰۵/۰۶/۲۷'}]))
            db.add(plan);db.flush()
            activity=Activity(plan_id=plan.id,day='شنبه',subject='ریاضی',title='تمرین',start_time='08:00',end_time='09:00')
            db.add(activity);db.commit();pid,act=plan.id,activity.id
        yield student,advisor,sh,ah,pid,act

def test_partial_report_persists_and_is_visible_to_advisor(report_setup):
    s,a,sh,ah,pid,act=report_setup
    base=f'/api/v1/plans/{pid}/study-reports'
    url=base+'/activities/'+act
    assert s.put(url,json={'status':'done'}).status_code==403
    first=s.put(url,headers=sh,json={'status':'done','actual_minutes':35,'question_count':10,'correct':5})
    assert first.status_code==200,first.text
    assert first.json()['data']['activities'][act]['values']=={'status':'done','actual_minutes':35,'question_count':10,'correct':5}
    assert s.put(url,headers=sh,json={'version':1,'quality':'مطالعه دقیق بود'}).status_code==200
    assert s.put(base+'/days/شنبه',headers=sh,json={'focus':4,'sleep_hours':7.5}).status_code==200
    result=a.get(base).json()['data']
    assert result['activities'][act]['values']['actual_minutes']==35
    assert result['activities'][act]['values']['quality']=='مطالعه دقیق بود'
    assert result['days']['شنبه']['values']=={'focus':4,'sleep_hours':7.5}
    with TestClient(app) as returning:
        login(returning,'09120000001','student')
        assert returning.get(base).json()['data']['activities']==result['activities']
    assert s.put(url,headers=sh,json={'version':1,'quality':'stale'}).status_code==409
    assert a.put(url,headers=ah,json={'version':2,'quality':'advisor'}).status_code==403
    with SessionLocal() as db:
        assert db.get(Activity,act).actual_minutes==35
        assert db.get(StudyReport,(pid,'activity:'+act)).version==2

def test_optional_fields_zero_validation_and_status_branches(report_setup):
    s,a,sh,ah,pid,act=report_setup
    base=f'/api/v1/plans/{pid}/study-reports'
    url=base+'/activities/'+act
    assert s.put(url,headers=sh,json={}).status_code==200
    assert s.put(url,headers=sh,json={'version':1,'status':'done','question_count':0,'correct':0,'actual_minutes':0}).status_code==200
    assert s.put(url,headers=sh,json={'version':2,'wrong':1}).status_code==422
    assert s.put(url,headers=sh,json={'version':2,'actual_minutes':-1}).status_code==422
    assert s.put(url,headers=sh,json={'version':2,'actual_minutes':True}).status_code==422
    changed=s.put(url,headers=sh,json={'version':2,'status':'not_done','not_done_reason':'بیماری'})
    assert changed.status_code==200
    assert changed.json()['data']['activities'][act]['values']=={'status':'not_done','not_done_reason':'بیماری'}
    assert s.put(base+'/days/جمعه',headers=sh,json={}).status_code==200
    assert s.put(base+'/days/جمعه',headers=sh,json={'version':1,'focus':6}).status_code==422
    assert s.put(base+'/days/جمعه',headers=sh,json={'version':1,'sleep_hours':25}).status_code==422
    assert s.put(base+'/days/جمعه',headers=sh,json={'version':1,'stress_source':'نگرانی امتحان'}).status_code==200
    assert s.put(base+'/days/یکشنبه',headers=sh,json={}).status_code==404

@pytest.mark.parametrize('when', [datetime(2026,9,1,tzinfo=timezone.utc), datetime(2030,1,1,tzinfo=timezone.utc)])
def test_reports_have_no_time_limit(report_setup,monkeypatch,when):
    s,a,sh,ah,pid,act=report_setup
    base=f'/api/v1/plans/{pid}/study-reports'
    monkeypatch.setattr(study_reporting,'utcnow',lambda:when)
    monkeypatch.setattr(study_reports,'utcnow',lambda:when)
    initial=s.get(base).json()['data']
    assert initial['editable_until'] is None
    assert initial['editable'] is True
    assert s.put(base+'/activities/'+act,headers=sh,json={'quality':'بدون محدودیت زمانی'}).status_code==200
    assert s.put(base+'/activities/'+act,headers=sh,json={'version':1,'quality':'ویرایش گزارش'}).status_code==200
    assert s.put(base+'/days/شنبه',headers=sh,json={'focus':5}).status_code==200
    assert s.put(base+'/days/شنبه',headers=sh,json={'version':1,'focus':4}).status_code==200
    assert a.get(base).json()['data']['activities'][act]['values']['quality']=='ویرایش گزارش'

def test_unpublished_and_other_students_are_denied(report_setup):
    s,a,sh,ah,pid,act=report_setup
    base=f'/api/v1/plans/{pid}/study-reports'
    with SessionLocal() as db:
        db.get(WeeklyPlan,pid).status='draft'
        db.commit()
    assert s.put(base+'/activities/'+act,headers=sh,json={}).status_code==403
    assert s.put(base+'/days/شنبه',headers=sh,json={}).status_code==403
    with SessionLocal() as db:
        plan=db.get(WeeklyPlan,pid)
        plan.status='published'
        plan.student_id=db.scalar(select(User.id).where(User.phone=='09120000004'))
        db.commit()
    assert s.get(base).status_code==403
    assert s.put(base+'/activities/'+act,headers=sh,json={}).status_code==403
    assert s.put(base+'/days/شنبه',headers=sh,json={}).status_code==403
