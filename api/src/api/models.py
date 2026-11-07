from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Set(Base):
    __tablename__ = "sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_number: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    card_type: Mapped[str]
    colors: Mapped[list[str]] = mapped_column(ARRAY(String))


class Printing(Base):
    __tablename__ = "printings"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("cards.id"))
    set_id: Mapped[int] = mapped_column(ForeignKey("sets.id"))
    rarity: Mapped[str]
    variant: Mapped[str]
    language: Mapped[str]
    source_ref: Mapped[str] = mapped_column(unique=True)
    image_url: Mapped[str | None]
    # cardmarket product id, only if we trust the match
    cardmarket_id: Mapped[int | None] = mapped_column(unique=True)


class PricePoint(Base):
    # one trend price per printing per day. kept as a series because you can't
    # download old prices later

    __tablename__ = "price_points"

    printing_id: Mapped[int] = mapped_column(
        ForeignKey("printings.id"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    trend_cents: Mapped[int]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)  # stored lowercase
    password_hash: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LoginSession(Base):
    # one logged in browser. the cookie has a random token, we only keep its hash

    __tablename__ = "login_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# card conditions, best to worst (cardmarket's names)
CONDITIONS = ("NM", "EX", "GD", "LP", "PL", "PO")


class Location(Base):
    # where the cards are, like a binder or a box

    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]


class Lot(Base):
    # n copies of one printing, bought on the same day for the same price.
    # how many you own is the sum of your lots, not a counter

    __tablename__ = "lots"
    __table_args__ = (
        # the db refuses bad rows even if the api forgets to check
        CheckConstraint("quantity > 0", name="ck_lots_quantity"),
        CheckConstraint(
            "condition in ('" + "','".join(CONDITIONS) + "')",
            name="ck_lots_condition",
        ),
        # 0 = free (pulled or a gift), NULL = don't know
        CheckConstraint("unit_cost_cents >= 0", name="ck_lots_unit_cost"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    printing_id: Mapped[int] = mapped_column(ForeignKey("printings.id"), index=True)
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    quantity: Mapped[int]
    condition: Mapped[str] = mapped_column(default="NM")
    acquired_on: Mapped[date] = mapped_column(Date)
    unit_cost_cents: Mapped[int | None]  # cents, never floats
    note: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
