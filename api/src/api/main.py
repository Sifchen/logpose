from fastapi import FastAPI

from api import auth, catalog, collection

app = FastAPI(title="Logpose")
app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(collection.router)


@app.get("/health")
def health():
    return {"status": "ok"}
