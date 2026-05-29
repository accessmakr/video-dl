import os
from fastapi import Security, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer()

def require_api_key(
    creds: HTTPAuthorizationCredentials = Security(bearer)
) -> str:
    if creds.credentials != os.environ["API_KEY"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return creds.credentials
