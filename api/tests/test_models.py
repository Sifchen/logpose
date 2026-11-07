from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Set


def test_set_roundtrip(engine):
    with Session(engine) as session:
        session.add(Set(code="OP01", name="Romance Dawn"))
        session.commit()

        op_set = session.scalars(select(Set).where(Set.code == "OP01")).one()
        assert op_set.name == "Romance Dawn"
