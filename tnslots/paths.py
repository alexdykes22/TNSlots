"""Where the game keeps its config and save files (Windows 11 + Linux)."""
import os
import sys


def data_dir() -> str:
    override = os.environ.get("TNSLOTS_HOME")
    if override:
        path = override
    elif sys.platform.startswith("win"):
        path = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "TNSlots")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
        path = os.path.join(base, "tnslots")
    os.makedirs(path, exist_ok=True)
    return path


def config_path() -> str:
    return os.path.join(data_dir(), "config.json")


def save_path() -> str:
    return os.path.join(data_dir(), "save.json")


def asset_dir() -> str:
    """Optional user art overrides: <data dir>/assets/symbols/<NAME>.png"""
    return os.path.join(data_dir(), "assets")
