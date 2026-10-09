/* Procedural sound design - port of tnslots/synth.py. Everything is generated in code. */
"use strict";
const SR = 32000;
const TAU = Math.PI * 2;
let _s = 1895;
function rand() { _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function gauss() { return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(TAU * rand()); }
const N = (dur) => Math.floor(dur * SR);
const zeros = (n) => new Float64Array(n);
function noise(dur) { const x = zeros(N(dur)); for (let i = 0; i < x.length; i++) x[i] = gauss(); return x; }
function maxAbs(x) { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; }
function norm(x, peak = 0.9) { const m = maxAbs(x) || 1; const k = peak / m; const o = zeros(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] * k; return o; }
function mix(n, ...parts) { const o = zeros(n); for (const [a, g] of parts) { const m = Math.min(n, a.length); for (let i = 0; i < m; i++) o[i] += a[i] * g; } return o; }

function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = TAU / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const pow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };
function fftFilter(x, lo, hi) {
  const n = x.length, M = pow2(n), re = zeros(M), im = zeros(M);
  re.set(x); fft(re, im, false);
  for (let k = 0; k <= M / 2; k++) {
    const f = k * SR / M;
    let m = 1;
    if (lo) m *= 1 / (1 + Math.pow(lo / Math.max(f, 1e-3), 4));
    if (hi) m *= 1 / (1 + Math.pow(f / hi, 4));
    re[k] *= m; im[k] *= m;
    if (k > 0 && k < M / 2) { re[M - k] *= m; im[M - k] *= m; }
  }
  fft(re, im, true);
  return re.slice(0, n);
}
/* Convolution reverb (mono in -> {l,r}). Tail is folded back on the start so loops stay seamless. */
function reverb(x, seconds = 2.2, wet = 0.35, stereo = true) {
  const n = x.length, irN = Math.min(n - 1, Math.floor(seconds * SR)), M = pow2(n + irN);
  const xr = zeros(M), xi = zeros(M); xr.set(x); fft(xr, xi, false);
  const chans = [];
  for (let c = 0; c < (stereo ? 2 : 1); c++) {
    const hr = zeros(M), hi = zeros(M);
    let lp = 0, e = 0;
    for (let i = 0; i < irN; i++) { lp += (gauss() * Math.exp(-i / SR * (6.9 / seconds)) - lp) * 0.55; hr[i] = lp; e += lp * lp; }
    const s = 1 / (Math.sqrt(e) + 1e-9);
    for (let i = 0; i < irN; i++) hr[i] *= s;
    fft(hr, hi, false);
    for (let k = 0; k < M; k++) { const a = xr[k] * hr[k] - xi[k] * hi[k], b = xr[k] * hi[k] + xi[k] * hr[k]; hr[k] = a; hi[k] = b; }
    fft(hr, hi, true);
    const out = zeros(n);
    for (let i = 0; i < n + irN && i < M; i++) out[i % n] += hr[i];
    chans.push(out);
  }
  const mk = (w) => { const o = zeros(n); for (let i = 0; i < n; i++) o[i] = x[i] * (1 - wet) + w[i] * wet * 2; return o; };
  const l = mk(chans[0]);
  return { l, r: stereo ? mk(chans[1]) : l };
}
const mono = (x) => ({ l: x, r: x });
function panned(x, p) { p = (p + 1) / 2; const a = Math.cos(p * Math.PI / 2), b = Math.sin(p * Math.PI / 2); const l = zeros(x.length), r = zeros(x.length); for (let i = 0; i < x.length; i++) { l[i] = x[i] * a; r[i] = x[i] * b; } return { l, r }; }
function place(buf, snd, at) {
  const L = buf.l.length, i0 = Math.floor(at * SR) % L, s = snd.l ? snd : mono(snd);
  for (let j = 0; j < s.l.length; j++) { const p = (i0 + j) % L; buf.l[p] += s.l[j]; buf.r[p] += s.r[j]; }
}
const newBuf = (dur) => ({ l: zeros(N(dur)), r: zeros(N(dur)) });
function finish(s, peak = 0.92) {
  if (!s.l) s = mono(s);
  const m = Math.max(maxAbs(s.l), maxAbs(s.r)) || 1, k = m > peak ? peak / m : 1;
  const l = new Float32Array(s.l.length), r = new Float32Array(s.r.length);
  for (let i = 0; i < l.length; i++) { l[i] = s.l[i] * k; r[i] = s.r[i] * k; }
  return { l, r };
}
function adsr(n, a = 0.01, r = 0.1) {
  const e = new Float64Array(n).fill(1), na = Math.min(Math.max(1, Math.floor(a * SR)), n >> 1), nr = Math.min(Math.max(1, Math.floor(r * SR)), n >> 1);
  for (let i = 0; i < na; i++) e[i] = i / na;
  for (let i = 0; i < nr; i++) e[n - nr + i] = Math.min(e[n - nr + i], 1 - i / nr);
  return e;
}
function bell(f, dur, ratio = 3.5, index = 3.0, k = 4.0) {
  const n = N(dur), o = zeros(n);
  for (let i = 0; i < n; i++) { const t = i / SR; const mod = Math.sin(TAU * f * ratio * t) * index * Math.exp(-t * k * 1.5); o[i] = Math.sin(TAU * f * t + mod) * Math.exp(-t * k); }
  return o;
}
function richTone(f, dur, harmonics = 8, detune = 0, rolloff = 1.0, vib = 0, vibRate = 5.2) {
  const n = N(dur), o = zeros(n), ds = detune ? [-detune, detune] : [0];
  for (let h = 1; h <= harmonics; h++) for (const d of ds) {
    const g = 1 / Math.pow(h, rolloff), fr = f * h * (1 + d);
    if (vib) { let ph = 0; for (let i = 0; i < n; i++) { ph += TAU * fr * (1 + vib * Math.sin(TAU * vibRate * i / SR)) / SR; o[i] += Math.sin(ph) * g; } }
    else { const w = TAU * fr / SR; for (let i = 0; i < n; i++) o[i] += Math.sin(w * i) * g; }
  }
  return o;
}
const mulArr = (a, b, g = 1) => { for (let i = 0; i < a.length; i++) a[i] *= b[i] * g; return a; };
const scaleArr = (a, g) => { for (let i = 0; i < a.length; i++) a[i] *= g; return a; };

/* ----------------------------------------------------------------- one-shots */
function reelStop(i) {
  const n = N(0.3), thump = zeros(n); let ph = 0;
  for (let k = 0; k < n; k++) { const t = k / SR, f = 150 - 70 * (1 - Math.exp(-t * 30)); ph += TAU * f * (1 + i * 0.05) / SR; thump[k] = Math.sin(ph) * Math.exp(-22 * t); }
  const clack = fftFilter(noise(0.3), 1800, 7000), click = fftFilter(noise(0.3), 4000, 0), x = zeros(n);
  for (let k = 0; k < n; k++) { const t = k / SR; clack[k] *= Math.exp(-90 * t); click[k] *= Math.exp(-400 * t); x[k] = thump[k] + clack[k] * 0.55 + click[k] * 0.35 + Math.sin(TAU * (700 + i * 90) * t) * Math.exp(-28 * t) * 0.25; }
  return finish(norm(x, 0.9));
}
function reelSpinLoop() {
  const n = 32768, wind = fftFilter((() => { const a = zeros(n); for (let i = 0; i < n; i++) a[i] = gauss(); return a; })(), 300, 1800);
  const w = norm(wind, 1); const x = zeros(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = w[i] * 0.35 + Math.sin(TAU * 110 * t) * 0.18 + Math.sin(TAU * 220 * t) * 0.08; }
  for (let k = 0; k < 14; k++) { const s = Math.floor(k / 14 * n); for (let j = 0; j < 640 && s + j < n; j++) x[s + j] += Math.sin(TAU * 1200 * j / SR) * Math.exp(-160 * j / SR) * 0.5; }
  return finish(norm(x, 0.55));
}
function orbLand(step) {
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33], f = 392 * Math.pow(2, scale[Math.min(step, 14)] / 12), n = N(1.1);
  const b1 = bell(f, 1.1, 3.5, 2.5, 3.2), b2 = bell(f * 2, 0.8, 2.0, 1.2, 5), x = zeros(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (b1[i] + 0.5 * (i < b2.length ? b2[i] : 0)) * 0.8 + Math.sin(TAU * 80 * t) * Math.exp(-18 * t) * 0.9 * 0.6; }
  for (let s = 0; s < 7; s++) { const i0 = Math.floor(rand() * 0.3 * SR), tf = 3000 + rand() * 4000; for (let i = i0; i < n; i++) { const t = (i - i0) / SR; x[i] += Math.sin(TAU * tf * t) * Math.exp(-30 * t) * 0.12; } }
  return finish(norm(x, 0.85));
}
function powerTLand(step) {
  const dur = 1.9, n = N(dur), boom = zeros(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * (70 - 30 * (1 - Math.exp(-5 * t))) / SR; boom[i] = Math.tanh(2.5 * Math.sin(ph)) * Math.exp(-3 * t); }
  const chord = zeros(n), root = 146.83 * Math.pow(2, step * 2 / 12 / 2);
  for (const r of [1.0, 1.2, 1.5, 2.0]) { const c = richTone(root * r, dur, 6, 0.004, 1.3, 0.004); for (let i = 0; i < n; i++) chord[i] += c[i]; }
  const env = adsr(n, 0.25, 1.0); scaleArr(mulArr(chord, env), 0.12);
  const zap = fftFilter(noise(dur), 1500, 0), x = zeros(n);
  for (let i = 0; i < n; i++) x[i] = boom[i] * 0.8 + chord[i] + zap[i] * Math.exp(-25 * i / SR) * 0.4;
  return finish(reverb(norm(x), 1.4, 0.3, false));
}
function coin(pitch = 0) {
  const n = N(0.22), x = zeros(n), f = 1568 * Math.pow(2, pitch / 12);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.5 * t)) * Math.exp(-22 * t) * 0.4 * Math.min(1, i / (0.004 * SR)); }
  return finish(x);
}
function click(pitch = 0) {
  const n = N(0.08), nz = fftFilter(noise(0.08), 3000, 0), x = zeros(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (Math.sin(TAU * 900 * Math.pow(2, pitch / 12) * t) * Math.exp(-60 * t) + nz[i] * Math.exp(-200 * t) * 0.3) * 0.5; }
  return finish(x);
}
function spinButton() {
  const n = N(0.35), nz = fftFilter(noise(0.35), 500, 4000), x = zeros(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = nz[i] * (0.2 + 0.8 * i / n) * Math.exp(-6 * t) * 0.6 + Math.sin(TAU * 70 * t) * Math.exp(-20 * t); }
  return finish(norm(x, 0.7));
}
function brass(f, dur, vol = 1) {
  const x = richTone(f, dur, 10, 0.003, 1.1), e = adsr(x.length, 0.04, 0.18);
  for (let i = 0; i < x.length; i++) x[i] *= e[i] * (0.7 + 0.3 * Math.exp(-3 * i / SR)) * vol;
  return x;
}
function fanfare(level) {
  const notes = [[0, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16, 19], [0, 3, 7, 12, 15, 19, 24, 27]][level];
  const base = 293.66 * (level < 3 ? 1 : 0.5), dur = [0.9, 1.6, 2.6, 4.2][level], step = [0.11, 0.1, 0.1, 0.13][level];
  const out = newBuf(dur);
  notes.forEach((nn, i) => place(out, panned(brass(base * Math.pow(2, nn / 12), dur - i * step, 0.5), (i % 3 - 1) * 0.4), i * step));
  if (level >= 1) {
    const cnt = Math.floor(dur / 0.09);
    for (let k = 0; k < cnt; k++) { const sn = fftFilter(noise(0.08), 900, 0); for (let i = 0; i < sn.length; i++) sn[i] *= Math.exp(-40 * i / SR) * 0.25 * (0.4 + k / cnt); place(out, mono(sn), k * 0.09); }
  }
  if (level >= 2) {
    [0, 0.2, 0.4].forEach((off, k) => place(out, mono(scaleArr(bell(880 * Math.pow(2, k * 4 / 12), 1.5, 3.5, 2, 2.8), 0.3)), off));
    const sub = zeros(N(dur)); for (let i = 0; i < sub.length; i++) sub[i] = Math.sin(TAU * 55 * i / SR) * Math.exp(-1.6 * i / SR) * 0.8;
    place(out, mono(sub), 0);
  }
  for (let i = 0; i < out.l.length; i++) { out.l[i] *= 0.8; out.r[i] *= 0.8; }
  return finish(out);
}
function bonusTrigger() {
  const dur = 3.6, n = N(dur), rise = fftFilter(noise(dur), 200, 9000), crash = fftFilter(noise(dur), 3000, 0), x = zeros(n);
  const chord = zeros(n);
  for (const r of [1.0, 1.1892, 1.4983, 2.0]) { const c = richTone(146.83 * r, dur, 6, 0.005, 1.2); for (let i = 0; i < n; i++) chord[i] += c[i]; }
  let sph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / dur; sph += TAU * (60 + 900 * Math.pow(u, 2.2)) / SR;
    const h = Math.max(0, t - 2.4), on = t > 2.4 ? 1 : 0;
    x[i] = rise[i] * Math.pow(u, 2.5) * 0.4 + Math.sin(sph) * Math.pow(u, 1.5) * 0.3 + Math.sin(TAU * 48 * h) * Math.exp(-2.6 * h) * on * 1.2
      + crash[i] * Math.exp(-3.5 * h) * on * 0.6 + chord[i] * Math.pow(u, 1.4) * 0.05;
  }
  return finish(reverb(norm(x), 2.2, 0.3, false));
}
function thunder() {
  const dur = 3, n = N(dur), rumble = fftFilter(noise(dur), 0, 220), crack = fftFilter(noise(dur), 800, 9000), x = zeros(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = rumble[i] * Math.exp(-1.3 * t) * (1 + 0.6 * Math.sin(TAU * 3.3 * t)) * 2.2 + crack[i] * Math.exp(-28 * t) * 0.9; }
  return finish(norm(x, 0.9));
}
function zap() {
  const dur = 0.38, n = N(dur), nz = fftFilter(noise(dur), 2500, 0), x = zeros(n); let cs = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; cs += 4200 * Math.exp(-9 * t) + 160; const saw = ((cs / SR) % 1) * 2 - 1; x[i] = saw * Math.exp(-11 * t) + nz[i] * Math.exp(-35 * t); }
  return finish(norm(x, 0.7));
}
function interp(t, xs, ys) { if (t <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (t <= xs[i]) { const u = (t - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + u * (ys[i] - ys[i - 1]); } return ys[ys.length - 1]; }
function howl() {
  const dur = 3, n = N(dur), x = zeros(n), nz = fftFilter(noise(dur), 700, 3500), amps = [1, .65, .5, .3, .22, .14, .1, .06]; let ph = 0;
  const e = adsr(n, 0.18, 0.9);
  for (let i = 0; i < n; i++) {
    const t = i / SR, f0 = interp(t, [0, .35, 1, 1.9, 3], [300, 410, 560, 520, 330]);
    ph += TAU * f0 * (1 + 0.012 * Math.sin(TAU * 5.4 * t) * Math.min(1, t / 1.2)) / SR;
    let v = 0; for (let h = 0; h < 8; h++) v += Math.sin((h + 1) * ph) * amps[h];
    v += 0.25 * nz[i] * Math.min(1, t / 0.4);
    x[i] = Math.tanh(v * e[i] * (0.85 + 0.15 * Math.sin(TAU * 0.7 * t)) * 0.9);
  }
  return finish(reverb(norm(x, 0.8), 2.6, 0.42, false));
}
function bark() {
  const out = newBuf(0.9);
  [0, 0.26].forEach((at, k) => {
    const n = N(0.22), x = zeros(n), nz = fftFilter(noise(0.22), 400, 2500), e = adsr(n, 0.005, 0.1); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * interp(t, [0, .05, .22], [210, 330, 150]) * (1 + 0.1 * k) / SR; let v = 0; for (let h = 1; h < 8; h++) v += Math.sin(h * ph) / h; x[i] = Math.tanh((v + nz[i] * 0.6) * e[i] * Math.exp(-7 * t) * 1.2); }
    place(out, panned(x, -0.2 + 0.4 * k), at);
  });
  for (let i = 0; i < out.l.length; i++) { out.l[i] *= 0.7; out.r[i] *= 0.7; }
  return finish(out);
}
function orbBoost() {
  const out = newBuf(1.3);
  [0, 4, 7, 12, 16, 19, 24].forEach((nn, i) => place(out, mono(scaleArr(bell(523 * Math.pow(2, nn / 12), 0.9, 3.0, 1.6, 4.5), 0.35)), i * 0.055));
  const nz = fftFilter(noise(1.3), 4000, 0);
  for (let i = 0; i < out.l.length; i++) { const s = nz[i] * Math.exp(-4 * i / SR) * 0.08; out.l[i] += s; out.r[i] += s * 0.9; }
  return finish(out);
}
function collect() {
  const out = newBuf(1.4);
  for (let i = 0; i < 12; i++) place(out, mono(scaleArr(bell(659 * Math.pow(2, i * 2 / 12), 0.5, 2.5, 1.0, 7), 0.3)), i * 0.06);
  return finish(out);
}
function errorBuzz() {
  const n = N(0.25), x = zeros(n), e = adsr(n, 0.005, 0.08);
  for (let i = 0; i < n; i++) x[i] = (Math.sin(TAU * 110 * i / SR) >= 0 ? 1 : -1) * 0.3 * e[i];
  return finish(x);
}

/* --------------------------------------------------------------------- music (dry; reverb is a Convolver at playback) */
const tick = () => new Promise((r) => setTimeout(r, 0));
async function musicBase() {
  const beat = 60 / 57, chordLen = 4 * beat * 2, chords = [[36.71, "m"], [29.14, "M"], [24.50, "m"], [27.50, "M"]];
  const total = chordLen * 4, n = N(total), buf = { l: zeros(n), r: zeros(n) };
  for (let ci = 0; ci < 4; ci++) {
    const [root, q] = chords[ci], st = ci * chordLen, third = q === "m" ? 1.1892 : 1.2599;
    for (const [octv, amp] of [[4, 0.55], [8, 0.25], [16, 0.10]]) for (const [r, pn] of [[1.0, -0.3], [third, 0], [1.4983, 0.3]]) {
      const tone = richTone(root * octv * r, chordLen + 3, 4, 0.003, 1.5, octv === 4 ? 0.002 : 0, 0.2 + 0.1 * ci);
      scaleArr(mulArr(tone, adsr(tone.length, 2.6, 2.8)), amp * 0.16);
      place(buf, panned(tone, pn), st); await tick();
    }
    place(buf, mono(scaleArr(bell(root * 8, 6.0, 2.76, 2.2, 0.9), 0.55)), st);
    place(buf, mono(scaleArr(bell(root * 16.02, 4.5, 2.76, 1.5, 1.1), 0.22)), st + beat * 4);
    if (ci >= 1) {
      const ch = richTone(root * (ci !== 2 ? 32 : 40), 6, 4, 0.006, 1.6, 0.006, 4.8);
      scaleArr(mulArr(ch, adsr(ch.length, 2.5, 2.5)), 0.08);
      place(buf, panned(ch, ci % 2 === 0 ? 0.5 : -0.5), st + beat * 2);
    }
    const mel = q === "m" ? [12, 15, 14] : [14, 12, 9];
    mel.forEach((semi, k) => place(buf, panned(scaleArr(bell(root * 16 * Math.pow(2, semi / 12), 2.4, 3.5, 1.4, 1.6), 0.17), 0.35 * (k - 1)), st + beat * (1.5 + k * 2.5)));
    await tick();
  }
  for (let i = 0; i < n; i++) { const t = i / SR, s = (Math.sin(TAU * 36.71 * t) + 0.4 * Math.sin(TAU * 73.42 * t + 0.4 * Math.sin(TAU * 0.11 * t))) * 0.22; buf.l[i] += s; buf.r[i] += s; }
  for (let b = 0; b < Math.floor(total / beat); b++) for (const [off, amp] of [[0, 1], [0.32, 0.6]]) {
    const th = zeros(N(0.35)); for (let i = 0; i < th.length; i++) { const t = i / SR; th[i] = Math.sin(TAU * (52 + 16 * Math.exp(-25 * t)) * t) * Math.exp(-14 * t) * amp * 0.5; }
    place(buf, mono(th), b * beat + off);
  }
  let lp1 = 0, lp2 = 0;
  for (let i = 0; i < n; i++) { const g = gauss(); lp1 += (g - lp1) * 0.12; lp2 += (g - lp2) * 0.04; const env = Math.pow(Math.sin(Math.PI * i / n), 2); const w = (lp1 - lp2) * env * 0.22; buf.l[i] += w; buf.r[i] += w; }
  return finish(buf, 0.5);
}
function taiko(f = 70, d = 0.5, amp = 1) {
  const n = N(d), nz = fftFilter(noise(d), 200, 1200), x = zeros(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * f * (1 + 1.2 * Math.exp(-18 * t)) / SR; x[i] = (Math.sin(ph) * Math.exp(-7 * t) + 0.35 * nz[i] * Math.exp(-35 * t)) * amp; }
  return x;
}
async function musicBonus(kind) {
  const bpm = kind === "orb" ? 118 : 104, beat = 60 / bpm, bars = 8, total = beat * 4 * bars, n = N(total), buf = { l: zeros(n), r: zeros(n) };
  const root = 36.71 * (kind === "orb" ? 2 : 1), prog = kind === "orb" ? [0, 0, -4, -4, -2, -2, 0, -2] : [0, -4, -2, -4, 0, -4, -7, -5];
  for (let bar = 0; bar < bars; bar++) {
    const st = bar * 4 * beat, r = root * Math.pow(2, prog[bar] / 12);
    place(buf, mono(taiko(62, 0.7, 0.9)), st); place(buf, mono(taiko(62, 0.5, 0.6)), st + beat * 2.5);
    place(buf, mono(taiko(90, 0.4, 0.55)), st + beat); place(buf, mono(taiko(90, 0.4, 0.55)), st + beat * 3); place(buf, mono(taiko(115, 0.3, 0.4)), st + beat * 3.5);
    for (let k = 0; k < (kind === "orb" ? 8 : 4); k++) { const hh = fftFilter(noise(0.06), 6000, 0); for (let i = 0; i < hh.length; i++) hh[i] *= Math.exp(-90 * i / SR) * (k % 2 ? 0.18 : 0.1); place(buf, mono(hh), st + k * beat * (kind === "orb" ? 0.5 : 1)); }
    if (kind === "free") for (let k = 0; k < 4; k++) { const sn = fftFilter(noise(0.14), 1500, 6000); for (let i = 0; i < sn.length; i++) sn[i] *= Math.exp(-28 * i / SR) * 0.28; place(buf, mono(sn), st + k * beat + (k % 2 ? 0.5 * beat : 0)); }
    const steps = kind === "orb" ? [0, 0, 3, 0, 5, 0, 3, -2] : [0, 7, 0, 7, 3, 7, 0, 5];
    steps.forEach((semi, k) => { const tn = richTone(r * Math.pow(2, semi / 12) * 2, beat * 0.5, 7, 0, 1.0), e = adsr(tn.length, 0.005, 0.05); for (let i = 0; i < tn.length; i++) tn[i] *= Math.exp(-6 * i / SR) * e[i] * 0.10; place(buf, panned(tn, -0.1), st + k * beat * 0.5); });
    if (bar % 2 === 0) {
      for (const [rr, pn] of [[1.0, -0.4], [1.1892, 0], [1.4983, 0.4], [2.0, 0.2]]) {
        const f = r * 8 * rr, d = beat * 3.6;
        const ch = kind === "free" ? brass(f, d, 0.07) : scaleArr(mulArr(richTone(f, d, 5, 0.005, 1.4, 0.005), adsr(N(d), 0.3, 1.2)), 0.07);
        place(buf, panned(ch, pn), st);
      }
      place(buf, mono(scaleArr(bell(r * 16, 3.0, 2.76, 2.0, 1.2), 0.25)), st);
    }
    if (kind === "orb" && (bar === 3 || bar === 7)) [0, 3, 7, 10, 12, 15, 19, 22].forEach((s, k) => place(buf, mono(scaleArr(bell(r * 8 * Math.pow(2, s / 12), 0.6, 3.0, 1.4, 5), 0.18)), st + beat * 2 + k * beat * 0.25));
    await tick();
  }
  for (let i = 0; i < n; i++) { const s = Math.sin(TAU * 36.71 * i / SR) * 0.16; buf.l[i] += s; buf.r[i] += s; }
  return finish(buf, 0.55);
}
function reverbIR(seconds, sr = SR) {
  const n = Math.floor(seconds * sr), l = new Float32Array(n), r = new Float32Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) { const e = Math.exp(-i / sr * (6.9 / seconds)); a += (gauss() * e - a) * 0.5; b += (gauss() * e - b) * 0.5; l[i] = a * 0.05; r[i] = b * 0.05; }
  return { l, r };
}
