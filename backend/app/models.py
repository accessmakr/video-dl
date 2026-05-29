from pydantic import BaseModel
from typing import Optional, List

class AnalyzeRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"

class VideoFormat(BaseModel):
    format_id: str
    ext: str
    height:   Optional[int] = None
    fps:      Optional[float] = None
    vcodec:   Optional[str] = None
    acodec:   Optional[str] = None
    filesize: Optional[int] = None
    tbr:      Optional[float] = None

class VideoInfo(BaseModel):
    title:     str
    thumbnail: Optional[str] = None
    duration:  Optional[float] = None
    uploader:  Optional[str] = None
    platform:  str
    formats:   List[VideoFormat]

class JobStatus(BaseModel):
    status:         str
    progress:       float = 0.0
    speed:          Optional[float] = None
    eta:            Optional[int]   = None
    error:          Optional[str]   = None
    download_token: Optional[str]   = None
    filename:       Optional[str]   = None
