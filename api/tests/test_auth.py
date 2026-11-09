from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from api.auth import COOKIE, MAX_FAILS, _fails, hash_password, verify_password
from api.models import LoginSession


def test_password_hash_roundtrip():
    stored = hash_password("secret123")
    assert stored != "secret123"
    assert verify_password(stored, "secret123")
    assert not verify_password(stored, "wrong")
    assert not verify_password("not-a-hash", "secret123")


def test_login_sets_httponly_cookie(client, user, password):
    response = client.post(
        "/api/auth/login", json={"email": "  NAMI@example.com ", "password": password}
    )
    assert response.status_code == 200
    assert response.json() == {"id": user.id, "email": "nami@example.com"}
    assert "httponly" in response.headers["set-cookie"].lower()


def test_cookie_holds_token_db_holds_only_its_hash(logged_in, session):
    token = logged_in.cookies[COOKIE]
    stored = session.scalars(select(LoginSession.token_hash)).one()
    assert token != stored


def test_wrong_password_and_unknown_email_look_the_same(client, user):
    wrong = client.post(
        "/api/auth/login", json={"email": user.email, "password": "nope"}
    )
    unknown = client.post(
        "/api/auth/login", json={"email": "zoro@example.com", "password": "nope"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_me_requires_login(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_logged_in_user(logged_in, user):
    assert logged_in.get("/api/auth/me").json()["email"] == user.email


def test_logout_kills_the_session_server_side(logged_in):
    token = logged_in.cookies[COOKIE]
    assert logged_in.post("/api/auth/logout").status_code == 204

    # a cookie copied before logout doesn't work anymore either
    logged_in.cookies.set(COOKIE, token)
    assert logged_in.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(logged_in, session):
    session.execute(
        update(LoginSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    assert logged_in.get("/api/auth/me").status_code == 401


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_sixth_try_is_blocked_even_with_the_right_password(client, user, password):
    for _ in range(MAX_FAILS):
        assert login(client, user.email, "nope").status_code == 401
    blocked = login(client, user.email, password)
    assert blocked.status_code == 429
    assert 0 < int(blocked.headers["retry-after"]) <= 15 * 60


def test_good_login_resets_the_count(client, user, password):
    for _ in range(MAX_FAILS - 1):
        login(client, user.email, "nope")
    assert login(client, user.email, password).status_code == 200
    for _ in range(MAX_FAILS - 1):
        login(client, user.email, "nope")
    assert login(client, user.email, password).status_code == 200


def test_limit_is_per_email(client, user, password):
    for _ in range(MAX_FAILS):
        login(client, "zoro@example.com", "nope")
    assert login(client, user.email, password).status_code == 200


def test_old_fails_dont_count(client, user, password):
    for _ in range(MAX_FAILS):
        login(client, user.email, "nope")
    # pretend they all happened 16 minutes ago
    old = datetime.now(UTC) - timedelta(minutes=16)
    for times in _fails.values():
        times[:] = [old] * len(times)
    assert login(client, user.email, password).status_code == 200
