import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from api.db import Db
from api.models import LoginSession, User

COOKIE = "logpose_session"
SESSION_TTL = timedelta(days=14)
# off for local http, on behind https
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

_hasher = PasswordHasher()
# used when the email doesn't exist, so that takes as long as a wrong password
# and you can't tell from the timing which emails have an account
_DUMMY_HASH = _hasher.hash("no-such-user")


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(password_hash: str, plain: str) -> bool:
    try:
        return _hasher.verify(password_hash, plain)
    except (VerificationError, InvalidHashError):
        return False


def normalize_email(email: str) -> str:
    return email.strip().lower()


MAX_FAILS = 5
FAIL_WINDOW = timedelta(minutes=15)
# failed logins per (email, ip). only in memory, so a restart resets it and it
# only works with one api process, which is all we run
_fails: dict[tuple[str, str], list[datetime]] = {}


def recent_fails(key: tuple[str, str]) -> list[datetime]:
    cutoff = datetime.now(UTC) - FAIL_WINDOW
    recent = [t for t in _fails.get(key, []) if t > cutoff]
    if recent:
        _fails[key] = recent
    else:
        _fails.pop(key, None)  # so old keys don't pile up
    return recent


def _hash_token(token: str) -> str:
    # db only gets the hash, so a leaked table can't be used to log in
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Session, user: User) -> str:
    now = datetime.now(UTC)
    db.execute(delete(LoginSession).where(LoginSession.expires_at < now))
    token = secrets.token_urlsafe(32)
    db.add(
        LoginSession(
            user_id=user.id,
            token_hash=_hash_token(token),
            expires_at=now + SESSION_TTL,
        )
    )
    db.commit()
    return token


def current_user(request: Request, db: Db) -> User:
    token = request.cookies.get(COOKIE)
    if token:
        user = db.scalars(
            select(User)
            .join(LoginSession, LoginSession.user_id == User.id)
            .where(
                LoginSession.token_hash == _hash_token(token),
                LoginSession.expires_at > datetime.now(UTC),
            )
        ).one_or_none()
        if user is not None:
            return user
    raise HTTPException(status_code=401, detail="Not logged in")


# `user: CurrentUser` in an endpoint = login required
CurrentUser = Annotated[User, Depends(current_user)]


class Credentials(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(body: Credentials, request: Request, response: Response, db: Db) -> UserOut:
    email = normalize_email(body.email)
    key = (email, request.client.host if request.client else "")
    fails = recent_fails(key)
    if len(fails) >= MAX_FAILS:
        wait = fails[0] + FAIL_WINDOW - datetime.now(UTC)
        raise HTTPException(
            status_code=429,
            detail="Too many tries, wait a few minutes",
            headers={"Retry-After": str(int(wait.total_seconds()) + 1)},
        )

    user = db.scalars(select(User).where(User.email == email)).one_or_none()

    if user is None:
        verify_password(_DUMMY_HASH, body.password)
    if user is None or not verify_password(user.password_hash, body.password):
        _fails.setdefault(key, []).append(datetime.now(UTC))
        # same message for both on purpose
        raise HTTPException(status_code=401, detail="Wrong email or password")

    _fails.pop(key, None)

    response.set_cookie(
        COOKIE,
        start_session(db, user),
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,  # js can't read it, so XSS can't steal it
        samesite="lax",  # not sent on cross-site POSTs, blocks CSRF
        secure=COOKIE_SECURE,
    )
    return UserOut.model_validate(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Db) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(
            delete(LoginSession).where(LoginSession.token_hash == _hash_token(token))
        )
        db.commit()
    response.delete_cookie(COOKIE, httponly=True, samesite="lax", secure=COOKIE_SECURE)


@router.get("/me")
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
