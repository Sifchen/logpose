import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api import auth, catalog, collection

app = FastAPI(title="Logpose")
app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(collection.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# in docker the built react app is served from here, same origin as the api so
# the cookie works without CORS. in dev vite serves it. mounted last so it
# doesn't shadow /api
if static_dir := os.environ.get("STATIC_DIR"):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="web")
