"""All tunable numbers live here. The admin panel edits a JSON copy of this dict."""
import copy
import json
import os

from . import paths

SYMBOLS = ["J", "Q", "K", "A", "CHECKER", "FOOTBALL", "HELMET", "TROPHY", "SMOKEY", "WILD", "POWERT", "ORB"]
PAYING = ["J", "Q", "K", "A", "CHECKER", "FOOTBALL", "HELMET", "TROPHY", "SMOKEY", "WILD"]
JACKPOTS = ["mini", "minor", "major", "grand"]
ORB_TYPES = ["cash"] + JACKPOTS

#            reel:  1    2    3    4    5
_BASE_WEIGHTS = {
    "J":        [16, 16, 16, 16, 16],
    "Q":        [15, 15, 15, 15, 15],
    "K":        [14, 14, 14, 14, 14],
    "A":        [13, 13, 13, 13, 13],
    "CHECKER":  [11, 11, 11, 11, 11],
    "FOOTBALL": [10, 10, 10, 10, 10],
    "HELMET":   [8, 8, 8, 8, 8],
    "TROPHY":   [6, 6, 6, 6, 6],
    "SMOKEY":   [4, 4, 4, 4, 4],
    "WILD":     [0, 5, 6, 5, 0],
    "POWERT":   [3, 3, 3, 3, 3],
    "ORB":      [6, 6, 6, 6, 6],
}
_FREE_WEIGHTS = {
    "J":        [14, 14, 14, 14, 14],
    "Q":        [14, 14, 14, 14, 14],
    "K":        [13, 13, 13, 13, 13],
    "A":        [13, 13, 13, 13, 13],
    "CHECKER":  [11, 11, 11, 11, 11],
    "FOOTBALL": [10, 10, 10, 10, 10],
    "HELMET":   [9, 9, 9, 9, 9],
    "TROPHY":   [7, 7, 7, 7, 7],
    "SMOKEY":   [5, 5, 5, 5, 5],
    "WILD":     [0, 5, 6, 5, 0],
    "POWERT":   [2, 2, 2, 2, 2],
    "ORB":      [4, 4, 4, 4, 4],
}

DEFAULT_CONFIG = {
    "general": {
        "starting_balance": 1000.00,
        "admin_pin": "1234",
        "persist_balance": True,
        "start_denom": 0.25,
        "start_power_level": 3,
        "music_volume": 0.55,
        "sfx_volume": 0.85,
        "fullscreen": False,
        "turbo_spin": False,
    },
    "bet": {
        # Dollar value of one credit. Every one of these is a selectable mode.
        "denominations": [0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 1.00, 5.00, 10.00],
        # Power levels: total credits wagered per spin (20 paylines always play).
        "power_levels": [20, 30, 40, 50, 75, 100, 150, 200, 300, 500],
    },
    "hit_rates": {
        # "1 in N" spins forces the bonus (lower N = more frequent).
        "orb_bonus_one_in": 135,
        "power_t_bonus_one_in": 165,
        # Weights for how many orbs / Power Ts the trigger lands (6,7,8,9,10,11 / 3,4,5)
        "orb_count_weights": [60, 22, 10, 5, 2, 1],
        "power_t_count_weights": [93, 6, 1],
        # Inside Power T Free Games
        "free_orb_bonus_one_in": 100,
        "free_retrigger_one_in": 45,
    },
    "weights": {"base": copy.deepcopy(_BASE_WEIGHTS), "free": copy.deepcopy(_FREE_WEIGHTS)},
    "paytable": {  # multiples of the LINE bet (total bet / 20) for 3 / 4 / 5 of a kind
        "J": [5, 15, 50],
        "Q": [5, 15, 60],
        "K": [8, 20, 75],
        "A": [8, 25, 100],
        "CHECKER": [12, 40, 150],
        "FOOTBALL": [20, 50, 200],
        "HELMET": [25, 75, 300],
        "TROPHY": [40, 125, 500],
        "SMOKEY": [75, 250, 1000],
        "WILD": [75, 250, 1000],
    },
    # Power T scatter pay for 3 / 4 / 5 symbols, multiples of TOTAL bet
    "scatter_pay": [2, 10, 50],
    "orbs": {
        # Cash orb values, multiples of TOTAL bet, and how often each shows up
        "value_ladder": [0.2, 0.5, 1, 1.5, 2, 3, 5, 8, 10, 20, 50, 100],
        "value_weights": [30, 28, 20, 14, 10, 7, 5, 3, 2, 1.2, 0.5, 0.1],
        # Orb flavours: cash, mini, minor, major, grand
        "type_weights": [965, 24, 9, 2, 0],
        # Jackpot values, multiples of TOTAL bet (at Power Level boost 1.0)
        "jackpots": [20, 50, 250, 2500],
        # Per-power-level jackpot boost (higher power level => bigger jackpots)
        "jackpot_level_boost": [1.0, 1.0, 1.0, 1.0, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4],
        "respins": 3,
        "respin_orb_chance": 0.033,
        "fill_board_grand": True,
    },
    "smokey": {
        "appear_chance": 0.18,        # per respin, Smokey may show up on his own
        "intro_chance": 0.25,         # chance Smokey greets the bonus at the start
        "howl_weight": 60,            # Smokey howls: boosts some orbs
        "fetch_weight": 15,           # Smokey fetches: drops new orbs
        "super_howl_weight": 15,      # Super howl: boosts EVERY orb
        "boost_orbs_min": 1,
        "boost_orbs_max": 3,
        "boost_tiers_min": 1,
        "boost_tiers_max": 2,
        "jackpot_upgrade_chance": 0.3,
        "fetch_orbs_min": 1,
        "fetch_orbs_max": 2,
    },
    "free_games": {
        "spins_awarded": [8, 12, 20],      # for 3 / 4 / 5 Power T
        "retrigger_spins": [4, 6, 10],
        "multipliers": [1, 1, 1, 2, 2, 2, 3, 3],  # win multiplier by spin number
        "smokey_wild_chance": 0.12,        # per free spin, Smokey drops sticky wilds
        "smokey_wild_min": 1,
        "smokey_wild_max": 2,
        "multiplier_on_orbs": False,
    },
}


def deep_merge(base, over):
    out = copy.deepcopy(base)
    if not isinstance(over, dict):
        return out
    for k, v in over.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge(out[k], v)
        elif k in out and isinstance(out[k], list) and isinstance(v, list):
            merged = list(out[k])
            for i, item in enumerate(v[: len(merged)] if _fixed_len(k) else v):
                if i < len(merged):
                    merged[i] = item
                else:
                    merged.append(item)
            out[k] = merged
        elif k in out:
            out[k] = v
    return out


def _fixed_len(key):
    return key not in ("denominations", "power_levels", "multipliers", "jackpot_level_boost")


def load_config(path=None):
    path = path or paths.config_path()
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                cfg = deep_merge(DEFAULT_CONFIG, json.load(fh))
        except (OSError, ValueError):
            pass
    return cfg


def save_config(cfg, path=None):
    path = path or paths.config_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)
    os.replace(tmp, path)


def reset_config():
    return copy.deepcopy(DEFAULT_CONFIG)
