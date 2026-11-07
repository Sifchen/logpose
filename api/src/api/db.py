import os
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

engine = create_engine(
    os.environ.get(
        "DATABASE_URL", "postgresql+psycopg://logpose:dev@127.0.0.1:5432/logpose"
    )
)


def get_db() -> Iterator[Session]:
    # one session per request, tests swap this for their rollback session
    with Session(engine) as session:
        yield session


# `db: Db` in an endpoint gets the session for that request
Db = Annotated[Session, Depends(get_db)]
