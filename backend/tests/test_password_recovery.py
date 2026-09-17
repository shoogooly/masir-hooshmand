from datetime import timedelta
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db.session import SessionLocal
from app.models import User, PasswordChallenge, AuditLog, utcnow
from app.core.security import hash_password, verify_password
from app.core.config import settings

OLD = 'Old-password-123'
NEW = 'New-password-456'
BASE = '/api/v1/auth/'

@pytest.fixture
def account():
    with TestClient(app) as client:
        with SessionLocal() as db:
            user = User(phone='09'+str(int(uuid4().hex[:12],16))[-9:].zfill(9), role='advisor', password_hash=hash_password(OLD))
            db.add(user); db.commit()
            identity = user.id, user.phone
        yield client, identity

def login(client, phone, password=OLD):
    result = client.post(BASE+'login', json={'phone':phone, 'password':password})
    assert result.status_code == 200, result.text
    return {'X-CSRF-Token': result.json()['data']['csrf_token']}

def request(client, phone):
    result = client.post(BASE+'password-recovery/request', json={'phone':phone})
    assert result.status_code == 200, result.text
    return result.json()['data']

def complete(client, challenge, **extra):
    return client.post(BASE+'password-recovery/complete', json={
        'challenge_id':challenge['challenge_id'], 'code':challenge['dev_code'], 'password':NEW, 'password_confirm':NEW, **extra})

def test_recovery_replaces_hash_revokes_all_sessions_and_cannot_replay(account):
    client, (user_id, phone) = account
    login(client, phone)
    old_access = client.cookies.get('access_token'); old_refresh = client.cookies.get('refresh_token')
    code = request(client, phone)
    with SessionLocal() as db:
        stored = db.get(PasswordChallenge, code['challenge_id'])
        assert stored.code_hash != code['dev_code']
    assert complete(client, code).status_code == 200
    assert complete(client, code).status_code == 400
    assert client.post(BASE+'login', json={'phone':phone,'password':OLD}).status_code == 401
    client.cookies.set('access_token', old_access)
    assert client.get(BASE+'me').status_code == 401
    client.cookies.clear(); client.cookies.set('refresh_token', old_refresh)
    assert client.post(BASE+'refresh').status_code == 401
    client.cookies.clear(); login(client, phone, NEW)
    assert client.get(BASE+'me').status_code == 200
    with SessionLocal() as db:
        assert verify_password(NEW, db.get(User, user_id).password_hash)
        logs = db.scalars(select(AuditLog).where(AuditLog.resource_id == user_id)).all()
        assert all(NEW not in x.after_json and OLD not in x.before_json for x in logs)

def test_recovery_limits_expiry_validation_and_unknown_users(account):
    client, (_, phone) = account
    code = request(client, phone)
    assert client.post(BASE+'password-recovery/request', json={'phone':phone}).status_code == 429
    assert complete(client, code, password_confirm='mismatch123').status_code == 422
    wrong = '000001' if code['dev_code'] != '000001' else '000002'
    for _ in range(5):
        assert complete(client, code, code=wrong).status_code == 400
    assert complete(client, code).status_code == 400
    with SessionLocal() as db:
        item = db.get(PasswordChallenge, code['challenge_id'])
        assert item.attempts == 5
        item.attempts = 0; item.expires_at = utcnow()-timedelta(seconds=1); db.commit()
    assert complete(client, code).status_code == 400
    unknown = request(client, '09999999881')
    assert unknown['message'] == code['message']
    assert complete(client, unknown).status_code == 400

@pytest.mark.parametrize('role', ['student','advisor'])
def test_change_password_requires_old_and_confirmation_for_every_role(account, role):
    client, (user_id, phone) = account
    with SessionLocal() as db:
        db.get(User,user_id).role = role
        db.commit()
    headers = login(client, phone)
    body = {'old_password':OLD, 'password':NEW, 'password_confirm':NEW}
    assert client.post(BASE+'change-password',json=body).status_code == 403
    assert client.post(BASE+'change-password',headers=headers,json={**body,'old_password':'wrong'}).status_code == 400
    assert client.post(BASE+'change-password',headers=headers,json={**body,'password_confirm':'mismatch123'}).status_code == 422
    assert client.post(BASE+'change-password',headers=headers,json=body).status_code == 200
    assert client.get(BASE+'me').status_code == 401
    login(client,phone,NEW)

def test_new_request_invalidates_older_code_and_change_invalidates_challenge(account):
    client, (_, phone) = account
    first = request(client, phone)
    with SessionLocal() as db:
        db.get(PasswordChallenge, first['challenge_id']).created_at = utcnow()-timedelta(seconds=65)
        db.commit()
    second = request(client, phone)
    assert complete(client, first).status_code == 400
    headers = login(client, phone)
    assert client.post(BASE+'change-password', headers=headers,json={'old_password':OLD,'password':NEW,'password_confirm':NEW}).status_code == 200
    assert complete(client, second).status_code == 400

def test_password_change_bruteforce_limited(account):
    client, (_,phone) = account
    headers=login(client,phone)
    body={'old_password':'wrong','password':NEW,'password_confirm':NEW}
    for _ in range(5):
        assert client.post(BASE+'change-password',headers=headers,json=body).status_code == 400
    assert client.post(BASE+'change-password',headers=headers,json=body).status_code == 429

def test_production_never_accepts_demo_recovery_or_legacy_otp(account, monkeypatch):
    client, (_, phone) = account
    monkeypatch.setattr(settings,'env','production')
    result=client.post(BASE+'password-recovery/request',json={'phone':phone})
    assert result.status_code == 503 and 'dev_code' not in result.text
    assert client.post(BASE+'verify-otp',json={'phone':phone,'role':'advisor','code':'123456'}).status_code == 503
    assert client.post(BASE+'staff-login',json={'phone':phone,'code':'123456'}).status_code == 503

def test_admin_never_receives_password_or_recovery_code(account):
    client, (user_id, phone) = account
    headers=login(client,phone)
    assert client.post('/api/v1/admin/users/'+user_id+'/password-recovery',headers=headers).status_code == 403
    with SessionLocal() as db:
        admin=User(phone='09999999882',role='super_admin',password_hash=hash_password(OLD))
        db.add(admin);db.commit()
    staff_login = client.post(BASE+'staff-login', json={'phone':'09999999882','code':'123456'})
    assert staff_login.status_code == 200
    headers={'X-CSRF-Token':staff_login.json()['data']['csrf_token']}
    detail=client.get('/api/v1/admin/users/'+user_id+'/detail')
    assert detail.status_code == 200
    assert 'password_hash' not in detail.text and OLD not in detail.text
    result=client.post('/api/v1/admin/users/'+user_id+'/password-recovery',headers=headers)
    assert result.status_code == 200 and 'dev_code' not in result.text
