/* VOLS POWER LINK - game state machine, flows and rendering (port of tnslots/game.py + ui.py). */
"use strict";
const TIERS = [[500, "LEGENDARY WIN", [255, 80, 60]], [150, "EPIC WIN", [255, 60, 200]], [50, "MEGA WIN", [255, 200, 40]], [15, "BIG WIN", ORANGE], [5, "NICE WIN", [255, 170, 80]]];
const FILLER = ["J", "Q", "K", "A", "CHECKER", "FOOTBALL", "HELMET", "TROPHY", "SMOKEY", "WILD", "POWERT", "ORB", "J", "Q", "K", "A"];
const FILLER_FREE = FILLER.concat(["WHEEL", "WHEEL", "WHEEL"]);
const POT_POS = [W / 2, 385];                   // where meter / pot flights land (status bar)
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function money(cents, short = false) {
  const d = cents / 100, f = (v, dec) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (short) {
    if (d >= 1e6) return "$" + f(d / 1e6, 2) + "M";
    if (d >= 1e5) return "$" + f(d / 1e3, 0) + "K";
    if (d >= 1e4) return "$" + f(d / 1e3, 1) + "K";
  }
  return "$" + f(d, 2);
}

class Reel {
  constructor(idx) {
    this.idx = idx; this.x = GX + idx * PITCH; this.L = 48;
    this.strip = Array.from({ length: this.L }, () => FILLER[rint(0, FILLER.length - 1)]);
    this.pos = rint(0, this.L - 1); this.state = "idle"; this.speed = 26; this.orbAt = {}; this.t = 0; this.dur = 0.7; this.p0 = this.p1 = 0; this.anticipate = false;
  }
  idx_(j) { return ((j % this.L) + this.L) % this.L; }
  setIdle(syms, orbs) {
    const P = Math.floor(this.pos); this.orbAt = {};
    for (let r = 0; r < ROWS; r++) { const j = this.idx_(P - r); this.strip[j] = syms[r]; if (orbs && orbs[r]) this.orbAt[j] = orbs[r]; }
    this.pos = P;
  }
  start(speed, free = false) {
    this.state = "spinning"; this.speed = speed;
    const P = Math.floor(this.pos), keep = new Set(), pool = free ? FILLER_FREE : FILLER;
    for (let k = 0; k < ROWS + 1; k++) keep.add(this.idx_(P + 1 - k));
    for (let j = 0; j < this.L; j++) if (!keep.has(j)) this.strip[j] = pool[rint(0, pool.length - 1)];
    this.orbAt = {}; this.anticipate = false;
  }
  requestStop(syms, orbs, turbo, quick = false) {
    const P = Math.ceil(this.pos) + ROWS + 3; this.orbAt = {};
    for (let r = 0; r < ROWS; r++) { const j = this.idx_(P - r); this.strip[j] = syms[r]; if (orbs[r]) this.orbAt[j] = orbs[r]; }
    this.p0 = this.pos; this.p1 = P; this.dur = quick ? 0.22 : turbo ? 0.36 : 0.62; this.t = 0; this.state = "stopping";
  }
  update(dt) {
    if (this.state === "spinning") this.pos += this.speed * dt;
    else if (this.state === "stopping") {
      this.t += dt; const u = Math.min(1, this.t / this.dur);
      this.pos = this.p0 + (this.p1 - this.p0) * easeOutBack(u, 1.0);
      if (u >= 1) { this.pos = this.idx_(this.p1); this.state = "idle"; this.anticipate = false; return true; }
    }
    return false;
  }
  moving() { return this.state === "spinning" || (this.state === "stopping" && this.t < this.dur * 0.55); }
  draw(ctx, game) {
    ctx.save(); ctx.beginPath(); ctx.rect(this.x - 1, GY, CELL + 2, ROWS * PITCH - GAP); ctx.clip();
    const P = Math.floor(this.pos), frac = this.pos - P, blur = this.moving();
    for (let off = 0; off <= ROWS; off++) {
      const j = P + 1 - off, jj = this.idx_(j), y = GY + (off - 1 + frac) * PITCH, sym = this.strip[jj];
      if (sym === "ORB" && !blur) game.drawOrb(ctx, this.orbAt[jj] || null, this.x + CELL / 2, y + CELL / 2);
      else ctx.drawImage(blur ? game.art.blur[sym] : game.art.sym[sym], this.x, Math.round(y), CELL, CELL);
    }
    ctx.restore();
  }
}

class Banner {
  constructor(title, sub = "", color = ORANGE, life = 2.4, size = 84, y = GY + 288) { this.title = title; this.sub = sub; this.color = color; this.life = this.max = life; this.size = size; this.y = y; }
  draw(ctx, t) {
    const age = this.max - this.life, a = Math.max(0, Math.min(Math.min(1, age / 0.25), Math.min(1, this.life / 0.4)));
    const sc = easeOutBack(Math.min(1, age / 0.35), 1.7) * (1 + 0.015 * Math.sin(t * 9));
    ctx.save(); ctx.font = `${this.size}px ${FONT}`; const fit = Math.min(1, 680 / Math.max(1, ctx.measureText(this.title).width)), size = this.size * fit;
    ctx.font = `${size * 0.42}px ${FONT}`; const subFit = this.sub ? Math.min(1, 680 / Math.max(1, ctx.measureText(this.sub).width)) : 1; ctx.restore();
    ctx.fillStyle = `rgba(0,0,10,${0.7 * a})`; ctx.fillRect(0, this.y - size * 0.95, W, size * 1.9);
    addGlow(ctx, W / 2, this.y, size * 4 * a, scaleC(this.color, 0.35));
    drawText(ctx, this.title, size, W / 2, this.y - (this.sub ? size * 0.16 : 0), { color: this.color, ow: Math.max(3, size * 0.06), outline: [40, 10, 0], alpha: a, scale: Math.max(0.01, sc) });
    if (this.sub) drawText(ctx, this.sub, size * 0.42 * subFit, W / 2, this.y + size * 0.6, { ow: 3, alpha: a });
  }
}

/* Smokey stands in the hero zone the whole time; he howls and fires bolts when a feature calls for it. */
class SmokeyActor {
  constructor() { this.active = true; this.t = 0; this.howling = 0; this.rings = []; this.excite = 0; this.x = 140; this.y = 270; }
  enter() {}
  mouth() { return [150, HERO_Y + 130]; }
  update(dt, present) { this.t += dt; this.excite += ((present ? 1 : 0) - this.excite) * Math.min(1, dt * 6); this.howling = Math.max(0, this.howling - dt); this.rings.forEach((r) => (r[2] += dt)); this.rings = this.rings.filter((r) => r[2] < 1); }
  howl(s = 1.8) { this.howling = s; }
  ring() { const [mx, my] = this.mouth(); this.rings.push([mx, my, 0]); }
  draw(ctx, art) {
    const howl = this.howling > 0, breath = 1 + Math.sin(this.t * 1.8) * 0.006 + this.excite * 0.03, S = 268;
    addGlow(ctx, 150, HERO_Y + 110, 180 + 30 * this.excite, [70 + 60 * this.excite, 40 + 30 * this.excite, 10], 0.9);
    ctx.save(); ctx.translate(150, HERO_Y + 134); ctx.rotate(howl ? -(0.04 + Math.sin(this.t * 14) * 0.01) : Math.sin(this.t * 1.1) * 0.012); if (howl) ctx.translate(0, 8);
    ctx.drawImage(howl ? art.hero.howl : art.hero.idle, -S / 2 * breath, -S / 2 * breath, S * breath, S * breath); ctx.restore();
    for (const [rx, ry, age] of this.rings) { ctx.strokeStyle = rgb([255, 160, 40], 1 - age); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(rx + age * 40, ry - age * 40, 20 + age * 190, 0, 6.283); ctx.stroke(); }
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.cfg = loadConfig(); this.engine = new Engine(this.cfg, new RNG());
    this.art = new Art(); this.reels = Array.from({ length: 5 }, (_, i) => new Reel(i));
    this.particles = new Particles(); this.bolts = []; this.banners = []; this.toasts = [];
    this.smokey = new SmokeyActor(); this.smokeyPresent = false;
    this.audio = new GameAudio(this.cfg.general.music_volume, this.cfg.general.sfx_volume);
    this.embers = new Embers(); this.flashes = [];
    this.t = 0; this.dt = 0.016; this.state = "title"; this.flow = null; this.skip = false; this.timers = [];
    this.shake = 0; this.flash = 0; this.theme = "base"; this.prevTheme = "base"; this.themeMix = 1; this.auto = false; this.autoTimer = 0;
    this.forceNext = null; this.helpOpen = false; this.quitArmed = 0; this.mouse = [0, 0];
    this.balance = 0; this.winDisp = 0;
    const z = () => ({ spins: 0, wagered: 0, won: 0, biggest: 0, orb_bonuses: 0, free_games: 0, jackpots: 0, meter_bonuses: 0, wheel_spins: 0 });
    this.stats = z(); this.session = z(); this.best = []; this.bestFlash = -1; this.winLabel = ""; this.spinPress = null; this.meter = 0; this.meterDisp = 0; this.fliers = []; this.potDisp = 0; this.potCountDisp = 0; this.wheel = null;
    this.loadBets(); this.loadSave();
    this.spinBet = this.betCredits; this.spinLevel = this.levelIdx; this.spinDenom = this.denomCents;
    this.ctxInfo = { grid: null, orbCount: 0, tCount: 0 };
    this.hlCells = new Set(); this.hlLine = null; this.cycle = []; this.cycleI = 0; this.cycleT = 0;
    this.sticky = new Set(); this.stickyBorn = {}; this.hold = null; this.holdSpinning = new Set(); this.respinsDisp = 3; this.fgInfo = null;
    this.meterDisp = this.meter; this.makeBackgrounds(); this.initIdleGrid(); this.buildButtons();
    this.admin = new Admin(this);
    this.bindInput(); this.resize(); window.addEventListener("resize", () => this.resize());
  }
  /* ------------------------------------------------------------------ setup */
  loadBets() {
    const b = this.cfg.bet;
    this.denoms = b.denominations.map((d) => Math.max(1, Math.round(Number(d) * 100)));
    this.levels = b.power_levels.map((l) => Math.max(1, Math.floor(l)));
  }
  loadSave() {
    const g = this.cfg.general, sd = Math.round(g.start_denom * 100);
    this.denomIdx = Math.max(0, this.denoms.indexOf(sd));
    this.levelIdx = Math.max(0, Math.min(this.levels.length - 1, Math.floor(g.start_power_level) - 1));
    this.balance = Math.round(g.starting_balance * 100);
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (d) {
        if (g.persist_balance && Number.isInteger(d.balance) && d.balance > 0) this.balance = d.balance;
        if (this.denoms.includes(d.denom)) this.denomIdx = this.denoms.indexOf(d.denom);
        if (Number.isInteger(d.level)) this.levelIdx = Math.max(0, Math.min(this.levels.length - 1, d.level));
        for (const k of Object.keys(this.stats)) if (d.stats && typeof d.stats[k] === "number") this.stats[k] = d.stats[k];
        if (Number.isFinite(d.meter) && d.meter >= 0) this.meter = Math.floor(d.meter);
        if (Array.isArray(d.best)) this.best = d.best.filter((v) => Number.isFinite(v)).slice(0, 5);
      }
    } catch (e) {}
  }
  saveState() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ balance: this.balance, denom: this.denomCents, level: this.levelIdx, stats: this.stats, meter: this.meter, best: this.best })); } catch (e) {} }
  applyConfig(cfg) {
    this.cfg = cfg; this.engine = new Engine(cfg, new RNG());
    const old = this.denomCents; this.loadBets();
    this.denomIdx = this.denoms.includes(old) ? this.denoms.indexOf(old) : Math.min(this.denomIdx, this.denoms.length - 1);
    this.levelIdx = Math.min(this.levelIdx, this.levels.length - 1);
    this.audio.setVolumes(cfg.general.music_volume, cfg.general.sfx_volume);
    saveConfig(cfg); this.toast("SETTINGS SAVED");
  }
  resetBankroll() { this.balance = Math.round(this.cfg.general.starting_balance * 100); this.saveState(); this.toast("BANKROLL RESET"); }
  resetStats() { for (const d of [this.stats, this.session]) for (const k of Object.keys(d)) d[k] = 0; this.saveState(); }
  initIdleGrid() {
    const g = this.engine.naturalGrid("base");
    this.reels.forEach((r, i) => { const o = {}; for (let k = 0; k < ROWS; k++) if (g[i][k] === "ORB") o[k] = this.engine.newOrb(); r.setIdle(g[i], o); });
  }
  makeBackgrounds() {
    this.bgs = {};
    const themes = { base: [[34, 12, 56], [6, 3, 14], ORANGE], orb: [[6, 26, 62], [3, 4, 16], [90, 170, 255]], free: [[84, 28, 0], [18, 4, 0], [255, 180, 50]] };
    for (const [name, [top, bot, acc]] of Object.entries(themes)) {
      const c = mkCanvas(W, H), x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot)); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.07; x.drawImage(this.art.powerTBig, W / 2 - 300, H / 2 - 250, 600, 600); x.globalAlpha = 1;
      for (let i = -6; i < 24; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) {
        const y0 = H - 110 + j * 24, sk = (3 - j) * 20 + 40; x.fillStyle = rgb(acc, (14 + j * 5) / 255);
        x.beginPath(); x.moveTo(i * 80 - sk, y0 + 30); x.lineTo(i * 80 + 80 - sk, y0 + 30); x.lineTo(i * 80 + 80 - sk * 0.8, y0); x.lineTo(i * 80 - sk * 0.8, y0); x.closePath(); x.fill();
      }
      const v = x.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
      x.fillStyle = v; x.fillRect(0, 0, W, H);
      this.bgs[name] = { canvas: c, acc };
    }
  }
  resize() {
    const dpr = window.devicePixelRatio || 1, cssW = Math.min(window.innerWidth, window.innerHeight * W / H);
    const k = Math.max(1, Math.min(2, cssW * dpr / W));
    this.canvas.width = Math.round(W * k); this.canvas.height = Math.round(H * k); this.k = k;
  }
  /* -------------------------------------------------------------- bet helpers */
  get denomCents() { return this.denoms[this.denomIdx]; }
  get betCredits() { return this.levels[this.levelIdx]; }
  get cost() { return this.betCredits * this.denomCents; }
  denomLabel(c = this.denomCents) { return c < 100 ? `${c}¢` : `$${c / 100}`; }
  canAfford() { return this.balance >= this.cost; }
  broke() { return this.balance < Math.min(...this.levels) * Math.min(...this.denoms); }
  changeDenom(d) { if (this.state !== "idle") return; this.denomIdx = (this.denomIdx + d + this.denoms.length) % this.denoms.length; this.sfx("click"); }
  changeLevel(d) { if (this.state !== "idle") return; this.levelIdx = Math.max(0, Math.min(this.levels.length - 1, this.levelIdx + d)); this.sfx("click"); }
  maxBet() { if (this.state !== "idle") return; for (let i = this.levels.length - 1; i >= 0; i--) if (this.levels[i] * this.denomCents <= this.balance) { this.levelIdx = i; break; } this.sfx("click"); }
  /* ---------------------------------------------------------------- utilities */
  sfx(n, v = 1, p = 0) { this.audio.play(n, v, p); }
  music(k) { this.audio.setMusic(k); }
  setTheme(t) { if (t !== this.theme) { this.prevTheme = this.theme; this.theme = t; this.themeMix = 0; } }
  later(d, fn) { this.timers.push([d, fn]); }
  toast(text, secs = 2.2) { this.toasts.push([text, secs]); }
  banner(title, sub, color, life, size, y) { const b = new Banner(title, sub, color, life, size, y); this.banners.push(b); return b; }
  shakeScreen(a) { this.shake = Math.max(this.shake, a); }
  consumeSkip() { const s = this.skip; this.skip = false; return s; }
  *sleep(secs, skippable = false) { let t = 0; while (t < secs) { if (skippable && this.consumeSkip()) return; yield; t += this.dt; } }
  *until(fn) { while (!fn()) yield; }
  pay(credits) { const c = Math.floor(credits) * this.spinDenom; this.balance += c; for (const d of [this.stats, this.session]) d.won += c; }
  noteRoundWin(credits) {
    const c = Math.floor(credits) * this.spinDenom; for (const d of [this.stats, this.session]) d.biggest = Math.max(d.biggest, c);
    if (c > 0 && (this.best.length < 5 || c > this.best[this.best.length - 1])) { this.best.push(c); this.best.sort((a, b) => b - a); this.best = this.best.slice(0, 5); this.bestFlash = this.best.indexOf(c); setTimeout(() => { this.bestFlash = -1; }, 4000); }
  }
  xpInfo() { const w = this.stats.wagered / 100, level = 1 + Math.floor(Math.sqrt(w / 20)), lo = 20 * (level - 1) ** 2, hi = 20 * level * level; return { level, frac: (w - lo) / (hi - lo) }; }
  orbCents(orb) { return this.engine.orbCredits(orb, this.spinBet, this.spinLevel) * this.spinDenom; }
  bump(k) { this.stats[k]++; this.session[k]++; }
  /* --------------------------------------------------------------------- spin */
  startSpin() {
    if (this.state !== "idle") return false;
    if (this.broke()) { this.sfx("buzz"); return false; }
    if (!this.canAfford()) { this.toast("NOT ENOUGH FUNDS - LOWER YOUR BET"); this.sfx("buzz"); return false; }
    this.state = "busy"; this.flow = this.flowSpin(); this.skip = false; return true;
  }
  *flowSpin() {
    const cost = this.cost;
    this.balance -= cost; this.spinBet = this.betCredits; this.spinLevel = this.levelIdx; this.spinDenom = this.denomCents;
    for (const d of [this.stats, this.session]) { d.spins++; d.wagered += cost; }
    this.winDisp = 0; this.hlCells = new Set(); this.hlLine = null; this.cycle = [];
    this.sfx("spin");
    const res = this.engine.spinBase(this.spinBet, this.spinLevel, this.forceNext); this.forceNext = null;
    yield* this.reelSpin(res.grid, res.orbs);
    let roundTotal = 0;
    yield* this.collectCheckers(res.grid);
    if (res.totalCredits) { yield* this.presentWins(res, this.spinBet, true); this.pay(res.totalCredits); roundTotal += res.totalCredits; }
    if (res.trigger === "power_t") roundTotal += yield* this.flowFreeGames(res);
    else if (res.trigger === "orb") roundTotal += yield* this.flowOrbLink(res.orbs, false);
    roundTotal += yield* this.flowMeterBonus();
    this.lastWinCents = roundTotal * this.spinDenom; this.noteRoundWin(roundTotal); this.saveState(); this.state = "idle"; this.autoTimer = 0;
  }
  *reelSpin(grid, orbs) {
    const turbo = this.cfg.general.turbo_spin, speed = turbo ? 40 : 30;
    this.ctxInfo = { grid, orbs, orbCount: 0, tCount: 0 };
    const freeMode = !!this.fgInfo;
    for (const r of this.reels) { r.start(speed, freeMode); yield* this.sleep(turbo ? 0.01 : 0.035); }
    this.audio.spinLoop(true);
    let quick = false; for (let t = 0; t < (turbo ? 0.1 : 0.4) && !quick; t += this.dt) { quick = this.consumeSkip(); yield; }
    const gap = turbo ? 0.07 : 0.2; let oSeen = 0, tSeen = 0, wSeen = 0;
    for (let i = 0; i < 5; i++) {
      const remaining = 5 - i, needO = 6 - oSeen;
      if ((oSeen >= 3 && needO > 0 && needO <= remaining) || (tSeen === 2 && remaining >= 1) || (freeMode && wSeen === 2 && remaining >= 1)) {
        for (let k = i; k < 5; k++) this.reels[k].anticipate = true;
        this.sfx("thunder", 0.35); if (!quick) yield* this.sleep(turbo ? 0.5 : 1.1, true);
      }
      const col = grid[i], omap = {};
      for (let r = 0; r < ROWS; r++) if (orbs[pk([i, r])]) omap[r] = orbs[pk([i, r])];
      if (!quick && this.consumeSkip()) quick = true;
      this.reels[i].requestStop(col, omap, turbo, quick); this.reels[i].anticipate = false;
      oSeen += Object.keys(omap).length; tSeen += col.filter((s) => s === "POWERT").length; wSeen += col.filter((s) => s === "WHEEL").length;
      if (!quick) { for (let t = 0; t < gap && !quick; t += this.dt) { quick = this.consumeSkip(); yield; } }
    }
    yield* this.until(() => this.reels.every((r) => r.state === "idle"));
    this.audio.spinLoop(false);
  }
  onLand(i) {
    this.sfx("stop" + i, 0.9, (i - 2) * 0.25);
    const grid = this.ctxInfo.grid; if (!grid) return;
    for (let r = 0; r < ROWS; r++) {
      const s = grid[i][r], [cx, cy] = cellCenter(i, r);
      if (s === "ORB") {
        const k = this.ctxInfo.orbCount++; this.later(0.03 + 0.05 * r, () => this.sfx("orb" + Math.min(k, 14)));
        this.particles.burst(cx, cy, 22, [255, 170, 40], 260, 0.8, 4, 200); this.shakeScreen(3);
      } else if (s === "POWERT") {
        const k = this.ctxInfo.tCount++; this.later(0.04, () => this.sfx("tland" + Math.min(k, 4)));
        this.particles.burst(cx, cy, 36, WHITE, 340, 0.9, 4, 100); this.particles.burst(cx, cy, 30, ORANGE, 300, 0.9, 5, 100);
        this.shakeScreen(7); this.flash = Math.max(this.flash, 0.25);
      } else if (s === "WHEEL") {
        this.later(0.04, () => this.sfx("boost")); this.particles.burst(cx, cy, 30, [255, 215, 110], 320, 0.9, 5, 100); this.particles.burst(cx, cy, 20, [175, 80, 245], 280, 0.9, 4, 100); this.shakeScreen(6);
      } else if (s === "WILD") this.particles.burst(cx, cy, 12, [255, 240, 120], 220, 0.6, 3, 50);
    }
  }
  tierFor(ratio) { for (const [th, name, col] of TIERS) if (ratio >= th) return [name, col]; return [null, null]; }
  *presentWins(res, bet, cycle) {
    const credits = res.totalCredits, cells = new Set();
    res.lineWins.forEach((lw) => lw.cells.forEach((c) => cells.add(pk(c))));
    if (res.scatterCredits) res.tCells.forEach((c) => cells.add(pk(c)));
    this.hlCells = cells;
    const ratio = credits / Math.max(1, bet), [name, col] = this.tierFor(ratio), level = ratio < 5 ? 0 : ratio < 15 ? 1 : ratio < 150 ? 2 : 3;
    this.sfx("fanfare" + level, level < 2 ? 0.7 : 0.9);
    if (name) { this.banner(name, money(credits * this.spinDenom), col, Math.min(6, 1.8 + Math.sqrt(ratio) * 0.22), level >= 2 ? 96 : 76); this.shakeScreen(6 + level * 3); }
    yield* this.countUp(credits, ratio, ratio >= 15);
    if (cycle && res.lineWins.length) { this.cycle = res.lineWins.slice(); this.cycleI = -1; this.cycleT = 99; } else this.hlCells = new Set();
  }
  *countUp(amount, ratio, coins = false, dur = null) {
    const start = this.winDisp, end = start + amount;
    dur = dur !== null ? dur : Math.min(5.5, 0.45 + Math.pow(ratio, 0.62) * 0.33);
    if (this.cfg.general.turbo_spin) dur *= 0.5;
    let t = 0, tick = 0, n = 0;
    while (t < dur) {
      if (this.consumeSkip()) break;
      t += this.dt; this.winDisp = start + (end - start) * Math.pow(Math.min(1, t / dur), 0.85);
      tick -= this.dt; if (tick <= 0) { this.sfx("coin" + (n % 5), 0.5); n++; tick = 0.075; if (coins) this.particles.coins(W / 2, 560, 3, 500); }
      yield;
    }
    this.winDisp = end;
  }
  /* ------------------------------------------------------- end-zone checker meter */
  *collectCheckers(grid) {
    const col = this.cfg.collect;
    if (!col.enabled || this.fgInfo) return;
    const cells = []; for (let c = 0; c < 5; c++) for (let r = 0; r < ROWS; r++) if (grid[c][r] === "CHECKER") cells.push([c, r]);
    if (!cells.length) return;
    this.meter += cells.length; let n = 0;
    cells.forEach((p, i) => {
      const [x, y] = cellCenter(p[0], p[1]);
      this.later(i * 0.07, () => this.fliers.push({ x0: x, y0: y, x1: POT_POS[0], y1: POT_POS[1], t: 0, dur: 0.75, kind: "checker", done: () => {
        this.meterDisp = Math.min(this.meter, this.meterDisp + 1); this.sfx("coin" + (n++ % 5), 0.35); this.particles.burst(POT_POS[0], POT_POS[1], 4, [255, 160, 40], 120, 0.4, 3, 0); } }));
    });
    yield* this.sleep(cells.length * 0.07 + 0.85);
    yield* this.until(() => this.fliers.length === 0);
    this.meterDisp = this.meter;
  }
  *flowMeterBonus() {
    const col = this.cfg.collect; let total = 0;
    while (col.enabled && this.meter >= col.target) {
      this.meter = col.carry_over ? this.meter - col.target : 0;
      this.bump("meter_bonuses");
      const pick = col.bonus === "random" ? (Math.random() < 0.5 ? "free_games" : "orb_link") : col.bonus;
      this.sfx("trigger"); this.flash = 0.7; this.shakeScreen(12);
      for (let i = 0; i < 4; i++) this.randomBolt([255, 190, 80]);
      this.banner("END ZONE BONUS!", `${col.target} CHECKERBOARDS COLLECTED`, [255, 170, 60], 3.2, 88);
      for (let i = 0; i < 8; i++) { this.particles.burst(rint(GX, GX + 576), rint(GY, GY + 560), 18, i % 2 ? WHITE : ORANGE, 280, 0.9, 4, 150); }
      yield* this.sleep(0.8);
      while (this.meterDisp > this.meter) { this.meterDisp = Math.max(this.meter, this.meterDisp - Math.max(2, col.target / 60)); yield; }
      this.meterDisp = this.meter; yield* this.sleep(2.2);
      if (pick === "orb_link") total += yield* this.flowOrbLink(this.engine.makeOrbTrigger(this.spinBet, this.spinLevel).orbs, false);
      else total += yield* this.flowFreeGames({ freeSpinsAwarded: Math.max(1, Math.floor(col.bonus_spins)), tCells: [], meter: true });
    }
    return total;
  }
  /* ----------------------------------------------- free-games orb pot + jackpot wheel */
  *collectPot(list) {
    const denom = this.spinDenom;
    list.forEach(([p, orb, cr], i) => {
      this.later(i * 0.17, () => {
        const [x, y] = cellCenter(p[0], p[1]);
        this.fliers.push({ x0: x, y0: y, x1: POT_POS[0], y1: POT_POS[1], t: 0, dur: 0.8, kind: "orb", orbKind: orb.kind, label: money(cr * denom, true), done: () => {
          this.potDisp += cr; this.potCountDisp++; this.sfx("coin" + (this.potCountDisp % 5), 0.6); this.sfx("boost", 0.25);
          this.particles.burst(POT_POS[0], POT_POS[1], 12, GOLD, 220, 0.6, 4, 100); } });
      });
    });
    yield* this.sleep(list.length * 0.17 + 0.95);
    yield* this.until(() => this.fliers.length === 0);
  }
  *payPot(fg) {
    const bet = this.spinBet, total = fg.potTotal, ratio = total / Math.max(1, bet);
    this.banner("ORB POT", `${fg.potCount} ORBS  =  ${money(total * this.spinDenom)}`, [255, 215, 90], 3.4, 96);
    this.sfx(ratio >= 50 ? "fanfare3" : ratio >= 15 ? "fanfare2" : "fanfare1"); this.flash = 0.5; this.shakeScreen(10);
    this.particles.coins(W / 2, 640, 50, 900);
    const start = this.winDisp; this.potDisp = total;
    yield* this.countUp(total, ratio, true, Math.min(4, 1 + Math.sqrt(ratio) * 0.25));
    this.winDisp = start + total; this.pay(total);
    yield* this.sleep(1.8, true);
  }
  *flowWheel(fg) {
    const bet = this.spinBet, level = this.spinLevel, spin = this.engine.spinWheel(bet, level), credits = fg.wheelWin(spin);
    const n = spin.layout.length, seg = Math.PI * 2 / n;
    const W_ = this.wheel = { layout: spin.layout, angle: 0, scale: 0, hl: -1, kind: null, flick: 0, bulbs: 0 };
    this.bump("wheel_spins");
    this.sfx("trigger", 0.8); this.flash = 0.5; this.hlCells = new Set();
    this.banner("JACKPOT WHEEL", "JACKPOTS ONLY  -  MINI  MINOR  MAJOR  GRAND", [255, 215, 110], 2.4, 70, 200);
    for (let t = 0; t < 0.5; t += this.dt) { W_.scale = easeOutBack(Math.min(1, t / 0.5), 1.4); yield; }
    W_.scale = 1; yield* this.sleep(1.2);
    const turns = 5 + rint(0, 2), final = turns * Math.PI * 2 - spin.index * seg + (Math.random() * 0.7 - 0.35) * seg, dur = 6.0;
    let t = 0, last = 0; this.sfx("spin");
    while (t < dur) {
      if (this.consumeSkip()) t = dur - 0.001;
      t += this.dt; const u = Math.min(1, t / dur), e = 1 - Math.pow(1 - u, 3.2);
      W_.angle = final * e; const pegs = Math.floor((W_.angle + seg / 2) / seg);
      if (pegs !== last) { last = pegs; W_.flick = 1; this.sfx("tick", Math.min(0.8, 0.25 + 0.6 * (1 - u))); }
      yield;
    }
    W_.angle = final; W_.hl = spin.index; W_.kind = spin.kind;
    const col = ORB_COLORS[spin.kind][1];
    this.sfx(spin.kind === "grand" || spin.kind === "major" ? "fanfare3" : "fanfare2"); this.sfx("thunder", 0.5);
    this.flash = 0.8; this.shakeScreen(spin.kind === "grand" ? 18 : 10); for (let i = 0; i < 5; i++) this.randomBolt(scaleC(col, 1.1));
    this.banner(spin.kind.toUpperCase() + " JACKPOT!", money(credits * this.spinDenom), col, 3.6, 84, 220);
    this.particles.coins(W / 2, 640, 70, 1000); this.bump("jackpots");
    this.pay(credits); fg.addWin(credits); this.winDisp = fg.totalCredits;
    yield* this.sleep(4.0, true);
    for (let tt = 0; tt < 0.4; tt += this.dt) { W_.scale = 1 - tt / 0.4; yield; }
    this.wheel = null;
  }
  /* ----------------------------------------------------------------- orb link */
  holdTotal() { let t = 0; if (this.hold) for (const d of Object.values(this.hold)) t += this.engine.orbCredits(d.orb, this.spinBet, this.spinLevel); return t; }
  *flowOrbLink(orbs, inFree) {
    const bet = this.spinBet, level = this.spinLevel, hs = this.engine.startHoldAndSpin(orbs, bet, level);
    this.bump("orb_bonuses");
    this.sfx("trigger"); this.setTheme("orb"); this.music("orb");
    this.banner("SMOKEY'S ORB LINK", "ORBS LOCK IN  -  FILL THE BOARD FOR THE GRAND JACKPOT", [120, 200, 255], 3.2, 80);
    this.flash = 0.6; this.shakeScreen(10); for (let i = 0; i < 4; i++) this.randomBolt();
    yield* this.sleep(1.4);
    this.hold = {}; this.holdSpinning = new Set(); this.respinsDisp = hs.respinsTotal; this.hlCells = new Set(); this.hlLine = null; this.cycle = [];
    const order = Object.keys(orbs).map(Number).sort((a, b) => a - b);
    for (let k = 0; k < order.length; k++) {
      const key = order[k]; this.hold[key] = { orb: orbs[key].copy(), born: this.t, flash: 0.5 };
      this.sfx("orb" + Math.min(k, 14)); const [cx, cy] = cellCenter(...unpk(key)); this.particles.burst(cx, cy, 20, [150, 210, 255], 260, 0.7, 4, 100);
      yield* this.sleep(0.16);
    }
    yield* this.sleep(0.6); this.winDisp = this.holdTotal();
    if (hs.introSmokey) yield* this.playSmokey(hs.introSmokey);
    while (!hs.done) {
      const empties = hs.emptyCells(), res = hs.step();
      this.holdSpinning = new Set(empties.map(pk)); this.audio.spinLoop(true);
      yield* this.sleep(this.cfg.general.turbo_spin ? 0.5 : 0.95);
      const landed = new Map(res.newOrbs.map(([p, o]) => [pk(p), o]));
      for (const p of empties.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
        const key = pk(p); this.holdSpinning.delete(key);
        if (landed.has(key)) {
          const o = landed.get(key); this.hold[key] = { orb: o.copy(), born: this.t, flash: 0.5 };
          this.sfx("orb" + Math.min(Object.keys(this.hold).length - 1, 14)); const [cx, cy] = cellCenter(p[0], p[1]);
          this.particles.burst(cx, cy, 26, [150, 210, 255], 300, 0.8, 4, 100); this.shakeScreen(4);
          if (o.kind !== "cash") this.boltAt(p);
          this.winDisp = this.holdTotal();
        } else this.sfx("tick", 0.25);
        if (!this.holdSpinning.size) this.audio.spinLoop(false);
        yield* this.sleep(0.07);
      }
      this.audio.spinLoop(false);
      if (res.newOrbs.length) { this.respinsDisp = hs.respinsTotal; this.toast("RESPINS RESET", 1.0); } else this.respinsDisp = res.respinsLeft;
      yield* this.sleep(0.35);
      if (res.smokey) yield* this.playSmokey(res.smokey);
      this.respinsDisp = hs.respinsLeft; this.winDisp = this.holdTotal();
      yield* this.sleep(0.25);
    }
    yield* this.sleep(0.5);
    const full = hs.count() >= 15;
    yield* this.collectOrbs(hs, full);
    const total = hs.total(); this.winDisp = total;
    const ratio = total / Math.max(1, bet), [, col] = this.tierFor(ratio);
    this.banner("ORB LINK TOTAL", money(total * this.spinDenom), col || [120, 200, 255], 2.8, 84);
    this.sfx(ratio >= 50 ? "fanfare3" : ratio >= 15 ? "fanfare2" : "fanfare1");
    this.particles.coins(W / 2, 600, 40, 700); this.shakeScreen(8);
    yield* this.sleep(2.6, true);
    this.pay(total); this.hold = null; this.holdSpinning = new Set(); this.smokeyPresent = false;
    if (!inFree) { this.setTheme("base"); this.music("base"); } else { this.setTheme("free"); this.music("free"); }
    return total;
  }
  *collectOrbs(hs, full) {
    const order = Object.keys(this.hold).map(Number).sort((a, b) => a - b), step = Math.max(0.05, Math.min(0.28, 3.2 / Math.max(1, order.length)));
    let running = 0; this.winDisp = 0;
    for (let k = 0; k < order.length; k++) {
      const key = order[k], d = this.hold[key], v = this.engine.orbCredits(d.orb, this.spinBet, this.spinLevel);
      running += v; d.flash = 1; this.winDisp = running;
      const [cx, cy] = cellCenter(...unpk(key)); this.particles.burst(cx, cy, 14, GOLD, 240, 0.7, 4, 400);
      if (d.orb.kind === "cash") this.sfx("coin" + Math.min(4, Math.floor(k / 3)), 0.7);
      else {
        this.sfx("fanfare1", 0.8); this.sfx("thunder", 0.5);
        this.banner(d.orb.kind.toUpperCase() + " JACKPOT!", money(v * this.spinDenom), ORB_COLORS[d.orb.kind][1], 1.8, 76);
        this.shakeScreen(10); this.bump("jackpots"); yield* this.sleep(1.0);
      }
      yield* this.sleep(step);
    }
    if (full && this.cfg.orbs.fill_board_grand) {
      const v = hs.grandBonus(); running += v;
      this.sfx("fanfare3"); this.sfx("thunder");
      this.banner("GRAND JACKPOT!", "THE BOARD IS FULL  " + money(v * this.spinDenom), [255, 70, 70], 4.5, 100);
      this.flash = 1; this.shakeScreen(16); for (let i = 0; i < 8; i++) this.randomBolt(); this.bump("jackpots");
      for (let i = 0; i < 10; i++) { this.particles.coins(W / 2, 620, 10, 900); yield* this.sleep(0.12); }
      this.winDisp = running; yield* this.sleep(1.5);
    }
  }
  *playSmokey(ev) {
    const s = this.smokey; s.enter(); this.smokeyPresent = true; this.sfx("bark");
    const title = { howl: "SMOKEY HOWLS!", fetch: "SMOKEY FETCHES!", super: "SUPER HOWL!" }[ev.action];
    const sub = { howl: "ORBS GET POWERED UP", fetch: "NEW ORBS FOR THE BOARD", super: "EVERY ORB LEVELS UP" }[ev.action];
    yield* this.sleep(0.55); s.howl(2.2); this.sfx("howl"); s.ring();
    this.banner(title, sub, [255, 190, 80], 2.4, 56, 250);
    yield* this.sleep(0.5); s.ring(); yield* this.sleep(0.5);
    const mouth = s.mouth();
    if (ev.action === "fetch") {
      for (const [p, orb] of ev.newOrbs) {
        const key = pk(p); this.hold[key] = { orb: orb.copy(), born: this.t, flash: 0.8 };
        this.bolts.push(new Bolt(mouth, cellCenter(p[0], p[1]), 0.4, [255, 190, 80], 5)); this.sfx("zap"); this.sfx("orb" + Math.min(Object.keys(this.hold).length - 1, 14));
        const [cx, cy] = cellCenter(p[0], p[1]); this.particles.burst(cx, cy, 28, [255, 210, 90], 300, 0.8, 4, 100); this.winDisp = this.holdTotal();
        yield* this.sleep(0.4);
      }
    } else {
      for (const [p, , after] of ev.boosted) {
        const key = pk(p), d = this.hold[key];
        this.bolts.push(new Bolt(mouth, cellCenter(p[0], p[1]), 0.45, [255, 190, 80], 6)); this.sfx("zap"); yield* this.sleep(0.18);
        if (d) { d.orb = after.copy(); d.born = this.t; d.flash = 1; }
        this.sfx("boost"); const [cx, cy] = cellCenter(p[0], p[1]); this.particles.burst(cx, cy, 34, [255, 220, 100], 360, 0.9, 5, 200);
        this.winDisp = this.holdTotal(); this.shakeScreen(5); yield* this.sleep(0.32);
      }
    }
    yield* this.sleep(0.5); this.smokeyPresent = false; yield* this.sleep(0.35);
  }
  /* --------------------------------------------------------------- free games */
  *flowFreeGames(res) {
    const bet = this.spinBet, level = this.spinLevel, fg = this.engine.startFreeGames(res.freeSpinsAwarded, bet, level), cfgFg = this.cfg.free_games;
    this.bump("free_games"); this.sfx("trigger"); this.setTheme("free"); this.music("free");
    this.hlCells = new Set(res.tCells.map(pk)); this.flash = 0.7; this.shakeScreen(12); for (let i = 0; i < 5; i++) this.randomBolt([255, 220, 120]);
    this.banner(res.meter ? "END ZONE FREE GAMES" : "POWER T FREE GAMES", `${res.freeSpinsAwarded} FREE GAMES AWARDED` + (cfgFg.collect_orbs ? "  -  ORBS BUILD THE ORB POT" : ""), [255, 190, 60], 3.6, res.meter ? 76 : 84);
    this.particles.coins(W / 2, 640, 40, 900); yield* this.sleep(3.2);
    this.hlCells = new Set(); this.cycle = []; this.winDisp = 0; this.potDisp = 0; this.potCountDisp = 0; this.fliers = [];
    let totalSpins = res.freeSpinsAwarded;
    this.fgInfo = { left: fg.spinsLeft, total: totalSpins, mult: fg.multiplier(), win: 0 };
    while (!fg.done) {
      this.fgInfo.left = fg.spinsLeft; this.fgInfo.total = totalSpins; this.fgInfo.mult = fg.multiplier();
      yield* this.sleep(0.45);
      const r = fg.playSpin();
      if (r.newSticky.length) yield* this.dropSticky(r.newSticky);
      this.fgInfo.left = fg.spinsLeft - (r.trigger === "power_t" ? r.freeSpinsAwarded : 0); this.fgInfo.mult = r.multiplier;
      yield* this.reelSpin(r.grid, r.orbs);
      if (r.potOrbs.length) {                                    // every orb that lands drops into the pot
        this.hlCells = new Set(r.potOrbs.map(([p]) => pk(p)));
        yield* this.collectPot(r.potOrbs); this.hlCells = new Set();
      }
      if (r.totalCredits) {
        this.hlCells = new Set(); r.lineWins.forEach((lw) => lw.cells.forEach((c) => this.hlCells.add(pk(c)))); if (r.scatterCredits) r.tCells.forEach((c) => this.hlCells.add(pk(c)));
        const ratio = r.totalCredits / bet, lvl = ratio < 5 ? 0 : ratio < 15 ? 1 : 2; this.sfx("fanfare" + lvl, 0.6);
        const [name, col] = this.tierFor(ratio); if (name) this.banner(name, money(r.totalCredits * this.spinDenom), col, 2.0, 70);
        if (r.multiplier > 1) this.toast(`x${r.multiplier} MULTIPLIER!`, 1.6);
        yield* this.countUp(r.totalCredits, ratio, ratio >= 15, Math.min(2.0, 0.4 + Math.sqrt(ratio) * 0.2)); yield* this.sleep(0.25, true); this.hlCells = new Set();
      }
      if (r.totalCredits) this.pay(r.totalCredits);
      this.winDisp = fg.totalCredits - (r.trigger === "orb" ? 0 : 0);
      if (r.trigger === "power_t") {
        this.hlCells = new Set(r.tCells.map(pk)); this.sfx("trigger", 0.8);
        this.banner(`+${r.freeSpinsAwarded} FREE GAMES`, "POWER T RETRIGGER!", [255, 220, 100], 2.6, 76);
        totalSpins += r.freeSpinsAwarded; this.flash = 0.5; this.shakeScreen(10); this.fgInfo.total = totalSpins; yield* this.sleep(2.2); this.hlCells = new Set();
      } else if (r.trigger === "wheel") {
        this.hlCells = new Set(); for (let c = 0; c < 5; c++) for (let rr = 0; rr < ROWS; rr++) if (r.grid[c][rr] === "WHEEL") this.hlCells.add(pk([c, rr]));
        this.sfx("trigger", 0.7); this.flash = 0.5; this.shakeScreen(10); yield* this.sleep(1.4);
        this.hlCells = new Set();
        for (let k = 0; k < r.wheelSpins; k++) yield* this.flowWheel(fg);
      } else if (r.trigger === "orb") {
        let v = yield* this.flowOrbLink(r.orbs, true);
        if (cfgFg.multiplier_on_orbs && r.multiplier > 1) { const extra = v * (r.multiplier - 1); this.pay(extra); v += extra; }
        fg.addWin(v); this.winDisp = fg.totalCredits; this.setTheme("free");
      }
      this.fgInfo.left = fg.spinsLeft; this.fgInfo.win = fg.totalCredits; this.winDisp = fg.totalCredits; this.sticky = new Set(fg.sticky);
    }
    if (fg.potTotal > 0) yield* this.payPot(fg);                 // the whole pot pays at the end
    const total = fg.finalTotal(), ratio = total / Math.max(1, bet), [, col] = this.tierFor(ratio);
    this.banner("FREE GAMES COMPLETE", `TOTAL WIN  ${money(total * this.spinDenom)}`, col || [255, 190, 60], 3.4, 78);
    this.sfx(ratio >= 50 ? "fanfare3" : "fanfare2"); this.particles.coins(W / 2, 640, 50, 900);
    yield* this.sleep(3.2, true);
    this.sticky = new Set(); this.fgInfo = null; this.potDisp = 0; this.potCountDisp = 0; this.setTheme("base"); this.music("base");
    return total;
  }
  *dropSticky(positions) {
    const s = this.smokey; s.enter(); this.smokeyPresent = true; this.sfx("bark"); yield* this.sleep(0.5);
    s.howl(1.6); this.sfx("howl", 0.8); s.ring();
    this.banner("SMOKEY'S WILDS!", "STICKY WILDS FOR THE REST OF THE ROUND", [255, 200, 80], 2.0, 50, 250); yield* this.sleep(0.6);
    const mouth = s.mouth();
    for (const p of positions) {
      this.bolts.push(new Bolt(mouth, cellCenter(p[0], p[1]), 0.4, [255, 190, 80], 6)); this.sfx("zap");
      this.sticky.add(pk(p)); this.stickyBorn[pk(p)] = this.t; const [cx, cy] = cellCenter(p[0], p[1]);
      this.particles.burst(cx, cy, 30, [255, 240, 130], 320, 0.8, 5, 150); this.shakeScreen(5); yield* this.sleep(0.4);
    }
    yield* this.sleep(0.4); this.smokeyPresent = false; yield* this.sleep(0.3);
  }
  randomBolt(color = [150, 210, 255]) { this.bolts.push(new Bolt([rint(60, 660), 0], [rint(80, 640), rint(400, 980)], 0.5, color, 6)); this.sfx("zap", 0.4); }
  boltAt(p) { const c = cellCenter(p[0], p[1]); this.bolts.push(new Bolt([c[0] + rint(-80, 80), 0], c, 0.4, [255, 190, 80], 5)); }
  /* ------------------------------------------------------------------- update */
  update(dt) {
    this.dt = dt; this.t += dt;
    if (this.themeMix < 1) this.themeMix = Math.min(1, this.themeMix + dt / 1.1);
    this.reels.forEach((r, i) => { if (r.update(dt)) this.onLand(i); });
    this.timers.forEach((tm) => (tm[0] -= dt));
    const due = this.timers.filter((tm) => tm[0] <= 0); this.timers = this.timers.filter((tm) => tm[0] > 0); due.forEach((tm) => tm[1]());
    if (this.flow) { try { if (this.flow.next().done) this.flow = null; } catch (e) { console.error(e); this.flow = null; this.state = "idle"; this.hold = null; this.audio.spinLoop(false); this.toast("ERROR - SEE CONSOLE"); } }
    this.particles.update(dt); this.bolts.forEach((b) => b.update(dt)); this.bolts = this.bolts.filter((b) => b.life > 0);
    this.banners.forEach((b) => (b.life -= dt)); this.banners = this.banners.filter((b) => b.life > 0);
    this.toasts.forEach((t) => (t[1] -= dt)); this.toasts = this.toasts.filter((t) => t[1] > 0);
    this.smokey.update(dt, this.smokeyPresent);
    if (this.spinPress && !this.spinPress.fired && performance.now() - this.spinPress.t > 600) { this.spinPress.fired = true; if (this.state === "idle" || this.auto) this.toggleAuto(); else this.onSpinButton(); }
    for (const f of this.fliers) { f.t += dt; if (f.t >= f.dur && !f.fired) { f.fired = true; f.done && f.done(); } }
    this.fliers = this.fliers.filter((f) => f.t < f.dur);
    if (this.wheel) { this.wheel.flick = Math.max(0, this.wheel.flick - dt * 6); this.wheel.bulbs += dt; }
    this.shake = Math.max(0, this.shake - dt * 30); this.flash = Math.max(0, this.flash - dt * 1.6); this.quitArmed = Math.max(0, this.quitArmed - dt);
    if (this.hold) for (const d of Object.values(this.hold)) d.flash = Math.max(0, d.flash - dt * 2.2);
    if (this.state === "idle") this.updateIdle(dt);
  }
  updateIdle(dt) {
    if (this.cycle.length) {
      this.cycleT += dt;
      if (this.cycleT > 1.1) { this.cycleT = 0; this.cycleI = (this.cycleI + 1) % this.cycle.length; this.hlLine = this.cycle[this.cycleI]; this.hlCells = new Set(this.hlLine.cells.map(pk)); }
    }
    if (this.auto) {
      if (this.broke() || !this.canAfford()) { this.auto = false; this.toast("AUTO SPIN STOPPED"); }
      else { this.autoTimer += dt; if (this.autoTimer > (this.cfg.general.turbo_spin ? 0.35 : 0.9)) this.startSpin(); }
    }
  }
  /* -------------------------------------------------------------------- input */
  buildButtons() {
    const idle = () => this.state === "idle", on = () => true;
    this.buttons = [
      { r: [568, 8, 34, 34], label: "", icon: "music", fn: () => this.toggleMusic(), kind: "icon", en: on }, { r: [606, 8, 34, 34], label: "", icon: "sound", fn: () => this.toggleSfx(), kind: "icon", en: on },
      { r: [644, 8, 34, 34], label: "", icon: "help", fn: () => (this.helpOpen = !this.helpOpen), kind: "icon", en: on }, { r: [682, 8, 34, 34], label: "", icon: "gear", fn: () => this.openAdmin(), kind: "icon", en: idle },
      { r: [14, 1076, 92, 56], label: "DENOM", fn: () => this.changeDenom(1), kind: "chip", en: idle },
      { r: [114, 1080, 48, 48], label: "-", fn: () => this.changeLevel(-1), kind: "round", en: idle }, { r: [310, 1080, 48, 48], label: "+", fn: () => this.changeLevel(1), kind: "round", en: idle },
      { r: [368, 1068, 196, 68], label: "SPIN", fn: () => this.onSpinButton(), kind: "spin", en: on, hold: true },
      { r: [574, 1072, 72, 28], label: "MAX BET", fn: () => this.maxBet(), kind: "small", en: idle }, { r: [574, 1104, 72, 28], label: "AUTO", fn: () => this.toggleAuto(), kind: "small", en: on },
      { r: [652, 1072, 58, 60], label: "TURBO", fn: () => { this.cfg.general.turbo_spin = !this.cfg.general.turbo_spin; this.toast("TURBO " + (this.cfg.general.turbo_spin ? "ON" : "OFF"), 1); }, kind: "small", en: on },
    ];
  }
  onSpinButton() { if (this.state === "idle") this.startSpin(); else if (this.state === "busy") this.skip = true; }
  toggleAuto() { this.auto = !this.auto; this.autoTimer = 0; this.toast("AUTO SPIN " + (this.auto ? "ON" : "OFF"), 1); }
  toggleMusic() { this.toast("MUSIC " + (this.audio.toggleMusic() ? "OFF" : "ON"), 1); }
  toggleSfx() { this.toast("SOUND " + (this.audio.toggleSfx() ? "OFF" : "ON"), 1); }
  openAdmin() { if (this.state === "idle") this.admin.open(); }
  toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
  toLogical(e) { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
  bindInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => { e.preventDefault(); this.audio.unlock(); if (e.button === 0 || e.pointerType !== "mouse") this.onPress(this.toLogical(e)); });
    c.addEventListener("pointerup", (e) => this.onRelease());
    c.addEventListener("pointercancel", () => { this.spinPress = null; });
    c.addEventListener("pointermove", (e) => { this.mouse = this.toLogical(e); });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => { if (this.state === "admin" || e.ctrlKey || e.metaKey || e.altKey) return; this.audio.unlock(); if (this.onKey(e)) e.preventDefault(); });
  }
  /* The SPIN button: tap = spin / stop, hold = toggle auto play. Everything else fires on press. */
  onPress(p) {
    const b = this.state === "admin" || this.state === "title" || this.helpOpen ? null : this.buttons.find((q) => q.hold && p[0] >= q.r[0] && p[0] <= q.r[0] + q.r[2] && p[1] >= q.r[1] && p[1] <= q.r[1] + q.r[3]);
    if (b) { this.spinPress = { t: performance.now(), fired: false }; return; }
    this.onClick(p);
  }
  onRelease() { const sp = this.spinPress; this.spinPress = null; if (sp && !sp.fired) this.onSpinButton(); }
  onClick(p) {
    if (this.state === "admin") return;
    if (this.state === "title") { this.state = "idle"; this.music("base"); this.sfx("click"); return; }
    if (this.helpOpen) { this.helpOpen = false; return; }
    let hit = false;
    for (const b of this.buttons) if (p[0] >= b.r[0] && p[0] <= b.r[0] + b.r[2] && p[1] >= b.r[1] && p[1] <= b.r[1] + b.r[3] && b.en()) { b.fn(); hit = true; break; }
    if (!hit && this.state === "busy") this.skip = true;
    if (!hit && this.state === "idle" && this.broke()) this.resetBankroll();
  }
  onKey(e) {
    const k = e.key;
    if (this.state === "title") { if (["Shift", "Control", "Alt", "Meta"].includes(k)) return false; this.state = "idle"; this.music("base"); this.sfx("click"); return true; }
    if (this.helpOpen && (k === "Escape" || k === "h" || k === "H")) { this.helpOpen = false; return true; }
    switch (k) {
      case " ": case "Enter": this.onSpinButton(); return true;
      case "ArrowUp": this.changeLevel(1); return true; case "ArrowDown": this.changeLevel(-1); return true;
      case "ArrowRight": this.changeDenom(1); return true; case "ArrowLeft": this.changeDenom(-1); return true;
      case "a": case "A": this.toggleAuto(); return true; case "b": case "B": this.maxBet(); return true;
      case "m": case "M": this.toggleMusic(); return true; case "s": case "S": this.toggleSfx(); return true;
      case "h": case "H": this.helpOpen = !this.helpOpen; return true; case "F11": this.toggleFullscreen(); return true; case "F1": this.openAdmin(); return true;
      case "r": case "R": if (this.state === "idle" && this.broke()) this.resetBankroll(); return true;
      case "Escape": if (this.state === "idle") { if (this.quitArmed > 0) this.toggleFullscreen(); else { this.quitArmed = 2; this.toast("PRESS ESC AGAIN FOR FULLSCREEN", 2); } } return true;
    }
    return false;
  }
  /* ---------------------------------------------------------------------- loop */
  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (this.state === "admin") { this.t += dt; this.dt = dt; } else this.update(dt);
      this.draw(); requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.addEventListener("beforeunload", () => this.saveState());
  }
}
