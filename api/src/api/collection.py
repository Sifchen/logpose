# every query here filters on the logged in user. someone else's lot is a 404,
# not a 403, so you can't even tell it exists

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.auth import CurrentUser
from api.catalog import PrintingOut, SearchText, matching, printing_out, printings_query
from api.db import Db
from api.models import Location, Lot, Printing, User

router = APIRouter(prefix="/api", tags=["collection"])

Condition = Literal["NM", "EX", "GD", "LP", "PL", "PO"]


class LocationIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class LocationOut(BaseModel):
    id: int
    name: str


class LotIn(BaseModel):
    printing_id: int
    quantity: int = Field(gt=0, le=10_000)
    condition: Condition = "NM"
    acquired_on: date = Field(default_factory=date.today)
    unit_cost_cents: int | None = Field(default=None, ge=0)
    location_id: int | None = None
    note: str | None = Field(default=None, max_length=500)


class LotPatch(BaseModel):
    # only the fields that were sent get changed

    quantity: int | None = Field(default=None, gt=0, le=10_000)
    condition: Condition | None = None
    acquired_on: date | None = None
    unit_cost_cents: int | None = Field(default=None, ge=0)
    location_id: int | None = None
    note: str | None = Field(default=None, max_length=500)


class LotOut(BaseModel):
    id: int
    quantity: int
    condition: str
    acquired_on: date
    unit_cost_cents: int | None
    note: str | None
    location: LocationOut | None
    printing: PrintingOut


@router.get("/locations")
def list_locations(db: Db, user: CurrentUser) -> list[LocationOut]:
    rows = db.scalars(
        select(Location).where(Location.user_id == user.id).order_by(Location.name)
    )
    return [LocationOut(id=loc.id, name=loc.name) for loc in rows]


@router.post("/locations", status_code=201)
def create_location(body: LocationIn, db: Db, user: CurrentUser) -> LocationOut:
    location = Location(user_id=user.id, name=body.name.strip())
    db.add(location)
    try:
        db.commit()
    except IntegrityError:
        # the unique constraint catches it, no racy check before
        db.rollback()
        raise HTTPException(409, f"You already have a location '{location.name}'")
    return LocationOut(id=location.id, name=location.name)


@router.delete("/locations/{location_id}", status_code=204)
def delete_location(location_id: int, db: Db, user: CurrentUser) -> None:
    location = own_location(db, user, location_id)
    if location is None:
        raise HTTPException(404, "Location not found")
    db.delete(location)  # its lots stay, with location_id set to NULL
    db.commit()


def own_location(db: Session, user: User, location_id: int) -> Location | None:
    location = db.get(Location, location_id)
    return location if location and location.user_id == user.id else None


def own_lot(db: Session, user: User, lot_id: int) -> Lot:
    lot = db.get(Lot, lot_id)
    if lot is None or lot.user_id != user.id:
        raise HTTPException(404, "Lot not found")
    return lot


def check_references(
    db: Session, user: User, printing_id: int | None, location_id: int | None
) -> None:
    if printing_id is not None and db.get(Printing, printing_id) is None:
        raise HTTPException(422, "Unknown printing")
    if location_id is not None and own_location(db, user, location_id) is None:
        raise HTTPException(422, "Unknown location")


def lots_query(user: User):
    return (
        printings_query()
        .add_columns(Lot, Location)
        .join(Lot, Lot.printing_id == Printing.id)
        .outerjoin(Location, Location.id == Lot.location_id)
        .where(Lot.user_id == user.id)
    )


def lot_out(printing, card, set_, trend, lot: Lot, location: Location | None) -> LotOut:
    return LotOut(
        id=lot.id,
        quantity=lot.quantity,
        condition=lot.condition,
        acquired_on=lot.acquired_on,
        unit_cost_cents=lot.unit_cost_cents,
        note=lot.note,
        location=LocationOut(id=location.id, name=location.name) if location else None,
        printing=printing_out(printing, card, set_, trend),
    )


def read_lot(db: Session, user: User, lot_id: int) -> LotOut:
    return lot_out(*db.execute(lots_query(user).where(Lot.id == lot_id)).one())


@router.get("/lots")
def list_lots(
    db: Db,
    user: CurrentUser,
    q: SearchText = None,
    set_id: int | None = None,
    location_id: int | None = None,
    condition: Condition | None = None,
    language: str | None = None,
    # no paging yet, 2000 is plenty for now
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
) -> list[LotOut]:
    stmt = lots_query(user)
    if q:
        stmt = stmt.where(matching(q))
    if set_id is not None:
        stmt = stmt.where(Printing.set_id == set_id)
    if location_id is not None:
        stmt = stmt.where(Lot.location_id == location_id)
    if condition:
        stmt = stmt.where(Lot.condition == condition)
    if language:
        stmt = stmt.where(Printing.language == language)
    stmt = stmt.order_by(Lot.acquired_on.desc(), Lot.id.desc()).limit(limit)
    return [lot_out(*row) for row in db.execute(stmt)]


@router.post("/lots", status_code=201)
def create_lot(body: LotIn, db: Db, user: CurrentUser) -> LotOut:
    check_references(db, user, body.printing_id, body.location_id)
    lot = Lot(user_id=user.id, **body.model_dump())
    db.add(lot)
    db.commit()
    return read_lot(db, user, lot.id)


class AddOneIn(BaseModel):
    printing_id: int
    condition: Condition = "NM"
    location_id: int | None = None


@router.post("/lots/add-one")
def add_one(body: AddOneIn, db: Db, user: CurrentUser) -> LotOut:
    # +1 on today's lot for this card/condition/location, or a new lot.
    # lots with a price or a note are left alone, those were typed in by hand
    check_references(db, user, body.printing_id, body.location_id)
    lot = db.scalars(
        select(Lot)
        .where(
            Lot.user_id == user.id,
            Lot.printing_id == body.printing_id,
            Lot.condition == body.condition,
            Lot.location_id.is_not_distinct_from(body.location_id),
            Lot.acquired_on == date.today(),
            Lot.unit_cost_cents.is_(None),
            Lot.note.is_(None),
        )
        .order_by(Lot.id)
        .limit(1)
        # locks the row so two quick clicks don't both read the same quantity.
        # two first clicks at once can still make two lots, total is right anyway
        .with_for_update()
    ).first()
    if lot is None:
        lot = Lot(
            user_id=user.id, quantity=1, acquired_on=date.today(), **body.model_dump()
        )
        db.add(lot)
    else:
        lot.quantity += 1
    db.commit()
    return read_lot(db, user, lot.id)


@router.patch("/lots/{lot_id}")
def update_lot(lot_id: int, body: LotPatch, db: Db, user: CurrentUser) -> LotOut:
    lot = own_lot(db, user, lot_id)
    changes = body.model_dump(exclude_unset=True)
    for field in ("quantity", "condition", "acquired_on"):
        if field in changes and changes[field] is None:
            raise HTTPException(422, f"{field} cannot be empty")
    check_references(db, user, None, changes.get("location_id"))
    for field, value in changes.items():
        setattr(lot, field, value)
    db.commit()
    return read_lot(db, user, lot.id)


@router.delete("/lots/{lot_id}", status_code=204)
def delete_lot(lot_id: int, db: Db, user: CurrentUser) -> None:
    db.delete(own_lot(db, user, lot_id))
    db.commit()
