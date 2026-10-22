from pathlib import Path

import pytest

from app.services.data_pack import DEFAULT_DATA_DIR, DataPackError, resolve_data_dir


def test_default_is_the_bundled_pack():
    assert resolve_data_dir({}) == DEFAULT_DATA_DIR.resolve()


def test_absolute_path(tmp_path: Path):
    (tmp_path / "categories.yaml").write_text("[]\n")
    assert resolve_data_dir({"CITY_DATA_DIR": str(tmp_path)}) == tmp_path.resolve()


def test_relative_path_resolves_under_config_dir(tmp_path: Path):
    (tmp_path / "city.config.json").write_text("{}")
    pack = tmp_path / "data" / "my-city"
    pack.mkdir(parents=True)
    (pack / "categories.yaml").write_text("[]\n")
    env = {"CITY_CONFIG_DIR": str(tmp_path), "CITY_DATA_DIR": "data/my-city"}
    assert resolve_data_dir(env) == pack.resolve()


def test_directory_without_categories_fails(tmp_path: Path):
    with pytest.raises(DataPackError, match="not a data pack"):
        resolve_data_dir({"CITY_DATA_DIR": str(tmp_path)})
