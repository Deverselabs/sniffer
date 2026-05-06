from fastapi import FastAPI

from app.api.v1 import router as v1_router

app = FastAPI(title="Sniffer API", version="1.0.0")
app.include_router(v1_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
