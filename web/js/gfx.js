/* Procedural art + effects for the Canvas renderer (port of tnslots/gfx.py). */
"use strict";
const W = 1280, H = 720, CELL = 150, GAP = 8, PITCH = CELL + GAP;
const GX = Math.floor((W - (5 * CELL + 4 * GAP)) / 2), GY = 138;
const ORANGE = [255, 130, 0], ORANGE_HI = [255, 176, 60], ORANGE_DK = [190, 85, 0], WHITE = [255, 255, 255], GOLD = [255, 205, 60];
const ORB_COLORS = {
  cash: [[255, 190, 60], [255, 110, 0], [140, 50, 0]], mini: [[140, 255, 150], [40, 190, 70], [10, 90, 30]],
  minor: [[140, 200, 255], [40, 120, 255], [10, 40, 140]], major: [[225, 160, 255], [160, 60, 240], [70, 10, 120]],
  grand: [[255, 160, 140], [240, 30, 40], [110, 0, 10]],
};
const FONT = 'Impact, "Arial Black", "Haettenschweiler", "Franklin Gothic Heavy", Arial, sans-serif';
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scaleC = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const cellPos = (c, r) => [GX + c * PITCH, GY + r * PITCH];
const cellCenter = (c, r) => [GX + c * PITCH + CELL / 2, GY + r * PITCH + CELL / 2];
const easeOutBack = (u, s = 1.25) => { u -= 1; return 1 + (s + 1) * u * u * u + s * u * u; };
function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function fillRR(ctx, x, y, w, h, r, fill, stroke, lw = 2) {
  rrect(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/* text with a round outline. opts: color, anchor (center|left|right), outline, ow, alpha, scale, font */
function drawText(ctx, s, size, x, y, o = {}) {
  const color = o.color || WHITE, outline = o.outline === undefined ? [0, 0, 0] : o.outline, ow = o.ow === undefined ? 2 : o.ow;
  ctx.save();
  ctx.translate(x, y);
  if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = o.anchor || "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  if (outline && ow) { ctx.lineWidth = ow * 2; ctx.strokeStyle = rgb(outline); ctx.strokeText(s, 0, 0); }
  ctx.fillStyle = rgb(color); ctx.fillText(s, 0, 0);
  ctx.restore();
}
function addGlow(ctx, x, y, radius, color, strength = 1) {
  if (radius < 1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const cs = scaleC(color, strength);
  g.addColorStop(0, rgb(cs, 1)); g.addColorStop(0.25, rgb(cs, 0.56)); g.addColorStop(0.5, rgb(cs, 0.25)); g.addColorStop(0.75, rgb(cs, 0.06)); g.addColorStop(1, rgb(cs, 0));
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
}

/* ----------------------------------------------------------- symbol drawing (unit square S) */
function tile(ctx, S, top, bottom, border, radius = 0.12, bw = 0.03) {
  const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bottom));
  fillRR(ctx, 0, 0, S, S, S * radius, g, null);
  ctx.save(); rrect(ctx, 0, 0, S, S, S * radius); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.beginPath(); ctx.ellipse(S / 2, 0, S * 0.75, S * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const w = Math.max(2, S * bw); fillRR(ctx, w / 2, w / 2, S - w, S - w, S * radius, null, rgb(border), w);
}
function poly(ctx, S, pts, fill, stroke, lw) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S))); ctx.closePath();
  if (fill) { ctx.fillStyle = rgb(fill); ctx.fill(); }
  if (stroke) { ctx.strokeStyle = rgb(stroke); ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.stroke(); }
}
function line(ctx, S, pts, color, lw) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)));
  ctx.strokeStyle = rgb(color); ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
}
function drawLetter(ctx, S, ch, color) {
  tile(ctx, S, [48, 32, 70], [20, 12, 36], lerpC(color, [0, 0, 0], 0.3));
  ctx.font = `${S * 0.86}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const y = S * 0.55;
  ctx.fillStyle = "#000"; ctx.fillText(ch, S / 2 + S * 0.012, y + S * 0.025);
  const g = ctx.createLinearGradient(0, S * 0.15, 0, S * 0.85); g.addColorStop(0, rgb(lerpC(color, WHITE, 0.55))); g.addColorStop(0.45, rgb(color)); g.addColorStop(1, rgb(lerpC(color, [0, 0, 0], 0.25)));
  ctx.fillStyle = g; ctx.fillText(ch, S / 2, y);
}
function drawChecker(ctx, S) {
  tile(ctx, S, [60, 30, 8], [30, 14, 4], ORANGE_HI);
  const n = 5, m = S * 0.14, cs = (S - 2 * m) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = rgb((i + j) % 2 === 0 ? ORANGE : WHITE); ctx.fillRect(m + i * cs, m + j * cs, cs + 0.5, cs + 0.5); }
  ctx.strokeStyle = "#1e0e04"; ctx.lineWidth = Math.max(2, S / 60); ctx.strokeRect(m, m, cs * n, cs * n);
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.moveTo(m, m); ctx.lineTo(S - m, m); ctx.lineTo(m, S - m); ctx.closePath(); ctx.fill();
}
function drawFootball(ctx, S) {
  tile(ctx, S, [40, 36, 70], [18, 12, 34], [150, 90, 40]);
  ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-28 * Math.PI / 180);
  const w = S * 0.78, h = S * 0.46;
  ctx.fillStyle = "#5c3014"; ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8c4e24"; ctx.beginPath(); ctx.ellipse(0, -h * 0.15, w * 0.47, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(2, S / 60); ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, S / 55);
  for (const fx of [-0.33, -0.27, 0.27, 0.33]) { ctx.beginPath(); ctx.moveTo(fx * w, -h * 0.36); ctx.lineTo(fx * w, h * 0.36); ctx.stroke(); }
  ctx.lineWidth = Math.max(3, S / 45); ctx.beginPath(); ctx.moveTo(-w * 0.2, 0); ctx.lineTo(w * 0.2, 0); ctx.stroke();
  ctx.lineWidth = Math.max(2, S / 55);
  for (let k = 0; k < 5; k++) { const x = w * (-0.16 + k * 0.08); ctx.beginPath(); ctx.moveTo(x, -h * 0.16); ctx.lineTo(x, h * 0.16); ctx.stroke(); }
  ctx.restore();
}
function drawHelmet(ctx, S) {
  tile(ctx, S, [50, 34, 84], [22, 14, 40], ORANGE);
  const shell = [[0.16, 0.56], [0.18, 0.36], [0.30, 0.22], [0.50, 0.15], [0.70, 0.21], [0.80, 0.35], [0.83, 0.5], [0.79, 0.6], [0.70, 0.64], [0.66, 0.78], [0.44, 0.80], [0.28, 0.72]];
  poly(ctx, S, shell.map(([x, y]) => [x + 0.012, y + 0.015]), [0, 0, 0]);
  poly(ctx, S, shell, ORANGE);
  poly(ctx, S, [[0.22, 0.38], [0.30, 0.26], [0.5, 0.19], [0.62, 0.22], [0.44, 0.3], [0.3, 0.42]], ORANGE_HI);
  poly(ctx, S, [[0.44, 0.16], [0.52, 0.15], [0.56, 0.5], [0.48, 0.52]], WHITE);
  poly(ctx, S, [[0.62, 0.62], [0.7, 0.64], [0.66, 0.78], [0.58, 0.77]], ORANGE_DK);
  ctx.fillStyle = "#1e0c00"; ctx.beginPath(); ctx.arc(0.40 * S, 0.55 * S, 0.05 * S, 0, Math.PI * 2); ctx.fill();
  const gray = [225, 225, 235];
  line(ctx, S, [[0.78, 0.5], [0.92, 0.52], [0.92, 0.7], [0.68, 0.74]], gray, Math.max(3, S / 36));
  line(ctx, S, [[0.92, 0.585], [0.76, 0.585]], gray, Math.max(3, S / 40));
  line(ctx, S, [[0.92, 0.65], [0.72, 0.65]], gray, Math.max(3, S / 40));
  poly(ctx, S, shell, null, [0, 0, 0], Math.max(2, S / 70));
}
function drawTrophy(ctx, S) {
  tile(ctx, S, [56, 36, 90], [22, 12, 40], GOLD);
  ctx.strokeStyle = "#d29614"; ctx.lineWidth = Math.max(4, S / 28);
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse((0.5 + sd * 0.25) * S, 0.35 * S, 0.09 * S, 0.13 * S, 0, 0, Math.PI * 2); ctx.stroke(); }
  const cup = [[0.28, 0.17], [0.72, 0.17], [0.68, 0.46], [0.58, 0.6], [0.42, 0.6], [0.32, 0.46]];
  poly(ctx, S, cup, GOLD);
  poly(ctx, S, [[0.31, 0.19], [0.42, 0.19], [0.40, 0.46], [0.36, 0.44]], [255, 240, 150]);
  poly(ctx, S, [[0.62, 0.19], [0.71, 0.19], [0.67, 0.45], [0.58, 0.58], [0.56, 0.58]], [205, 140, 10]);
  ctx.fillStyle = "#d7960f"; ctx.fillRect(0.45 * S, 0.6 * S, 0.1 * S, 0.12 * S);
  fillRR(ctx, 0.30 * S, 0.72 * S, 0.40 * S, 0.1 * S, S / 40, "#5a2806");
  fillRR(ctx, 0.33 * S, 0.70 * S, 0.34 * S, 0.06 * S, S / 50, rgb(GOLD));
  ctx.font = `${S * 0.28}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = rgb(ORANGE_DK); ctx.fillText("T", S / 2, S * 0.35);
  poly(ctx, S, cup, null, [120, 70, 0], Math.max(2, S / 80));
}
function drawSmokeyHead(ctx, S, mouthOpen, bg) {
  if (bg) tile(ctx, S, [36, 44, 84], [16, 14, 36], [130, 150, 190]);
  const cx = S / 2, blue = [96, 118, 148], blueDk = [58, 74, 100], tan = [206, 160, 108];
  const P = (x, y) => [x, y];
  for (const sd of [-1, 1]) {
    const pts = [[cx + sd * 0.17 * S, 0.22 * S], [cx + sd * 0.36 * S, 0.24 * S], [cx + sd * 0.43 * S, 0.62 * S], [cx + sd * 0.36 * S, 0.78 * S], [cx + sd * 0.26 * S, 0.62 * S]];
    poly(ctx, 1, pts, [60, 36, 24]);
    poly(ctx, 1, [[cx + sd * 0.19 * S, 0.27 * S], [cx + sd * 0.33 * S, 0.29 * S], [cx + sd * 0.37 * S, 0.6 * S], [cx + sd * 0.29 * S, 0.62 * S]], [90, 56, 36]);
  }
  const ell = (x, y, w, h, col) => { ctx.fillStyle = rgb(col); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); };
  ell(cx - 0.25 * S, 0.14 * S, 0.5 * S, 0.5 * S, blueDk); ell(cx - 0.24 * S, 0.14 * S, 0.48 * S, 0.46 * S, blue);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  ctx.fillStyle = "rgb(40,52,76)";
  for (let i = 0; i < 60; i++) { const a = rnd() * 6.283, r = rnd() * 0.2 * S; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, 0.37 * S + Math.sin(a) * r * 0.9, Math.max(1, S / 90), 0, 6.283); ctx.fill(); }
  for (const sd of [-1, 1]) ell(cx + sd * 0.12 * S - 0.04 * S, 0.22 * S, 0.08 * S, 0.06 * S, tan);
  ell(cx - 0.19 * S, 0.40 * S, 0.38 * S, 0.30 * S, tan); ell(cx - 0.15 * S, 0.42 * S, 0.30 * S, 0.18 * S, [232, 200, 158]);
  for (const sd of [-1, 1]) {
    const ex = cx + sd * 0.115 * S, ey = 0.34 * S;
    ell(ex - 0.045 * S, ey - 0.05 * S, 0.09 * S, 0.1 * S, WHITE);
    ctx.fillStyle = "rgb(50,24,6)"; ctx.beginPath(); ctx.arc(ex, ey + 0.005 * S, 0.032 * S, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex - 0.01 * S, ey - 0.012 * S, Math.max(2, 0.01 * S), 0, 6.283); ctx.fill();
  }
  ell(cx - 0.07 * S, 0.43 * S, 0.14 * S, 0.09 * S, [14, 14, 18]);
  ctx.fillStyle = "rgb(120,120,140)"; ctx.beginPath(); ctx.arc(cx - 0.02 * S, 0.452 * S, Math.max(2, 0.012 * S), 0, 6.283); ctx.fill();
  if (mouthOpen) { ell(cx - 0.08 * S, 0.56 * S, 0.16 * S, 0.16 * S, [60, 10, 20]); ell(cx - 0.05 * S, 0.65 * S, 0.10 * S, 0.06 * S, [230, 90, 110]); }
  else {
    ctx.strokeStyle = "rgb(60,36,24)"; ctx.lineWidth = Math.max(2, S / 70); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx, 0.52 * S); ctx.lineTo(cx, 0.58 * S); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - 0.05 * S, 0.54 * S, 0.05 * S, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 0.05 * S, 0.54 * S, 0.05 * S, 0.1, Math.PI - 0.1); ctx.stroke();
  }
  poly(ctx, 1, [[cx - 0.3 * S, 0.7 * S], [cx + 0.3 * S, 0.7 * S], [cx, 0.96 * S]], ORANGE, ORANGE_DK, Math.max(2, S / 80));
  ctx.fillStyle = "rgb(255,220,160)"; ctx.fillRect(cx - 0.07 * S, 0.73 * S, 0.14 * S, 0.04 * S); ctx.fillRect(cx - 0.02 * S, 0.73 * S, 0.04 * S, 0.14 * S);
}
function drawWild(ctx, S) {
  tile(ctx, S, [120, 40, 0], [40, 8, 4], ORANGE_HI);
  const bolt = [[0.58, 0.08], [0.28, 0.5], [0.46, 0.5], [0.38, 0.84], [0.74, 0.4], [0.54, 0.4], [0.68, 0.08]];
  poly(ctx, S, bolt.map(([x, y]) => [x + 0.02, y + 0.02]), [255, 120, 0]);
  poly(ctx, S, bolt, [255, 240, 120]);
  poly(ctx, S, [[0.58, 0.1], [0.36, 0.44], [0.5, 0.44], [0.56, 0.2]], WHITE);
  poly(ctx, S, bolt, null, ORANGE_DK, Math.max(2, S / 80));
  ctx.font = `${S * 0.25}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#000"; ctx.fillText("WILD", S / 2 + S / 80, S * 0.86 + S / 80); ctx.fillStyle = "#fff"; ctx.fillText("WILD", S / 2, S * 0.86);
}
const T_PTS = [[0.10, 0.20], [0.90, 0.20], [0.90, 0.40], [0.60, 0.40], [0.60, 0.84], [0.40, 0.84], [0.40, 0.40], [0.10, 0.40]];
function drawPowerT(ctx, S) {
  tile(ctx, S, [255, 255, 255], [222, 214, 206], ORANGE, 0.12, 0.04);
  poly(ctx, S, T_PTS.map(([x, y]) => [x + 0.012, y + 0.02]), [120, 60, 10]);
  poly(ctx, S, T_PTS, ORANGE);
  ctx.fillStyle = "rgba(255,200,120,0.63)"; ctx.fillRect(0.12 * S, 0.22 * S, 0.76 * S, 0.05 * S);
  poly(ctx, S, T_PTS, null, [130, 60, 0], Math.max(2, S / 70));
  ctx.font = `${S * 0.13}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgb(110,55,0)"; ctx.fillText("POWER", S / 2, S * 0.93);
}
function drawOrb(ctx, S, kind) {
  const [hi, mid, lo] = ORB_COLORS[kind], c = S / 2, r = S * 0.40;
  const g = ctx.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.05, c, c, r);
  g.addColorStop(0, rgb(hi)); g.addColorStop(0.35, rgb(lerpC(mid, hi, 0.4))); g.addColorStop(0.7, rgb(mid)); g.addColorStop(1, rgb(lo));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, r, 0, 6.283); ctx.fill();
  ctx.strokeStyle = rgb(lerpC(lo, [0, 0, 0], 0.4)); ctx.lineWidth = Math.max(2, S / 40); ctx.beginPath(); ctx.arc(c, c, r, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = rgb(hi); ctx.lineWidth = Math.max(1, S / 90); ctx.beginPath(); ctx.arc(c, c, r - S / 40, 0, 6.283); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.ellipse(c - r * 0.17, c - r * 0.61, r * 0.45, r * 0.25, 0, 0, 6.283); ctx.fill();
}

const WHEEL_COL = { mini: [60, 200, 90], minor: [60, 130, 255], major: [175, 80, 245], grand: [240, 50, 60] };
/* Draws a wheel of coloured wedges. Used for the reel symbol and the big jackpot wheel. */
function drawWheelDisc(ctx, cx, cy, R, layout, angle = 0, o = {}) {
  const n = layout.length, seg = Math.PI * 2 / n;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
  for (let i = 0; i < n; i++) {
    const a0 = i * seg - Math.PI / 2 - seg / 2, a1 = a0 + seg, c = WHEEL_COL[layout[i]];
    const g = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R); g.addColorStop(0, rgb(scaleC(c, 0.55))); g.addColorStop(1, rgb(c));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,240,200,0.9)"; ctx.lineWidth = o.thin ? 1.5 : 3; ctx.stroke();
    if (o.labels) {
      ctx.save(); ctx.rotate(a0 + seg / 2); ctx.translate(R * 0.66, 0);
      ctx.font = `${Math.max(12, Math.min(26, R * 0.11 * 12 / Math.max(8, n) * 1.6))}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = "#fff"; const t = layout[i].toUpperCase();
      ctx.strokeText(t, 0, 0); ctx.fillText(t, 0, 0); ctx.restore();
    }
  }
  ctx.restore();
}
function drawWheelSymbol(ctx, S) {
  tile(ctx, S, [40, 24, 76], [14, 8, 34], [255, 215, 110]);
  const layout = ["mini", "minor", "mini", "major", "mini", "minor", "mini", "grand"];
  drawWheelDisc(ctx, S / 2, S * 0.5, S * 0.36, layout, -0.2, { thin: true });
  ctx.strokeStyle = rgb(GOLD); ctx.lineWidth = S * 0.045; ctx.beginPath(); ctx.arc(S / 2, S * 0.5, S * 0.37, 0, 6.283); ctx.stroke();
  ctx.fillStyle = rgb(GOLD); ctx.beginPath(); ctx.arc(S / 2, S * 0.5, S * 0.07, 0, 6.283); ctx.fill();
  ctx.strokeStyle = "#7a4a00"; ctx.lineWidth = S * 0.012; ctx.stroke();
  poly(ctx, S, [[0.44, 0.07], [0.56, 0.07], [0.5, 0.19]], [255, 70, 60], [255, 240, 200], Math.max(2, S / 70));
  ctx.font = `${S * 0.12}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText("JACKPOT", S / 2 + 1, S * 0.935 + 1); ctx.fillStyle = "#fff"; ctx.fillText("JACKPOT", S / 2, S * 0.935);
}
function drawCheckerIcon(ctx, x, y, s) {
  const n = 4, c = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = rgb((i + j) % 2 === 0 ? ORANGE : WHITE); ctx.fillRect(x + i * c, y + j * c, c + 0.5, c + 0.5); }
  ctx.strokeStyle = "rgba(20,8,0,0.9)"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, s, s);
}

class Art {
  constructor() {
    const R = 2, S = CELL * R, mk = (fn) => { const c = mkCanvas(S, S), x = c.getContext("2d"); fn(x, S); return c; };
    this.sym = {
      J: mk((x, s) => drawLetter(x, s, "J", ORANGE)), Q: mk((x, s) => drawLetter(x, s, "Q", WHITE)),
      K: mk((x, s) => drawLetter(x, s, "K", ORANGE_HI)), A: mk((x, s) => drawLetter(x, s, "A", [235, 235, 245])),
      CHECKER: mk(drawChecker), WHEEL: mk(drawWheelSymbol), FOOTBALL: mk(drawFootball), HELMET: mk(drawHelmet), TROPHY: mk(drawTrophy),
      SMOKEY: mk((x, s) => drawSmokeyHead(x, s, false, true)), WILD: mk(drawWild), POWERT: mk(drawPowerT),
    };
    this.orb = {}; for (const k of Object.keys(ORB_COLORS)) this.orb[k] = mk((x, s) => drawOrb(x, s, k));
    this.sym.ORB = this.orb.cash;
    this.blur = {};
    for (const [n, img] of Object.entries(this.sym)) {
      const c = mkCanvas(S, S), x = c.getContext("2d"), cnt = 7;
      x.globalAlpha = 1.6 / cnt;
      for (let i = 0; i < cnt; i++) x.drawImage(img, 0, (i - 3) * S * 0.045);
      this.blur[n] = c;
    }
    this.empty = mk((x, s) => {
      fillRR(x, 0, 0, s, s, s * 0.12, "rgba(14,10,26,0.92)", "rgb(90,56,20)", 4);
      fillRR(x, s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.08, null, "rgb(30,22,50)", 2);
    });
    this.smokey = { idle: mkCanvas(520, 520), howl: mkCanvas(520, 520) };
    drawSmokeyHead(this.smokey.idle.getContext("2d"), 520, false, false);
    drawSmokeyHead(this.smokey.howl.getContext("2d"), 520, true, false);
    this.powerTBig = mkCanvas(512, 512); const tx = this.powerTBig.getContext("2d"); poly(tx, 512, T_PTS, ORANGE);
    this.powerTOutline = mkCanvas(256, 256); const ox = this.powerTOutline.getContext("2d");
    poly(ox, 256, T_PTS, WHITE, ORANGE, 14);
    /* soft light beams, 11 angles x 3 themes, apex at top */
    this.beams = {};
    for (const [name, acc] of Object.entries(THEME_ACC)) {
      const list = [];
      for (let a = -30; a <= 30; a += 6) {
        const bw = 300, bh = 560, c = mkCanvas(bw, bh), x = c.getContext("2d");
        const g = x.createLinearGradient(0, 0, 0, bh); g.addColorStop(0, rgb(acc, 0.34)); g.addColorStop(1, rgb(acc, 0));
        x.fillStyle = g; x.beginPath(); x.moveTo(bw / 2 - 10, 0); x.lineTo(bw / 2 + 10, 0); x.lineTo(bw / 2 + 95, bh); x.lineTo(bw / 2 - 95, bh); x.closePath(); x.fill();
        list.push({ canvas: c, angle: a });
      }
      this.beams[name] = list;
    }
  }
}
const THEME_ACC = { base: [255, 130, 0], orb: [90, 170, 255], free: [255, 180, 50] };

/* ------------------------------------------------------------------ effects */
class Particles {
  constructor() { this.items = []; }
  burst(x, y, n = 30, color = ORANGE, speed = 300, life = 1.0, size = 5, gravity = 500, spread = 6.283, angle = 0, kind = "spark") {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread, v = (0.25 + Math.random() * 0.75) * speed;
      this.items.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.5), max: life, size: size * (0.6 + Math.random() * 0.7), color, g: gravity, kind });
    }
  }
  coins(x, y, n = 40, width = 400) {
    for (let i = 0; i < n; i++) this.items.push({ x: x + (Math.random() - 0.5) * width, y, vx: (Math.random() - 0.5) * 320, vy: -250 - Math.random() * 450, life: 1.4 + Math.random(), max: 2, size: 7 + Math.random() * 5, color: GOLD, g: 1100, kind: "coin" });
  }
  update(dt) {
    for (const p of this.items) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.items = this.items.filter((p) => p.life > 0);
    if (this.items.length > 700) this.items = this.items.slice(-700);
  }
  draw(ctx) {
    for (const p of this.items) {
      const t = Math.max(0, p.life / p.max);
      if (p.kind === "coin") {
        const w = Math.max(2, p.size * Math.abs(Math.cos(p.life * 9)));
        ctx.fillStyle = "rgb(255,205,60)"; ctx.beginPath(); ctx.ellipse(p.x, p.y, w / 2, p.size / 2, 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = "rgb(255,245,170)"; ctx.lineWidth = 1; ctx.stroke();
      } else {
        const r = Math.max(1, p.size * (0.4 + 0.6 * t)), k = Math.min(1, t * 1.6);
        ctx.fillStyle = rgb(scaleC(p.color, k)); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
        if (r > 2.5) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = rgb(p.color, 0.18 * t); ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, 6.283); ctx.fill(); ctx.restore(); }
      }
    }
  }
}
class Bolt {
  constructor(p1, p2, life = 0.35, color = [255, 170, 40], width = 5, jag = 0.12) {
    this.life = this.max = life; this.color = color; this.width = width;
    let pts = [p1, p2], off = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * jag;
    for (let it = 0; it < 5; it++) {
      const nw = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, n = (Math.random() * 2 - 1) * off;
        nw.push([(a[0] + b[0]) / 2 - dy / d * n, (a[1] + b[1]) / 2 + dx / d * n], b);
      }
      pts = nw; off *= 0.55;
    }
    this.pts = pts;
  }
  update(dt) { this.life -= dt; }
  draw(ctx) {
    const k = Math.max(0, this.life / this.max) * (0.6 + 0.4 * Math.random());
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineJoin = "round"; ctx.lineCap = "round";
    const path = () => { ctx.beginPath(); this.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
    ctx.strokeStyle = rgb(this.color, 0.28 * k); ctx.lineWidth = this.width * 3; path(); ctx.stroke();
    ctx.strokeStyle = rgb(this.color, 0.6 * k); ctx.lineWidth = this.width * 1.6; path(); ctx.stroke();
    ctx.strokeStyle = rgb(WHITE, k); ctx.lineWidth = Math.max(1, this.width * 0.45); path(); ctx.stroke();
    ctx.restore();
  }
}
class Embers {
  constructor(n = 60) { this.p = Array.from({ length: n }, () => [Math.random() * W, Math.random() * H, 10 + Math.random() * 40, 1 + Math.random() * 2.2, Math.random() * 6.28]); }
  update(dt, speed = 1) { for (const p of this.p) { p[1] -= p[2] * dt * speed; p[0] += Math.sin(p[4] + p[1] * 0.01) * 12 * dt; if (p[1] < -10) { p[0] = Math.random() * W; p[1] = H + 10; } } }
  draw(ctx, color) { for (const [x, y, , r, ph] of this.p) { const a = 0.35 + 0.35 * Math.sin(ph + y * 0.02); ctx.fillStyle = rgb(color, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); } }
}
