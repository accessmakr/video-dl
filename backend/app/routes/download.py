import uuid
from fastapi import APIRouter, Depends
from ..auth import require_api_key
from ..models import DownloadRequest
from ..jobs import create_job
from ..downloader import start_download_thread

router = APIRouter()

@router.post("/download")
def download(req: DownloadRequest, _: str = Depends(require_api_key)):
    job_id = str(uuid.uuid4())
    create_job(job_id, req.url, req.format_id)
    start_download_thread(job_id, req.url, req.format_id)
    return {"job_id": job_id}
