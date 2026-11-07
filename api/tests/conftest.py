import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.models import Base

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://logpose:dev@127.0.0.1:5432/logpose_test"
)


@pytest.fixture
def session(engine):
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(
            bind=connection, join_transaction_mode="create_savepoint"
        ) as session:
            yield session
        transaction.rollback()


@pytest.fixture(scope="session")
def engine():
    engine = create_engine(TEST_URL)

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)

    engine.dispose()
