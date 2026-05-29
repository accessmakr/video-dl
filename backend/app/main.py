import os
import threading
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import analyze, download, status, file
from .jobs import cleanup_old_jobs

app = FastAPI(title="VideoDL API", docs_url=None, redoc_url=None)

ALLOWED_ORIGINS = [
    os.getenv("FRONTEND_URL", ""),
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(analyze.router)
app.include_router(download.router)
app.include_router(status.router)
app.include_router(file.router)

def _cleanup_loop():
    while True:
        time.sleep(1800)
        cleanup_old_jobs(3600)

threading.Thread(target=_cleanup_loop, daemon=True).start()

@app.get("/health")
def health():
    return {"ok": True}
