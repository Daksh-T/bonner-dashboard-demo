from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..settings import AppConfig, DEFAULT_MESSAGE_TEMPLATES, TEMPLATE_VARIABLES, default_config, get_config, save_config
from ..data.loader import STATE
from ..data.processor import data_status, load_dashboard_data

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
def read_config():
    return get_config().model_dump(mode="json")


@router.get("/template-defaults")
def template_defaults():
    return {"templates": DEFAULT_MESSAGE_TEMPLATES, "variables": TEMPLATE_VARIABLES}


@router.put("")
def write_config(payload: dict[str, Any] = Body(...)):
    """Merge the supplied keys over the current config, validate, persist, and
    reload the dashboard so changes (checkpoints, cohorts, reflection rules, data
    source) take effect immediately."""
    current = get_config().model_dump(mode="json")
    merged = {**current, **payload}
    return _save_and_reload(merged)


@router.post("/import")
def import_config(payload: dict[str, Any] = Body(...)):
    """Replace the entire config from a portable settings JSON (export/import)."""
    # Merge over defaults so older/partial exports still validate.
    base = default_config().model_dump(mode="json")
    base.update(payload)
    return _save_and_reload(base)


def _save_and_reload(merged: dict[str, Any]) -> dict[str, Any]:
    try:
        config = AppConfig.model_validate(merged)
    except Exception as exc:  # pragma: no cover - validation feedback
        raise HTTPException(status_code=422, detail=f"Invalid config: {exc}") from exc
    save_config(config)
    status = {"saved": True, "config": config.model_dump(mode="json")}
    try:
        status["data"] = load_dashboard_data(checkpoint_name=STATE.active_checkpoint or None, force=True)
    except Exception as exc:
        status["data"] = data_status()
        status["load_error"] = str(exc)
    return status


@router.post("/export-file")
def export_settings_file():
    """Write the current settings JSON to the user's Downloads folder.

    Only does so in the desktop app (the embedded webview can't handle browser
    blob downloads); in hosted/browser mode returns ``saved: false`` so the
    frontend falls back to a normal browser download.
    """
    if not os.getenv("BONNER_DESKTOP"):
        return {"saved": False}
    config = get_config()
    slug = re.sub(r"\s+", "-", (config.program_name or "bonner").strip().lower()) or "bonner"
    downloads = Path.home() / "Downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    target = downloads / f"{slug}-settings.json"
    target.write_text(json.dumps(config.model_dump(mode="json"), indent=2), encoding="utf-8")
    return {"saved": True, "path": str(target)}


@router.post("/reset")
def reset_config():
    config = save_config(default_config())
    return {"saved": True, "config": config.model_dump(mode="json")}


@router.post("/onboarding-complete")
def complete_onboarding():
    config = get_config()
    config.onboarding_complete = True
    save_config(config)
    return {"onboarding_complete": True}
