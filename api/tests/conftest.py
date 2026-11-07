import os

import pytest
from sqlalchemy import create_engine

from api.models import Base

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://logpose:dev@127.0.0.1:5432/logpose_test"
)


@pytest.fixture(scope="session")
def engine():
    engine = create_engine(TEST_URL)

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)

    engine.dispose()
