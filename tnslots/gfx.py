"""Procedural art + effects. Every symbol is drawn in code (supersampled), so the game ships with
no image files. Drop PNGs in <data dir>/assets/symbols/<NAME>.png to override any symbol."""
import math
import os
import random

import pygame

from . import paths

ORANGE = (255, 130, 0)
ORANGE_HI = (255, 176, 60)
ORANGE_DK = (190, 85, 0)
WHITE = (255, 255, 255)
SMOKE = (88, 89, 91)
GOLD = (255, 205, 60)
BG_DARK = (12, 8, 22)
SS = 3  # supersample factor

_font_cache = {}
_text_cache = {}
_glow_cache = {}
FONT_CHAIN = "impact,arialblack,franklingothicheavy,dejavusansbold,liberationsansbold,arial"


def font(size, face=None):
    key = (size, face)
    f = _font_cache.get(key)
    if f is None:
        try:
            path = pygame.font.match_font(face or FONT_CHAIN, bold=True)
            f = pygame.font.Font(path, size) if path else pygame.font.Font(None, int(size * 1.15))
        except Exception:
            f = pygame.font.Font(None, int(size * 1.15))
        _font_cache[key] = f
    return f


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def text_surf(s, size, color=WHITE, outline=(0, 0, 0), ow=2, face=None):
    key = (s, size, color, outline, ow, face)
    surf = _text_cache.get(key)
    if surf is None:
        if len(_text_cache) > 900:
            _text_cache.clear()
        f = font(size, face)
        base = f.render(s, True, color)
        if outline and ow:
            w, h = base.get_size()
            surf = pygame.Surface((w + ow * 2, h + ow * 2), pygame.SRCALPHA)
            o = f.render(s, True, outline)
            for dx in range(-ow, ow + 1):
                for dy in range(-ow, ow + 1):
                    if dx * dx + dy * dy <= ow * ow + 1:
                        surf.blit(o, (ow + dx, ow + dy))
            surf.blit(base, (ow, ow))
        else:
            surf = base
        _text_cache[key] = surf
    return surf


def draw_text(dst, s, size, pos, color=WHITE, anchor="center", outline=(0, 0, 0), ow=2, alpha=255, face=None, scale=1.0):
    surf = text_surf(s, size, color, outline, ow, face)
    if scale != 1.0:
        surf = pygame.transform.smoothscale(surf, (max(1, int(surf.get_width() * scale)), max(1, int(surf.get_height() * scale))))
    if alpha < 255:
        surf = surf.copy()
        surf.set_alpha(alpha)
    r = surf.get_rect()
    setattr(r, anchor, pos)
    dst.blit(surf, r)
    return r


def glow(radius, color, strength=1.0):
    key = (radius, color, round(strength, 2))
    g = _glow_cache.get(key)
    if g is None:
        g = pygame.Surface((radius * 2, radius * 2))
        for i in range(radius, 0, -2):
            t = (i / radius)
            k = (1 - t) ** 2 * strength
            c = tuple(min(255, int(ch * k)) for ch in color)
            pygame.draw.circle(g, c, (radius, radius), i)
        _glow_cache[key] = g
    return g


def add_glow(dst, pos, radius, color, strength=1.0):
    g = glow(int(radius), color, strength)
    dst.blit(g, (pos[0] - g.get_width() // 2, pos[1] - g.get_height() // 2), special_flags=pygame.BLEND_RGB_ADD)


def vgrad(size, top, bottom):
    w, h = size
    s = pygame.Surface(size, pygame.SRCALPHA)
    for y in range(h):
        pygame.draw.line(s, lerp(top, bottom, y / max(1, h - 1)), (0, y), (w, y))
    return s


def rounded_mask(surf, radius):
    mask = pygame.Surface(surf.get_size(), pygame.SRCALPHA)
    pygame.draw.rect(mask, (255, 255, 255, 255), mask.get_rect(), border_radius=radius)
    surf.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MIN)
    return surf


def tile(size, top, bottom, border=ORANGE, radius=0.12, bw=0.03):
    s = vgrad((size, size), top, bottom)
    rounded_mask(s, int(size * radius))
    pygame.draw.rect(s, border, s.get_rect(), width=max(2, int(size * bw)), border_radius=int(size * radius))
    # glossy top highlight
    hl = pygame.Surface((size, size // 2), pygame.SRCALPHA)
    pygame.draw.ellipse(hl, (255, 255, 255, 38), (-size // 4, -size // 2, size * 1.5, size))
    s.blit(hl, (0, 0))
    return s


def poly(s, color, pts, w=450):
    pygame.draw.polygon(s, color, [(x * w, y * w) for x, y in pts])


def polyline(s, color, pts, width, w=450, closed=False):
    pygame.draw.lines(s, color, closed, [(x * w, y * w) for x, y in pts], width)


# ---------------------------------------------------------------- symbol drawing
def _letter(ch, color, S):
    s = tile(S, (48, 32, 70), (20, 12, 36), border=lerp(color, (0, 0, 0), 0.3))
    f = font(int(S * 0.82))
    for off, col in ((int(S * 0.025), (0, 0, 0)), (0, color)):
        t = f.render(ch, True, col)
        s.blit(t, t.get_rect(center=(S // 2 + off // 2, S // 2 + off)))
    # white inner shine
    t = f.render(ch, True, lerp(color, WHITE, 0.55))
    t = t.subsurface((0, 0, t.get_width(), int(t.get_height() * 0.42))).copy()
    s.blit(t, t.get_rect(midtop=(S // 2, S // 2 - f.get_height() // 2 + int(S * 0.0))), special_flags=pygame.BLEND_RGBA_MIN) if False else None
    return s


def _checker(S):
    s = tile(S, (60, 30, 8), (30, 14, 4), border=ORANGE_HI)
    n = 5
    m = int(S * 0.14)
    cs = (S - 2 * m) // n
    ox = (S - cs * n) // 2
    for i in range(n):
        for j in range(n):
            col = ORANGE if (i + j) % 2 == 0 else WHITE
            pygame.draw.rect(s, col, (ox + i * cs, ox + j * cs, cs, cs))
    pygame.draw.rect(s, (30, 14, 4), (ox, ox, cs * n, cs * n), width=max(2, S // 60))
    sh = pygame.Surface((S, S), pygame.SRCALPHA)
    pygame.draw.polygon(sh, (255, 255, 255, 45), [(ox, ox), (ox + cs * n, ox), (ox, ox + cs * n)])
    s.blit(sh, (0, 0))
    return s


def _football(S):
    s = tile(S, (40, 36, 70), (18, 12, 34), border=(150, 90, 40))
    w, h = int(S * 0.78), int(S * 0.46)
    b = pygame.Surface((w, h), pygame.SRCALPHA)
    pygame.draw.ellipse(b, (92, 48, 20), (0, 0, w, h))
    pygame.draw.ellipse(b, (140, 78, 36), (int(w * 0.03), int(h * 0.04), int(w * 0.94), int(h * 0.55)))
    pygame.draw.ellipse(b, (0, 0, 0, 255), (0, 0, w, h), width=max(2, S // 60))
    for fx in (0.17, 0.23, 0.77, 0.83):
        pygame.draw.line(b, WHITE, (w * fx, h * 0.14), (w * fx, h * 0.86), max(2, S // 55))
    pygame.draw.line(b, WHITE, (w * 0.3, h * 0.5), (w * 0.7, h * 0.5), max(3, S // 45))
    for k in range(5):
        x = w * (0.34 + k * 0.08)
        pygame.draw.line(b, WHITE, (x, h * 0.34), (x, h * 0.66), max(2, S // 55))
    b = pygame.transform.rotate(b, 28)
    s.blit(b, b.get_rect(center=(S // 2, S // 2)))
    return s


def _helmet(S):
    s = tile(S, (50, 34, 84), (22, 14, 40), border=ORANGE)
    P = lambda pts: [(x * S, y * S) for x, y in pts]
    shell = [(0.16, 0.56), (0.18, 0.36), (0.30, 0.22), (0.50, 0.15), (0.70, 0.21), (0.80, 0.35), (0.83, 0.5),
             (0.79, 0.6), (0.70, 0.64), (0.66, 0.78), (0.44, 0.80), (0.28, 0.72)]
    pygame.draw.polygon(s, (0, 0, 0), P([(x + 0.012, y + 0.015) for x, y in shell]))
    pygame.draw.polygon(s, ORANGE, P(shell))
    pygame.draw.polygon(s, ORANGE_HI, P([(0.22, 0.38), (0.30, 0.26), (0.5, 0.19), (0.62, 0.22), (0.44, 0.3), (0.3, 0.42)]))
    pygame.draw.polygon(s, WHITE, P([(0.44, 0.16), (0.52, 0.15), (0.56, 0.5), (0.48, 0.52)]))
    pygame.draw.polygon(s, ORANGE_DK, P([(0.62, 0.62), (0.7, 0.64), (0.66, 0.78), (0.58, 0.77)]))
    pygame.draw.circle(s, (30, 12, 0), (int(0.40 * S), int(0.55 * S)), int(0.05 * S))
    pygame.draw.lines(s, (225, 225, 235), False, P([(0.78, 0.5), (0.92, 0.52), (0.92, 0.7), (0.68, 0.74)]), max(3, S // 36))
    pygame.draw.line(s, (225, 225, 235), (0.92 * S, 0.585 * S), (0.76 * S, 0.585 * S), max(3, S // 40))
    pygame.draw.line(s, (225, 225, 235), (0.92 * S, 0.65 * S), (0.72 * S, 0.65 * S), max(3, S // 40))
    pygame.draw.polygon(s, (0, 0, 0), P(shell), width=max(2, S // 70))
    return s


def _trophy(S):
    s = tile(S, (56, 36, 90), (22, 12, 40), border=GOLD)
    P = lambda pts: [(x * S, y * S) for x, y in pts]
    for side in (-1, 1):
        cx = 0.5 + side * 0.25
        pygame.draw.ellipse(s, (210, 150, 20), (int((cx - 0.09) * S), int(0.22 * S), int(0.18 * S), int(0.26 * S)), width=max(4, S // 28))
    cup = [(0.28, 0.17), (0.72, 0.17), (0.68, 0.46), (0.58, 0.6), (0.42, 0.6), (0.32, 0.46)]
    pygame.draw.polygon(s, GOLD, P(cup))
    pygame.draw.polygon(s, (255, 240, 150), P([(0.31, 0.19), (0.42, 0.19), (0.40, 0.46), (0.36, 0.44)]))
    pygame.draw.polygon(s, (205, 140, 10), P([(0.62, 0.19), (0.71, 0.19), (0.67, 0.45), (0.58, 0.58), (0.56, 0.58)]))
    pygame.draw.rect(s, (215, 150, 15), (0.45 * S, 0.6 * S, 0.1 * S, 0.12 * S))
    pygame.draw.rect(s, (90, 40, 6), (0.30 * S, 0.72 * S, 0.40 * S, 0.1 * S), border_radius=S // 40)
    pygame.draw.rect(s, GOLD, (0.33 * S, 0.70 * S, 0.34 * S, 0.06 * S), border_radius=S // 50)
    t = font(int(S * 0.28)).render("T", True, ORANGE_DK)
    s.blit(t, t.get_rect(center=(S // 2, int(S * 0.34))))
    pygame.draw.polygon(s, (120, 70, 0), P(cup), width=max(2, S // 80))
    return s


def _smokey_head(S, mouth_open=False, bg=True):
    """Bluetick coonhound in an orange bandana, cartoon style."""
    s = tile(S, (36, 44, 84), (16, 14, 36), border=(130, 150, 190)) if bg else pygame.Surface((S, S), pygame.SRCALPHA)
    cx = S / 2
    blue, blue_dk = (96, 118, 148), (58, 74, 100)
    tan = (206, 160, 108)
    # ears
    for sd in (-1, 1):
        pts = [(cx + sd * 0.17 * S, 0.22 * S), (cx + sd * 0.36 * S, 0.24 * S), (cx + sd * 0.43 * S, 0.62 * S),
               (cx + sd * 0.36 * S, 0.78 * S), (cx + sd * 0.26 * S, 0.62 * S)]
        pygame.draw.polygon(s, (60, 36, 24), pts)
        pygame.draw.polygon(s, (90, 56, 36), [(cx + sd * 0.19 * S, 0.27 * S), (cx + sd * 0.33 * S, 0.29 * S), (cx + sd * 0.37 * S, 0.6 * S), (cx + sd * 0.29 * S, 0.62 * S)])
    # head
    pygame.draw.ellipse(s, blue_dk, (cx - 0.25 * S, 0.14 * S, 0.5 * S, 0.5 * S))
    pygame.draw.ellipse(s, blue, (cx - 0.24 * S, 0.14 * S, 0.48 * S, 0.46 * S))
    rnd = random.Random(7)
    for _ in range(60):  # ticking speckles
        a = rnd.uniform(0, 6.283)
        r = rnd.uniform(0, 0.2) * S
        px, py = cx + math.cos(a) * r, 0.37 * S + math.sin(a) * r * 0.9
        pygame.draw.circle(s, (40, 52, 76), (px, py), max(1, S // 90))
    # tan eyebrows spots + muzzle
    for sd in (-1, 1):
        pygame.draw.ellipse(s, tan, (cx + sd * 0.12 * S - 0.04 * S, 0.22 * S, 0.08 * S, 0.06 * S))
    pygame.draw.ellipse(s, tan, (cx - 0.19 * S, 0.40 * S, 0.38 * S, 0.30 * S))
    pygame.draw.ellipse(s, (232, 200, 158), (cx - 0.15 * S, 0.42 * S, 0.30 * S, 0.18 * S))
    # eyes
    for sd in (-1, 1):
        ex, ey = cx + sd * 0.115 * S, 0.34 * S
        pygame.draw.ellipse(s, WHITE, (ex - 0.045 * S, ey - 0.05 * S, 0.09 * S, 0.1 * S))
        pygame.draw.circle(s, (50, 24, 6), (ex, ey + 0.005 * S), int(0.032 * S))
        pygame.draw.circle(s, WHITE, (ex - 0.01 * S, ey - 0.012 * S), max(2, int(0.01 * S)))
    # nose + mouth
    pygame.draw.ellipse(s, (14, 14, 18), (cx - 0.07 * S, 0.43 * S, 0.14 * S, 0.09 * S))
    pygame.draw.circle(s, (120, 120, 140), (cx - 0.02 * S, 0.452 * S), max(2, int(0.012 * S)))
    if mouth_open:
        pygame.draw.ellipse(s, (60, 10, 20), (cx - 0.08 * S, 0.56 * S, 0.16 * S, 0.16 * S))
        pygame.draw.ellipse(s, (230, 90, 110), (cx - 0.05 * S, 0.65 * S, 0.10 * S, 0.06 * S))
    else:
        pygame.draw.line(s, (60, 36, 24), (cx, 0.52 * S), (cx, 0.58 * S), max(2, S // 70))
        pygame.draw.arc(s, (60, 36, 24), (cx - 0.1 * S, 0.5 * S, 0.1 * S, 0.12 * S), 3.4, 6.1, max(2, S // 70))
        pygame.draw.arc(s, (60, 36, 24), (cx, 0.5 * S, 0.1 * S, 0.12 * S), 3.3, 6.0, max(2, S // 70))
    # bandana
    band = [(cx - 0.3 * S, 0.7 * S), (cx + 0.3 * S, 0.7 * S), (cx, 0.96 * S)]
    pygame.draw.polygon(s, ORANGE, band)
    pygame.draw.polygon(s, ORANGE_DK, band, width=max(2, S // 80))
    pygame.draw.rect(s, (255, 220, 160), (cx - 0.07 * S, 0.73 * S, 0.14 * S, 0.04 * S))
    pygame.draw.rect(s, (255, 220, 160), (cx - 0.02 * S, 0.73 * S, 0.04 * S, 0.14 * S))
    return s


def _wild(S):
    s = tile(S, (120, 40, 0), (40, 8, 4), border=ORANGE_HI)
    base = pygame.Surface((S, S), pygame.SRCALPHA)
    P = lambda pts: [(x * S, y * S) for x, y in pts]
    bolt = [(0.58, 0.08), (0.28, 0.5), (0.46, 0.5), (0.38, 0.84), (0.74, 0.4), (0.54, 0.4), (0.68, 0.08)]
    pygame.draw.polygon(base, (255, 255, 255, 60), P([(x * 1.0, y + 0.0) for x, y in bolt]), width=0)
    pygame.draw.polygon(s, (255, 120, 0), P([(x + 0.02, y + 0.02) for x, y in bolt]))
    pygame.draw.polygon(s, (255, 240, 120), P(bolt))
    pygame.draw.polygon(s, WHITE, P([(0.58, 0.1), (0.36, 0.44), (0.5, 0.44), (0.56, 0.2)]))
    pygame.draw.polygon(s, ORANGE_DK, P(bolt), width=max(2, S // 80))
    f = font(int(S * 0.24))
    t = f.render("WILD", True, (0, 0, 0))
    s.blit(t, t.get_rect(center=(S // 2 + S // 80, int(S * 0.86) + S // 80)))
    t = f.render("WILD", True, WHITE)
    s.blit(t, t.get_rect(center=(S // 2, int(S * 0.86))))
    return s


def power_t_shape(S, color, inset=0.0):
    """The big blocky Tennessee 'Power T' (stylised)."""
    surf = pygame.Surface((S, S), pygame.SRCALPHA)
    P = lambda pts: [(x * S, y * S) for x, y in pts]
    pts = [(0.10, 0.20), (0.90, 0.20), (0.90, 0.40), (0.60, 0.40), (0.60, 0.84), (0.40, 0.84), (0.40, 0.40), (0.10, 0.40)]
    pygame.draw.polygon(surf, color, P(pts))
    return surf


def _powert(S):
    s = tile(S, (255, 255, 255), (222, 214, 206), border=ORANGE, bw=0.04)
    sh = power_t_shape(S, (120, 60, 10))
    s.blit(sh, (S * 0.012, S * 0.02))
    t = power_t_shape(S, ORANGE)
    s.blit(t, (0, 0))
    hi = pygame.Surface((S, S), pygame.SRCALPHA)
    pygame.draw.polygon(hi, (255, 200, 120, 160), [(0.12 * S, 0.22 * S), (0.88 * S, 0.22 * S), (0.88 * S, 0.27 * S), (0.12 * S, 0.27 * S)])
    s.blit(hi, (0, 0))
    pygame.draw.polygon(s, (130, 60, 0), [(x * S, y * S) for x, y in [(0.10, 0.20), (0.90, 0.20), (0.90, 0.40), (0.60, 0.40), (0.60, 0.84), (0.40, 0.84), (0.40, 0.40), (0.10, 0.40)]], width=max(2, S // 70))
    f = font(int(S * 0.13))
    lab = f.render("POWER", True, (110, 55, 0))
    s.blit(lab, lab.get_rect(center=(S // 2, int(S * 0.93))))
    return s


ORB_COLORS = {
    "cash": ((255, 190, 60), (255, 110, 0), (140, 50, 0)),
    "mini": ((140, 255, 150), (40, 190, 70), (10, 90, 30)),
    "minor": ((140, 200, 255), (40, 120, 255), (10, 40, 140)),
    "major": ((225, 160, 255), (160, 60, 240), (70, 10, 120)),
    "grand": ((255, 160, 140), (240, 30, 40), (110, 0, 10)),
}


def _orb(S, kind):
    hi, mid, lo = ORB_COLORS[kind]
    s = pygame.Surface((S, S), pygame.SRCALPHA)
    r = int(S * 0.40)
    c = (S // 2, S // 2)
    for i in range(r, 0, -1):
        t = 1 - i / r
        col = lerp(lo, mid, min(1.0, t * 1.6)) if t < 0.62 else lerp(mid, hi, (t - 0.62) / 0.38)
        pygame.draw.circle(s, col, (c[0] - int((1 - i / r) * r * 0.22), c[1] - int((1 - i / r) * r * 0.22)), i)
    pygame.draw.circle(s, lerp(lo, (0, 0, 0), 0.4), c, r, width=max(2, S // 40))
    pygame.draw.circle(s, hi, c, r - max(3, S // 40), width=max(1, S // 90))
    hl = pygame.Surface((S, S), pygame.SRCALPHA)
    pygame.draw.ellipse(hl, (255, 255, 255, 140), (c[0] - r * 0.62, c[1] - r * 0.86, r * 0.9, r * 0.5))
    s.blit(hl, (0, 0))
    return s


def downscale(surf, size):
    return pygame.transform.smoothscale(surf, (size, size))


class Art:
    """Pre-rendered sprites, built once at start-up."""

    def __init__(self, cell):
        self.cell = cell
        C = cell
        S = C * SS
        self.sym = {}
        builders = {
            "J": lambda: _letter("J", ORANGE, S), "Q": lambda: _letter("Q", WHITE, S),
            "K": lambda: _letter("K", ORANGE_HI, S), "A": lambda: _letter("A", (235, 235, 245), S),
            "CHECKER": lambda: _checker(S), "FOOTBALL": lambda: _football(S), "HELMET": lambda: _helmet(S),
            "TROPHY": lambda: _trophy(S), "SMOKEY": lambda: _smokey_head(S), "WILD": lambda: _wild(S),
            "POWERT": lambda: _powert(S),
        }
        for name, fn in builders.items():
            self.sym[name] = self._load_override(name, C) or downscale(fn(), C)
        self.orb = {k: self._load_override("ORB_" + k.upper(), C) or downscale(_orb(S, k), C) for k in ORB_COLORS}
        self.sym["ORB"] = self.orb["cash"]
        self.blur = {n: self._blur(s) for n, s in self.sym.items()}
        self.empty = self._empty_slot(C)
        self.smokey = {}
        for size in (260, 120):
            self.smokey[(size, False)] = downscale(_smokey_head(size * 2, False, bg=False), size)
            self.smokey[(size, True)] = downscale(_smokey_head(size * 2, True, bg=False), size)
        self.power_t_big = downscale(power_t_shape(512, ORANGE), 256)
        self.power_t_outline = downscale(self._t_outline(512), 256)

    @staticmethod
    def _t_outline(S):
        s = pygame.Surface((S, S), pygame.SRCALPHA)
        pts = [(0.10, 0.20), (0.90, 0.20), (0.90, 0.40), (0.60, 0.40), (0.60, 0.84), (0.40, 0.84), (0.40, 0.40), (0.10, 0.40)]
        pygame.draw.polygon(s, (255, 255, 255), [(x * S, y * S) for x, y in pts])
        pygame.draw.polygon(s, ORANGE, [(x * S, y * S) for x, y in pts], width=S // 24)
        return s

    @staticmethod
    def _load_override(name, C):
        path = os.path.join(paths.asset_dir(), "symbols", name + ".png")
        if os.path.exists(path):
            try:
                img = pygame.image.load(path).convert_alpha()
                return pygame.transform.smoothscale(img, (C, C))
            except pygame.error:
                return None
        return None

    @staticmethod
    def _blur(img):
        w, h = img.get_size()
        out = pygame.Surface((w, h), pygame.SRCALPHA)
        n = 7
        for i in range(n):
            tmp = img.copy()
            tmp.set_alpha(int(255 / n * 1.6))
            out.blit(tmp, (0, int((i - n // 2) * h * 0.045)))
        return out

    def _empty_slot(self, C):
        s = pygame.Surface((C, C), pygame.SRCALPHA)
        pygame.draw.rect(s, (14, 10, 26, 235), s.get_rect(), border_radius=int(C * 0.12))
        pygame.draw.rect(s, (90, 56, 20, 255), s.get_rect(), width=2, border_radius=int(C * 0.12))
        pygame.draw.rect(s, (30, 22, 50, 255), s.get_rect().inflate(-C * 0.2, -C * 0.2), width=1, border_radius=int(C * 0.08))
        return s


# ---------------------------------------------------------------- effects
class Particles:
    def __init__(self):
        self.items = []  # [x, y, vx, vy, life, max_life, size, color, gravity, kind]

    def burst(self, x, y, n=30, color=ORANGE, speed=300, life=1.0, size=5, gravity=500, spread=6.283, angle=0.0, kind="spark"):
        for _ in range(n):
            a = angle + random.uniform(-spread / 2, spread / 2)
            v = random.uniform(0.25, 1.0) * speed
            self.items.append([x, y, math.cos(a) * v, math.sin(a) * v, life * random.uniform(0.6, 1.1), life,
                               size * random.uniform(0.6, 1.3), color, gravity, kind])

    def coins(self, x, y, n=40, width=400):
        for _ in range(n):
            self.items.append([x + random.uniform(-width / 2, width / 2), y, random.uniform(-160, 160), random.uniform(-700, -250),
                               random.uniform(1.4, 2.4), 2.0, random.uniform(7, 12), GOLD, 1100, "coin"])

    def update(self, dt):
        for p in self.items:
            p[4] -= dt
            p[3] += p[8] * dt
            p[0] += p[2] * dt
            p[1] += p[3] * dt
        self.items = [p for p in self.items if p[4] > 0]
        if len(self.items) > 900:
            self.items = self.items[-900:]

    def draw(self, surf):
        for x, y, vx, vy, life, mx, size, color, g, kind in self.items:
            t = max(0.0, life / mx)
            if kind == "coin":
                w = max(2, int(size * abs(math.cos(life * 9))))
                pygame.draw.ellipse(surf, GOLD, (x - w / 2, y - size / 2, w, size))
                pygame.draw.ellipse(surf, (255, 245, 170), (x - w / 2, y - size / 2, w, size), 1)
            else:
                r = max(1, int(size * (0.4 + 0.6 * t)))
                col = tuple(int(c * min(1.0, t * 1.6)) for c in color)
                pygame.draw.circle(surf, col, (int(x), int(y)), r)
                if r > 2:
                    surf.blit(glow(r * 3, tuple(int(c * 0.5 * t) for c in color)), (x - r * 3, y - r * 3), special_flags=pygame.BLEND_RGB_ADD)


class Bolt:
    def __init__(self, p1, p2, life=0.35, color=(255, 170, 40), width=5, jag=0.12):
        self.life = self.max = life
        self.color = color
        self.width = width
        self.pts = self._make(p1, p2, jag)

    @staticmethod
    def _make(p1, p2, jag):
        pts = [p1, p2]
        off = math.dist(p1, p2) * jag
        for _ in range(5):
            new = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                dx, dy = b[0] - a[0], b[1] - a[1]
                d = math.hypot(dx, dy) or 1
                n = random.uniform(-off, off)
                m = (m[0] - dy / d * n, m[1] + dx / d * n)
                new += [m, b]
            pts = new
            off *= 0.55
        return pts

    def update(self, dt):
        self.life -= dt

    def draw(self, surf):
        t = max(0.0, self.life / self.max)
        flick = 0.6 + 0.4 * random.random()
        k = t * flick
        for w, col in ((self.width * 3, tuple(int(c * 0.28 * k) for c in self.color)),
                       (self.width * 1.6, tuple(int(c * 0.6 * k) for c in self.color))):
            pygame.draw.lines(surf, col, False, self.pts, max(1, int(w)))
        pygame.draw.lines(surf, tuple(int(255 * k) for _ in range(3)), False, self.pts, max(1, int(self.width * 0.45)))


class Embers:
    def __init__(self, w, h, n=70):
        self.w, self.h = w, h
        self.p = [[random.uniform(0, w), random.uniform(0, h), random.uniform(10, 50), random.uniform(1, 3.2), random.uniform(0, 6.28)] for _ in range(n)]

    def update(self, dt, speed=1.0):
        for p in self.p:
            p[1] -= p[2] * dt * speed
            p[0] += math.sin(p[4] + p[1] * 0.01) * 12 * dt
            if p[1] < -10:
                p[0], p[1] = random.uniform(0, self.w), self.h + 10

    def draw(self, surf, color=(255, 140, 20)):
        for x, y, v, r, ph in self.p:
            a = 0.35 + 0.35 * math.sin(ph + y * 0.02)
            c = tuple(int(ch * a) for ch in color)
            pygame.draw.circle(surf, c, (int(x), int(y)), int(r))
