"""The playable game: state machine, flows (spin / orb link / free games), HUD and input."""
import json
import math
import os
import random
import time

import pygame

from . import __version__, gfx, paths
from .audio import Audio
from .config import JACKPOTS, load_config, save_config
from .engine import ALL_CELLS, LINES, PAYLINES, Engine
from .gfx import GOLD, ORANGE, ORB_COLORS, WHITE, Bolt, Particles, draw_text
from .ui import (CELL, GAP, GX, GY, H, PITCH, W, Background, Banner, Reel, SmokeyActor, cell_center, cell_pos,
                 ease_out_back, money)

TIERS = [(500, "LEGENDARY WIN", (255, 80, 60)), (150, "EPIC WIN", (255, 60, 200)), (50, "MEGA WIN", (255, 200, 40)),
         (15, "BIG WIN", ORANGE), (5, "NICE WIN", (255, 170, 80))]


class Button:
    def __init__(self, rect, label, action, kind="small", enabled=lambda: True):
        self.rect = pygame.Rect(rect)
        self.label, self.action, self.kind, self.enabled = label, action, kind, enabled
        self.hover = False


class DispOrb:
    def __init__(self, orb, born, flash=0.0):
        self.orb, self.born, self.flash = orb, born, flash


class Game:
    def __init__(self, cfg=None, audio=True, config_path=None, seed=None):
        self.config_path = config_path
        self.cfg = cfg or load_config(config_path)
        self.rng = random.Random(seed)
        self.engine = Engine(self.cfg, self.rng)
        pygame.display.set_caption("VOLS POWER LINK")
        flags = pygame.SCALED | pygame.RESIZABLE
        if self.cfg["general"]["fullscreen"]:
            flags |= pygame.FULLSCREEN
        try:
            self.screen = pygame.display.set_mode((W, H), flags, vsync=1)
        except pygame.error:
            self.screen = pygame.display.set_mode((W, H), flags)
        self.canvas = pygame.Surface((W, H)).convert()
        self.art = gfx.Art(CELL)
        self.bg = Background(self.art)
        self.reels = [Reel(i) for i in range(5)]
        self.particles = Particles()
        self.bolts = []
        self.banners = []
        self.toasts = []
        self.smokey = SmokeyActor(self.art)
        self.smokey_present = False
        self.audio = Audio(self.cfg["general"]["music_volume"], self.cfg["general"]["sfx_volume"]) if audio else None
        if self.audio and not self.audio.enabled:
            self.audio = None
        self.clock = pygame.time.Clock()
        self.t = 0.0
        self.dt = 0.016
        self.running = True
        self.state = "title"
        self.flow = None
        self.skip = False
        self.timers = []
        self.shake = 0.0
        self.flash = 0.0
        self.theme, self.prev_theme, self.theme_mix = "base", "base", 1.0
        self.auto = False
        self.auto_timer = 0.0
        self.force_next = None
        self.help_open = False
        self.quit_armed = 0.0
        # money
        self.balance = 0
        self.win_disp = 0.0
        self.last_win_credits = 0
        self.stats = dict(spins=0, wagered=0, won=0, biggest=0, orb_bonuses=0, free_games=0, jackpots=0)
        self.session = dict(spins=0, wagered=0, won=0, biggest=0, orb_bonuses=0, free_games=0, jackpots=0)
        self._load_bets()
        self._load_save()
        # round visuals
        self.spin_bet, self.spin_level, self.spin_denom = self.bet_credits, self.level_idx, self.denom_cents
        self.ctx = {"grid": None, "orb_count": 0, "t_count": 0}
        self.hl_cells, self.hl_line = set(), None
        self.cycle, self.cycle_i, self.cycle_t = [], 0, 0.0
        self.sticky = set()
        self.sticky_born = {}
        self.hold = None            # display state of the orb link: dict pos -> DispOrb
        self.hold_spinning = set()
        self.respins_disp = 3
        self.fg_info = None         # dict(left, total, mult)
        self.admin = None
        self._init_idle_grid()
        self._build_buttons()
        from .admin import Admin
        self.admin = Admin(self)

    # ------------------------------------------------------------------ setup
    def _load_bets(self):
        b = self.cfg["bet"]
        self.denoms = [max(1, int(round(float(d) * 100))) for d in b["denominations"]]
        self.levels = [max(1, int(l)) for l in b["power_levels"]]

    def _load_save(self):
        g = self.cfg["general"]
        start_denom = int(round(g["start_denom"] * 100))
        self.denom_idx = self.denoms.index(start_denom) if start_denom in self.denoms else 0
        self.level_idx = max(0, min(len(self.levels) - 1, int(g["start_power_level"]) - 1))
        self.balance = int(round(g["starting_balance"] * 100))
        try:
            with open(paths.save_path(), "r", encoding="utf-8") as fh:
                d = json.load(fh)
            if g["persist_balance"] and isinstance(d.get("balance"), int) and d["balance"] > 0:
                self.balance = d["balance"]
            if d.get("denom") in self.denoms:
                self.denom_idx = self.denoms.index(d["denom"])
            if isinstance(d.get("level"), int):
                self.level_idx = max(0, min(len(self.levels) - 1, d["level"]))
            for k, v in d.get("stats", {}).items():
                if k in self.stats and isinstance(v, (int, float)):
                    self.stats[k] = v
        except (OSError, ValueError):
            pass

    def save_state(self):
        try:
            with open(paths.save_path(), "w", encoding="utf-8") as fh:
                json.dump({"balance": self.balance, "denom": self.denom_cents, "level": self.level_idx, "stats": self.stats}, fh)
        except OSError:
            pass

    def apply_config(self, cfg, persist=True):
        self.cfg = cfg
        self.engine = Engine(cfg, self.rng)
        old_denom = self.denom_cents
        self._load_bets()
        self.denom_idx = self.denoms.index(old_denom) if old_denom in self.denoms else min(self.denom_idx, len(self.denoms) - 1)
        self.level_idx = min(self.level_idx, len(self.levels) - 1)
        if self.audio:
            self.audio.set_volumes(cfg["general"]["music_volume"], cfg["general"]["sfx_volume"])
        if persist:
            save_config(cfg, self.config_path)
        self.toast("SETTINGS SAVED")

    def reset_bankroll(self):
        self.balance = int(round(self.cfg["general"]["starting_balance"] * 100))
        self.save_state()
        self.toast("BANKROLL RESET")

    def reset_stats(self):
        for d in (self.stats, self.session):
            for k in d:
                d[k] = 0
        self.save_state()

    def _init_idle_grid(self):
        g = self.engine._natural_grid("base")
        for i, reel in enumerate(self.reels):
            reel.set_idle_symbols(g[i], {r: self.engine.new_orb() for r in range(3) if g[i][r] == "ORB"})

    # ------------------------------------------------------------ bet helpers
    @property
    def denom_cents(self):
        return self.denoms[self.denom_idx]

    @property
    def bet_credits(self):
        return self.levels[self.level_idx]

    @property
    def cost(self):
        return self.bet_credits * self.denom_cents

    def denom_label(self, cents=None):
        c = self.denom_cents if cents is None else cents
        return f"{c}¢" if c < 100 else f"${c / 100:g}"

    def can_afford(self):
        return self.balance >= self.cost

    def broke(self):
        return self.balance < min(self.levels) * min(self.denoms)

    def change_denom(self, d):
        if self.state != "idle":
            return
        self.denom_idx = (self.denom_idx + d) % len(self.denoms)
        self.audio_play("click")

    def change_level(self, d):
        if self.state != "idle":
            return
        self.level_idx = max(0, min(len(self.levels) - 1, self.level_idx + d))
        self.audio_play("click")

    def max_bet(self):
        if self.state != "idle":
            return
        for i in range(len(self.levels) - 1, -1, -1):
            if self.levels[i] * self.denom_cents <= self.balance:
                self.level_idx = i
                break
        self.audio_play("click")

    # --------------------------------------------------------------- utilities
    def audio_play(self, name, vol=1.0, pan=None):
        if self.audio:
            self.audio.play(name, vol, pan)

    def music(self, key):
        if self.audio:
            self.audio.set_music(key)

    def set_theme(self, theme):
        if theme != self.theme:
            self.prev_theme, self.theme, self.theme_mix = self.theme, theme, 0.0

    def later(self, delay, fn):
        self.timers.append([delay, fn])

    def toast(self, text, secs=2.2):
        self.toasts.append([text, secs])

    def banner(self, *a, **k):
        b = Banner(*a, **k)
        self.banners.append(b)
        return b

    def shake_screen(self, amt):
        self.shake = max(self.shake, amt)

    def consume_skip(self):
        s = self.skip
        self.skip = False
        return s

    def sleep(self, secs, skippable=False):
        t = 0.0
        while t < secs:
            if skippable and self.consume_skip():
                return
            yield
            t += self.dt

    def until(self, fn):
        while not fn():
            yield

    def pay(self, credits):
        cents = int(credits) * self.spin_denom
        self.balance += cents
        for d in (self.stats, self.session):
            d["won"] += cents

    def note_round_win(self, credits):
        cents = int(credits) * self.spin_denom
        for d in (self.stats, self.session):
            d["biggest"] = max(d["biggest"], cents)

    def orb_cents(self, orb):
        return self.engine.orb_credits(orb, self.spin_bet, self.spin_level) * self.spin_denom

    # ------------------------------------------------------------------ spin
    def start_spin(self):
        if self.state != "idle":
            return False
        if self.broke():
            self.audio_play("buzz")
            return False
        if not self.can_afford():
            self.toast("NOT ENOUGH FUNDS - LOWER YOUR BET")
            self.audio_play("buzz")
            return False
        self.state = "busy"
        self.flow = self.flow_spin()
        self.skip = False
        return True

    def flow_spin(self):
        cost = self.cost
        self.balance -= cost
        self.spin_bet, self.spin_level, self.spin_denom = self.bet_credits, self.level_idx, self.denom_cents
        for d in (self.stats, self.session):
            d["spins"] += 1
            d["wagered"] += cost
        self.win_disp = 0.0
        self.hl_cells, self.hl_line, self.cycle = set(), None, []
        self.audio_play("spin")
        res = self.engine.spin_base(self.spin_bet, self.spin_level, self.force_next)
        self.force_next = None
        yield from self.reel_spin(res.grid, res.orbs)
        round_total = 0
        if res.total_credits:
            yield from self.present_wins(res, self.spin_bet, cycle=True)
            self.pay(res.total_credits)
            round_total += res.total_credits
        if res.trigger == "power_t":
            round_total += yield from self.flow_free_games(res)
        elif res.trigger == "orb":
            total = yield from self.flow_orb_link(res.orbs)
            round_total += total
        self.note_round_win(round_total)
        self.last_win_credits = round_total
        self.save_state()
        self.state = "idle"
        self.auto_timer = 0.0

    def reel_spin(self, grid, orbs, sticky=()):
        turbo = self.cfg["general"]["turbo_spin"]
        speed = 34.0 if turbo else 24.0
        self.ctx = {"grid": grid, "orbs": orbs, "orb_count": 0, "t_count": 0}
        for r in self.reels:
            r.start(speed)
            yield from self.sleep(0.01 if turbo else 0.04)
        if self.audio:
            self.audio.spin_loop(True)
        yield from self.sleep(0.15 if turbo else 0.5)
        gap = 0.11 if turbo else 0.32
        o_seen = t_seen = 0
        for i in range(5):
            remaining = 5 - i
            need_o, need_t = 6 - o_seen, 3 - t_seen
            ant = (o_seen >= 3 and 0 < need_o <= remaining) or (t_seen == 2 and remaining >= 1)
            if ant:
                for rr in self.reels[i:]:
                    rr.anticipate = True
                self.audio_play("thunder", 0.35)
                yield from self.sleep(0.5 if turbo else 1.2)
            col = grid[i]
            omap = {r: orbs[(i, r)] for r in range(3) if (i, r) in orbs}
            self.reels[i].request_stop(col, omap, turbo)
            self.reels[i].anticipate = False
            o_seen += len(omap)
            t_seen += sum(1 for s in col if s == "POWERT")
            yield from self.sleep(gap)
        yield from self.until(lambda: all(r.state == "idle" for r in self.reels))
        if self.audio:
            self.audio.spin_loop(False)

    def on_land(self, i):
        self.audio_play(f"stop{i}", 0.9, pan=(i - 2) * 0.25)
        grid = self.ctx.get("grid")
        if not grid:
            return
        for r in range(3):
            s = grid[i][r]
            cx, cy = cell_center(i, r)
            if s == "ORB":
                k = self.ctx["orb_count"]
                self.ctx["orb_count"] += 1
                self.later(0.03 + 0.05 * r, lambda k=k: self.audio_play(f"orb{min(k, 14)}"))
                self.particles.burst(cx, cy, 22, (255, 170, 40), 260, 0.8, 4, 200)
                self.shake_screen(3)
            elif s == "POWERT":
                k = self.ctx["t_count"]
                self.ctx["t_count"] += 1
                self.later(0.04, lambda k=k: self.audio_play(f"tland{min(k, 4)}"))
                self.particles.burst(cx, cy, 36, WHITE, 340, 0.9, 4, 100)
                self.particles.burst(cx, cy, 30, ORANGE, 300, 0.9, 5, 100)
                self.shake_screen(7)
                self.flash = max(self.flash, 0.25)
            elif s == "WILD":
                self.particles.burst(cx, cy, 12, (255, 240, 120), 220, 0.6, 3, 50)

    # ---------------------------------------------------------- win presenting
    def tier_for(self, ratio):
        for thresh, name, col in TIERS:
            if ratio >= thresh:
                return name, col, thresh
        return None, None, 0

    def present_wins(self, res, bet, cycle=False, mult_label=None):
        credits = res.total_credits
        cells = set()
        for lw in res.line_wins:
            cells.update(lw.cells)
        if res.scatter_credits:
            cells.update(res.t_cells)
        self.hl_cells = cells
        ratio = credits / max(1, bet)
        name, col, thresh = self.tier_for(ratio)
        level = 0 if ratio < 5 else 1 if ratio < 15 else 2 if ratio < 150 else 3
        self.audio_play(f"fanfare{level}", 0.7 if level < 2 else 0.9)
        if name:
            self.banner(name, money(credits * self.spin_denom), col, life=min(6.0, 1.8 + ratio ** 0.5 * 0.22), size=96 if level >= 2 else 76)
            self.shake_screen(6 + level * 3)
        yield from self.count_up(credits, ratio, coins=ratio >= 15)
        if cycle and len(res.line_wins) > 0:
            self.cycle, self.cycle_i, self.cycle_t = list(res.line_wins), -1, 99.0
        else:
            self.hl_cells = set()

    def count_up(self, amount, ratio, coins=False, dur=None):
        start = self.win_disp
        end = start + amount
        dur = dur if dur is not None else min(5.5, 0.45 + (ratio ** 0.62) * 0.33)
        if self.cfg["general"]["turbo_spin"]:
            dur *= 0.5
        t = 0.0
        tick = 0.0
        n = 0
        while t < dur:
            if self.consume_skip():
                break
            t += self.dt
            u = min(1.0, t / dur)
            self.win_disp = start + (end - start) * (u ** 0.85)
            tick -= self.dt
            if tick <= 0:
                self.audio_play(f"coin{n % 5}", 0.5)
                n += 1
                tick = 0.075
                if coins:
                    self.particles.coins(W // 2, 560, 3, 500)
            yield
        self.win_disp = end

    # --------------------------------------------------------------- orb link
    def flow_orb_link(self, orbs, in_free=False):
        eng = self.engine
        bet, level = self.spin_bet, self.spin_level
        hs = eng.start_hold_and_spin(orbs, bet, level)
        self.stats["orb_bonuses"] += 1
        self.session["orb_bonuses"] += 1
        # --- intro
        self.audio_play("trigger")
        self.set_theme("orb")
        self.music("orb")
        self.banner("SMOKEY'S ORB LINK", "ORBS LOCK IN  -  FILL THE BOARD FOR THE GRAND JACKPOT", (120, 200, 255), life=3.2, size=80)
        self.flash = 0.6
        self.shake_screen(10)
        for _ in range(4):
            self.add_random_bolt()
        yield from self.sleep(1.4)
        self.hold = {}
        self.hold_spinning = set()
        self.respins_disp = hs.respins_total
        self.hl_cells, self.hl_line, self.cycle = set(), None, []
        order = sorted(orbs, key=lambda p: (p[0], p[1]))
        for k, pos in enumerate(order):
            self.hold[pos] = DispOrb(orbs[pos].copy(), self.t, 0.5)
            self.audio_play(f"orb{min(k, 14)}")
            cx, cy = cell_center(*pos)
            self.particles.burst(cx, cy, 20, (150, 210, 255), 260, 0.7, 4, 100)
            yield from self.sleep(0.16)
        yield from self.sleep(0.6)
        self.win_disp = self.hold_total()
        if hs.intro_smokey:
            yield from self.play_smokey(hs.intro_smokey, hs)
        # --- respins
        while not hs.done:
            empties = hs.empty_cells()
            res = hs.step()
            self.hold_spinning = set(empties)
            if self.audio:
                self.audio.spin_loop(True)
            yield from self.sleep(0.5 if self.cfg["general"]["turbo_spin"] else 0.95)
            landed = {p for p, _ in res.new_orbs}
            # land columns left to right
            for pos in sorted(empties, key=lambda p: (p[0], p[1])):
                self.hold_spinning.discard(pos)
                if pos in landed:
                    orb = dict(res.new_orbs)[pos]
                    self.hold[pos] = DispOrb(orb.copy(), self.t, 0.5)
                    self.audio_play(f"orb{min(len(self.hold) - 1, 14)}")
                    cx, cy = cell_center(*pos)
                    self.particles.burst(cx, cy, 26, (150, 210, 255), 300, 0.8, 4, 100)
                    self.shake_screen(4)
                    if res.new_orbs and orb.kind != "cash":
                        self.add_bolt_at(pos)
                    self.win_disp = self.hold_total()
                else:
                    self.audio_play("tick", 0.25)
                if not self.hold_spinning and self.audio:
                    self.audio.spin_loop(False)
                yield from self.sleep(0.07)
            if self.audio:
                self.audio.spin_loop(False)
            self.respins_disp = res.respins_left if not (res.new_orbs) else hs.respins_total
            if res.new_orbs:
                self.respins_disp = hs.respins_total
                self.toast("RESPINS RESET", 1.0)
            yield from self.sleep(0.35)
            if res.smokey:
                yield from self.play_smokey(res.smokey, hs, after_land=True)
            self.respins_disp = hs.respins_left
            self.win_disp = self.hold_total()
            yield from self.sleep(0.25)
        # --- collect
        yield from self.sleep(0.5)
        full = len(hs.orbs) >= len(ALL_CELLS)
        yield from self.collect_orbs(hs, full)
        total = hs.total()
        self.win_disp = float(total)
        ratio = total / max(1, bet)
        name, col, _ = self.tier_for(ratio)
        self.banner("ORB LINK TOTAL", money(total * self.spin_denom), col or (120, 200, 255), life=2.8, size=84)
        self.audio_play("fanfare3" if ratio >= 50 else "fanfare2" if ratio >= 15 else "fanfare1")
        self.particles.coins(W // 2, 600, 40, 700)
        self.shake_screen(8)
        yield from self.sleep(2.6, skippable=True)
        self.pay(total)
        self.hold = None
        self.hold_spinning = set()
        self.smokey_present = False
        if not in_free:
            self.set_theme("base")
            self.music("base")
        else:
            self.set_theme("free")
            self.music("free")
        return total

    def hold_total(self):
        if not self.hold:
            return 0
        return sum(self.engine.orb_credits(d.orb, self.spin_bet, self.spin_level) for d in self.hold.values())

    def collect_orbs(self, hs, full):
        order = sorted(self.hold, key=lambda p: (p[0], p[1]))
        step = max(0.05, min(0.28, 3.2 / max(1, len(order))))
        running = 0
        self.win_disp = 0.0
        for k, pos in enumerate(order):
            d = self.hold[pos]
            v = self.engine.orb_credits(d.orb, self.spin_bet, self.spin_level)
            running += v
            d.flash = 1.0
            self.win_disp = float(running)
            cx, cy = cell_center(*pos)
            self.particles.burst(cx, cy, 14, GOLD, 240, 0.7, 4, 400)
            if d.orb.kind == "cash":
                self.audio_play(f"coin{min(4, k // 3)}", 0.7)
            else:
                self.audio_play("fanfare1", 0.8)
                self.audio_play("thunder", 0.5)
                self.banner(d.orb.kind.upper() + " JACKPOT!", money(v * self.spin_denom), ORB_COLORS[d.orb.kind][1], life=1.8, size=76)
                self.shake_screen(10)
                self.stats["jackpots"] += 1
                self.session["jackpots"] += 1
                yield from self.sleep(1.0)
            yield from self.sleep(step)
        if full and self.cfg["orbs"]["fill_board_grand"]:
            v = hs.grand_bonus()
            running += v
            self.audio_play("fanfare3")
            self.audio_play("thunder")
            self.banner("GRAND JACKPOT!", "THE BOARD IS FULL  " + money(v * self.spin_denom), (255, 70, 70), life=4.5, size=100)
            self.flash = 1.0
            self.shake_screen(16)
            for _ in range(8):
                self.add_random_bolt()
            self.stats["jackpots"] += 1
            self.session["jackpots"] += 1
            for _ in range(10):
                self.particles.coins(W // 2, 620, 10, 900)
                yield from self.sleep(0.12)
            self.win_disp = float(running)
            yield from self.sleep(1.5)

    # ----------------------------------------------------------------- Smokey
    def play_smokey(self, ev, hs, after_land=False):
        s = self.smokey
        s.enter()
        self.smokey_present = True
        self.audio_play("bark")
        title = {"howl": "SMOKEY HOWLS!", "fetch": "SMOKEY FETCHES!", "super": "SUPER HOWL!"}[ev.action]
        sub = {"howl": "ORBS GET POWERED UP", "fetch": "NEW ORBS FOR THE BOARD", "super": "EVERY ORB LEVELS UP"}[ev.action]
        yield from self.sleep(0.55)
        s.howl(2.2)
        self.audio_play("howl")
        s.ring()
        self.banner(title, sub, (255, 190, 80), life=2.4, size=70, y=170)
        yield from self.sleep(0.5)
        s.ring()
        yield from self.sleep(0.5)
        mouth = (s.x + 40, s.y - 60)
        if ev.action == "fetch":
            for pos, orb in ev.new_orbs:
                self.hold[pos] = DispOrb(orb.copy(), self.t, 0.8)
                self.bolts.append(Bolt(mouth, cell_center(*pos), 0.4, (255, 190, 80), 5))
                self.audio_play("zap")
                self.audio_play(f"orb{min(len(self.hold) - 1, 14)}")
                cx, cy = cell_center(*pos)
                self.particles.burst(cx, cy, 28, (255, 210, 90), 300, 0.8, 4, 100)
                self.win_disp = self.hold_total()
                yield from self.sleep(0.4)
        else:
            for pos, before, after in ev.boosted:
                d = self.hold.get(pos)
                self.bolts.append(Bolt(mouth, cell_center(*pos), 0.45, (255, 190, 80), 6))
                self.audio_play("zap")
                yield from self.sleep(0.18)
                if d:
                    d.orb = after.copy()
                    d.born = self.t
                    d.flash = 1.0
                self.audio_play("boost")
                cx, cy = cell_center(*pos)
                self.particles.burst(cx, cy, 34, (255, 220, 100), 360, 0.9, 5, 200)
                self.win_disp = self.hold_total()
                self.shake_screen(5)
                yield from self.sleep(0.32)
        yield from self.sleep(0.5)
        self.smokey_present = False
        yield from self.sleep(0.35)

    # ------------------------------------------------------------- free games
    def flow_free_games(self, res):
        eng = self.engine
        bet, level = self.spin_bet, self.spin_level
        fg = eng.start_free_games(res.free_spins_awarded, bet, level)
        self.stats["free_games"] += 1
        self.session["free_games"] += 1
        self.audio_play("trigger")
        self.set_theme("free")
        self.music("free")
        self.hl_cells = set(res.t_cells)
        self.flash = 0.7
        self.shake_screen(12)
        for _ in range(5):
            self.add_random_bolt((255, 220, 120))
        self.banner("POWER T FREE GAMES", f"{res.free_spins_awarded} FREE GAMES AWARDED", (255, 190, 60), life=3.6, size=84)
        self.particles.coins(W // 2, 640, 40, 900)
        yield from self.sleep(3.2, skippable=False)
        self.hl_cells = set()
        self.cycle = []
        self.win_disp = 0.0
        total_spins = res.free_spins_awarded
        played = 0
        self.fg_info = dict(left=fg.spins_left, total=total_spins, mult=fg.multiplier(), win=0)
        while not fg.done:
            self.fg_info.update(left=fg.spins_left, total=total_spins, mult=fg.multiplier())
            yield from self.sleep(0.45)
            r = fg.play_spin()
            played += 1
            if r.new_sticky:
                yield from self.drop_sticky(r.new_sticky)
            self.fg_info.update(left=fg.spins_left + (0 if r.trigger != "power_t" else -r.free_spins_awarded), mult=r.multiplier)
            yield from self.reel_spin(r.grid, r.orbs, r.sticky)
            if r.total_credits:
                self.hl_cells = set()
                for lw in r.line_wins:
                    self.hl_cells.update(lw.cells)
                if r.scatter_credits:
                    self.hl_cells.update(r.t_cells)
                ratio = r.total_credits / bet
                lvl = 0 if ratio < 5 else 1 if ratio < 15 else 2
                self.audio_play(f"fanfare{lvl}", 0.6)
                name, col, _ = self.tier_for(ratio)
                if name:
                    self.banner(name, money(r.total_credits * self.spin_denom), col, life=2.0, size=70)
                if r.multiplier > 1:
                    self.toast(f"x{r.multiplier} MULTIPLIER!", 1.6)
                yield from self.count_up(r.total_credits, ratio, coins=ratio >= 15, dur=min(2.0, 0.4 + ratio ** 0.5 * 0.2))
                yield from self.sleep(0.25, skippable=True)
                self.hl_cells = set()
            if r.trigger == "power_t":
                self.hl_cells = set(r.t_cells)
                self.audio_play("trigger", 0.8)
                self.banner(f"+{r.free_spins_awarded} FREE GAMES", "POWER T RETRIGGER!", (255, 220, 100), life=2.6, size=76)
                total_spins += r.free_spins_awarded
                self.flash = 0.5
                self.shake_screen(10)
                self.fg_info["total"] = total_spins
                yield from self.sleep(2.2)
                self.hl_cells = set()
            elif r.trigger == "orb":
                v = yield from self.flow_orb_link(r.orbs, in_free=True)
                if self.cfg["free_games"]["multiplier_on_orbs"] and r.multiplier > 1:
                    extra = v * (r.multiplier - 1)
                    self.pay(extra)
                    v += extra
                fg.add_win(v)
                self.win_disp = float(fg.total_credits)
                self.set_theme("free")
            self.pay(r.total_credits) if r.total_credits else None
            self.fg_info["left"] = fg.spins_left
            self.fg_info["win"] = fg.total_credits
            self.win_disp = float(fg.total_credits)
            # keep sticky list for the overlay
            self.sticky = set(fg.sticky)
        # outro
        total = fg.total_credits
        ratio = total / max(1, bet)
        name, col, _ = self.tier_for(ratio)
        self.banner("FREE GAMES COMPLETE", f"TOTAL WIN  {money(total * self.spin_denom)}", col or (255, 190, 60), life=3.4, size=78)
        self.audio_play("fanfare3" if ratio >= 50 else "fanfare2")
        self.particles.coins(W // 2, 640, 50, 900)
        yield from self.sleep(3.2, skippable=True)
        self.sticky = set()
        self.fg_info = None
        self.set_theme("base")
        self.music("base")
        return total

    def drop_sticky(self, positions):
        s = self.smokey
        s.enter()
        self.smokey_present = True
        self.audio_play("bark")
        yield from self.sleep(0.5)
        s.howl(1.6)
        self.audio_play("howl", 0.8)
        s.ring()
        self.banner("SMOKEY'S WILDS!", "STICKY WILDS FOR THE REST OF THE ROUND", (255, 200, 80), life=2.0, size=62, y=170)
        yield from self.sleep(0.6)
        mouth = (s.x + 40, s.y - 60)
        for pos in positions:
            self.bolts.append(Bolt(mouth, cell_center(*pos), 0.4, (255, 190, 80), 6))
            self.audio_play("zap")
            self.sticky.add(pos)
            self.sticky_born[pos] = self.t
            cx, cy = cell_center(*pos)
            self.particles.burst(cx, cy, 30, (255, 240, 130), 320, 0.8, 5, 150)
            self.shake_screen(5)
            yield from self.sleep(0.4)
        yield from self.sleep(0.4)
        self.smokey_present = False
        yield from self.sleep(0.3)

    # ------------------------------------------------------------- bolt helpers
    def add_random_bolt(self, color=(150, 210, 255)):
        a = (random.randint(100, 1180), 0)
        b = (random.randint(100, 1180), random.randint(300, 640))
        self.bolts.append(Bolt(a, b, 0.5, color, 6))
        self.audio_play("zap", 0.4)

    def add_bolt_at(self, pos):
        c = cell_center(*pos)
        self.bolts.append(Bolt((c[0] + random.randint(-80, 80), 0), c, 0.4, (255, 190, 80), 5))

    # ------------------------------------------------------------------ update
    def update(self, dt):
        self.dt = dt
        self.t += dt
        if self.theme_mix < 1.0:
            self.theme_mix = min(1.0, self.theme_mix + dt / 1.1)
        for i, r in enumerate(self.reels):
            if r.update(dt):
                self.on_land(i)
        for tm in self.timers:
            tm[0] -= dt
        due = [tm for tm in self.timers if tm[0] <= 0]
        self.timers = [tm for tm in self.timers if tm[0] > 0]
        for tm in due:
            tm[1]()
        if self.flow is not None and self.state != "admin":
            try:
                next(self.flow)
            except StopIteration:
                self.flow = None
        self.particles.update(dt)
        for b in self.bolts:
            b.update(dt)
        self.bolts = [b for b in self.bolts if b.life > 0]
        for b in self.banners:
            b.update(dt)
        self.banners = [b for b in self.banners if b.life > 0]
        for tt in self.toasts:
            tt[1] -= dt
        self.toasts = [tt for tt in self.toasts if tt[1] > 0]
        self.smokey.update(dt, self.smokey_present)
        self.shake = max(0.0, self.shake - dt * 30)
        self.flash = max(0.0, self.flash - dt * 1.6)
        self.quit_armed = max(0.0, self.quit_armed - dt)
        for tmp in (self.hold or {}).values():
            tmp.flash = max(0.0, tmp.flash - dt * 2.2)
        if self.state == "idle":
            self.update_idle(dt)

    def update_idle(self, dt):
        if self.cycle:
            self.cycle_t += dt
            if self.cycle_t > 1.1:
                self.cycle_t = 0.0
                self.cycle_i = (self.cycle_i + 1) % len(self.cycle)
                lw = self.cycle[self.cycle_i]
                self.hl_line = lw
                self.hl_cells = set(lw.cells)
        if self.auto:
            if self.broke() or not self.can_afford():
                self.auto = False
                self.toast("AUTO SPIN STOPPED")
            else:
                self.auto_timer += dt
                if self.auto_timer > (0.35 if self.cfg["general"]["turbo_spin"] else 0.9) + (1.2 if self.cycle else 0.0) * 0:
                    self.start_spin()

    # ------------------------------------------------------------------- input
    def _build_buttons(self):
        idle = lambda: self.state == "idle"
        self.buttons = [
            Button((228, 664, 26, 36), "<", lambda: self.change_denom(-1), "arrow", idle),
            Button((372, 664, 26, 36), ">", lambda: self.change_denom(1), "arrow", idle),
            Button((414, 664, 26, 36), "<", lambda: self.change_level(-1), "arrow", idle),
            Button((552, 664, 26, 36), ">", lambda: self.change_level(1), "arrow", idle),
            Button((582, 622, 116, 98), "SPIN", self.on_spin_button, "spin", lambda: True),
            Button((1088, 636, 78, 30), "AUTO", self.toggle_auto, "small", lambda: True),
            Button((1174, 636, 86, 30), "MAX BET", self.max_bet, "small", idle),
            Button((1088, 676, 78, 30), "MUSIC", self.toggle_music, "small", lambda: True),
            Button((1174, 676, 86, 30), "SOUND", self.toggle_sfx, "small", lambda: True),
            Button((1218, 6, 56, 22), "ADMIN", self.open_admin, "tiny", idle),
            Button((1156, 6, 56, 22), "HELP", self.toggle_help, "tiny", lambda: True),
        ]

    def on_spin_button(self):
        if self.state == "idle":
            self.start_spin()
        elif self.state == "busy":
            self.skip = True

    def toggle_auto(self):
        self.auto = not self.auto
        self.auto_timer = 0.0
        self.toast("AUTO SPIN " + ("ON" if self.auto else "OFF"), 1.0)

    def toggle_music(self):
        if self.audio:
            self.toast("MUSIC " + ("OFF" if self.audio.toggle_music() else "ON"), 1.0)

    def toggle_sfx(self):
        if self.audio:
            self.toast("SOUND " + ("OFF" if self.audio.toggle_sfx() else "ON"), 1.0)

    def toggle_help(self):
        self.help_open = not self.help_open

    def open_admin(self):
        if self.state == "idle":
            self.admin.open()

    def toggle_fullscreen(self):
        pygame.display.toggle_fullscreen()

    def handle_event(self, e):
        if e.type == pygame.QUIT:
            self.running = False
            return
        if self.state == "admin":
            self.admin.handle_event(e)
            return
        if self.state == "title":
            if e.type in (pygame.KEYDOWN, pygame.MOUSEBUTTONDOWN):
                if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
                    self.running = False
                    return
                self.state = "idle"
                self.music("base")
                self.audio_play("click")
            return
        if e.type == pygame.MOUSEMOTION:
            for b in self.buttons:
                b.hover = b.rect.collidepoint(e.pos)
        elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if self.help_open:
                self.help_open = False
                return
            hit = False
            for b in self.buttons:
                if b.rect.collidepoint(e.pos) and b.enabled():
                    b.action()
                    hit = True
                    break
            if not hit and self.state == "busy":
                self.skip = True
            if not hit and self.state == "idle" and self.broke():
                self.reset_bankroll()
        elif e.type == pygame.KEYDOWN:
            k = e.key
            if self.help_open and k in (pygame.K_ESCAPE, pygame.K_h, pygame.K_F2):
                self.help_open = False
            elif k in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_KP_ENTER):
                self.on_spin_button()
            elif k == pygame.K_UP:
                self.change_level(1)
            elif k == pygame.K_DOWN:
                self.change_level(-1)
            elif k == pygame.K_RIGHT:
                self.change_denom(1)
            elif k == pygame.K_LEFT:
                self.change_denom(-1)
            elif k == pygame.K_a:
                self.toggle_auto()
            elif k == pygame.K_b:
                self.max_bet()
            elif k == pygame.K_m:
                self.toggle_music()
            elif k == pygame.K_s:
                self.toggle_sfx()
            elif k == pygame.K_h:
                self.toggle_help()
            elif k == pygame.K_F11:
                self.toggle_fullscreen()
            elif k == pygame.K_F1:
                self.open_admin()
            elif k == pygame.K_r and self.state == "idle" and self.broke():
                self.reset_bankroll()
            elif k == pygame.K_ESCAPE:
                if self.state == "idle":
                    if self.quit_armed > 0:
                        self.running = False
                    else:
                        self.quit_armed = 2.0
                        self.toast("PRESS ESC AGAIN TO QUIT", 2.0)

    # -------------------------------------------------------------------- draw
    def draw_orb(self, surf, orb, center, slot=None, topleft=None, scale=1.0, flash=0.0, cents=None):
        if slot is not None and topleft is not None:
            surf.blit(slot, topleft)
        kind = orb.kind if orb else "cash"
        img = self.art.orb[kind]
        s = 1.0 * scale
        if abs(s - 1.0) > 0.01:
            img = pygame.transform.smoothscale(img, (max(2, int(CELL * s)), max(2, int(CELL * s))))
        r = img.get_rect(center=center)
        gfx.add_glow(surf, center, int(CELL * 0.62 * s), tuple(int(c * 0.28) for c in ORB_COLORS[kind][1]), 1.0)
        surf.blit(img, r)
        if orb is not None:
            if kind == "cash":
                label = money(cents if cents is not None else self.orb_cents(orb), short=True)
                size = 30 if len(label) <= 6 else 26 if len(label) <= 7 else 22
                draw_text(surf, label, int(size * s), center, WHITE, ow=3, outline=(70, 25, 0))
            else:
                draw_text(surf, kind.upper(), int(26 * s), (center[0], center[1] - 8 * s), WHITE, ow=3, outline=(30, 0, 40))
                draw_text(surf, money(cents if cents is not None else self.orb_cents(orb), short=True), int(18 * s),
                          (center[0], center[1] + 16 * s), (255, 240, 180), ow=2, outline=(30, 0, 40))
        if flash > 0:
            gfx.add_glow(surf, center, int(CELL * 0.8), tuple(int(255 * min(1, flash)) for _ in range(3)), 0.9)

    def _reel_orb_drawer(self, surf, orb, center, slot, topleft):
        self.draw_orb(surf, orb, center, slot, topleft)

    def draw(self):
        surf = self.canvas
        self.bg.draw(surf, self.t, self.theme, self.prev_theme, self.theme_mix,
                     intensity=1.4 if self.state == "busy" and self.theme != "base" else 1.0, dt=self.dt)
        if self.state == "title":
            self.draw_title(surf)
        else:
            self.draw_title_bar(surf)
            self.draw_jackpots(surf)
            self.draw_side_panels(surf)
            self.draw_reel_frame(surf)
            if self.hold is not None:
                self.draw_hold_board(surf)
            else:
                for r in self.reels:
                    r.draw(surf, self.art, self._reel_orb_drawer)
                self.draw_sticky(surf)
                self.draw_highlights(surf)
                self.draw_anticipation(surf)
            self.smokey.draw(surf)
            for b in self.bolts:
                b.draw(surf)
            self.particles.draw(surf)
            self.draw_hud(surf)
            for b in self.banners:
                b.draw(surf, self.t)
            self.draw_toasts(surf)
            if self.flash > 0:
                f = pygame.Surface((W, H))
                v = int(255 * min(1.0, self.flash))
                f.fill((v, v, int(v * 0.85)))
                surf.blit(f, (0, 0), special_flags=pygame.BLEND_RGB_ADD)
            if self.broke() and self.state == "idle":
                self.draw_broke(surf)
            if self.help_open:
                self.draw_help(surf)
        if self.state == "admin":
            self.admin.draw(surf)
        ox = oy = 0
        if self.shake > 0.2:
            ox = int(random.uniform(-1, 1) * self.shake)
            oy = int(random.uniform(-1, 1) * self.shake)
        self.screen.fill((0, 0, 0))
        self.screen.blit(surf, (ox, oy))
        pygame.display.flip()

    def draw_title(self, surf):
        pygame.draw.rect(surf, (0, 0, 0), (0, 250, W, 210))
        surf.blit(pygame.transform.smoothscale(self.art.power_t_outline, (200, 200)), (W // 2 - 100, 40))
        draw_text(surf, "VOLS POWER LINK", 110, (W // 2, 330), ORANGE, ow=6, outline=(60, 20, 0),
                  scale=1.0 + 0.01 * math.sin(self.t * 3))
        draw_text(surf, "TENNESSEE EDITION  -  SMOKEY'S ORB LINK  &  POWER T FREE GAMES", 26, (W // 2, 410), WHITE)
        a = 150 + int(100 * math.sin(self.t * 4))
        draw_text(surf, "PRESS ANY KEY OR CLICK TO PLAY", 34, (W // 2, 560), (255, 220, 160), alpha=a)
        if self.audio:
            msg = "SOUND READY" if (self.audio.loaded and len(self.audio.music) >= 3) else "SYNTHESISING SOUNDS..."
            draw_text(surf, msg, 18, (W // 2, 640), (150, 150, 170), outline=None)
        draw_text(surf, f"v{__version__}", 16, (W - 40, H - 20), (110, 110, 130), outline=None)

    def draw_title_bar(self, surf):
        draw_text(surf, "VOLS POWER LINK", 38, (W // 2, 30), ORANGE, ow=3, outline=(50, 18, 0))
        for sx in (W // 2 - 230, W // 2 + 230):
            t = pygame.transform.smoothscale(self.art.power_t_outline, (50, 50))
            surf.blit(t, t.get_rect(center=(sx, 30)))

    def draw_jackpots(self, surf):
        bet = self.bet_credits
        pw = 188
        x0 = (W - 4 * pw - 3 * 14) // 2
        for i, k in enumerate(JACKPOTS):
            x = x0 + i * (pw + 14)
            hi, mid, lo = ORB_COLORS[k]
            r = pygame.Rect(x, 62, pw, 60)
            pygame.draw.rect(surf, (10, 6, 20), r, border_radius=12)
            pygame.draw.rect(surf, mid, r, width=2, border_radius=12)
            pygame.draw.rect(surf, tuple(c // 5 for c in mid), r.inflate(-6, -6), width=0, border_radius=10)
            draw_text(surf, k.upper(), 17, (r.centerx, r.y + 14), hi, ow=2)
            amt = self.engine.orb_credits(self._fake_orb(k), bet, self.level_idx) * self.denom_cents
            draw_text(surf, money(amt), 26, (r.centerx, r.y + 39), WHITE, ow=2)

    @staticmethod
    def _fake_orb(kind):
        from .engine import Orb
        return Orb(kind, 0)

    def draw_reel_frame(self, surf):
        r = pygame.Rect(GX - 16, GY - 14, 5 * CELL + 4 * GAP + 32, 3 * PITCH - GAP + 28)
        col = {"base": ORANGE, "orb": (110, 190, 255), "free": (255, 200, 60)}[self.theme]
        gfx.add_glow(surf, r.center, 560, tuple(int(c * 0.2) for c in col), 0.6)
        pygame.draw.rect(surf, (6, 3, 12), r, border_radius=18)
        for i in range(5):
            pygame.draw.rect(surf, (20, 12, 34), (GX + i * PITCH - 4, GY - 4, CELL + 8, 3 * PITCH - GAP + 8), border_radius=10)
        pygame.draw.rect(surf, col, r, width=4, border_radius=18)
        pygame.draw.rect(surf, tuple(c // 2 for c in col), r.inflate(10, 10), width=2, border_radius=22)

    def draw_anticipation(self, surf):
        for r in self.reels:
            if r.anticipate:
                a = 0.5 + 0.5 * math.sin(self.t * 14)
                rect = r.rect.inflate(10, 10)
                pygame.draw.rect(surf, (int(255 * a), int(190 * a), int(60 * a)), rect, width=5, border_radius=8)
                gfx.add_glow(surf, rect.center, 280, (int(60 * a), int(40 * a), int(8 * a)), 0.8)

    def draw_highlights(self, surf):
        if not self.hl_cells:
            return
        dim = pygame.Surface((CELL, CELL), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 150))
        for c in range(5):
            for r in range(3):
                if (c, r) not in self.hl_cells and self.state == "idle" or (c, r) not in self.hl_cells and self.win_disp > 0:
                    if all(rr.state == "idle" for rr in self.reels):
                        surf.blit(dim, cell_pos(c, r))
        pulse = 0.5 + 0.5 * math.sin(self.t * 8)
        for c, r in self.hl_cells:
            x, y = cell_pos(c, r)
            rect = pygame.Rect(x - 3, y - 3, CELL + 6, CELL + 6)
            col = tuple(int(v * (0.6 + 0.4 * pulse)) for v in (255, 200, 80))
            pygame.draw.rect(surf, col, rect, width=4, border_radius=14)
            gfx.add_glow(surf, (x + CELL // 2, y + CELL // 2), 110, (60, 36, 6), 0.8)
        if self.hl_line is not None and self.state == "idle":
            pts = [cell_center(c, PAYLINES[self.hl_line.line][c]) for c in range(5)]
            pygame.draw.lines(surf, (255, 235, 150), False, pts, 5)
            pygame.draw.lines(surf, (255, 150, 30), False, pts, 2)
            lw = self.hl_line
            txt = f"LINE {lw.line + 1}  -  {lw.count} x {lw.symbol}  -  {money(int(round(lw.credits)) * self.spin_denom)}"
            draw_text(surf, txt, 22, (W // 2, GY + 3 * PITCH + 10), (255, 235, 170), ow=3)

    def draw_sticky(self, surf):
        if not self.sticky:
            return
        for pos in self.sticky:
            x, y = cell_pos(*pos)
            age = self.t - self.sticky_born.get(pos, -9)
            sc = ease_out_back(min(1.0, age / 0.35)) if age < 0.35 else 1.0
            img = self.art.sym["WILD"]
            if abs(sc - 1) > 0.01:
                img = pygame.transform.smoothscale(img, (max(2, int(CELL * sc)), max(2, int(CELL * sc))))
            surf.blit(img, img.get_rect(center=(x + CELL // 2, y + CELL // 2)))
            pulse = 0.5 + 0.5 * math.sin(self.t * 5 + pos[0])
            pygame.draw.rect(surf, (255, int(180 + 70 * pulse), 60), (x - 2, y - 2, CELL + 4, CELL + 4), width=3, border_radius=14)
            gfx.add_glow(surf, (x + CELL // 2, y + CELL // 2), 100, (int(60 * pulse), int(40 * pulse), 4), 0.8)

    def draw_hold_board(self, surf):
        for c in range(5):
            for r in range(3):
                pos = (c, r)
                x, y = cell_pos(c, r)
                d = self.hold.get(pos)
                surf.blit(self.art.empty, (x, y))
                if d:
                    age = self.t - d.born
                    sc = ease_out_back(min(1.0, age / 0.4), 2.0) if age < 0.4 else 1.0
                    self.draw_orb(surf, d.orb, (x + CELL // 2, y + CELL // 2), scale=max(0.1, sc), flash=d.flash)
                elif pos in self.hold_spinning:
                    clip = pygame.Rect(x, y, CELL, CELL)
                    old = surf.get_clip()
                    surf.set_clip(clip)
                    for k in range(-1, 4):
                        yy = y + ((self.t * 700 + k * 60 + c * 23 + r * 41) % 240) - 60
                        pygame.draw.line(surf, (60, 90, 140), (x + 10, yy), (x + CELL - 10, yy), 2)
                    ph = (self.t * 900 + c * 130 + r * 77) % 330 - 90
                    s = pygame.transform.smoothscale(self.art.blur["ORB"], (CELL, CELL))
                    s.set_alpha(110)
                    surf.blit(s, (x, y + ph - 90))
                    surf.set_clip(old)
                else:
                    pygame.draw.circle(surf, (36, 28, 60), (x + CELL // 2, y + CELL // 2), 18, width=2)

    def draw_side_panels(self, surf):
        # left: Smokey idle / info
        if not self.smokey.active:
            self.smokey.t += 0
            s = self.smokey
            s.y = 410
            s.x = 118
            s.draw(surf, idle=True)
            draw_text(surf, "SMOKEY", 26, (118, 568), (200, 220, 255), ow=3)
        px = 1058
        card = pygame.Rect(px, 150, 206, 420)
        pygame.draw.rect(surf, (10, 6, 20), card, border_radius=14)
        pygame.draw.rect(surf, (90, 56, 20), card, width=2, border_radius=14)
        cx = card.centerx
        if self.hold is not None:
            draw_text(surf, "ORB LINK", 30, (cx, card.y + 28), (140, 210, 255), ow=3)
            draw_text(surf, "RESPINS", 20, (cx, card.y + 76), WHITE)
            for i in range(3 if True else 0):
                on = i < self.respins_disp
                pygame.draw.circle(surf, (255, 190, 60) if on else (40, 30, 56), (cx - 50 + i * 50, card.y + 118), 17)
                pygame.draw.circle(surf, WHITE if on else (90, 90, 110), (cx - 50 + i * 50, card.y + 118), 17, width=2)
            draw_text(surf, "ORBS", 20, (cx, card.y + 176), WHITE)
            draw_text(surf, f"{len(self.hold)} / 15", 34, (cx, card.y + 212), (255, 210, 120), ow=3)
            draw_text(surf, "TOTAL", 20, (cx, card.y + 272), WHITE)
            draw_text(surf, money(self.hold_total() * self.spin_denom, short=True), 30, (cx, card.y + 308), GOLD, ow=3)
            draw_text(surf, "FILL ALL 15 FOR", 15, (cx, card.y + 360), (200, 200, 220), outline=None)
            draw_text(surf, "THE GRAND!", 22, (cx, card.y + 384), (255, 90, 90), ow=2)
        elif self.fg_info:
            fi = self.fg_info
            draw_text(surf, "FREE GAMES", 28, (cx, card.y + 28), (255, 200, 80), ow=3)
            draw_text(surf, "SPINS LEFT", 18, (cx, card.y + 76), WHITE)
            draw_text(surf, str(fi["left"]), 60, (cx, card.y + 124), WHITE, ow=4)
            draw_text(surf, "MULTIPLIER", 18, (cx, card.y + 188), WHITE)
            draw_text(surf, f"x{fi['mult']}", 54, (cx, card.y + 232), (255, 160, 40), ow=4)
            draw_text(surf, "ROUND WIN", 18, (cx, card.y + 292), WHITE)
            draw_text(surf, money(int(self.win_disp) * self.spin_denom, short=True), 28, (cx, card.y + 328), GOLD, ow=3)
            draw_text(surf, "SMOKEY DROPS", 14, (cx, card.y + 376), (200, 200, 220), outline=None)
            draw_text(surf, "STICKY WILDS!", 20, (cx, card.y + 398), (255, 220, 120), ow=2)
        else:
            t = pygame.transform.smoothscale(self.art.sym["POWERT"], (84, 84))
            surf.blit(t, t.get_rect(center=(cx, card.y + 60)))
            draw_text(surf, "3 POWER T", 26, (cx, card.y + 122), (255, 200, 80), ow=3)
            draw_text(surf, "FREE GAMES", 22, (cx, card.y + 148), WHITE, ow=2)
            o = self.art.orb["cash"]
            o = pygame.transform.smoothscale(o, (84, 84))
            surf.blit(o, o.get_rect(center=(cx, card.y + 230)))
            draw_text(surf, "6+ ORBS", 26, (cx, card.y + 292), (150, 210, 255), ow=3)
            draw_text(surf, "ORB LINK", 22, (cx, card.y + 318), WHITE, ow=2)
            draw_text(surf, "WIN UP TO", 15, (cx, card.y + 364), (200, 200, 220), outline=None)
            grand = self.engine.orb_credits(self._fake_orb("grand"), self.bet_credits, self.level_idx) * self.denom_cents
            draw_text(surf, money(grand, short=True), 26, (cx, card.y + 390), (255, 90, 90), ow=3)

    def draw_panel(self, surf, rect, label, value, vsize=30, vcolor=WHITE):
        pygame.draw.rect(surf, (10, 6, 20), rect, border_radius=10)
        pygame.draw.rect(surf, (110, 66, 20), rect, width=2, border_radius=10)
        draw_text(surf, label, 15, (rect.centerx, rect.y + 15), ORANGE, ow=2)
        draw_text(surf, value, vsize, (rect.centerx, rect.y + 46), vcolor, ow=3)

    def draw_hud(self, surf):
        bar = pygame.Rect(0, 628, W, 92)
        pygame.draw.rect(surf, (8, 5, 16), bar)
        pygame.draw.line(surf, ORANGE, (0, 628), (W, 628), 3)
        self.draw_panel(surf, pygame.Rect(18, 640, 202, 68), "BALANCE", money(self.balance), 32)
        self.draw_panel(surf, pygame.Rect(224, 640, 178, 68), "DENOMINATION", self.denom_label(self.denom_cents), 32, (255, 210, 120))
        lvl = self.level_idx + 1
        self.draw_panel(surf, pygame.Rect(410, 640, 172, 68), f"POWER LEVEL {lvl}", f"{self.bet_credits} CR", 30, (255, 170, 60))
        self.draw_panel(surf, pygame.Rect(708, 640, 180, 68), "TOTAL BET", money(self.cost), 32)
        win_cents = int(self.win_disp * self.spin_denom)
        self.draw_panel(surf, pygame.Rect(896, 640, 186, 68), "WIN", money(win_cents), 32, GOLD if win_cents else (120, 120, 140))
        for b in self.buttons:
            self.draw_button(surf, b)

    def draw_button(self, surf, b):
        en = b.enabled()
        if b.kind == "spin":
            cx, cy = b.rect.center
            pulse = 0.5 + 0.5 * math.sin(self.t * 4)
            idle = self.state == "idle" and not self.broke()
            col = (255, int(120 + 50 * pulse), 0) if idle else (110, 70, 30)
            if idle:
                gfx.add_glow(surf, (cx, cy - 6), 90, (int(70 + 50 * pulse), int(30 + 20 * pulse), 0), 0.9)
            pygame.draw.circle(surf, (20, 10, 4), (cx, cy - 6), 56)
            pygame.draw.circle(surf, col, (cx, cy - 6), 52)
            pygame.draw.circle(surf, tuple(min(255, c + 70) for c in col), (cx, cy - 18), 40, width=0) if idle else None
            pygame.draw.circle(surf, col, (cx, cy - 6), 46)
            pygame.draw.circle(surf, (255, 235, 200), (cx, cy - 6), 52, width=3)
            label = "SPIN" if self.state == "idle" else "SKIP" if self.state == "busy" else "..."
            if self.auto and self.state == "idle":
                label = "AUTO"
            draw_text(surf, label, 34, (cx, cy - 6), WHITE, ow=3, outline=(90, 30, 0))
            return
        col = (60, 40, 90) if en else (30, 24, 40)
        if b.hover and en:
            col = (110, 70, 130)
        if b.label in ("AUTO",) and self.auto:
            col = (200, 100, 0)
        if b.label == "MUSIC" and self.audio and self.audio.muted_music:
            col = (90, 20, 20)
        if b.label == "SOUND" and self.audio and self.audio.muted_sfx:
            col = (90, 20, 20)
        if b.kind == "tiny":
            draw_text(surf, b.label, 13, b.rect.center, (150, 140, 170) if en else (70, 70, 80), outline=None)
            return
        pygame.draw.rect(surf, col, b.rect, border_radius=8)
        pygame.draw.rect(surf, ORANGE if en else (70, 60, 70), b.rect, width=2, border_radius=8)
        draw_text(surf, b.label, 20 if b.kind == "arrow" else 15, b.rect.center, WHITE if en else (110, 110, 120), ow=2)

    def draw_toasts(self, surf):
        y = 600
        for text, life in self.toasts[-3:]:
            a = int(255 * min(1.0, life / 0.4))
            draw_text(surf, text, 28, (W // 2, y), (255, 240, 200), ow=3, alpha=a)
            y -= 34

    def draw_broke(self, surf):
        ov = pygame.Surface((W, H), pygame.SRCALPHA)
        ov.fill((0, 0, 0, 190))
        surf.blit(ov, (0, 0))
        draw_text(surf, "OUT OF FUNDS", 90, (W // 2, 290), (255, 90, 60), ow=5)
        draw_text(surf, f"CLICK OR PRESS R FOR A FRESH {money(int(round(self.cfg['general']['starting_balance'] * 100)))}", 30, (W // 2, 380), WHITE)

    def draw_help(self, surf):
        ov = pygame.Surface((W, H), pygame.SRCALPHA)
        ov.fill((0, 0, 0, 225))
        surf.blit(ov, (0, 0))
        draw_text(surf, "HOW TO PLAY", 48, (W // 2, 50), ORANGE, ow=4)
        lines = [
            "20 paylines, 5 reels. Wilds substitute for everything except Power T and Orbs.",
            "6+ ORBS anywhere  =  SMOKEY'S ORB LINK. Orbs lock, 3 respins (reset on every new orb).",
            "Smokey may appear at random to HOWL (boost orbs), FETCH (add orbs) or SUPER HOWL (boost all).",
            "Mini / Minor / Major jackpot orbs pay their jackpot. Fill all 15 spots for the GRAND.",
            "3+ POWER T anywhere  =  POWER T FREE GAMES with climbing multipliers and sticky Smokey wilds.",
            "All prizes are multiples of your bet, so POWER LEVEL and DENOMINATION scale every win.",
        ]
        for i, ln in enumerate(lines):
            draw_text(surf, ln, 21, (W // 2, 108 + i * 30), WHITE, ow=2)
        pays = self.cfg["paytable"]
        lb = self.bet_credits / LINES * self.denom_cents
        y = 310
        draw_text(surf, f"PAYTABLE at {money(self.cost)} bet (line bet {money(int(lb))})", 24, (W // 2, y - 8), (255, 200, 120), ow=2)
        from .config import PAYING
        for i, sym in enumerate(reversed(PAYING)):
            col, row = i % 5, i // 5
            x = 190 + col * 225
            yy = y + 24 + row * 150
            surf.blit(pygame.transform.smoothscale(self.art.sym[sym], (70, 70)), (x - 110, yy))
            for k in range(3):
                draw_text(surf, f"{5 - k}: {money(int(round(pays[sym][2 - k] * lb)))}", 17, (x - 30, yy + 8 + k * 22), WHITE, anchor="midleft", ow=2)
        draw_text(surf, "SPACE spin/skip   UP/DOWN power level   LEFT/RIGHT denomination   A auto   B max bet   M music   S sound   F11 fullscreen   F1 admin",
                  15, (W // 2, 665), (180, 180, 200), outline=None)
        draw_text(surf, "CLICK OR PRESS ESC TO CLOSE", 18, (W // 2, 695), (255, 220, 160))

    # -------------------------------------------------------------------- loop
    def run(self):
        while self.running:
            dt = min(self.clock.tick(60) / 1000.0, 0.05)
            for e in pygame.event.get():
                self.handle_event(e)
            if self.state == "admin":
                self.admin.update(dt)
                self.t += dt
                self.dt = dt
            else:
                self.update(dt)
            self.draw()
        self.save_state()
        pygame.quit()
