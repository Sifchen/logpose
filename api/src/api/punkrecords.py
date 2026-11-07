import re

import httpx2
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import engine
from api.models import Card, Printing, Set

# Pinned commit, not main: main changes under us (japanese/packs.json was `{}`
BASE_URL = "https://raw.githubusercontent.com/buhbbl/punk-records/f93e2646e22df629e24e8d54deb5b0e566d4720e"
LANGUAGES = {"english": "EN", "japanese": "JP"}


def set_code(raw_title: str, pack_id: str) -> str:
    match = re.search(r"[\[【]([^\]】]+)[\]】]", raw_title)

    if match:
        return match.group(1)

    return f"PACK-{pack_id}"


def parse_card_id(card_id: str) -> tuple[str, str]:
    nr, _, suffix = card_id.partition("_")

    match suffix[:1]:
        case "p":
            variant = "parallel"
        case "r":
            variant = "reprint"
        case _:
            variant = "base"

    return (nr, variant)


def get_or_create_set(session, code: str, name: str) -> Set:
    res = session.scalars(select(Set).where(Set.code == code)).one_or_none()

    if res is None:
        res = Set(code=code, name=name)
        session.add(res)
        session.flush()

    return res


def get_or_create_card(
    session, card_number: str, name: str, card_type: str, colors: list[str]
) -> Card:
    res = session.scalars(
        select(Card).where(Card.card_number == card_number)
    ).one_or_none()

    if res is None:
        res = Card(
            card_number=card_number, name=name, card_type=card_type, colors=colors
        )
        session.add(res)
        session.flush()

    return res


def get_or_create_printing(
    session,
    source_ref: str,
    card: Card,
    set_: Set,
    rarity: str,
    variant: str,
    language: str,
) -> Printing:
    res = session.scalars(
        select(Printing).where(Printing.source_ref == source_ref)
    ).one_or_none()

    if res is None:
        res = Printing(
            source_ref=source_ref,
            card_id=card.id,
            set_id=set_.id,
            rarity=rarity,
            variant=variant,
            language=language,
        )
        session.add(res)

    return res


def import_pack(session, locale: str, pack: dict, cards: list[dict]) -> None:
    set_ = get_or_create_set(
        session, set_code(pack["raw_title"], pack["id"]), pack["raw_title"]
    )

    for c in cards:
        number, variant = parse_card_id(c["id"])
        if c["rarity"] == "TreasureRare":
            variant = "treasure_rare"

        card = get_or_create_card(
            session, number, c["name"], c["category"], c["colors"]
        )
        get_or_create_printing(
            session,
            f"{locale}:{pack['id']}:{c['id']}",
            card,
            set_,
            c["rarity"],
            variant,
            LANGUAGES[locale],
        )


def fetch(client, path: str):
    response = client.get(f"{BASE_URL}/{path}")
    response.raise_for_status()  # 404 must stop import
    return response.json()


def run() -> None:
    with httpx2.Client() as client, Session(engine) as session:
        for locale in LANGUAGES:  # english first: its names win
            packs = fetch(client, f"{locale}/packs.json")
            for pack in packs.values():
                cards = fetch(client, f"{locale}/data/{pack['id']}.json")
                import_pack(session, locale, pack, cards)
            print(f"{locale}: {len(packs)} packs")
        session.commit()


if __name__ == "__main__":
    run()
