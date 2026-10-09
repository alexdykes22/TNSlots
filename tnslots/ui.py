"""Visual building blocks: reels, backgrounds, banners, Smokey actor, money formatting."""
import math
import random

import pygame

from . import gfx
from .config import SYMBOLS
from .gfx import ORANGE, WHITE, draw_text

W, H = 1280, 720
CELL, GAP = 150, 8
PITCH = CELL + GAP
GX = (W - (5 * CELL + 4 * GAP)) // 2
GY = 138
FILLER = ["J", "Q", "K", "A", "CHECKER", "FOOTBALL", "HELMET", "TROPHY", "SMOKEY", "WILD", "POWERT", "ORB", "J", "Q", "K", "A"]


def cell_pos(c, r):
    return GX + c * PITCH, GY + r * PITCH


def cell_center(c, r):
    x, y = cell_pos(c, r)
    return x + CELL // 2, y + CELL // 2


def money(cents, short=False):
    d = cents / 100.0
    if short:
        if d >= 1_000_000:
            return f"${d / 1_000_000:.2f}M"
        if d >= 100_000:
            return f"${d / 1000:.0f}K"
        if d >= 10_000:
            return f"${d / 1000:.1f}K"
    if abs(d) >= 1000 or short is False:
        return f"${d:,.2f}"
    return f"${d:.2f}"


def ease_out_back(u, s=1.25):
    u -= 1
    return 1 + (s + 1) * u ** 3 + s * u ** 2


class Reel:
    L = 40

    def __init__(self, idx):
        self.idx = idx
        self.x = GX + idx * PITCH
        self.y = GY
        self.strip = [random.choice(FILLER) for _ in range(self.L)]
        self.pos = float(random.randint(0, self.L - 1))
        self.state = "idle"  # idle | spinning | stopping
        self.speed = 24.0
        self.orb_at = {}
        self.t = 0.0
        self.dur = 0.7
        self.p0 = self.p1 = 0.0
        self.anticipate = False
        self.landed_flag = False
        self.rect = pygame.Rect(self.x, GY, CELL, 3 * PITCH - GAP)

    def set_idle_symbols(self, syms, orbs=None):
        P = int(math.floor(self.pos))
        for r in range(3):
            self.strip[(P - r) % self.L] = syms[r]
        self.pos = float(P)
        self.orb_at = {(P - r) % self.L: orbs[r] for r in range(3) if orbs and r in orbs}

    def start(self, speed):
        self.state = "spinning"
        self.speed = speed
        P = int(math.floor(self.pos))
        keep = {(P + 1 - k) % self.L for k in range(4)}
        for j in range(self.L):
            if j not in keep:
                self.strip[j] = random.choice(FILLER)
        self.orb_at = {}
        self.anticipate = False

    def request_stop(self, syms, orbs, turbo=False):
        P = int(math.ceil(self.pos)) + 5
        for r in range(3):
            self.strip[(P - r) % self.L] = syms[r]
        self.orb_at = {(P - r) % self.L: orbs[r] for r in range(3) if r in orbs}
        self.p0, self.p1 = self.pos, float(P)
        self.dur = 0.42 if turbo else 0.72
        self.t = 0.0
        self.state = "stopping"

    def update(self, dt):
        if self.state == "spinning":
            self.pos += self.speed * dt
        elif self.state == "stopping":
            self.t += dt
            u = min(1.0, self.t / self.dur)
            self.pos = self.p0 + (self.p1 - self.p0) * ease_out_back(u, 1.15)
            if u >= 1.0:
                self.pos = self.p1 % self.L
                self.state = "idle"
                self.anticipate = False
                self.landed_flag = True
                return True
        return False

    def moving(self):
        return self.state == "spinning" or (self.state == "stopping" and self.t < self.dur * 0.55)

    def draw(self, surf, art, orb_drawer, clip=True):
        old = surf.get_clip()
        if clip:
            surf.set_clip(self.rect)
        P = int(math.floor(self.pos))
        frac = self.pos - P
        blur = self.moving()
        for off in range(4):
            j = P + 1 - off
            y = self.y + (off - 1 + frac) * PITCH
            sym = self.strip[j % self.L]
            if y > self.rect.bottom or y + CELL < self.rect.top:
                continue
            orb = self.orb_at.get(j % self.L)
            if sym == "ORB" and not blur:
                orb_drawer(surf, orb, (self.x + CELL // 2, int(y) + CELL // 2), art.empty, (self.x, int(y)))
            else:
                img = art.blur[sym] if blur else art.sym[sym]
                surf.blit(img, (self.x, int(y)))
        surf.set_clip(old)


class Background:
    THEMES = {
        "base": ((34, 12, 56), (6, 3, 14), (255, 130, 0)),
        "orb": ((6, 26, 62), (3, 4, 16), (90, 170, 255)),
        "free": ((84, 28, 0), (18, 4, 0), (255, 180, 50)),
    }

    def __init__(self, art):
        self.static = {}
        for name, (top, bot, acc) in self.THEMES.items():
            s = gfx.vgrad((W, H), top, bot).convert()
            t = pygame.transform.smoothscale(art.power_t_big, (620, 620))
            t.set_alpha(22)
            s.blit(t, (W // 2 - 310, 70))
            # stadium checker band on the floor
            floor = pygame.Surface((W, 120), pygame.SRCALPHA)
            for i in range(-6, 24):
                for j in range(4):
                    if (i + j) % 2 == 0:
                        y0 = j * 30
                        sk = (3 - j) * 20 + 40
                        pts = [(i * 80 - sk + 0, y0 + 30), (i * 80 + 80 - sk, y0 + 30), (i * 80 + 80 - sk * 0.8, y0), (i * 80 - sk * 0.8, y0)]
                        pygame.draw.polygon(floor, (*acc, 14 + j * 5), pts)
            s.blit(floor, (0, H - 150))
            vig = pygame.Surface((W, H), pygame.SRCALPHA)
            for k in range(8):
                pygame.draw.rect(vig, (0, 0, 0, 14), (k * 18, k * 14, W - k * 36, H - k * 28), width=18, border_radius=60)
            s.blit(vig, (0, 0))
            self.static[name] = s
        self.beams = {name: self._make_beams(self.THEMES[name][2]) for name in self.THEMES}
        self.embers = gfx.Embers(W, H)
        self.flashes = []

    @staticmethod
    def _make_beams(acc, h=560, half_top=10, spread=0.17):
        import numpy as np
        w = int(half_top * 2 + spread * h * 2) + 4
        ys = np.arange(h)[:, None]
        xs = np.arange(w)[None, :] - w / 2
        hw = half_top + spread * ys
        edge = np.clip(1 - np.abs(xs) / hw, 0, 1) ** 0.8
        inten = edge * (1 - ys / h) ** 1.6 * 0.30
        arr = np.zeros((w, h, 3), dtype=np.uint8)
        for c in range(3):
            arr[:, :, c] = (inten.T * acc[c]).clip(0, 255).astype(np.uint8)
        base = pygame.surfarray.make_surface(arr)
        out = []
        for a in range(-30, 31, 5):
            rot = pygame.transform.rotate(base, a)
            th = math.radians(a)
            cx, cy = rot.get_width() / 2, rot.get_height() / 2
            # apex sits at (0, -h/2) from the unrotated centre; find where it ends up
            ax = -(h / 2) * math.sin(th)
            ay = -(h / 2) * math.cos(th)
            out.append((rot, cx + ax, cy + ay))
        return out

    def draw(self, surf, t, theme, prev, mix, intensity=1.0, dt=0.016):
        if prev != theme and mix < 1.0:
            surf.blit(self.static[prev], (0, 0))
            s = self.static[theme]
            s.set_alpha(int(255 * mix))
            surf.blit(s, (0, 0))
            s.set_alpha(255)
        else:
            surf.blit(self.static[theme], (0, 0))
        acc = self.THEMES[theme][2]
        sprites = self.beams[theme]
        for i in range(5):
            x = 150 + i * 245 + math.sin(t * 0.5 + i * 1.7) * 70
            ang = math.sin(t * 0.37 + i * 2.1) * 26
            idx = int(round((ang + 30) / 5))
            spr, ox, oy = sprites[max(0, min(len(sprites) - 1, idx))]
            k = (0.55 + 0.25 * math.sin(t * 1.3 + i)) * intensity
            surf.blit(spr, (x - ox, -oy), special_flags=pygame.BLEND_RGB_ADD)
            gfx.add_glow(surf, (int(x), 8), 60, tuple(int(c * 0.8 * min(1.0, k)) for c in acc), 0.9)
        self.embers.update(dt, 0.6 + intensity)
        self.embers.draw(surf, acc)
        if random.random() < 0.08 * intensity:
            self.flashes.append([random.choice([random.randint(10, 230), random.randint(1050, 1270)]), random.randint(300, 640), 0.18])
        for f in self.flashes:
            f[2] -= dt
            a = max(0, f[2] / 0.18)
            gfx.add_glow(surf, (f[0], f[1]), 16, (int(255 * a), int(255 * a), int(230 * a)), 1.0)
        self.flashes = [f for f in self.flashes if f[2] > 0]


class Banner:
    def __init__(self, title, sub="", color=ORANGE, life=2.4, size=84, y=300):
        self.title, self.sub, self.color = title, sub, color
        self.life = self.max = life
        self.size, self.y = size, y

    def update(self, dt):
        self.life -= dt

    def draw(self, surf, t_global):
        age = self.max - self.life
        a_in = min(1.0, age / 0.25)
        a_out = min(1.0, self.life / 0.4)
        a = max(0.0, min(a_in, a_out))
        sc = ease_out_back(min(1.0, age / 0.35), 1.7) * (1.0 + 0.015 * math.sin(t_global * 9))
        bar = pygame.Surface((W, int(self.size * 1.9)), pygame.SRCALPHA)
        bar.fill((0, 0, 0, int(165 * a)))
        surf.blit(bar, (0, self.y - bar.get_height() // 2))
        gfx.add_glow(surf, (W // 2, self.y), int(self.size * 5 * a), tuple(int(c * 0.35) for c in self.color), 1.0)
        draw_text(surf, self.title, self.size, (W // 2, self.y - (14 if self.sub else 0)), self.color, ow=5,
                  alpha=int(255 * a), scale=max(0.01, sc), outline=(40, 10, 0))
        if self.sub:
            draw_text(surf, self.sub, int(self.size * 0.42), (W // 2, self.y + self.size * 0.6), WHITE, ow=3, alpha=int(255 * a))


class SmokeyActor:
    """Smokey sliding in to howl, fetch and boost orbs."""

    def __init__(self, art):
        self.art = art
        self.active = False
        self.t = 0.0
        self.x = -300.0
        self.target_x = 118.0
        self.y = 420.0
        self.howling = 0.0
        self.rings = []
        self.speech = ""

    def enter(self):
        self.active = True
        self.t = 0.0

    def leave(self):
        self.leaving = True

    mouth = property(lambda self: (self.x + 10, self.y - 70))

    def update(self, dt, want_present):
        self.t += dt
        goal = self.target_x if want_present else -320
        self.x += (goal - self.x) * min(1.0, dt * 7)
        self.howling = max(0.0, self.howling - dt)
        for r in self.rings:
            r[2] += dt
        self.rings = [r for r in self.rings if r[2] < 1.0]
        if not want_present and self.x < -280:
            self.active = False

    def howl(self, secs=1.8):
        self.howling = secs

    def ring(self):
        self.rings.append([self.x + 60, self.y - 80, 0.0])

    def draw(self, surf, idle=False):
        if not self.active and not idle:
            return
        art = self.art
        x = self.x if not idle else 118
        bob = math.sin(self.t * 2.2) * 4
        howl = self.howling > 0
        img = art.smokey[(260, howl)]
        ang = 0
        if howl:
            ang = 14 + math.sin(self.t * 14) * 2
        spr = pygame.transform.rotozoom(img, ang, 1.0 + (0.06 if howl else 0.0))
        r = spr.get_rect(center=(int(x), int(self.y + bob)))
        gfx.add_glow(surf, r.center, 190, (60, 40, 10), 0.8)
        surf.blit(spr, r)
        for rx, ry, age in self.rings:
            rad = int(30 + age * 260)
            col = tuple(int(c * (1 - age)) for c in (255, 160, 40))
            pygame.draw.circle(surf, col, (int(rx + age * 60), int(ry - age * 50)), rad, width=4)
