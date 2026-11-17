"""Vercel serverless entrypoint: the FastAPI app from app/web.py.

Vercel expects the ASGI app at `api/index.py` as `app`. This file imports the configured FastAPI instance
and applies cloud-specific middleware (rate limiting, security headers)."""
import hmac
import os
import time
from collections import defaultdict

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

# Import the main FastAPI app.
from app.web import app

# ─────────────────────────────────────────────────────────────────────────────
# Rate limiting: simple in-memory limiter for expensive endpoints.
# On Vercel each request may hit a different instance, so this is per-instance
# only — good enough to slow down abuse, not a hard guarantee.
# ─────────────────────────────────────────────────────────────────────────────

RATE_LIMITS = {
    "/api/board/pick": (5, 60),   # 5 requests per 60 seconds
    "/api/chat": (10, 60),        # 10 requests per 60 seconds
    "/api/replace": (10, 60),     # 10 requests per 60 seconds
}

# {endpoint: {ip: [(timestamp, ...)]}}
_request_log: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))


def _get_client_ip(request: Request) -> str:
    """Get client IP, considering Vercel's X-Forwarded-For header."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(request: Request) -> None:
    """Check rate limit for the current request; raises 429 if exceeded."""
    path = request.url.path
    if path not in RATE_LIMITS:
        return

    max_requests, window_seconds = RATE_LIMITS[path]
    client_ip = _get_client_ip(request)
    now = time.time()
    cutoff = now - window_seconds

    # Clean old entries and count recent ones.
    log = _request_log[path][client_ip]
    _request_log[path][client_ip] = [t for t in log if t > cutoff]
    log = _request_log[path][client_ip]

    if len(log) >= max_requests:
        raise HTTPException(
            429,
            f"Prea multe cereri. Încearcă din nou în {int(window_seconds - (now - log[0]))} secunde."
        )

    log.append(now)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware for expensive endpoints."""
    try:
        _check_rate_limit(request)
    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
    return await call_next(request)


# ─────────────────────────────────────────────────────────────────────────────
# Cron endpoint: /api/cron/autopilot
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/cron/autopilot")
def cron_autopilot(request: Request) -> dict:
    """Daily autopilot cron job. Vercel sends CRON_SECRET in the Authorization header."""
    # Verify the cron secret using timing-safe comparison.
    cron_secret = os.environ.get("CRON_SECRET")
    if cron_secret:
        auth_header = request.headers.get("authorization", "")
        expected = f"Bearer {cron_secret}"
        # Use hmac.compare_digest for timing-safe comparison to prevent timing attacks.
        if not hmac.compare_digest(auth_header.encode(), expected.encode()):
            raise HTTPException(401, "Invalid cron secret.")

    from app import service
    result = service.autopilot()
    return {"ok": True, "result": result}


# The `app` export is what Vercel uses.
