import os
import threading
import time
from pathlib import Path
from typing import Callable, Optional

import yt_dlp
from jose import jwt

from .jobs import update_job

DOWNLOAD_DIR = Path("/tmp/downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

BASE_OPTS: dict = {
    "merge_output_format": "mp4",
    "writethumbnail": False,
    "writesubtitles": False,
    "http_headers": {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept":                  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":         "en-US,en;q=0.5",
        "Accept-Encoding":         "gzip, deflate, br",
        "DNT":                     "1",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest":          "document",
        "Sec-Fetch-Mode":          "navigate",
        "Sec-Fetch-Site":          "none",
        "Sec-Fetch-User":          "?1",
    },
    "retries":                   10,
    "fragment_retries":          10,
    "skip_unavailable_fragments": True,
    "ignoreerrors":              False,
    "nocheckcertificate":        True,
    "sleep_interval":            1,
    "max_sleep_interval":        5,
    "geo_bypass":                True,
    "extractor_args": {
        "youtube": {
            "player_client": ["android", "web"],
            "skip": ["translated_subs"],
        },
        "twitter": {
            "api": "graphql",
        },
    },
    "quiet":       True,
    "no_warnings": True,
    "noprogress":  True,
}


def fetch_video_info(url: str) -> dict:
    with yt_dlp.YoutubeDL(BASE_OPTS) as ydl:
        info = ydl.extract_info(url, download=False)

    formats = []
    for f in (info.get("formats") or []):
        if not f.get("url"):
            continue
        formats.append({
            "format_id": f.get("format_id"),
            "ext":       f.get("ext", "mp4"),
            "height":    f.get("height"),
            "fps":       f.get("fps"),
            "vcodec":    f.get("vcodec"),
            "acodec":    f.get("acodec"),
            "filesize":  f.get("filesize") or f.get("filesize_approx"),
            "tbr":       f.get("tbr"),
        })

    return {
        "title":     info.get("title", "Untitled"),
        "thumbnail": info.get("thumbnail"),
        "duration":  info.get("duration"),
        "uploader":  info.get("uploader"),
        "platform":  info.get("extractor_key", "unknown"),
        "formats":   sorted(
            [f for f in formats if f["height"]],
            key=lambda x: x["height"] or 0,
            reverse=True,
        ),
    }


def run_download(job_id: str, url: str, format_id: str) -> None:
    out_dir = DOWNLOAD_DIR / job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    update_job(job_id, status="downloading")

    def progress_hook(d: dict) -> None:
        if d["status"] == "downloading":
            dl  = d.get("downloaded_bytes", 0)
            tot = d.get("total_bytes") or d.get("total_bytes_estimate") or 1
            update_job(
                job_id,
                progress=round((dl / tot) * 100, 1),
                speed=d.get("speed"),
                eta=d.get("eta"),
            )

    opts = {
        **BASE_OPTS,
        "format": format_id,
        "outtmpl": str(out_dir / "%(title)s.%(ext)s"),
        "progress_hooks": [progress_hook],
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info     = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)

        secret = os.environ["JWT_SECRET"]
        token  = jwt.encode(
            {"job_id": job_id, "exp": time.time() + 600},
            secret,
            algorithm="HS256",
        )
        update_job(
            job_id,
            status="done",
            progress=100.0,
            filename=filename,
            download_token=token,
        )
    except Exception as exc:
        update_job(job_id, status="error", error=str(exc))


def start_download_thread(job_id: str, url: str, format_id: str) -> None:
    t = threading.Thread(
        target=run_download, args=(job_id, url, format_id), daemon=True
    )
    t.start()
