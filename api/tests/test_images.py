import httpx2
import pytest

from api import images
from api.models import Card, Printing, Set

PICTURE = images.PNG + b"rest of the picture"


@pytest.fixture
def media(tmp_path, monkeypatch):
    # images go to a temp folder, downloads only get recorded
    fetched = []

    def download(url):
        fetched.append(url)
        return PICTURE

    monkeypatch.setattr(images, "MEDIA_DIR", tmp_path)
    monkeypatch.setattr(images, "download", download)
    return fetched


def printing(session, image_url):
    op01 = Set(code="OP-01", name="Romance Dawn")
    zoro = Card(card_number="OP01-001", name="Zoro", card_type="Leader", colors=["Red"])
    session.add_all([op01, zoro])
    session.flush()
    p = Printing(
        card_id=zoro.id,
        set_id=op01.id,
        rarity="L",
        variant="base",
        language="EN",
        source_ref="EN:OP01-001",
        image_url=image_url,
    )
    session.add(p)
    session.flush()
    return p


BANDAI = "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?1"


def test_picture_is_fetched_once_then_served_from_disk(logged_in, session, media):
    p = printing(session, BANDAI)
    for _ in range(2):
        response = logged_in.get(f"/api/printings/{p.id}/image")
        assert response.status_code == 200
        assert response.content == PICTURE
        assert response.headers["content-type"] == "image/png"
    assert media == [BANDAI]


def test_api_points_at_our_own_address(logged_in, session, media):
    p = printing(session, BANDAI)
    [out] = logged_in.get("/api/printings", params={"q": "zoro"}).json()
    assert out["image_url"] == f"/api/printings/{p.id}/image"
    assert out["colors"] == ["Red"]


def test_other_hosts_are_never_fetched(logged_in, session, media):
    p = printing(session, "http://169.254.169.254/latest/meta-data")
    assert logged_in.get(f"/api/printings/{p.id}/image").status_code == 404
    assert media == []


def test_non_png_is_refused_and_not_kept(logged_in, session, media, monkeypatch):
    p = printing(session, BANDAI)
    monkeypatch.setattr(images, "download", lambda url: b"<html>oops</html>")
    assert logged_in.get(f"/api/printings/{p.id}/image").status_code == 502
    assert list(images.MEDIA_DIR.iterdir()) == []


def test_source_down_is_a_bad_gateway(logged_in, session, media, monkeypatch):
    p = printing(session, BANDAI)

    def down(url):
        raise httpx2.ConnectError("no route")

    monkeypatch.setattr(images, "download", down)
    assert logged_in.get(f"/api/printings/{p.id}/image").status_code == 502


def test_pictures_need_a_login(client, session, media):
    p = printing(session, BANDAI)
    assert client.get(f"/api/printings/{p.id}/image").status_code == 401
