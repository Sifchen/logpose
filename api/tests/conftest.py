import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.auth import hash_password
from api.db import get_db
from api.main import app
from api.models import Base, User

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://logpose:dev@127.0.0.1:5432/logpose_test"
)
PASSWORD = "correct horse battery"


@pytest.fixture(scope="session")
def engine():
    engine = create_engine(TEST_URL)

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)

    engine.dispose()


@pytest.fixture
def session(engine):
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(
            bind=connection, join_transaction_mode="create_savepoint"
        ) as session:
            yield session
        transaction.rollback()


@pytest.fixture
def client(session):
    # requests run inside the test's session, so everything gets rolled back
    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_user(session, email: str) -> User:
    user = User(email=email, password_hash=hash_password(PASSWORD))
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def password():
    return PASSWORD


@pytest.fixture
def user(session):
    return make_user(session, "nami@example.com")


def _log_in(client, email: str) -> TestClient:
    response = client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return client


@pytest.fixture
def logged_in(client, user):
    return _log_in(client, user.email)


@pytest.fixture
def login_as(session, client):
    # switches the client to a new user: login_as("zoro@example.com")

    def switch(email: str) -> TestClient:
        make_user(session, email)
        return _log_in(client, email)

    return switch
