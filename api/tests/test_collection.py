from typing import get_args

import pytest
from sqlalchemy.exc import IntegrityError

from api.collection import Condition
from api.models import CONDITIONS, Card, Lot, Printing, Set


@pytest.fixture
def catalog(session):
    # two cards in one set, nami in EN and JP
    op01 = Set(code="OP-01", name="Romance Dawn")
    nami = Card(
        card_number="OP01-016", name="Nami", card_type="Character", colors=["Red"]
    )
    luffy = Card(
        card_number="OP01-024", name="Luffy", card_type="Character", colors=["Red"]
    )
    session.add_all([op01, nami, luffy])
    session.flush()
    printings = {}
    for key, card, lang in [
        ("nami_en", nami, "EN"),
        ("nami_jp", nami, "JP"),
        ("luffy_en", luffy, "EN"),
    ]:
        printings[key] = Printing(
            card_id=card.id,
            set_id=op01.id,
            rarity="Rare",
            variant="base",
            language=lang,
            source_ref=f"{lang}:{card.card_number}",
        )
    session.add_all(printings.values())
    session.flush()
    return {"set": op01, **printings}


def add_lot(client, printing, **fields):
    response = client.post(
        "/api/lots", json={"printing_id": printing.id, "quantity": 1, **fields}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_api_conditions_match_db_constraint():
    assert get_args(Condition) == CONDITIONS


def test_collection_requires_login(client):
    assert client.get("/api/lots").status_code == 401


def test_search_by_name_or_number(logged_in, catalog):
    by_name = logged_in.get("/api/printings", params={"q": "nam"}).json()
    by_number = logged_in.get("/api/printings", params={"q": "OP01-02"}).json()
    assert {p["language"] for p in by_name} == {"EN", "JP"}
    assert [p["name"] for p in by_number] == ["Luffy"]


def test_search_treats_percent_literally(logged_in, catalog):
    assert logged_in.get("/api/printings", params={"q": "%%"}).json() == []


def test_search_lists_the_plain_printing_first(logged_in, session, catalog):
    nami = catalog["nami_en"]
    # its source_ref sorts before the base one, so only the variant rule puts it second
    session.add(
        Printing(
            card_id=nami.card_id,
            set_id=nami.set_id,
            rarity="Rare",
            variant="parallel",
            language="EN",
            source_ref="EN:OP01-015-parallel",
        )
    )
    session.flush()
    found = logged_in.get(
        "/api/printings", params={"q": "OP01-016", "language": "EN"}
    ).json()
    assert [p["variant"] for p in found] == ["base", "parallel"]


def test_create_lot_returns_printing_details(logged_in, catalog):
    lot = add_lot(
        logged_in, catalog["nami_en"], quantity=3, unit_cost_cents=250, condition="EX"
    )
    assert lot["quantity"] == 3
    assert lot["unit_cost_cents"] == 250
    assert lot["printing"]["name"] == "Nami"
    assert lot["printing"]["set_code"] == "OP-01"
    assert lot["acquired_on"]  # defaults to today


@pytest.mark.parametrize(
    "bad",
    [{"quantity": 0}, {"quantity": -1}, {"unit_cost_cents": -5}, {"condition": "MINT"}],
)
def test_invalid_lot_is_rejected(logged_in, catalog, bad):
    body = {"printing_id": catalog["nami_en"].id, "quantity": 1, **bad}
    assert logged_in.post("/api/lots", json=body).status_code == 422


def test_unknown_printing_is_rejected(logged_in, catalog):
    assert (
        logged_in.post(
            "/api/lots", json={"printing_id": 999999, "quantity": 1}
        ).status_code
        == 422
    )


def test_database_also_refuses_zero_quantity(session, user, catalog):
    session.add(
        Lot(
            user_id=user.id,
            printing_id=catalog["nami_en"].id,
            quantity=0,
            acquired_on="2026-01-01",
        )
    )
    with pytest.raises(IntegrityError):
        session.flush()


def test_filters(logged_in, catalog):
    binder = logged_in.post("/api/locations", json={"name": "Red binder"}).json()
    add_lot(logged_in, catalog["nami_en"], location_id=binder["id"])
    add_lot(logged_in, catalog["nami_jp"], condition="LP")
    add_lot(logged_in, catalog["luffy_en"])

    def names(**params):
        lots = logged_in.get("/api/lots", params=params).json()
        return sorted(
            (lot["printing"]["name"], lot["printing"]["language"]) for lot in lots
        )

    assert len(names()) == 3
    assert names(q="luf") == [("Luffy", "EN")]
    assert names(language="JP") == [("Nami", "JP")]
    assert names(condition="LP") == [("Nami", "JP")]
    assert names(location_id=binder["id"]) == [("Nami", "EN")]
    assert len(names(set_id=catalog["set"].id)) == 3


def test_edit_lot(logged_in, catalog):
    lot = add_lot(logged_in, catalog["nami_en"], unit_cost_cents=100, note="from Kai")
    response = logged_in.patch(
        f"/api/lots/{lot['id']}", json={"quantity": 4, "unit_cost_cents": None}
    )
    assert response.status_code == 200
    edited = response.json()
    assert edited["quantity"] == 4
    assert edited["unit_cost_cents"] is None  # explicitly cleared
    assert edited["note"] == "from Kai"  # not sent, so untouched


def test_edit_cannot_null_required_field(logged_in, catalog):
    lot = add_lot(logged_in, catalog["nami_en"])
    assert (
        logged_in.patch(f"/api/lots/{lot['id']}", json={"quantity": None}).status_code
        == 422
    )


def test_delete_lot(logged_in, catalog):
    lot = add_lot(logged_in, catalog["nami_en"])
    assert logged_in.delete(f"/api/lots/{lot['id']}").status_code == 204
    assert logged_in.get("/api/lots").json() == []


def test_duplicate_location_name_is_a_conflict(logged_in):
    assert logged_in.post("/api/locations", json={"name": "Box"}).status_code == 201
    assert logged_in.post("/api/locations", json={"name": "Box"}).status_code == 409


def test_deleting_location_keeps_its_lots(logged_in, catalog):
    box = logged_in.post("/api/locations", json={"name": "Box"}).json()
    add_lot(logged_in, catalog["nami_en"], location_id=box["id"])
    assert logged_in.delete(f"/api/locations/{box['id']}").status_code == 204
    [lot] = logged_in.get("/api/lots").json()
    assert lot["location"] is None


def test_other_users_lots_are_invisible(logged_in, catalog, login_as):
    lot = add_lot(logged_in, catalog["nami_en"])
    box = logged_in.post("/api/locations", json={"name": "Box"}).json()

    client = login_as("zoro@example.com")

    assert client.get("/api/lots").json() == []
    assert (
        client.patch(f"/api/lots/{lot['id']}", json={"quantity": 9}).status_code == 404
    )
    assert client.delete(f"/api/lots/{lot['id']}").status_code == 404
    # and zoro can't put his own lot into nami's box
    body = {
        "printing_id": catalog["nami_en"].id,
        "quantity": 1,
        "location_id": box["id"],
    }
    assert client.post("/api/lots", json=body).status_code == 422


def add_one(client, printing, **fields):
    response = client.post(
        "/api/lots/add-one", json={"printing_id": printing.id, **fields}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_add_one_grows_the_same_lot(logged_in, catalog):
    first = add_one(logged_in, catalog["nami_en"])
    second = add_one(logged_in, catalog["nami_en"])
    assert second["id"] == first["id"]
    assert second["quantity"] == 2
    assert len(logged_in.get("/api/lots").json()) == 1


def test_add_one_keeps_conditions_and_locations_apart(logged_in, catalog):
    box = logged_in.post("/api/locations", json={"name": "Box"}).json()
    ids = {
        add_one(logged_in, catalog["nami_en"])["id"],
        add_one(logged_in, catalog["nami_en"], condition="EX")["id"],
        add_one(logged_in, catalog["nami_en"], location_id=box["id"])["id"],
    }
    assert len(ids) == 3


def test_add_one_leaves_typed_in_purchases_alone(logged_in, catalog):
    bought = add_lot(logged_in, catalog["nami_en"], unit_cost_cents=250)
    noted = add_lot(logged_in, catalog["nami_en"], note="from Zoro")
    added = add_one(logged_in, catalog["nami_en"])
    assert added["id"] not in {bought["id"], noted["id"]}
    assert added["quantity"] == 1


def test_add_one_never_grows_another_users_lot(logged_in, catalog, login_as):
    theirs = add_one(logged_in, catalog["nami_en"])
    mine = add_one(login_as("zoro@example.com"), catalog["nami_en"])
    assert mine["id"] != theirs["id"]
    assert mine["quantity"] == 1


def test_whole_set_in_one_request(logged_in, catalog):
    response = logged_in.get(
        "/api/printings", params={"set_id": catalog["set"].id, "limit": 500}
    )
    assert response.status_code == 200
    assert len(response.json()) == 3
