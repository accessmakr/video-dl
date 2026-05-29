from fastapi import APIRouter, Depends, HTTPException
from ..auth import require_api_key
from ..models import AnalyzeRequest, VideoInfo
from ..downloader import fetch_video_info

router = APIRouter()

@router.post("/analyze", response_model=VideoInfo)
def analyze(req: AnalyzeRequest, _: str = Depends(require_api_key)):
    try:
        return fetch_video_info(req.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
