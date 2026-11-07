from fastapi import FastAPI

from api import auth

app = FastAPI(title="Logpose")
app.include_router(auth.router)


@app.get("/health")
def health():
    return {"status": "ok"}
