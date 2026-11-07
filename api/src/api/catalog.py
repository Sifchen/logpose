from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import Select, or_, select

from api.auth import CurrentUser
from api.db import Db
from api.models import Card, Printing, Set

router = APIRouter(prefix="/api", tags=["catalog"])

# at least 2 chars, otherwise "a" matches half the db
SearchText = Annotated[str | None, Query(min_length=2, max_length=50)]


class SetOut(BaseModel):
    id: int
    code: str
    name: str


class PrintingOut(BaseModel):
    id: int
    card_number: str
    name: str
    set_code: str
    rarity: str
    variant: str
    language: str
    image_url: str | None


def printing_out(printing: Printing, card: Card, set_: Set) -> PrintingOut:
    return PrintingOut(
        id=printing.id,
        card_number=card.card_number,
        name=card.name,
        set_code=set_.code,
        rarity=printing.rarity,
        variant=printing.variant,
        language=printing.language,
        image_url=printing.image_url,
    )


def printings_query() -> Select:
    return (
        select(Printing, Card, Set)
        .join(Card, Card.id == Printing.card_id)
        .join(Set, Set.id == Printing.set_id)
    )


def matching(text: str):
    # name contains it or number starts with it. % and _ are escaped so they
    # don't work as LIKE wildcards
    escaped = text.strip().replace("\\", "\\\\").replace("%", r"\%")
    escaped = escaped.replace("_", r"\_")
    return or_(
        Card.name.ilike(f"%{escaped}%", escape="\\"),
        Card.card_number.ilike(f"{escaped}%", escape="\\"),
    )


@router.get("/sets")
def list_sets(db: Db, _: CurrentUser) -> list[SetOut]:
    sets = db.scalars(select(Set).order_by(Set.code))
    return [SetOut(id=s.id, code=s.code, name=s.name) for s in sets]


@router.get("/printings")
def search_printings(
    db: Db,
    _: CurrentUser,
    q: SearchText = None,
    set_id: int | None = None,
    language: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
) -> list[PrintingOut]:
    stmt = printings_query()
    if q:
        stmt = stmt.where(matching(q))
    if set_id is not None:
        stmt = stmt.where(Printing.set_id == set_id)
    if language:
        stmt = stmt.where(Printing.language == language)
    stmt = stmt.order_by(Card.card_number, Printing.language, Printing.source_ref)
    return [printing_out(*row) for row in db.execute(stmt.limit(limit))]
