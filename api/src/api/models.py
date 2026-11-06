from sqlalchemy import ForeignKey, String
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
