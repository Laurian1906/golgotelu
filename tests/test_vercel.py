"""Tests for Vercel deployment configuration and API entrypoint."""
import json
from pathlib import Path

import pytest


def test_vercel_json_exists():
    """vercel.json exists and is valid JSON."""
    vercel_json = Path(__file__).parent.parent / "vercel.json"
    assert vercel_json.exists(), "vercel.json not found"
    config = json.loads(vercel_json.read_text(encoding="utf-8"))
    assert config["version"] == 2


def test_vercel_json_cron():
    """Cron job is configured for autopilot."""
    vercel_json = Path(__file__).parent.parent / "vercel.json"
    config = json.loads(vercel_json.read_text(encoding="utf-8"))
    crons = config.get("crons", [])
    assert len(crons) >= 1, "No cron jobs configured"
    autopilot = next((c for c in crons if "autopilot" in c.get("path", "")), None)
    assert autopilot is not None, "Autopilot cron not found"
    assert autopilot["schedule"] == "0 6 * * *"


def test_vercel_json_functions():
    """Functions are configured with maxDuration."""
    vercel_json = Path(__file__).parent.parent / "vercel.json"
    config = json.loads(vercel_json.read_text(encoding="utf-8"))
    functions = config.get("functions", {})
    assert "api/**/*.py" in functions
    assert functions["api/**/*.py"]["maxDuration"] == 300


def test_vercel_json_security_headers():
    """Security headers are configured."""
    vercel_json = Path(__file__).parent.parent / "vercel.json"
    config = json.loads(vercel_json.read_text(encoding="utf-8"))
    headers = config.get("headers", [])
    assert len(headers) >= 1, "No headers configured"

    # Check API headers.
    api_headers = next((h for h in headers if h.get("source") == "/api/(.*)"), None)
    assert api_headers is not None, "API headers not found"
    header_keys = {h["key"] for h in api_headers["headers"]}
    assert "X-Content-Type-Options" in header_keys
    assert "X-Frame-Options" in header_keys


def test_requirements_txt_exists():
    """requirements.txt exists for Vercel Python runtime."""
    requirements = Path(__file__).parent.parent / "requirements.txt"
    assert requirements.exists(), "requirements.txt not found"
    content = requirements.read_text(encoding="utf-8")
    # Essential dependencies.
    assert "fastapi" in content
    assert "psycopg" in content
    assert "msal" in content


def test_api_entrypoint_exists():
    """api/index.py entrypoint exists."""
    entrypoint = Path(__file__).parent.parent / "api" / "index.py"
    assert entrypoint.exists(), "api/index.py not found"


def test_api_entrypoint_imports_app():
    """api/index.py imports the FastAPI app."""
    entrypoint = Path(__file__).parent.parent / "api" / "index.py"
    content = entrypoint.read_text(encoding="utf-8")
    assert "from app.web import app" in content


def test_api_entrypoint_rate_limiting():
    """api/index.py has rate limiting middleware."""
    entrypoint = Path(__file__).parent.parent / "api" / "index.py"
    content = entrypoint.read_text(encoding="utf-8")
    assert "RATE_LIMITS" in content
    assert "rate_limit_middleware" in content


def test_api_entrypoint_cron_endpoint():
    """api/index.py has cron autopilot endpoint."""
    entrypoint = Path(__file__).parent.parent / "api" / "index.py"
    content = entrypoint.read_text(encoding="utf-8")
    assert "/api/cron/autopilot" in content
    assert "CRON_SECRET" in content


def test_env_example_has_cloud_vars():
    """.env.example includes all cloud deployment variables."""
    env_example = Path(__file__).parent.parent / ".env.example"
    assert env_example.exists(), ".env.example not found"
    content = env_example.read_text(encoding="utf-8")

    required_vars = [
        "DATABASE_URL",
        "MS_CLIENT_ID",
        "MS_CLIENT_SECRET",
        "MS_REDIRECT_URI",
        "ALLOWED_EMAILS",
        "SESSION_SECRET",
        "TOKEN_ENCRYPTION_KEY",
        "CRON_SECRET",
        "GOLGOTELU_URL",
    ]
    for var in required_vars:
        assert var in content, f"{var} not in .env.example"
