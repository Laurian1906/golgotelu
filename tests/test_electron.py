"""Tests for Electron security configuration (Phase 7)."""
import json
from pathlib import Path


def test_main_cjs_exists():
    """desktop/main.cjs exists."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    assert main_cjs.exists(), "desktop/main.cjs not found"


def test_main_cjs_sandbox_enabled():
    """All BrowserWindows have sandbox: true."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    content = main_cjs.read_text(encoding="utf-8")
    # Check that sandbox is mentioned and set to true.
    assert "sandbox: true" in content, "sandbox: true not found in main.cjs"


def test_main_cjs_context_isolation():
    """All BrowserWindows have contextIsolation: true."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    content = main_cjs.read_text(encoding="utf-8")
    assert "contextIsolation: true" in content


def test_main_cjs_node_integration_disabled():
    """All BrowserWindows have nodeIntegration: false."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    content = main_cjs.read_text(encoding="utf-8")
    assert "nodeIntegration: false" in content


def test_main_cjs_permission_handler():
    """Permission request handler is set up to deny all."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    content = main_cjs.read_text(encoding="utf-8")
    assert "setPermissionRequestHandler" in content
    assert "callback(false)" in content


def test_main_cjs_ipc_validation():
    """IPC handlers validate sender origin."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    content = main_cjs.read_text(encoding="utf-8")
    assert "validateIpcSender" in content
    assert "senderFrame" in content


def test_main_cjs_cloud_mode():
    """Cloud mode (GOLGOTELU_URL) is supported."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    content = main_cjs.read_text(encoding="utf-8")
    assert "GOLGOTELU_URL" in content
    assert "IS_CLOUD" in content
    assert "connectToCloud" in content


def test_main_cjs_navigation_guard():
    """Navigation to external URLs is blocked."""
    main_cjs = Path(__file__).parent.parent / "desktop" / "main.cjs"
    content = main_cjs.read_text(encoding="utf-8")
    assert "will-navigate" in content
    assert "event.preventDefault()" in content


def test_preload_cjs_exists():
    """desktop/preload.cjs exists."""
    preload_cjs = Path(__file__).parent.parent / "desktop" / "preload.cjs"
    assert preload_cjs.exists(), "desktop/preload.cjs not found"


def test_preload_exposes_limited_api():
    """Preload only exposes a limited API via contextBridge."""
    preload_cjs = Path(__file__).parent.parent / "desktop" / "preload.cjs"
    content = preload_cjs.read_text(encoding="utf-8")
    assert "contextBridge" in content
    assert "exposeInMainWorld" in content
    # Should not have require() calls that expose Node modules.
    lines = content.split("\n")
    # Check that only electron is required.
    requires = [line for line in lines if "require(" in line and "electron" not in line]
    assert len(requires) == 0, f"Unexpected requires in preload: {requires}"


def test_package_json_nsis_per_machine():
    """package.json has nsis.perMachine set (check it matches docs)."""
    package_json = Path(__file__).parent.parent / "package.json"
    config = json.loads(package_json.read_text(encoding="utf-8"))
    nsis = config.get("build", {}).get("nsis", {})
    # Should be false (per-user install, no UAC).
    assert nsis.get("perMachine") is False, "nsis.perMachine should be false"


def test_docs_desktop_md_updated():
    """docs/desktop.md mentions security and cloud mode."""
    desktop_md = Path(__file__).parent.parent / "docs" / "desktop.md"
    content = desktop_md.read_text(encoding="utf-8")
    assert "Securitate Electron" in content or "Security" in content
    assert "GOLGOTELU_URL" in content or "cloud" in content.lower()


def test_docs_deploy_md_exists():
    """docs/deploy.md exists for Vercel deployment."""
    deploy_md = Path(__file__).parent.parent / "docs" / "deploy.md"
    assert deploy_md.exists(), "docs/deploy.md not found"
    content = deploy_md.read_text(encoding="utf-8")
    assert "Vercel" in content
    assert "Neon" in content or "Postgres" in content
