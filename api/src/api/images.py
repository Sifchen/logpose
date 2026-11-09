import hashlib
import os
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

import httpx2
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from api.auth import CurrentUser
from api.db import Db
from api.models import Printing

router = APIRouter(prefix="/api", tags=["images"])

MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", "media"))
BANDAI_HOSTS = {"en.onepiece-cardgame.com", "www.onepiece-cardgame.com"}
PNG = b"\x89PNG\r\n\x1a\n"

# one shared client so the connection stays open, a TLS handshake per image was slow
client = httpx2.Client(timeout=20)


def download(url: str) -> bytes:
    response = client.get(url)
    response.raise_for_status()
    return response.content


# bandai sends CORP: same-site, so browsers won't show their images on our page.
# so we download each image once and serve it ourselves
@router.get("/printings/{printing_id}/image")
def printing_image(printing_id: int, db: Db, _: CurrentUser) -> FileResponse:
    printing = db.get(Printing, printing_id)
    url = printing.image_url if printing else None
    # only bandai urls, otherwise anyone could use this as a proxy
    if not url or urlsplit(url).hostname not in BANDAI_HOSTS:
        raise HTTPException(404, "No image")

    path = MEDIA_DIR / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".png")
    if not path.exists():
        try:
            data = download(url)
        except httpx2.HTTPError:
            raise HTTPException(502, "Image source unavailable")
        if not data.startswith(PNG):
            raise HTTPException(502, "Image source sent something else")
        MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        # temp file + rename, so nobody ever reads a half written image
        with tempfile.NamedTemporaryFile(dir=MEDIA_DIR, delete=False) as tmp:
            tmp.write(data)
        os.replace(tmp.name, path)

    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=604800"},
    )
