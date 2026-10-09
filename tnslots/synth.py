"""Procedural sound design (numpy only - no audio files needed)."""
import numpy as np

SR = 44100
_rng = np.random.default_rng(1895)  # the year of the first Vols football season


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def noise(dur):
    return _rng.standard_normal(int(dur * SR))


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def fft_filter(x, lo=None, hi=None):
    """Brick-wall band filter. Circular, so loops stay seamless."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    mask = np.ones_like(f)
    if lo:
        mask *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi:
        mask *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * mask, len(x))


def padto(x, n):
    return np.pad(x, (0, n - len(x))) if len(x) < n else x[:n]


def decay(t, k):
    return np.exp(-t * k)


def adsr(n, a=0.01, r=0.1):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    na, nr = min(na, n // 2), min(nr, n // 2)
    e[:na] = np.linspace(0, 1, na)
    e[n - nr:] = np.minimum(e[n - nr:], np.linspace(1, 0, nr))
    return e


def bell(f, dur, ratio=3.5, index=3.0, k=4.0):
    t = tt(dur)
    mod = np.sin(2 * np.pi * f * ratio * t) * index * decay(t, k * 1.5)
    return np.sin(2 * np.pi * f * t + mod) * decay(t, k)


def rich_tone(f, dur, harmonics=8, detune=0.0, rolloff=1.0, vib=0.0, vib_rate=5.2):
    t = tt(dur)
    out = np.zeros_like(t)
    vibr = 1 + vib * np.sin(2 * np.pi * vib_rate * t) if vib else 1.0
    for h in range(1, harmonics + 1):
        for d in ((-detune, detune) if detune else (0,)):
            ph = 2 * np.pi * np.cumsum(f * h * (1 + d) * vibr / SR) if vib else 2 * np.pi * f * h * (1 + d) * t
            out += np.sin(ph) / h ** rolloff
    return out


def reverb(x, seconds=2.2, wet=0.35, damp=3.5, stereo=True):
    n = len(x)
    ir_n = min(n - 1, int(seconds * SR))
    t = np.arange(ir_n) / SR

    def ir():
        r = _rng.standard_normal(ir_n) * np.exp(-t * (6.9 / seconds))
        return fft_filter(r, hi=9000 / (1 + damp * 0.15))

    out = []
    X = np.fft.rfft(x)
    chans = 2 if stereo else 1
    for _ in range(chans):
        h = np.zeros(n)
        h[:ir_n] = ir()
        h /= np.sqrt(np.sum(h ** 2)) + 1e-9
        out.append(np.fft.irfft(X * np.fft.rfft(h), n))
    wetv = np.stack(out, axis=1) if stereo else np.array(out[0])[:, None]
    dry = x[:, None] if stereo else x[:, None]
    return dry * (1 - wet) + wetv * wet * 2.0


def to_stereo(x):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return x


def pan(x, p):
    p = (p + 1) / 2
    return np.stack([x * np.cos(p * np.pi / 2), x * np.sin(p * np.pi / 2)], axis=1)


def to_int16(x, peak=0.92):
    x = to_stereo(x)
    m = np.max(np.abs(x)) or 1.0
    if m > peak:
        x = x / m * peak
    return (x * 32767).astype(np.int16)


def place(buf, snd, at):
    """Add a (possibly stereo) sound into a buffer at time `at`, wrapping the tail (loop-safe)."""
    snd = to_stereo(snd)
    i = int(at * SR) % len(buf)
    n = len(snd)
    end = i + n
    if end <= len(buf):
        buf[i:end] += snd
    else:
        k = len(buf) - i
        buf[i:] += snd[:k]
        rest = snd[k:]
        while len(rest):
            m = min(len(rest), len(buf))
            buf[:m] += rest[:m]
            rest = rest[m:]


# ------------------------------------------------------------------ one-shots
def reel_stop(i):
    t = tt(0.3)
    f = 150 - 70 * (1 - np.exp(-t * 30))
    thump = np.sin(2 * np.pi * np.cumsum(f * (1 + i * 0.05)) / SR) * decay(t, 22)
    clack = fft_filter(noise(0.3), lo=1800, hi=7000) * decay(t, 90)
    click = fft_filter(noise(0.3), lo=4000) * decay(t, 400)
    ping = np.sin(2 * np.pi * (700 + i * 90) * t) * decay(t, 28) * 0.25
    return to_int16(norm(thump * 1.0 + clack * 0.55 + click * 0.35 + ping))


def reel_spin_loop():
    n = SR  # exactly 1s so the loop is seamless
    wind = fft_filter(_rng.standard_normal(n), lo=300, hi=1800)
    wind = norm(wind) * 0.35
    t = np.arange(n) / SR
    ticks = np.zeros(n)
    for k in range(14):
        s = int(k / 14 * n)
        m = min(900, n - s)
        ticks[s:s + m] += np.sin(2 * np.pi * 1200 * t[:m]) * decay(t[:m], 160) * 0.5
    hum = np.sin(2 * np.pi * 110 * t) * 0.18 + np.sin(2 * np.pi * 220 * t) * 0.08
    return to_int16(norm(wind + ticks + hum, 0.55))


def orb_land(step):
    scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33]
    f = 392 * 2 ** (scale[min(step, len(scale) - 1)] / 12)
    t = tt(1.1)
    b = bell(f, 1.1, 3.5, 2.5, 3.2) + 0.5 * padto(bell(f * 2, 0.8, 2.0, 1.2, 5), len(t))
    thump = np.sin(2 * np.pi * 80 * t) * decay(t, 18) * 0.9
    sparkle = np.zeros_like(t)
    for _ in range(7):
        s = _rng.uniform(0, 0.3)
        tf = _rng.uniform(3000, 7000)
        i0 = int(s * SR)
        tn = t[: len(t) - i0]
        sparkle[i0:] += np.sin(2 * np.pi * tf * tn) * decay(tn, 30) * 0.12
    return to_int16(norm(b * 0.8 + thump * 0.6 + sparkle, 0.85))


def power_t_land(step):
    t = tt(1.9)
    boom = np.tanh(2.5 * np.sin(2 * np.pi * np.cumsum(70 - 30 * (1 - decay(t, 5))) / SR)) * decay(t, 3)
    chord = np.zeros_like(t)
    root = 146.83 * 2 ** (step * 2 / 12 / 2)
    for r in (1.0, 1.2, 1.5, 2.0):
        chord += rich_tone(root * r, 1.9, 6, detune=0.004, rolloff=1.3, vib=0.004)[: len(t)]
    chord *= adsr(len(t), 0.25, 1.0) * 0.12
    zap = fft_filter(noise(1.9), lo=1500) * decay(t, 25) * 0.4
    return to_int16(reverb(norm(boom * 0.8 + chord + zap), 1.4, 0.3, stereo=False)[:, 0])


def coin(pitch=0):
    t = tt(0.22)
    f = 1568 * 2 ** (pitch / 12)
    x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t)) * decay(t, 22)
    x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return to_int16(x * 0.4)


def click(pitch=0):
    t = tt(0.08)
    x = np.sin(2 * np.pi * (900 * 2 ** (pitch / 12)) * t) * decay(t, 60) + fft_filter(noise(0.08), lo=3000) * decay(t, 200) * 0.3
    return to_int16(x * 0.5)


def spin_button():
    t = tt(0.35)
    x = fft_filter(noise(0.35), lo=500, hi=4000) * np.linspace(0.2, 1, len(t)) * decay(t, 6)
    thud = np.sin(2 * np.pi * 70 * t) * decay(t, 20)
    return to_int16(norm(x * 0.6 + thud, 0.7))


def _brass(f, dur, vol=1.0):
    x = rich_tone(f, dur, 10, detune=0.003, rolloff=1.1)
    env = adsr(len(x), 0.04, 0.18) * (0.7 + 0.3 * decay(tt(dur), 3))
    return x * env * vol


def fanfare(level):
    """level 0 small .. 3 jackpot"""
    notes = [[0, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16, 19], [0, 3, 7, 12, 15, 19, 24, 27]][level]
    base = 293.66 * (1.0 if level < 3 else 0.5)
    dur = [0.9, 1.6, 2.6, 4.2][level]
    out = np.zeros((int(dur * SR), 2))
    step = [0.11, 0.1, 0.1, 0.13][level]
    for i, n in enumerate(notes):
        tone = _brass(base * 2 ** (n / 12), dur - i * step, 0.5)
        place(out, pan(tone, (i % 3 - 1) * 0.4), i * step)
    if level >= 1:
        for k in range(int(dur / 0.09)):
            sn = fft_filter(noise(0.08), lo=900) * decay(tt(0.08), 40) * 0.25 * (0.4 + k / (dur / 0.09))
            place(out, sn, k * 0.09)
    if level >= 2:
        for k, off in enumerate([0, 0.2, 0.4]):
            place(out, bell(880 * 2 ** (k * 4 / 12), 1.5, 3.5, 2, 2.8) * 0.3, off)
        place(out, np.sin(2 * np.pi * 55 * tt(dur)) * decay(tt(dur), 1.6) * 0.8, 0)
    return to_int16(out * 0.8)


def bonus_trigger():
    dur = 3.6
    t = tt(dur)
    rise = fft_filter(noise(dur), lo=200, hi=9000) * (t / dur) ** 2.5
    sweep = np.sin(2 * np.pi * np.cumsum(60 + 900 * (t / dur) ** 2.2) / SR) * (t / dur) ** 1.5
    hit_t = tt(dur)
    mask = (hit_t > 2.4)
    boom = np.sin(2 * np.pi * 48 * (hit_t - 2.4).clip(0)) * decay((hit_t - 2.4).clip(0), 2.6) * mask
    crash = fft_filter(noise(dur), lo=3000) * decay((hit_t - 2.4).clip(0), 3.5) * mask
    chord = np.zeros_like(t)
    for r in (1.0, 1.1892, 1.4983, 2.0):
        c = rich_tone(146.83 * r, dur, 6, detune=0.005, rolloff=1.2)[: len(t)]
        chord += c
    chord *= (t / dur) ** 1.4 * 0.05
    x = norm(rise * 0.4 + sweep * 0.3 + boom * 1.2 + crash * 0.6 + chord)
    return to_int16(reverb(x, 2.2, 0.3, stereo=False)[:, 0])


def thunder():
    dur = 3.0
    t = tt(dur)
    rumble = fft_filter(noise(dur), hi=220)
    env = decay(t, 1.3) * (1 + 0.6 * np.sin(2 * np.pi * 3.3 * t))
    crack = fft_filter(noise(dur), lo=800, hi=9000) * decay(t, 28)
    return to_int16(norm(rumble * env * 2.2 + crack * 0.9, 0.9))


def zap():
    dur = 0.38
    t = tt(dur)
    f = 4200 * decay(t, 9) + 160
    saw = ((np.cumsum(f) / SR) % 1.0) * 2 - 1
    x = saw * decay(t, 11) + fft_filter(noise(dur), lo=2500) * decay(t, 35)
    return to_int16(norm(x, 0.7))


def howl():
    dur = 3.0
    t = tt(dur)
    f0 = np.interp(t, [0, 0.35, 1.0, 1.9, 3.0], [300, 410, 560, 520, 330])
    vib = 1 + 0.012 * np.sin(2 * np.pi * 5.4 * t) * np.clip(t / 1.2, 0, 1)
    ph = 2 * np.pi * np.cumsum(f0 * vib) / SR
    x = np.zeros_like(t)
    for h, a in enumerate([1.0, .65, .5, .3, .22, .14, .1, .06], start=1):
        x += np.sin(h * ph) * a
    x += 0.25 * fft_filter(noise(dur), lo=700, hi=3500) * np.clip(t / 0.4, 0, 1)
    x *= adsr(len(t), 0.18, 0.9) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.7 * t))
    x = np.tanh(x * 0.9)
    return to_int16(reverb(norm(x, 0.8), 2.6, 0.42, stereo=False)[:, 0])


def bark():
    out = np.zeros((int(0.9 * SR), 2))
    for k, at in enumerate((0.0, 0.26)):
        t = tt(0.22)
        f = np.interp(t, [0, 0.05, 0.22], [210, 330, 150]) * (1 + 0.1 * k)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = sum(np.sin(h * ph) / h for h in range(1, 8))
        x += fft_filter(noise(0.22), lo=400, hi=2500) * 0.6
        x *= adsr(len(t), 0.005, 0.1) * decay(t, 7)
        place(out, pan(np.tanh(x * 1.2), -0.2 + 0.4 * k), at)
    return to_int16(out * 0.7)


def orb_boost():
    out = np.zeros((int(1.3 * SR), 2))
    for i, n in enumerate([0, 4, 7, 12, 16, 19, 24]):
        place(out, bell(523 * 2 ** (n / 12), 0.9, 3.0, 1.6, 4.5) * 0.35, i * 0.055)
    t = tt(1.3)
    out[:, 0] += fft_filter(noise(1.3), lo=4000) * decay(t, 4) * 0.08
    out[:, 1] = out[:, 0] * 0.9 + out[:, 1]
    return to_int16(out)


def collect():
    out = np.zeros((int(1.4 * SR), 2))
    for i in range(12):
        place(out, bell(659 * 2 ** (i * 2 / 12), 0.5, 2.5, 1.0, 7) * 0.3, i * 0.06)
    return to_int16(out)


def error_buzz():
    t = tt(0.25)
    return to_int16(np.sign(np.sin(2 * np.pi * 110 * t)) * 0.3 * adsr(len(t), 0.005, 0.08))


# ------------------------------------------------------------------- music
def _fold(buf, length):
    if len(buf) > length:
        tail = buf[length:]
        buf = buf[:length].copy()
        buf[: len(tail)] += tail
    return buf


def music_base():
    """Dark, slow, brooding: sub drone, tolling bell, heartbeat, wind, choir. ~33.6 s loop."""
    beat = 60 / 57
    bars_per_chord = 2
    chords = [(36.71, 'm'), (29.14, 'M'), (24.50, 'm'), (27.50, 'M')]  # D, Bb, G, A (low octave roots)
    chord_len = 4 * beat * bars_per_chord
    total = chord_len * len(chords)
    n = int(total * SR)
    buf = np.zeros((n + 12 * SR, 2))
    for ci, (root, q) in enumerate(chords):
        st = ci * chord_len
        third = 1.1892 if q == 'm' else 1.2599
        for octv, amp in ((4, 0.55), (8, 0.25), (16, 0.10)):
            for r, pn in ((1.0, -0.3), (third, 0.0), (1.4983, 0.3)):
                d = chord_len + 3.0
                tone = rich_tone(root * octv * r, d, 5, detune=0.003, rolloff=1.5, vib=0.002 if octv == 4 else 0.0, vib_rate=0.2 + 0.1 * ci)
                tone *= adsr(len(tone), 2.6, 2.8) * amp * 0.16
                place(buf, pan(tone, pn), st)
        # tolling bell on the downbeat
        place(buf, bell(root * 8, 6.0, 2.76, 2.2, 0.9) * 0.55, st)
        place(buf, bell(root * 16.02, 4.5, 2.76, 1.5, 1.1) * 0.22, st + beat * 4)
        # eerie high choir sighs
        if ci in (1, 2, 3):
            f = root * (32 if ci != 2 else 40)
            ch = rich_tone(f, 6.0, 4, detune=0.006, rolloff=1.6, vib=0.006, vib_rate=4.8) * adsr(int(6 * SR), 2.5, 2.5)
            place(buf, pan(ch * 0.08, (-0.5, 0.5)[ci % 2 == 0]), st + beat * 2)
        # sparse minor melody - a lonely music-box
        mel = [12, 15, 14, 10] if q == 'm' else [14, 12, 9, 7]
        for k, semi in enumerate(mel[:3]):
            place(buf, pan(bell(root * 16 * 2 ** (semi / 12), 2.4, 3.5, 1.4, 1.6) * 0.17, 0.35 * (k - 1)),
                  st + beat * (1.5 + k * 2.5))
    # sub drone, constant
    t = tt(total + 12)[: len(buf)]
    sub = (np.sin(2 * np.pi * 36.71 * t) + 0.4 * np.sin(2 * np.pi * 73.42 * t + 0.4 * np.sin(2 * np.pi * 0.11 * t))) * 0.22
    buf += sub[:, None]
    # heartbeat
    for b in range(int(total / beat)):
        for off, amp in ((0.0, 1.0), (0.32, 0.6)):
            tk = tt(0.35)
            th = np.sin(2 * np.pi * (52 + 16 * decay(tk, 25)) * tk) * decay(tk, 14) * amp * 0.5
            place(buf, th, b * beat + off)
    buf = _fold(buf, n)
    wind = fft_filter(_rng.standard_normal(n), lo=200, hi=900)
    wind *= 0.55 + 0.45 * np.sin(2 * np.pi * np.arange(n) / SR / total * 2 * np.pi * 1.0 + 1.0) ** 2
    buf += (norm(wind) * 0.05)[:, None]
    wet = reverb(buf.mean(axis=1), 3.5, 1.0, stereo=True)
    out = buf * 0.75 + wet * 0.45
    return to_int16(norm(out, 0.62))


def _taiko(f=70, d=0.5, amp=1.0):
    t = tt(d)
    x = np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * decay(t, 18))) / SR) * decay(t, 7)
    x += 0.35 * fft_filter(noise(d), lo=200, hi=1200) * decay(t, 35)
    return x * amp


def music_bonus(kind="orb"):
    """Driving, urgent. 'orb' = tense war-drum ostinato; 'free' = heroic-dark march."""
    bpm = 118 if kind == "orb" else 104
    beat = 60 / bpm
    bars = 8
    total = beat * 4 * bars
    n = int(total * SR)
    buf = np.zeros((n + 8 * SR, 2))
    root = 36.71 * (2 if kind == "orb" else 1)
    prog = [0, 0, -4, -4, -2, -2, 0, -2] if kind == "orb" else [0, -4, -2, -4, 0, -4, -7, -5]
    for bar in range(bars):
        st = bar * 4 * beat
        r = root * 2 ** (prog[bar] / 12)
        # drums
        place(buf, _taiko(62, 0.7, 0.9), st)
        place(buf, _taiko(62, 0.5, 0.6), st + beat * 2.5)
        place(buf, _taiko(90, 0.4, 0.55), st + beat)
        place(buf, _taiko(90, 0.4, 0.55), st + beat * 3)
        place(buf, _taiko(115, 0.3, 0.4), st + beat * 3.5)
        for k in range(8 if kind == "orb" else 4):
            hh = fft_filter(noise(0.06), lo=6000) * decay(tt(0.06), 90) * (0.18 if k % 2 else 0.1)
            place(buf, hh, st + k * beat * (0.5 if kind == "orb" else 1.0))
        if kind == "free":
            for k in range(4):
                sn = fft_filter(noise(0.14), lo=1500, hi=6000) * decay(tt(0.14), 28) * 0.28
                place(buf, sn, st + k * beat + (0.5 * beat if k % 2 else 0))
        # ostinato bass
        steps = [0, 0, 3, 0, 5, 0, 3, -2] if kind == "orb" else [0, 7, 0, 7, 3, 7, 0, 5]
        for k, semi in enumerate(steps):
            tn = rich_tone(r * 2 ** (semi / 12) * 2, beat * 0.5, 9, rolloff=1.0)
            tn *= decay(tt(beat * 0.5), 6) * adsr(len(tn), 0.005, 0.05) * 0.10
            place(buf, pan(tn, -0.1), st + k * beat * 0.5)
        # choir stab / brass
        if bar % 2 == 0:
            third = 1.1892
            for rr, pn in ((1.0, -0.4), (third, 0), (1.4983, 0.4), (2.0, 0.2)):
                f = r * 8 * rr
                ch = _brass(f, beat * 3.6, 0.07) if kind == "free" else \
                    rich_tone(f, beat * 3.6, 5, detune=0.005, rolloff=1.4, vib=0.005) * adsr(int(beat * 3.6 * SR), 0.3, 1.2) * 0.07
                place(buf, pan(ch, pn), st)
            place(buf, bell(r * 16, 3.0, 2.76, 2.0, 1.2) * 0.25, st)
        # rising tension arp
        if kind == "orb" and bar in (3, 7):
            for k in range(8):
                place(buf, bell(r * 8 * 2 ** ([0, 3, 7, 10, 12, 15, 19, 22][k] / 12), 0.6, 3.0, 1.4, 5) * 0.18, st + beat * 2 + k * beat * 0.25)
    t = tt(total + 8)[: len(buf)]
    buf += (np.sin(2 * np.pi * 36.71 * t) * 0.16)[:, None]
    buf = _fold(buf, n)
    wet = reverb(buf.mean(axis=1), 1.8, 1.0, stereo=True)
    out = buf * 0.8 + wet * 0.3
    return to_int16(norm(out, 0.66))
