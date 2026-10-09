"""In-game admin / operator panel: every number that drives the maths is editable here."""
import copy
import math
import threading

import pygame

from . import gfx, simulate
from .config import DEFAULT_CONFIG, JACKPOTS, PAYING, SYMBOLS, deep_merge
from .gfx import ORANGE, WHITE, draw_text
from .ui import H, W, money

CELL_W, CELL_H = 94, 32
ROW_H = 44


class Field:
    def __init__(self, label, path, kind="num", lo=0.0, hi=1e9, step=1.0, note=None, per_row=6,
                 cell_labels=None, action=None, choices=None):
        self.label, self.path, self.kind = label, tuple(path.split(".")) if isinstance(path, str) else path, kind
        self.lo, self.hi, self.step, self.note = lo, hi, step, note
        self.per_row, self.cell_labels, self.action, self.choices = per_row, cell_labels, action, choices

    def height(self, work):
        if self.kind == "vec":
            n = len(get(work, self.path))
            return ROW_H * max(1, math.ceil(n / self.per_row))
        return ROW_H

    def ncells(self, work):
        if self.kind == "vec":
            return len(get(work, self.path))
        return 1


class Info:
    def __init__(self, text, color=(190, 190, 210)):
        self.text, self.color = text, color

    def height(self, work):
        return 30

    def ncells(self, work):
        return 0


def get(cfg, path):
    for k in path:
        cfg = cfg[k]
    return cfg


def put(cfg, path, value):
    for k in path[:-1]:
        cfg = cfg[k]
    cfg[path[-1]] = value


def fmt_num(v):
    if isinstance(v, bool):
        return "ON" if v else "OFF"
    if isinstance(v, int):
        return str(v)
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s or "0"


class Admin:
    def __init__(self, game):
        self.g = game
        self.visible = False
        self.mode = "pin"          # pin | main
        self.pin_buf = ""
        self.pin_err = 0.0
        self.work = None
        self.page = 0
        self.sel = (0, 0)
        self.edit = None
        self.scroll = 0.0
        self.dirty = False
        self.confirm_close = False
        self.confirm_reset = False
        self.sim = dict(running=False, progress=0.0, result=None, spins=100000, level=1, cancel=False)
        self.build_pages()

    # ------------------------------------------------------------------ pages
    def build_pages(self):
        def pct(path, one_in=True):
            return lambda w: (f"= {100.0 / max(1.0, get(w, path)):.3f}% of spins  (about every {get(w, path):g} spins)")

        def reel_share(mode, sym):
            def f(w):
                out = []
                for r in range(5):
                    tot = sum(max(0, get(w, ("weights", mode, s))[r]) for s in SYMBOLS) or 1
                    out.append(f"{100 * get(w, ('weights', mode, sym))[r] / tot:.1f}%")
                return "per-cell chance: " + "  ".join(out)
            return f

        weights_pages = []
        for mode, title in (("base", "Reel Weights: Base"), ("free", "Reel Weights: Free")):
            fields = [Info("Relative weights per reel (higher = more frequent). Columns are reels 1-5. Wilds default to reels 2-4 only.")]
            for s in SYMBOLS:
                fields.append(Field(s if s not in ("POWERT", "ORB") else {"POWERT": "POWER T", "ORB": "MONEY ORB"}[s],
                                    ("weights", mode, s), "vec", 0, 10000, 1, note=None, per_row=5,
                                    cell_labels=["R1", "R2", "R3", "R4", "R5"]))
            fields.append(Info("Tip: only the *hit rates* page forces bonuses. These weights decide how often orbs / Power Ts / wilds "
                               "show up as near-misses and line wins."))
            weights_pages.append((title, fields))

        self.pages = [
            ("General", [
                Field("Starting balance ($)", "general.starting_balance", "num", 0, 1e7, 100),
                Field("Admin PIN (blank = no PIN)", "general.admin_pin", "str"),
                Field("Remember balance between sessions", "general.persist_balance", "bool"),
                Field("Starting denomination ($)", "general.start_denom", "num", 0.01, 10, 0.01),
                Field("Starting power level", "general.start_power_level", "int", 1, 99, 1),
                Field("Music volume (0-1)", "general.music_volume", "num", 0, 1, 0.05),
                Field("Sound-effect volume (0-1)", "general.sfx_volume", "num", 0, 1, 0.05),
                Field("Start fullscreen", "general.fullscreen", "bool"),
                Field("Turbo reels", "general.turbo_spin", "bool"),
                Field("[ Reset bankroll to starting balance now ]", "", "action", action="reset_bankroll"),
                Field("[ Reset lifetime statistics ]", "", "action", action="reset_stats"),
                Field("[ Restore ALL settings to factory defaults ]", "", "action", action="factory"),
            ]),
            ("Bonus Hit Rates", [
                Info("Bonuses are forced on a '1 in N spins' basis. Lower N = more often. These do not depend on the reel weights."),
                Field("Smokey's Orb Link (6+ orbs): 1 in", "hit_rates.orb_bonus_one_in", "num", 1, 1e6, 5,
                      note=pct(("hit_rates", "orb_bonus_one_in"))),
                Field("Power T Free Games (3 T): 1 in", "hit_rates.power_t_bonus_one_in", "num", 1, 1e6, 5,
                      note=pct(("hit_rates", "power_t_bonus_one_in"))),
                Field("Orb count on trigger (weights)", "hit_rates.orb_count_weights", "vec", 0, 1e5, 1, per_row=6,
                      cell_labels=["6", "7", "8", "9", "10", "11"]),
                Field("Power T count on trigger (weights)", "hit_rates.power_t_count_weights", "vec", 0, 1e5, 1, per_row=6,
                      cell_labels=["3 T", "4 T", "5 T"]),
                Info("Inside Free Games:"),
                Field("Orb Link during free games: 1 in", "hit_rates.free_orb_bonus_one_in", "num", 1, 1e6, 5,
                      note=pct(("hit_rates", "free_orb_bonus_one_in"))),
                Field("Retrigger (3 T) during free games: 1 in", "hit_rates.free_retrigger_one_in", "num", 1, 1e6, 5,
                      note=pct(("hit_rates", "free_retrigger_one_in"))),
            ]),
            *weights_pages,
            ("Paytable", [
                Info("Line pays are multiples of the LINE bet (total bet / 20). Columns: 3, 4, 5 of a kind."),
                *[Field(s, ("paytable", s), "vec", 0, 1e7, 5, per_row=3, cell_labels=["3x", "4x", "5x"]) for s in reversed(PAYING)],
                Field("Power T scatter (x TOTAL bet)", "scatter_pay", "vec", 0, 1e7, 1, per_row=3, cell_labels=["3 T", "4 T", "5 T"]),
            ]),
            ("Orbs & Jackpots", [
                Info("Orb values are multiples of the TOTAL bet, so every denomination and power level scales automatically."),
                Field("Cash orb value ladder (x total bet)", "orbs.value_ladder", "vec", 0, 1e6, 0.5, per_row=6),
                Field("Cash orb value weights", "orbs.value_weights", "vec", 0, 1e6, 1, per_row=6),
                Field("Orb type weights", "orbs.type_weights", "vec", 0, 1e6, 1, per_row=5,
                      cell_labels=["CASH", "MINI", "MINOR", "MAJOR", "GRAND"]),
                Field("Jackpot values (x total bet)", "orbs.jackpots", "vec", 0, 1e7, 5, per_row=4,
                      cell_labels=["MINI", "MINOR", "MAJOR", "GRAND"]),
                Field("Jackpot boost per power level", "orbs.jackpot_level_boost", "vec", 0, 1000, 0.05, per_row=5),
                Field("Respins (reset when an orb lands)", "orbs.respins", "int", 1, 9, 1),
                Field("Orb chance per empty cell / respin", "orbs.respin_orb_chance", "num", 0, 1, 0.005,
                      note=lambda w: f"= {100 * get(w, ('orbs', 'respin_orb_chance')):.1f}% per empty cell"),
                Field("Filling all 15 spots pays the GRAND", "orbs.fill_board_grand", "bool"),
            ]),
            ("Smokey", [
                Info("Smokey shows up at random during the Orb Link and in Free Games."),
                Field("Chance Smokey appears each respin", "smokey.appear_chance", "num", 0, 1, 0.01),
                Field("Smokey greets bonus start chance", "smokey.intro_chance", "num", 0, 1, 0.01),
                Field("Howl weight (boost some orbs)", "smokey.howl_weight", "num", 0, 1e4, 5),
                Field("Fetch weight (drop new orbs)", "smokey.fetch_weight", "num", 0, 1e4, 5),
                Field("Super Howl weight (boost ALL orbs)", "smokey.super_howl_weight", "num", 0, 1e4, 5),
                Field("Howl boosts this many orbs: min", "smokey.boost_orbs_min", "int", 0, 15, 1),
                Field("Howl boosts this many orbs: max", "smokey.boost_orbs_max", "int", 0, 15, 1),
                Field("Boost raises the value ladder by: min", "smokey.boost_tiers_min", "int", 0, 12, 1),
                Field("Boost raises the value ladder by: max", "smokey.boost_tiers_max", "int", 0, 12, 1),
                Field("Boost upgrades Mini/Minor chance", "smokey.jackpot_upgrade_chance", "num", 0, 1, 0.05),
                Field("Fetch drops this many orbs: min", "smokey.fetch_orbs_min", "int", 0, 15, 1),
                Field("Fetch drops this many orbs: max", "smokey.fetch_orbs_max", "int", 0, 15, 1),
            ]),
            ("Free Games", [
                Field("Free games awarded (3/4/5 T)", "free_games.spins_awarded", "vec", 1, 999, 1, per_row=3, cell_labels=["3 T", "4 T", "5 T"]),
                Field("Retrigger spins (3/4/5 T)", "free_games.retrigger_spins", "vec", 0, 999, 1, per_row=3, cell_labels=["3 T", "4 T", "5 T"]),
                Field("Win multiplier by free-spin number", "free_games.multipliers", "vec", 1, 1000, 1, per_row=8,
                      cell_labels=[f"#{i}" for i in range(1, 9)]),
                Field("Smokey sticky-wild chance / spin", "free_games.smokey_wild_chance", "num", 0, 1, 0.01),
                Field("Sticky wilds dropped: min", "free_games.smokey_wild_min", "int", 1, 9, 1),
                Field("Sticky wilds dropped: max", "free_games.smokey_wild_max", "int", 1, 9, 1),
                Field("Multiplier also boosts Orb Link", "free_games.multiplier_on_orbs", "bool"),
            ]),
            ("Bets & Denoms", [
                Info("Total bet = denomination x power-level credits. Every prize is a multiple of the bet, so wins scale with both."),
                Field("Denominations ($)", "bet.denominations", "vec", 0.01, 1000, 0.01, per_row=5),
                Field("Power levels (credits per spin)", "bet.power_levels", "vec", 1, 1e6, 5, per_row=5),
            ]),
            ("Simulator", []),
            ("Tools & Stats", []),
        ]
        self.pages = [(t, f) for t, f in self.pages]

    # ------------------------------------------------------------------ open/close
    def open(self):
        g = self.g
        self.work = copy.deepcopy(g.cfg)
        self.dirty = False
        self.confirm_close = self.confirm_reset = False
        self.edit = None
        self.sel = (self.first_field(), 0)
        self.scroll = 0.0
        pin = str(g.cfg["general"].get("admin_pin", ""))
        self.mode = "pin" if pin else "main"
        self.pin_buf = ""
        self.visible = True
        g.state = "admin"
        g.audio_play("click")
        if g.audio:
            g.audio.spin_loop(False)

    def close(self):
        self.visible = False
        self.edit = None
        self.g.state = "idle"
        self.sim["cancel"] = True

    def update(self, dt):
        self.pin_err = max(0.0, self.pin_err - dt)

    # ------------------------------------------------------------------ helpers
    def fields(self):
        return self.pages[self.page][1]

    def first_field(self):
        for i, f in enumerate(self.pages[self.page][1] if self.work else []):
            if f.ncells(self.work) or getattr(f, "kind", "") == "action":
                return i
        return 0

    def selectable(self, f):
        return isinstance(f, Field)

    def move_field(self, d):
        fs = self.fields()
        i = self.sel[0]
        for _ in range(len(fs)):
            i = (i + d) % len(fs)
            if self.selectable(fs[i]):
                break
        self.sel = (i, min(self.sel[1], max(0, fs[i].ncells(self.work) - 1)))
        self.ensure_visible()

    def move_cell(self, d):
        f = self.fields()[self.sel[0]]
        n = f.ncells(self.work)
        if n:
            self.sel = (self.sel[0], max(0, min(n - 1, self.sel[1] + d)))

    def row_top(self, idx):
        y = 0
        for i, f in enumerate(self.fields()):
            if i == idx:
                return y
            y += f.height(self.work)
        return y

    def ensure_visible(self):
        top = self.row_top(self.sel[0])
        f = self.fields()[self.sel[0]]
        view = 520
        if top < self.scroll:
            self.scroll = top
        elif top + f.height(self.work) > self.scroll + view:
            self.scroll = top + f.height(self.work) - view

    def cell_value(self, f, ci):
        v = get(self.work, f.path)
        return v[ci] if f.kind == "vec" else v

    def set_cell(self, f, ci, val):
        if f.kind == "vec":
            get(self.work, f.path)[ci] = val
        else:
            put(self.work, f.path, val)
        self.dirty = True
        self.confirm_close = False

    def clamp(self, f, v, cur):
        v = max(f.lo, min(f.hi, v))
        is_int = f.kind == "int" or (isinstance(cur, int) and not isinstance(cur, bool) and float(v).is_integer() and f.step >= 1)
        return int(round(v)) if is_int else float(v)

    def adjust(self, f, ci, direction, big=False):
        if f.kind == "bool":
            self.set_cell(f, ci, not self.cell_value(f, ci))
            return
        if f.kind in ("str", "action"):
            return
        cur = self.cell_value(f, ci)
        step = f.step * (10 if big else 1)
        nv = round(cur + direction * step, 6)
        self.set_cell(f, ci, self.clamp(f, nv, cur))
        self.g.audio_play("tick", 0.4)

    def commit_edit(self):
        f = self.fields()[self.sel[0]]
        ci = self.sel[1]
        if f.kind == "str":
            self.set_cell(f, ci, self.edit)
        else:
            try:
                v = float(self.edit)
            except ValueError:
                self.edit = None
                return
            cur = self.cell_value(f, ci)
            self.set_cell(f, ci, self.clamp(f, v, cur))
        self.edit = None
        self.g.audio_play("click")

    def begin_edit(self, f, ci, first=""):
        if f.kind == "bool":
            self.adjust(f, ci, 1)
        elif f.kind == "action":
            self.run_action(f.action)
        else:
            cur = self.cell_value(f, ci)
            self.edit = first if first else ("" if f.kind == "str" else fmt_num(cur))
            self._fresh = not first

    def run_action(self, name):
        g = self.g
        if name == "reset_bankroll":
            g.reset_bankroll()
        elif name == "reset_stats":
            g.reset_stats()
            g.toast("STATS CLEARED")
        elif name == "factory":
            if self.confirm_reset:
                self.work = copy.deepcopy(DEFAULT_CONFIG)
                self.dirty = True
                self.confirm_reset = False
                g.toast("DEFAULTS LOADED - PRESS SAVE TO APPLY")
            else:
                self.confirm_reset = True
                g.toast("PRESS AGAIN TO CONFIRM FACTORY RESET")
        elif name == "force_orb":
            g.force_next = "orb"
            g.toast("NEXT SPIN FORCES THE ORB LINK")
            self.close()
        elif name == "force_t":
            g.force_next = "power_t"
            g.toast("NEXT SPIN FORCES FREE GAMES")
            self.close()
        elif name == "run_sim":
            self.start_sim()

    def save(self):
        w = self.work
        # basic sanity
        if int(w["bet"]["power_levels"][0]) < 1:
            w["bet"]["power_levels"][0] = 1
        self.g.apply_config(copy.deepcopy(w))
        self.dirty = False
        self.g.audio_play("collect")

    def revert(self):
        self.work = copy.deepcopy(self.g.cfg)
        self.dirty = False
        self.edit = None
        self.g.toast("CHANGES DISCARDED")

    # ------------------------------------------------------------------ simulator
    def start_sim(self):
        if self.sim["running"]:
            self.sim["cancel"] = True
            return
        cfg = copy.deepcopy(self.work)
        spins = int(self.sim["spins"])
        lvl = max(0, min(len(cfg["bet"]["power_levels"]) - 1, int(self.sim["level"]) - 1))
        self.sim.update(running=True, cancel=False, progress=0.0, result=None)

        def work():
            def prog(p):
                self.sim["progress"] = p
                return not self.sim["cancel"]
            try:
                self.sim["result"] = simulate.run(cfg, spins, lvl, progress=prog)
            except Exception as exc:  # show the error rather than crash the game
                self.sim["result"] = {"error": repr(exc)}
            self.sim["running"] = False

        threading.Thread(target=work, daemon=True).start()

    # ------------------------------------------------------------------ events
    def handle_event(self, e):
        if self.mode == "pin":
            self.handle_pin(e)
            return
        if e.type == pygame.MOUSEWHEEL:
            self.scroll = max(0.0, self.scroll - e.y * 50)
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button in (4, 5):
            self.scroll = max(0.0, self.scroll + (-50 if e.button == 4 else 50))
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            self.click(e.pos)
            return
        if e.type != pygame.KEYDOWN:
            return
        k = e.key
        mods = pygame.key.get_mods()
        if self.edit is not None:
            f = self.fields()[self.sel[0]]
            if k in (pygame.K_RETURN, pygame.K_KP_ENTER):
                self.commit_edit()
            elif k == pygame.K_ESCAPE:
                self.edit = None
            elif k == pygame.K_BACKSPACE:
                self.edit = self.edit[:-1]
                self._fresh = False
            elif k == pygame.K_TAB:
                self.commit_edit()
                self.move_cell(1)
            elif e.unicode and (e.unicode.isprintable()):
                ch = e.unicode
                if f.kind == "str" or ch.isdigit() or ch in ".-":
                    if self._fresh:
                        self.edit = ""
                        self._fresh = False
                    self.edit += ch
            return
        if k == pygame.K_s and (mods & pygame.KMOD_CTRL):
            self.save()
            return
        if k == pygame.K_ESCAPE:
            if self.dirty and not self.confirm_close:
                self.confirm_close = True
                self.g.toast("UNSAVED CHANGES - ESC AGAIN TO DISCARD, CTRL+S TO SAVE")
            else:
                self.close()
            return
        if k == pygame.K_PAGEUP or (k == pygame.K_TAB and mods & pygame.KMOD_SHIFT):
            self.set_page(self.page - 1)
        elif k in (pygame.K_PAGEDOWN, pygame.K_TAB):
            self.set_page(self.page + 1)
        title = self.pages[self.page][0]
        if title in ("Simulator", "Tools & Stats"):
            if title == "Simulator" and k in (pygame.K_RETURN, pygame.K_SPACE):
                self.start_sim()
            return
        fs = self.fields()
        if not fs:
            return
        f = fs[self.sel[0]]
        if k == pygame.K_DOWN:
            self.move_field(1)
        elif k == pygame.K_UP:
            self.move_field(-1)
        elif k == pygame.K_RIGHT:
            self.move_cell(1)
        elif k == pygame.K_LEFT:
            self.move_cell(-1)
        elif k in (pygame.K_RETURN, pygame.K_KP_ENTER):
            self.begin_edit(f, self.sel[1])
        elif k in (pygame.K_PLUS, pygame.K_EQUALS, pygame.K_KP_PLUS):
            self.adjust(f, self.sel[1], 1, bool(mods & pygame.KMOD_SHIFT))
        elif k in (pygame.K_MINUS, pygame.K_KP_MINUS):
            self.adjust(f, self.sel[1], -1, bool(mods & pygame.KMOD_SHIFT))
        elif e.unicode and (e.unicode.isdigit() or e.unicode == ".") and f.kind in ("num", "int", "vec"):
            self.begin_edit(f, self.sel[1], e.unicode)
        elif k == pygame.K_SPACE and f.kind == "bool":
            self.adjust(f, 0, 1)

    def set_page(self, p):
        self.page = p % len(self.pages)
        self.edit = None
        self.scroll = 0.0
        self.sel = (self.first_field(), 0)
        self.g.audio_play("click", 0.5)

    def handle_pin(self, e):
        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_ESCAPE:
                self.close()
            elif e.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                if self.pin_buf == str(self.g.cfg["general"].get("admin_pin", "")):
                    self.mode = "main"
                    self.g.audio_play("collect")
                else:
                    self.pin_buf = ""
                    self.pin_err = 1.0
                    self.g.audio_play("buzz")
            elif e.key == pygame.K_BACKSPACE:
                self.pin_buf = self.pin_buf[:-1]
            elif e.unicode and e.unicode.isprintable() and len(self.pin_buf) < 12:
                self.pin_buf += e.unicode
        elif e.type == pygame.MOUSEBUTTONDOWN:
            pass

    # ------------------------------------------------------------------ layout
    CONTENT = pygame.Rect(250, 74, 1010, 520)
    LABEL_W = 400
    CELLS_X = 640

    def layout(self):
        """Yield (field_index, field, y) for the current page."""
        y = self.CONTENT.y - self.scroll
        for i, f in enumerate(self.fields()):
            yield i, f, y
            y += f.height(self.work)

    def cell_rect(self, f, ci, y):
        row, col = divmod(ci, f.per_row) if f.kind == "vec" else (0, 0)
        return pygame.Rect(self.CELLS_X + col * (CELL_W + 6), y + row * ROW_H + 7, CELL_W if f.kind != "str" else 200, CELL_H)

    def tab_rects(self):
        return [pygame.Rect(16, 74 + i * 42, 220, 38) for i in range(len(self.pages))]

    def button_rects(self):
        return {
            "save": pygame.Rect(250, 650, 200, 50),
            "revert": pygame.Rect(462, 650, 160, 50),
            "close": pygame.Rect(634, 650, 160, 50),
        }

    def click(self, pos):
        for i, r in enumerate(self.tab_rects()):
            if r.collidepoint(pos):
                self.set_page(i)
                return
        b = self.button_rects()
        if b["save"].collidepoint(pos):
            self.save()
            return
        if b["revert"].collidepoint(pos):
            self.revert()
            return
        if b["close"].collidepoint(pos):
            if self.dirty and not self.confirm_close:
                self.confirm_close = True
                self.g.toast("UNSAVED CHANGES - CLICK CLOSE AGAIN TO DISCARD")
            else:
                self.close()
            return
        title = self.pages[self.page][0]
        if title == "Simulator":
            for key, r in self.sim_rects().items():
                if r.collidepoint(pos):
                    if key == "run":
                        self.start_sim()
                    elif key == "spins":
                        self.sim["spins"] = {10000: 100000, 100000: 500000, 500000: 1000000, 1000000: 10000}.get(self.sim["spins"], 100000)
                    elif key == "level":
                        self.sim["level"] = self.sim["level"] % len(self.work["bet"]["power_levels"]) + 1
            return
        if title == "Tools & Stats":
            for key, r in self.tool_rects().items():
                if r.collidepoint(pos):
                    self.run_action(key)
            return
        if not self.CONTENT.collidepoint(pos):
            return
        if self.edit is not None:
            self.commit_edit()
        for i, f, y in self.layout():
            if not isinstance(f, Field):
                continue
            for ci in range(max(1, f.ncells(self.work))):
                r = self.cell_rect(f, ci, y) if f.kind != "action" else pygame.Rect(self.CONTENT.x, y + 4, 700, 34)
                if r.collidepoint(pos):
                    self.sel = (i, ci)
                    if f.kind in ("bool", "action"):
                        self.begin_edit(f, ci)
                    else:
                        self.begin_edit(f, ci)
                    return

    def sim_rects(self):
        return {"run": pygame.Rect(270, 150, 260, 54), "spins": pygame.Rect(560, 150, 220, 54), "level": pygame.Rect(800, 150, 220, 54)}

    def tool_rects(self):
        return {"force_orb": pygame.Rect(270, 140, 340, 54), "force_t": pygame.Rect(630, 140, 340, 54)}

    # ------------------------------------------------------------------ draw
    def draw(self, surf):
        ov = pygame.Surface((W, H))
        ov.fill((8, 5, 16))
        surf.blit(ov, (0, 0))
        draw_text(surf, "ADMIN / OPERATOR SETTINGS", 40, (W // 2, 34), ORANGE, ow=3, outline=(50, 18, 0))
        if self.mode == "pin":
            self.draw_pin(surf)
            return
        for i, r in enumerate(self.tab_rects()):
            on = i == self.page
            pygame.draw.rect(surf, (140, 70, 0) if on else (28, 20, 44), r, border_radius=8)
            pygame.draw.rect(surf, ORANGE if on else (70, 50, 90), r, width=2, border_radius=8)
            draw_text(surf, self.pages[i][0], 20, (r.x + 12, r.centery), WHITE if on else (200, 190, 220), anchor="midleft", ow=2)
        title = self.pages[self.page][0]
        pygame.draw.rect(surf, (14, 9, 26), self.CONTENT.inflate(16, 12), border_radius=12)
        if title == "Simulator":
            self.draw_sim(surf)
        elif title == "Tools & Stats":
            self.draw_tools(surf)
        else:
            self.draw_fields(surf)
        b = self.button_rects()
        for key, label, col in (("save", "SAVE & APPLY", (20, 120, 50)), ("revert", "REVERT", (110, 80, 20)), ("close", "CLOSE", (110, 30, 30))):
            r = b[key]
            pygame.draw.rect(surf, col, r, border_radius=10)
            pygame.draw.rect(surf, WHITE, r, width=2, border_radius=10)
            draw_text(surf, label, 24, r.center, WHITE, ow=2)
        if self.dirty:
            draw_text(surf, "UNSAVED CHANGES", 22, (900, 675), (255, 190, 60), ow=2)
        draw_text(surf, "Click or arrow keys to pick a value  -  type a number then ENTER  -  +/- adjust (SHIFT x10)  -  CTRL+S save  -  TAB next page",
                  15, (W // 2, 616), (160, 160, 185), outline=None)
        for text, life in self.g.toasts[-2:]:
            draw_text(surf, text, 24, (W // 2, 600 - 0), (255, 235, 170), ow=3)

    def draw_pin(self, surf):
        box = pygame.Rect(W // 2 - 260, 250, 520, 220)
        pygame.draw.rect(surf, (20, 12, 36), box, border_radius=16)
        pygame.draw.rect(surf, ORANGE, box, width=3, border_radius=16)
        draw_text(surf, "ENTER ADMIN PIN", 34, (W // 2, 295), WHITE, ow=3)
        shown = "*" * len(self.pin_buf)
        draw_text(surf, shown or "_", 48, (W // 2, 370), (255, 210, 120) if not self.pin_err else (255, 80, 80), ow=3)
        draw_text(surf, "ENTER to unlock   -   ESC to cancel", 18, (W // 2, 440), (160, 160, 185), outline=None)

    def draw_fields(self, surf):
        old = surf.get_clip()
        surf.set_clip(self.CONTENT.inflate(0, 4))
        for i, f, y in self.layout():
            h = f.height(self.work)
            if y + h < self.CONTENT.y or y > self.CONTENT.bottom:
                continue
            if isinstance(f, Info):
                draw_text(surf, f.text, 17, (self.CONTENT.x + 6, y + 15), f.color, anchor="midleft", outline=None)
                continue
            sel_row = i == self.sel[0]
            if sel_row:
                pygame.draw.rect(surf, (36, 24, 56), (self.CONTENT.x - 4, y + 2, self.CONTENT.w + 8, h - 4), border_radius=8)
            if f.kind == "action":
                r = pygame.Rect(self.CONTENT.x + 4, y + 4, 700, 34)
                pygame.draw.rect(surf, (90, 40, 40) if sel_row else (60, 30, 40), r, border_radius=8)
                pygame.draw.rect(surf, (200, 100, 100), r, width=2, border_radius=8)
                draw_text(surf, f.label, 19, r.center, WHITE, ow=2)
                continue
            draw_text(surf, f.label, 18, (self.CONTENT.x + 6, y + 22), WHITE, anchor="midleft", ow=2)
            n = f.ncells(self.work)
            for ci in range(n):
                r = self.cell_rect(f, ci, y)
                v = self.cell_value(f, ci)
                sel = sel_row and ci == self.sel[1]
                pygame.draw.rect(surf, (60, 36, 10) if sel else (24, 18, 40), r, border_radius=6)
                pygame.draw.rect(surf, ORANGE if sel else (80, 60, 110), r, width=2, border_radius=6)
                if sel and self.edit is not None:
                    txt = self.edit + ("|" if int(self.g.t * 2) % 2 == 0 else " ")
                    col = (255, 240, 160)
                elif f.kind == "bool":
                    txt, col = ("ON" if v else "OFF"), ((120, 255, 140) if v else (255, 120, 120))
                elif f.kind == "str":
                    txt, col = ("*" * len(str(v)) if str(v) else "(none)"), WHITE
                else:
                    txt, col = fmt_num(v), WHITE
                draw_text(surf, txt, 19, r.center, col, ow=1, outline=None)
                if f.cell_labels and ci < len(f.cell_labels) and ci < f.per_row:
                    draw_text(surf, f.cell_labels[ci], 11, (r.x + 3, r.y - 4), (150, 140, 180), anchor="midleft", outline=None)
            if f.note and f.kind != "vec":
                try:
                    draw_text(surf, f.note(self.work), 15, (self.CELLS_X + CELL_W + 16, y + 22), (140, 200, 235), anchor="midleft", outline=None)
                except Exception:
                    pass
        surf.set_clip(old)

    def draw_sim(self, surf):
        x = 270
        draw_text(surf, "Runs the full game maths (base game + Orb Link + Free Games) with your UNSAVED settings.", 18, (x, 100), (190, 190, 210), anchor="midleft", outline=None)
        draw_text(surf, "Use it to dial in RTP (return to player) and bonus frequency before you save.", 18, (x, 124), (190, 190, 210), anchor="midleft", outline=None)
        rects = self.sim_rects()
        for key, r in rects.items():
            col = (20, 120, 50) if key == "run" and not self.sim["running"] else (110, 80, 20) if key == "run" else (40, 30, 70)
            pygame.draw.rect(surf, col, r, border_radius=10)
            pygame.draw.rect(surf, WHITE, r, width=2, border_radius=10)
            label = {"run": "STOP" if self.sim["running"] else "RUN SIMULATION",
                     "spins": f"SPINS: {self.sim['spins']:,}",
                     "level": f"POWER LEVEL {self.sim['level']}"}[key]
            draw_text(surf, label, 22, r.center, WHITE, ow=2)
        if self.sim["running"]:
            pr = pygame.Rect(270, 225, 750, 22)
            pygame.draw.rect(surf, (30, 24, 50), pr, border_radius=8)
            pygame.draw.rect(surf, ORANGE, (pr.x, pr.y, int(pr.w * self.sim["progress"]), pr.h), border_radius=8)
            draw_text(surf, f"{self.sim['progress'] * 100:.0f}%", 16, pr.center, WHITE, outline=None)
        res = self.sim["result"]
        if not res:
            return
        if "error" in res:
            draw_text(surf, "ERROR: " + res["error"], 18, (x, 280), (255, 100, 100), anchor="midleft", outline=None)
            return
        rows = [
            ("TOTAL RTP", f"{res['rtp']:.2f}%", (255, 220, 120)),
            ("  line wins + scatters", f"{res['rtp_base_lines']:.2f}%", WHITE),
            ("  Orb Link bonus", f"{res['rtp_orb_bonus']:.2f}%", WHITE),
            ("  Power T Free Games", f"{res['rtp_free_games']:.2f}%", WHITE),
            ("Base hit frequency", f"{res['hit_freq']:.1f}% of spins", WHITE),
            ("Orb Link frequency", f"1 in {res['orb_bonus_one_in']:.0f}   (avg pay {res['avg_orb_bonus_x']:.1f}x bet)", WHITE),
            ("Free Games frequency", f"1 in {res['free_games_one_in']:.0f}   (avg pay {res['avg_free_games_x']:.1f}x bet)", WHITE),
            ("20x+ bet win", f"1 in {res['big_win_one_in']:.0f} spins", WHITE),
            ("Biggest win seen", f"{res['max_win_x']:,.0f}x bet   ({res['full_boards']} full boards)", WHITE),
            ("Volatility (std dev)", f"{res['volatility']:.1f}", WHITE),
            ("Simulated", f"{res['spins']:,} spins in {res['seconds']:.1f}s", (150, 150, 170)),
        ]
        for i, (a, bb, col) in enumerate(rows):
            y = 285 + i * 29
            draw_text(surf, a, 21 if i else 26, (x, y), WHITE if i else (255, 220, 120), anchor="midleft", ow=2)
            draw_text(surf, bb, 21 if i else 28, (x + 330, y), col, anchor="midleft", ow=2)

    def draw_tools(self, surf):
        g = self.g
        x = 270
        draw_text(surf, "TEST TOOLS", 26, (x, 100), (255, 220, 120), anchor="midleft", ow=2)
        draw_text(surf, "Force the next spin to trigger a bonus (closes this panel):", 17, (x, 128), (190, 190, 210), anchor="midleft", outline=None)
        for key, r in self.tool_rects().items():
            pygame.draw.rect(surf, (40, 40, 110), r, border_radius=10)
            pygame.draw.rect(surf, WHITE, r, width=2, border_radius=10)
            draw_text(surf, "FORCE ORB LINK" if key == "force_orb" else "FORCE FREE GAMES", 24, r.center, WHITE, ow=2)
        draw_text(surf, "STATISTICS", 26, (x, 226), (255, 220, 120), anchor="midleft", ow=2)
        for j, (title, d) in enumerate((("SESSION", g.session), ("LIFETIME", g.stats))):
            cx = x + j * 480
            draw_text(surf, title, 21, (cx, 260), ORANGE, anchor="midleft", ow=2)
            rtp = 100.0 * d["won"] / d["wagered"] if d["wagered"] else 0.0
            rows = [("Spins", f"{d['spins']:,}"), ("Wagered", money(d["wagered"])), ("Won", money(d["won"])), ("Actual RTP", f"{rtp:.1f}%"),
                    ("Biggest win", money(d["biggest"])), ("Orb Links", str(d["orb_bonuses"])), ("Free Games", str(d["free_games"])), ("Jackpots", str(d["jackpots"]))]
            for i, (a, v) in enumerate(rows):
                draw_text(surf, a, 19, (cx, 290 + i * 27), (200, 200, 220), anchor="midleft", outline=None)
                draw_text(surf, v, 19, (cx + 200, 290 + i * 27), WHITE, anchor="midleft", outline=None)
        draw_text(surf, f"Config file: {self._cfg_path()}", 14, (x, 540), (130, 130, 150), anchor="midleft", outline=None)

    def _cfg_path(self):
        from . import paths
        return self.g.config_path or paths.config_path()
