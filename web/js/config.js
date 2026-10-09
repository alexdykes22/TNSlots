/* Generated from tnslots/config.py defaults. */
const DEFAULT_CONFIG = {
  "general": {
    "starting_balance": 1000.0,
    "admin_pin": "1234",
    "persist_balance": true,
    "start_denom": 0.25,
    "start_power_level": 3,
    "music_volume": 0.55,
    "sfx_volume": 0.85,
    "fullscreen": false,
    "turbo_spin": false
  },
  "bet": {
    "denominations": [
      0.01,
      0.02,
      0.05,
      0.1,
      0.25,
      0.5,
      1.0,
      5.0,
      10.0
    ],
    "power_levels": [
      20,
      30,
      40,
      50,
      75,
      100,
      150,
      200,
      300,
      500
    ]
  },
  "hit_rates": {
    "orb_bonus_one_in": 135,
    "power_t_bonus_one_in": 165,
    "orb_count_weights": [
      60,
      22,
      10,
      5,
      2,
      1
    ],
    "power_t_count_weights": [
      93,
      6,
      1
    ],
    "free_orb_bonus_one_in": 100,
    "free_retrigger_one_in": 45
  },
  "weights": {
    "base": {
      "J": [
        16,
        16,
        16,
        16,
        16
      ],
      "Q": [
        15,
        15,
        15,
        15,
        15
      ],
      "K": [
        14,
        14,
        14,
        14,
        14
      ],
      "A": [
        13,
        13,
        13,
        13,
        13
      ],
      "CHECKER": [
        11,
        11,
        11,
        11,
        11
      ],
      "FOOTBALL": [
        10,
        10,
        10,
        10,
        10
      ],
      "HELMET": [
        8,
        8,
        8,
        8,
        8
      ],
      "TROPHY": [
        6,
        6,
        6,
        6,
        6
      ],
      "SMOKEY": [
        4,
        4,
        4,
        4,
        4
      ],
      "WILD": [
        0,
        5,
        6,
        5,
        0
      ],
      "POWERT": [
        3,
        3,
        3,
        3,
        3
      ],
      "ORB": [
        6,
        6,
        6,
        6,
        6
      ]
    },
    "free": {
      "J": [
        14,
        14,
        14,
        14,
        14
      ],
      "Q": [
        14,
        14,
        14,
        14,
        14
      ],
      "K": [
        13,
        13,
        13,
        13,
        13
      ],
      "A": [
        13,
        13,
        13,
        13,
        13
      ],
      "CHECKER": [
        11,
        11,
        11,
        11,
        11
      ],
      "FOOTBALL": [
        10,
        10,
        10,
        10,
        10
      ],
      "HELMET": [
        9,
        9,
        9,
        9,
        9
      ],
      "TROPHY": [
        7,
        7,
        7,
        7,
        7
      ],
      "SMOKEY": [
        5,
        5,
        5,
        5,
        5
      ],
      "WILD": [
        0,
        5,
        6,
        5,
        0
      ],
      "POWERT": [
        2,
        2,
        2,
        2,
        2
      ],
      "ORB": [
        4,
        4,
        4,
        4,
        4
      ]
    }
  },
  "paytable": {
    "J": [
      5,
      15,
      50
    ],
    "Q": [
      5,
      15,
      60
    ],
    "K": [
      8,
      20,
      75
    ],
    "A": [
      8,
      25,
      100
    ],
    "CHECKER": [
      12,
      40,
      150
    ],
    "FOOTBALL": [
      20,
      50,
      200
    ],
    "HELMET": [
      25,
      75,
      300
    ],
    "TROPHY": [
      40,
      125,
      500
    ],
    "SMOKEY": [
      75,
      250,
      1000
    ],
    "WILD": [
      75,
      250,
      1000
    ]
  },
  "scatter_pay": [
    2,
    10,
    50
  ],
  "orbs": {
    "value_ladder": [
      0.2,
      0.5,
      1,
      1.5,
      2,
      3,
      5,
      8,
      10,
      20,
      50,
      100
    ],
    "value_weights": [
      30,
      28,
      20,
      14,
      10,
      7,
      5,
      3,
      2,
      1.2,
      0.5,
      0.1
    ],
    "type_weights": [
      965,
      24,
      9,
      2,
      0
    ],
    "jackpots": [
      20,
      50,
      250,
      2500
    ],
    "jackpot_level_boost": [
      1.0,
      1.0,
      1.0,
      1.0,
      1.05,
      1.1,
      1.15,
      1.2,
      1.3,
      1.4
    ],
    "respins": 3,
    "respin_orb_chance": 0.033,
    "fill_board_grand": true
  },
  "smokey": {
    "appear_chance": 0.18,
    "intro_chance": 0.25,
    "howl_weight": 60,
    "fetch_weight": 15,
    "super_howl_weight": 15,
    "boost_orbs_min": 1,
    "boost_orbs_max": 3,
    "boost_tiers_min": 1,
    "boost_tiers_max": 2,
    "jackpot_upgrade_chance": 0.3,
    "fetch_orbs_min": 1,
    "fetch_orbs_max": 2
  },
  "free_games": {
    "spins_awarded": [
      8,
      12,
      20
    ],
    "retrigger_spins": [
      4,
      6,
      10
    ],
    "multipliers": [
      1,
      1,
      1,
      2,
      2,
      2,
      3,
      3
    ],
    "smokey_wild_chance": 0.12,
    "smokey_wild_min": 1,
    "smokey_wild_max": 2,
    "multiplier_on_orbs": false
  }
};

const SYMBOLS = ["J","Q","K","A","CHECKER","FOOTBALL","HELMET","TROPHY","SMOKEY","WILD","POWERT","ORB"];
const PAYING = ["J","Q","K","A","CHECKER","FOOTBALL","HELMET","TROPHY","SMOKEY","WILD"];
const JACKPOTS = ["mini","minor","major","grand"];
const ORB_TYPES = ["cash","mini","minor","major","grand"];
const VAR_LEN = ["denominations","power_levels","multipliers","jackpot_level_boost"];
const CFG_KEY = "volspowerlink.config.v1";
const SAVE_KEY = "volspowerlink.save.v1";

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function deepMerge(base, over) {
  const out = clone(base);
  if (!over || typeof over !== "object") return out;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (!(k in out)) continue;
    if (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(out[k], v);
    } else if (Array.isArray(out[k]) && Array.isArray(v)) {
      const merged = out[k].slice();
      const src = VAR_LEN.includes(k) ? v : v.slice(0, merged.length);
      src.forEach((item, i) => { merged[i] = item; });
      out[k] = merged;
    } else if (typeof out[k] === typeof v) {
      out[k] = v;
    }
  }
  return out;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return deepMerge(DEFAULT_CONFIG, JSON.parse(raw));
  } catch (e) {}
  return clone(DEFAULT_CONFIG);
}
function saveConfig(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
function resetConfig() { return clone(DEFAULT_CONFIG); }
if (typeof module !== "undefined") module.exports = { DEFAULT_CONFIG, SYMBOLS, PAYING, JACKPOTS, ORB_TYPES, deepMerge, clone };
