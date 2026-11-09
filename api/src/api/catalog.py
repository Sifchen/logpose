from datetime import date
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import Select, func, or_, select

from api.auth import CurrentUser
from api.db import Db
from api.models import Card, PricePoint, Printing, Set

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
    colors: list[str]
    image_url: str | None  # our own /api/... url, see images.py
    trend_cents: int | None  # None = no match we trust
    cardmarket_url: str  # product page, or a search if there's no match


CARDMARKET = "https://www.cardmarket.com/en/OnePiece/Products"


def cardmarket_url(printing: Printing, card: Card) -> str:
    # cardmarket opens a product by the same id as in the price file, so no urls to store
    if printing.cardmarket_id:
        return f"{CARDMARKET}?idProduct={printing.cardmarket_id}"
    return f"{CARDMARKET}/Search?{urlencode({'searchString': card.card_number})}"


def printing_out(
    printing: Printing, card: Card, set_: Set, trend: int | None
) -> PrintingOut:
    return PrintingOut(
        id=printing.id,
        card_number=card.card_number,
        name=card.name,
        set_code=set_.code,
        rarity=printing.rarity,
        variant=printing.variant,
        language=printing.language,
        colors=card.colors,
        image_url=f"/api/printings/{printing.id}/image" if printing.image_url else None,
        # old prices stay in the history when a match is removed, don't show them
        trend_cents=trend if printing.cardmarket_id else None,
        cardmarket_url=cardmarket_url(printing, card),
    )


# newest price per printing, uses the (printing_id, day) primary key as index
latest_trend = (
    select(PricePoint.trend_cents)
    .where(PricePoint.printing_id == Printing.id)
    .order_by(PricePoint.day.desc())
    .limit(1)
    .correlate(Printing)
    .scalar_subquery()
)


def printings_query() -> Select:
    return (
        select(Printing, Card, Set, latest_trend)
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


class PriceStatus(BaseModel):
    updated_on: date | None
    priced_printings: int


@router.get("/prices/status")
def price_status(db: Db, _: CurrentUser) -> PriceStatus:
    day = db.scalar(select(func.max(PricePoint.day)))
    count = (
        db.scalar(
            select(func.count()).select_from(PricePoint).where(PricePoint.day == day)
        )
        if day
        else 0
    )
    return PriceStatus(updated_on=day, priced_printings=count)


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
    # 500 so a whole set with all variants fits in one request
    limit: Annotated[int, Query(ge=1, le=500)] = 40,
) -> list[PrintingOut]:
    stmt = printings_query()
    if q:
        stmt = stmt.where(matching(q))
    if set_id is not None:
        stmt = stmt.where(Printing.set_id == set_id)
    if language:
        stmt = stmt.where(Printing.language == language)
    # base printing first (False sorts before True), then variants, then reprints
    stmt = stmt.order_by(
        Card.card_number,
        Printing.language,
        Printing.variant != "base",
        Set.code,
        Printing.source_ref,
    )
    return [printing_out(*row) for row in db.execute(stmt.limit(limit))]
