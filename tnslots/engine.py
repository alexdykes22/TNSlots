"""Pure game maths. No pygame in here, so it can be simulated at full speed.

Money is tracked in integer *credits*; dollars = credits * denomination.
Grids are indexed grid[reel][row] (5 reels x 3 rows).
"""
import random
from dataclasses import dataclass, field

from .config import JACKPOTS, ORB_TYPES, PAYING, SYMBOLS

REELS = 5
ROWS = 3
LINES = 20
PAYLINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2], [1, 0, 1, 0, 1], [1, 2, 1, 2, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [0, 2, 0, 2, 0],
]
ALL_CELLS = [(c, r) for c in range(REELS) for r in range(ROWS)]


@dataclass
class Orb:
    kind: str = "cash"  # cash | mini | minor | major | grand
    tier: int = 0       # index into the cash value ladder

    def copy(self):
        return Orb(self.kind, self.tier)


@dataclass
class LineWin:
    line: int
    symbol: str
    count: int
    credits: float
    cells: list


@dataclass
class SpinResult:
    grid: list
    orbs: dict = field(default_factory=dict)       # (c, r) -> Orb
    line_wins: list = field(default_factory=list)
    line_credits: float = 0.0
    scatter_credits: float = 0.0
    t_cells: list = field(default_factory=list)
    multiplier: int = 1
    trigger: str = None                            # "orb" | "power_t" | None
    total_credits: int = 0                         # (lines + scatter) * multiplier
    free_spins_awarded: int = 0
    new_sticky: list = field(default_factory=list)  # Smokey wilds added this free spin
    sticky: list = field(default_factory=list)


@dataclass
class SmokeyEvent:
    action: str                                    # howl | fetch | super
    boosted: list = field(default_factory=list)    # [(pos, before_orb, after_orb)]
    new_orbs: list = field(default_factory=list)   # [(pos, orb)]


@dataclass
class RespinResult:
    new_orbs: list                                 # [(pos, orb)] landed by the reel spin
    smokey: SmokeyEvent = None
    respins_left: int = 0
    full: bool = False
    done: bool = False


def _weighted_index(rng, weights):
    total = sum(max(0.0, w) for w in weights)
    if total <= 0:
        return 0
    x = rng.random() * total
    acc = 0.0
    for i, w in enumerate(weights):
        acc += max(0.0, w)
        if x < acc:
            return i
    return len(weights) - 1


class Engine:
    def __init__(self, cfg, rng=None):
        self.cfg = cfg
        self.rng = rng or random.Random()
        self._tables = {}

    # ---------------------------------------------------------------- helpers
    def level_boost(self, level):
        boosts = self.cfg["orbs"]["jackpot_level_boost"]
        return float(boosts[min(level, len(boosts) - 1)]) if boosts else 1.0

    def jackpot_mult(self, kind, level):
        idx = JACKPOTS.index(kind)
        return float(self.cfg["orbs"]["jackpots"][idx]) * self.level_boost(level)

    def orb_credits(self, orb, bet, level):
        if orb.kind == "cash":
            ladder = self.cfg["orbs"]["value_ladder"]
            return max(1, int(round(float(ladder[min(orb.tier, len(ladder) - 1)]) * bet)))
        return max(1, int(round(self.jackpot_mult(orb.kind, level) * bet)))

    def new_orb(self):
        o = self.cfg["orbs"]
        kind = ORB_TYPES[_weighted_index(self.rng, o["type_weights"])]
        tier = _weighted_index(self.rng, o["value_weights"]) if kind == "cash" else 0
        return Orb(kind, tier)

    def _table(self, mode, reel, exclude):
        key = (mode, reel, exclude)
        t = self._tables.get(key)
        if t is None:
            w = self.cfg["weights"][mode]
            syms, cum, acc = [], [], 0.0
            for s in SYMBOLS:
                if s in exclude:
                    continue
                v = float(w[s][reel])
                if v > 0:
                    acc += v
                    syms.append(s)
                    cum.append(acc)
            if not syms:
                syms, cum = ["J"], [1.0]
            t = (syms, cum)
            self._tables[key] = t
        return t

    def _pick(self, mode, reel, exclude=()):
        syms, cum = self._table(mode, reel, exclude)
        return self.rng.choices(syms, cum_weights=cum)[0]

    # ---------------------------------------------------------- grid creation
    def _natural_grid(self, mode, fixed=None):
        fixed = fixed or {}
        for _ in range(300):
            grid = [[None] * ROWS for _ in range(REELS)]
            orbs = ts = 0
            for c in range(REELS):
                for r in range(ROWS):
                    s = fixed.get((c, r)) or self._pick(mode, c)
                    grid[c][r] = s
                    orbs += s == "ORB"
                    ts += s == "POWERT"
            if orbs < 6 and ts < 3:
                return grid
        return [[("J" if (c + r) % 2 else "Q") for r in range(ROWS)] for c in range(REELS)]

    def _orb_trigger_grid(self, mode, blocked=()):
        o = self.cfg["hit_rates"]["orb_count_weights"]
        n = 6 + _weighted_index(self.rng, o)
        cells = [p for p in ALL_CELLS if p not in blocked]
        self.rng.shuffle(cells)
        orb_cells = set(cells[: min(n, 15)])
        grid = [[None] * ROWS for _ in range(REELS)]
        for c in range(REELS):
            for r in range(ROWS):
                grid[c][r] = "ORB" if (c, r) in orb_cells else self._pick(mode, c, ("ORB", "POWERT"))
        return grid

    def _t_trigger_grid(self, mode, n=None, blocked=()):
        if n is None:
            n = 3 + _weighted_index(self.rng, self.cfg["hit_rates"]["power_t_count_weights"])
        reels = list(range(REELS))
        self.rng.shuffle(reels)
        t_cells = set()
        for c in reels[:n]:
            rows = [r for r in range(ROWS) if (c, r) not in blocked] or list(range(ROWS))
            t_cells.add((c, self.rng.choice(rows)))
        for _ in range(300):
            grid = [[None] * ROWS for _ in range(REELS)]
            orbs = 0
            for c in range(REELS):
                for r in range(ROWS):
                    if (c, r) in t_cells:
                        grid[c][r] = "POWERT"
                    else:
                        s = self._pick(mode, c, ("POWERT",))
                        orbs += s == "ORB"
                        grid[c][r] = s
            if orbs < 6:
                return grid
        return grid

    # ------------------------------------------------------------- evaluation
    def evaluate(self, grid, bet):
        pays = self.cfg["paytable"]
        line_bet = bet / LINES
        wins, total = [], 0.0
        for li, rows in enumerate(PAYLINES):
            syms = [grid[c][rows[c]] for c in range(REELS)]
            run = 0
            while run < REELS and syms[run] == "WILD":
                run += 1
            base, count = None, 0
            if run < REELS and syms[run] in PAYING:
                base = syms[run]
                count = run
                while count < REELS and syms[count] in (base, "WILD"):
                    count += 1
            best, best_sym, best_n = 0.0, None, 0
            if base and count >= 3:
                best, best_sym, best_n = pays[base][count - 3], base, count
            if run >= 3 and pays["WILD"][run - 3] > best:
                best, best_sym, best_n = pays["WILD"][run - 3], "WILD", run
            if best > 0:
                credits = best * line_bet
                cells = [(c, rows[c]) for c in range(best_n)]
                wins.append(LineWin(li, best_sym, best_n, credits, cells))
                total += credits
        return wins, total

    def _finish(self, grid, bet, level, multiplier=1, trigger=None, sticky=()):
        res = SpinResult(grid=grid, multiplier=multiplier, trigger=trigger, sticky=list(sticky))
        res.line_wins, res.line_credits = self.evaluate(grid, bet)
        res.t_cells = [(c, r) for c in range(REELS) for r in range(ROWS) if grid[c][r] == "POWERT"]
        if len(res.t_cells) >= 3:
            sp = self.cfg["scatter_pay"]
            res.scatter_credits = sp[min(len(res.t_cells), 5) - 3] * bet
        for c in range(REELS):
            for r in range(ROWS):
                if grid[c][r] == "ORB":
                    res.orbs[(c, r)] = self.new_orb()
        res.total_credits = int(round((res.line_credits + res.scatter_credits) * multiplier))
        if res.total_credits == 0 and (res.line_credits + res.scatter_credits) > 0:
            res.total_credits = 1
        return res

    # ---------------------------------------------------------------- spins
    def spin_base(self, bet, level, force=None):
        h = self.cfg["hit_rates"]
        p_orb = 1.0 / max(1.0, float(h["orb_bonus_one_in"]))
        p_t = 1.0 / max(1.0, float(h["power_t_bonus_one_in"]))
        x = self.rng.random()
        if force == "orb":
            x = 0.0
        elif force == "power_t":
            x = p_orb + 1e-12
        if x < p_orb:
            grid, trig = self._orb_trigger_grid("base"), "orb"
        elif x < p_orb + p_t:
            grid, trig = self._t_trigger_grid("base"), "power_t"
        else:
            grid, trig = self._natural_grid("base"), None
        res = self._finish(grid, bet, level, 1, trig)
        if trig == "power_t":
            res.free_spins_awarded = self.free_spins_for(len(res.t_cells))
        return res

    def free_spins_for(self, n_t, retrigger=False):
        key = "retrigger_spins" if retrigger else "spins_awarded"
        table = self.cfg["free_games"][key]
        return int(table[min(max(n_t, 3), 5) - 3])

    # ------------------------------------------------------------- hold & spin
    def start_hold_and_spin(self, orbs, bet, level):
        return HoldAndSpin(self, orbs, bet, level)

    def start_free_games(self, spins, bet, level):
        return FreeGames(self, spins, bet, level)


class HoldAndSpin:
    """Smokey's Orb Link: orbs lock, respins reset to 3 whenever a new orb lands."""

    def __init__(self, engine, orbs, bet, level):
        self.e = engine
        self.bet, self.level = bet, level
        self.orbs = {p: o.copy() for p, o in orbs.items()}
        self.respins_total = int(engine.cfg["orbs"]["respins"])
        self.respins_left = self.respins_total
        self.done = False
        self.intro_smokey = None
        if engine.rng.random() < engine.cfg["smokey"]["intro_chance"]:
            self.intro_smokey = self._smokey()

    def empty_cells(self):
        return [p for p in ALL_CELLS if p not in self.orbs]

    def value(self, orb):
        return self.e.orb_credits(orb, self.bet, self.level)

    def total(self):
        t = sum(self.value(o) for o in self.orbs.values())
        if len(self.orbs) >= len(ALL_CELLS) and self.e.cfg["orbs"]["fill_board_grand"]:
            t += self.grand_bonus()
        return t

    def grand_bonus(self):
        return self.e.orb_credits(Orb("grand"), self.bet, self.level)

    # ---- Smokey
    def _smokey(self):
        e, s = self.e, self.e.cfg["smokey"]
        action = ["howl", "fetch", "super"][_weighted_index(
            e.rng, [s["howl_weight"], s["fetch_weight"], s["super_howl_weight"]])]
        ev = SmokeyEvent(action)
        ladder_max = len(e.cfg["orbs"]["value_ladder"]) - 1
        if action == "fetch":
            empties = self.empty_cells()
            if not empties:
                action = ev.action = "howl"
            else:
                e.rng.shuffle(empties)
                n = e.rng.randint(int(s["fetch_orbs_min"]), max(int(s["fetch_orbs_min"]), int(s["fetch_orbs_max"])))
                for p in empties[:n]:
                    o = e.new_orb()
                    self.orbs[p] = o
                    ev.new_orbs.append((p, o.copy()))
                return ev
        if not self.orbs:
            return ev
        pos = list(self.orbs)
        if action == "super":
            targets = pos
        else:
            e.rng.shuffle(pos)
            k = e.rng.randint(int(s["boost_orbs_min"]), max(int(s["boost_orbs_min"]), int(s["boost_orbs_max"])))
            targets = pos[:k]
        for p in targets:
            before = self.orbs[p].copy()
            o = self.orbs[p]
            if o.kind == "cash":
                step = e.rng.randint(int(s["boost_tiers_min"]), max(int(s["boost_tiers_min"]), int(s["boost_tiers_max"])))
                o.tier = min(ladder_max, o.tier + step)
            elif o.kind in ("mini", "minor") and e.rng.random() < s["jackpot_upgrade_chance"]:
                o.kind = JACKPOTS[JACKPOTS.index(o.kind) + 1]
            ev.boosted.append((p, before, o.copy()))
        return ev

    # ---- one respin
    def step(self):
        e = self.e
        chance = float(e.cfg["orbs"]["respin_orb_chance"])
        new = []
        for p in self.empty_cells():
            if e.rng.random() < chance:
                o = e.new_orb()
                self.orbs[p] = o
                new.append((p, o.copy()))
        ev = None
        if self.empty_cells() and e.rng.random() < e.cfg["smokey"]["appear_chance"]:
            ev = self._smokey()
        if new or (ev and ev.new_orbs):
            self.respins_left = self.respins_total
        else:
            self.respins_left -= 1
        full = len(self.orbs) >= len(ALL_CELLS)
        if full or self.respins_left <= 0:
            self.done = True
        return RespinResult(new, ev, self.respins_left, full, self.done)

    def play_out(self):
        while not self.done:
            self.step()
        return self.total()


class FreeGames:
    """Power T Free Games: climbing multipliers, Smokey sticky wilds, nested bonuses."""

    def __init__(self, engine, spins, bet, level):
        self.e = engine
        self.bet, self.level = bet, level
        self.spins_left = spins
        self.spins_played = 0
        self.total_credits = 0
        self.sticky = set()

    @property
    def done(self):
        return self.spins_left <= 0

    def multiplier(self):
        m = self.e.cfg["free_games"]["multipliers"]
        return int(m[min(self.spins_played, len(m) - 1)]) if m else 1

    def play_spin(self):
        e, cfg = self.e, self.e.cfg
        fg = cfg["free_games"]
        new_sticky = []
        if e.rng.random() < fg["smokey_wild_chance"]:
            cand = [(c, r) for c in range(1, 4) for r in range(ROWS) if (c, r) not in self.sticky]
            e.rng.shuffle(cand)
            n = e.rng.randint(int(fg["smokey_wild_min"]), max(int(fg["smokey_wild_min"]), int(fg["smokey_wild_max"])))
            new_sticky = cand[:n]
            self.sticky.update(new_sticky)
        h = cfg["hit_rates"]
        x = e.rng.random()
        p_orb = 1.0 / max(1.0, float(h["free_orb_bonus_one_in"]))
        p_t = 1.0 / max(1.0, float(h["free_retrigger_one_in"]))
        blocked = tuple(self.sticky)
        if x < p_orb:
            grid, trig = e._orb_trigger_grid("free", blocked), "orb"
        elif x < p_orb + p_t:
            grid, trig = e._t_trigger_grid("free", None, blocked), "power_t"
        else:
            grid, trig = e._natural_grid("free", {p: "WILD" for p in self.sticky}), None
        for p in self.sticky:
            grid[p[0]][p[1]] = "WILD"
        mult = self.multiplier()
        res = e._finish(grid, self.bet, self.level, mult, trig, self.sticky)
        res.new_sticky = new_sticky
        self.spins_left -= 1
        self.spins_played += 1
        if trig == "power_t":
            res.free_spins_awarded = e.free_spins_for(len(res.t_cells), retrigger=True)
            self.spins_left += res.free_spins_awarded
        self.total_credits += res.total_credits
        return res

    def add_win(self, credits):
        self.total_credits += credits
