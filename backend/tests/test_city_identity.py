"""Backend identity lines come from the city config (Austin by default)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models import IntakeSession
from app.services.city import CityConfigError, load_city
from app.services.prompts import build_instructions, identity_sentence
from app.services.scripted import DEMO_STEPS, welcome_message

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"


def _env(**extra: str) -> dict[str, str]:
    return {"CITY_CONFIG_DIR": str(CONFIG_DIR), **extra}


def test_default_config_gives_austin_strings():
    city = load_city(_env())
    assert city.app_name == "Austin Service Guide"
    assert city.phone311 == "311"
    assert welcome_message(city).startswith("Welcome to the Austin Service Guide! ")
    assert DEMO_STEPS[0]["message"].startswith("Welcome to the Austin Service Guide!")
    assert identity_sentence(city).startswith(
        "You are the intake assistant for the Austin Service Guide, a "
        "City of Austin / Austin Public Health portal"
    )
    assert "Austin Service Guide" in build_instructions(IntakeSession())


def test_preset_changes_greeting_and_prompt_identity():
    city = load_city(_env(CITY_CONFIG="presets/bchc-demo-city.json"))
    assert "Welcome to the Metro Service Guide!" in welcome_message(city)
    sentence = identity_sentence(city)
    assert "Metro Service Guide" in sentence and "Metro Public Health" in sentence
    assert "Austin" not in sentence
    assert load_city(_env(CITY_PRESET="bchc-demo-city")) == city


def test_temp_config_with_other_agency(tmp_path):
    cfg = json.loads((CONFIG_DIR / "city.config.json").read_text())
    cfg["appName"] = "Harbor Guide"
    cfg["agency"] = {"name": "Harbor County Health", "shortName": "HCH", "parent": "Harbor County"}
    (tmp_path / "city.config.json").write_text(json.dumps(cfg))
    city = load_city({"CITY_CONFIG_DIR": str(tmp_path)})
    assert "Welcome to the Harbor Guide!" in welcome_message(city)
    assert "Harbor County / Harbor County Health portal" in identity_sentence(city)


def test_malformed_config_raises_clear_error(tmp_path):
    (tmp_path / "city.config.json").write_text("{not json")
    with pytest.raises(CityConfigError, match="cannot read"):
        load_city({"CITY_CONFIG_DIR": str(tmp_path)})
    (tmp_path / "city.config.json").write_text('{"appName": "X"}')
    with pytest.raises(CityConfigError, match="agency.name"):
        load_city({"CITY_CONFIG_DIR": str(tmp_path)})


def test_missing_or_escaping_config_raises():
    with pytest.raises(CityConfigError):
        load_city(_env(CITY_CONFIG="presets/nope.json"))
    with pytest.raises(CityConfigError):
        load_city(_env(CITY_CONFIG="../backend/requirements.txt"))
    with pytest.raises(CityConfigError):
        load_city({"CITY_CONFIG_DIR": "/nonexistent-dir"})


def test_timezone_and_languages_from_config():
    assert load_city(_env()).timezone == "America/Chicago"
    assert load_city(_env(CITY_PRESET="cedar-ridge-county")).timezone == "America/Los_Angeles"
    assert "en" in load_city(_env()).languages


def test_timezone_absent_is_utc_and_unknown_zone_fails(tmp_path):
    cfg = json.loads((CONFIG_DIR / "city.config.json").read_text())
    del cfg["serviceGuide"]["timezone"]
    (tmp_path / "city.config.json").write_text(json.dumps(cfg))
    assert load_city({"CITY_CONFIG_DIR": str(tmp_path)}).timezone == "UTC"
    cfg["serviceGuide"]["timezone"] = "Mars/Olympus"
    (tmp_path / "city.config.json").write_text(json.dumps(cfg))
    with pytest.raises(CityConfigError):
        load_city({"CITY_CONFIG_DIR": str(tmp_path)})


def test_env_file_selectors_fail_loudly(tmp_path):
    from app.services.city import CityConfigError, check_env_file

    env_file = tmp_path / ".env"
    env_file.write_text("OPENAI_MODEL=x\nCITY_DATA_DIR=data/my-city\n")
    with pytest.raises(CityConfigError, match="CITY_DATA_DIR"):
        check_env_file(env_file, environ={})
    # Same value already in the process environment (compose env_file): fine.
    check_env_file(env_file, environ={"CITY_DATA_DIR": "data/my-city"})
    # Settings-only keys and a missing file are fine.
    (tmp_path / "ok.env").write_text("OPENAI_MODEL=x\n")
    check_env_file(tmp_path / "ok.env", environ={})
    check_env_file(tmp_path / "missing.env", environ={})
