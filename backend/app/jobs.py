import threading
import time
from typing import Dict, Any

_store: Dict[str, Any] = {}
_lock  = threading.Lock()

def create_job(job_id: str, url: str, format_id: str) -> None:
    with _lock:
        _store[job_id] = {
            "status":         "queued",
            "progress":       0.0,
            "speed":          None,
            "eta":            None,
            "error":          None,
            "url":            url,
            "format_id":      format_id,
            "filename":       None,
            "created_at":     time.time(),
            "download_token": None,
        }

def update_job(job_id: str, **kwargs) -> None:
    with _lock:
        if job_id in _store:
            _store[job_id].update(kwargs)

def get_job(job_id: str):
    with _lock:
        return dict(_store.get(job_id, {})) or None

def cleanup_old_jobs(max_age_seconds: int = 3600) -> None:
    now = time.time()
    with _lock:
        dead = [
            k for k, v in _store.items()
            if now - v.get("created_at", 0) > max_age_seconds
        ]
        for k in dead:
            del _store[k]
