from sqlalchemy import select

from api.models import Card, Printing, Set
from api.punkrecords import (
    get_or_create_card,
    get_or_create_set,
    import_pack,
    parse_card_id,
    set_code,
)


def test_set_code_en():
    title = "STARTER DECK -Straw Hat Crew- [ST-01]"
    pack_id = "569001"
    expected = "ST-01"
    actual = set_code(title, pack_id)
    assert actual == expected


def test_set_code_jp():
    title = "スタートデッキ 麦わらの一味【ST-01】"
    pack_id = "569001"
    expected = "ST-01"
    actual = set_code(title, pack_id)
    assert actual == expected


def test_set_code_promo():
    title = "Promotion card"
    pack_id = "550001"
    expected = "PACK-550001"
    actual = set_code(title, pack_id)
    assert actual == expected


def test_parse_card_id_base():
    card_id = "OP01-016"
    expected = ("OP01-016", "base")
    actual = parse_card_id(card_id)
    assert expected == actual


def test_parse_card_id_parallel():
    card_id = "OP01-016_p2"
    expected = ("OP01-016", "parallel")
    actual = parse_card_id(card_id)
    assert expected == actual


def test_parse_card_id_reprint():
    card_id = "OP01-016_r1"
    expected = ("OP01-016", "reprint")
    actual = parse_card_id(card_id)
    assert expected == actual


def test_get_or_create_set_twice(session):
    s1 = get_or_create_set(session, "OP-01", "Romance Dawn")
    s2 = get_or_create_set(session, "OP-01", "Romance Dawn")
    assert s1 is s2
    assert len(session.scalars(select(Set).where(Set.code == "OP-01")).all()) == 1


def test_get_or_create_card_twice(session):
    c1 = get_or_create_card(session, "OP01-016", "Nami", "Character", ["Red"])
    c2 = get_or_create_card(session, "OP01-016", "Nami", "Character", ["Red"])
    assert c1 is c2
    assert len(session.scalars(select(Card)).all()) == 1


def test_import_pack_twice(session):
    pack = {"id": "569101", "raw_title": "BOOSTER PACK -ROMANCE DAWN- [OP-01]"}
    card = {"name": "Nami", "category": "Character", "colors": ["Red"]}
    cards = [
        {
            **card,
            "id": "OP01-016",
            "rarity": "Rare",
            "img_full_url": "https://example.com/OP01-016.png",
        },
        {
            **card,
            "id": "OP01-016_p1",
            "rarity": "Rare",
            "img_full_url": "https://example.com/OP01-016.png",
        },
    ]

    import_pack(session, "english", pack, cards)
    import_pack(session, "english", pack, cards)

    assert len(session.scalars(select(Set)).all()) == 1
    assert len(session.scalars(select(Card)).all()) == 1
    printings = session.scalars(select(Printing).order_by(Printing.source_ref)).all()
    assert [(p.variant, p.language) for p in printings] == [
        ("base", "EN"),
        ("parallel", "EN"),
    ]
