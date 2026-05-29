import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from jose import jwt, JWTError

DOWNLOAD_DIR = Path("/tmp/downloads")
router       = APIRouter()

@router.get("/file/{job_id}")
def serve_file(job_id: str, token: str = Query(...)):
    secret = os.environ["JWT_SECRET"]
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        if payload.get("job_id") != job_id:
            raise HTTPException(status_code=403, detail="Token mismatch")
    except JWTError:
        raise HTTPException(status_code=403, detail="Invalid or expired token")

    job_dir = DOWNLOAD_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="File not found")

    files = list(job_dir.iterdir())
    if not files:
        raise HTTPException(status_code=404, detail="No file in job directory")

    filepath = files[0]
    return FileResponse(
        path=str(filepath),
        media_type="application/octet-stream",
        filename=filepath.name,
    )
