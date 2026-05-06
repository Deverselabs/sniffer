from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.api.admin import router as admin_router
from app.api.v1 import router as v1_router
from app.services.jobs import arkham_sync, etherscan_label_scrape, self_learning_sweep, verify_active_contracts

app = FastAPI(title="Sniffer API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sniffer-kzmi.onrender.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(v1_router)
app.include_router(admin_router)

scheduler = AsyncIOScheduler(timezone="UTC")


@app.on_event("startup")
async def start_scheduler() -> None:
    if scheduler.running:
        return
    scheduler.add_job(self_learning_sweep, CronTrigger(hour=3, minute=0), id="self_learning_sweep", replace_existing=True)
    scheduler.add_job(etherscan_label_scrape, CronTrigger(day_of_week="mon", hour=5, minute=0), id="etherscan_label_scrape", replace_existing=True)
    scheduler.add_job(verify_active_contracts, CronTrigger(hour=6, minute=0), id="verify_active_contracts", replace_existing=True)
    scheduler.add_job(arkham_sync, CronTrigger(hour=5, minute=30), id="arkham_sync", replace_existing=True)
    scheduler.start()


@app.on_event("shutdown")
async def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
