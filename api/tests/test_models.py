from sqlalchemy import select

from api.models import Set


def test_set_roundtrip(session):
    session.add(Set(code="OP01", name="Romance Dawn"))
    session.commit()

    op_set = session.scalars(select(Set).where(Set.code == "OP01")).one()
    assert op_set.name == "Romance Dawn"
