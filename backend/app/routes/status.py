from fastapi import APIRouter, Depends, HTTPException
from ..auth import require_api_key
from ..models import JobStatus
from ..jobs import get_job

router = APIRouter()

@router.get("/status/{job_id}", response_model=JobStatus)
def status(job_id: str, _: str = Depends(require_api_key)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
