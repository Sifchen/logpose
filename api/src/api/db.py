import os

from sqlalchemy import create_engine

engine = create_engine(
    os.environ.get(
        "DATABASE_URL", "postgresql+psycopg://logpose:dev@127.0.0.1:5432/logpose"
    )
)
