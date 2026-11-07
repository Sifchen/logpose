from datetime import date

from sqlalchemy import select

from api.cardmarket import (
    OurPrinting,
    Product,
    import_prices,
    load_expansions,
    pair,
    parse,
    to_cents,
)
from api.models import Card, PricePoint, Printing, Set

EXPANSIONS = {5229: ("english", "569101")}


def product(pid, number, listed_at="2023-01-01 10:00:00", trend=None, expansion=5229):
    return Product(pid, expansion, number, listed_at, trend)


def printing(card_id, variant="base", number="OP01-016"):
    return OurPrinting(f"english:569101:{card_id}", number, variant)


def test_to_cents_avoids_float_noise():
    assert to_cents(2.43) == 243
    assert to_cents(0.29) == 29
    assert to_cents(None) is None
    assert to_cents(0) is None  # cardmarket's "no price"


def test_parse_reads_card_number_and_trend():
    products = {
        "products": [
            {
                "idProduct": 1,
                "name": "Uta ( ST11-001)",
                "idExpansion": 9,
                "dateAdded": "x",
            },
            {"idProduct": 2, "name": "Booster Box", "idExpansion": 9, "dateAdded": "x"},
        ]
    }
    prices = {"priceGuides": [{"idProduct": 1, "trend": 1.5}]}
    uta, box = parse(products, prices)
    assert (uta.card_number, uta.trend_cents) == ("ST11-001", 150)
    assert box.card_number is None


def test_single_product_matches_single_printing():
    matched, _ = pair([product(1, "OP01-016")], [printing("OP01-016")], EXPANSIONS)
    assert matched == {1: "english:569101:OP01-016"}


def test_base_and_parallels_pair_in_listing_order():
    products = [
        product(30, "OP01-016", "2023-01-01 10:00:03", trend=900),
        product(10, "OP01-016", "2023-01-01 10:00:01", trend=100),
        product(20, "OP01-016", "2023-01-01 10:00:02", trend=500),
    ]
    ours = [
        printing("OP01-016_p2", "parallel"),
        printing("OP01-016"),
        printing("OP01-016_p1", "parallel"),
    ]
    matched, _ = pair(products, ours, EXPANSIONS)
    assert matched == {
        10: "english:569101:OP01-016",
        20: "english:569101:OP01-016_p1",
        30: "english:569101:OP01-016_p2",
    }


def test_count_mismatch_refuses_the_whole_bucket():
    products = [
        product(1, "OP01-016", "2023-01-01 10:00:01"),
        product(2, "OP01-016", "2023-01-01 10:00:02"),
    ]
    matched, skipped = pair(products, [printing("OP01-016")], EXPANSIONS)
    assert matched == {}
    assert skipped == {"count differs": 2}


def test_same_second_listing_is_refused():
    products = [product(1, "OP01-016"), product(2, "OP01-016")]  # same listed_at
    ours = [printing("OP01-016"), printing("OP01-016_p1", "parallel")]
    matched, skipped = pair(products, ours, EXPANSIONS)
    assert matched == {}
    assert skipped == {"listed in the same second": 2}


def test_parallel_cheaper_than_base_means_order_is_wrong():
    # listed base first, but the "base" costs 600 € and the "parallel" 3 €
    products = [
        product(1, "OP01-016", "2023-01-01 10:00:01", trend=60000),
        product(2, "OP01-016", "2023-01-01 10:00:02", trend=300),
    ]
    ours = [printing("OP01-016"), printing("OP01-016_p1", "parallel")]
    matched, skipped = pair(products, ours, EXPANSIONS)
    assert matched == {}
    assert skipped == {"prices contradict the order": 2}


def test_unknown_expansion_is_skipped():
    matched, skipped = pair(
        [product(1, "OP01-016", expansion=1)], [printing("OP01-016")], EXPANSIONS
    )
    assert matched == {}
    assert skipped == {"unknown expansion": 1}


def test_shipped_expansion_table_loads():
    expansions = load_expansions()
    assert len(expansions) > 100
    assert expansions[5229] == ("english", "569101")  # OP-01, english


def test_import_stores_match_and_todays_price(session):
    op01 = Set(code="OP-01", name="Romance Dawn")
    nami = Card(
        card_number="OP01-016", name="Nami", card_type="Character", colors=["Red"]
    )
    session.add_all([op01, nami])
    session.flush()
    base = Printing(
        card_id=nami.id,
        set_id=op01.id,
        rarity="R",
        variant="base",
        language="EN",
        source_ref="english:569101:OP01-016",
    )
    session.add(base)
    session.flush()
    day = date(2026, 11, 7)

    summary = import_prices(session, [product(690999, "OP01-016", trend=250)], day)
    assert summary["printings_matched"] == 1

    # second run on the same day updates the price instead of adding one
    import_prices(session, [product(690999, "OP01-016", trend=275)], day)
    session.expire_all()
    assert session.get(Printing, base.id).cardmarket_id == 690999
    assert session.scalars(select(PricePoint.trend_cents)).all() == [275]


def test_lot_shows_current_trend(logged_in, session):
    op01 = Set(code="OP-01", name="Romance Dawn")
    nami = Card(
        card_number="OP01-016", name="Nami", card_type="Character", colors=["Red"]
    )
    session.add_all([op01, nami])
    session.flush()
    base = Printing(
        card_id=nami.id,
        set_id=op01.id,
        rarity="R",
        variant="base",
        language="EN",
        source_ref="x",
        cardmarket_id=690999,
    )
    session.add(base)
    session.flush()
    session.add_all(
        [
            PricePoint(printing_id=base.id, day=date(2026, 11, 6), trend_cents=200),
            PricePoint(printing_id=base.id, day=date(2026, 11, 7), trend_cents=240),
        ]
    )
    session.flush()

    lot = logged_in.post(
        "/api/lots", json={"printing_id": base.id, "quantity": 2}
    ).json()
    assert lot["printing"]["trend_cents"] == 240  # the newest day wins
    status = logged_in.get("/api/prices/status").json()
    assert status == {"updated_on": "2026-11-07", "priced_printings": 1}

    # match gets removed (a later run skipped it). the history stays in
    # price_points but the old price shouldn't show up
    base.cardmarket_id = None
    session.flush()
    [lot] = logged_in.get("/api/lots").json()
    assert lot["printing"]["trend_cents"] is None
