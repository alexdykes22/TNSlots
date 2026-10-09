/* VOLS POWER LINK - game state machine, flows and rendering (port of tnslots/game.py + ui.py). */
"use strict";
const TIERS = [[500, "LEGENDARY WIN", [255, 80, 60]], [150, "EPIC WIN", [255, 60, 200]], [50, "MEGA WIN", [255, 200, 40]], [15, "BIG WIN", ORANGE], [5, "NICE WIN", [255, 170, 80]]];
const FILLER = ["J", "Q", "K", "A", "CHECKER", "FOOTBALL", "HELMET", "TROPHY", "SMOKEY", "WILD", "POWERT", "ORB", "J", "Q", "K", "A"];
const FILLER_FREE = FILLER.concat(["WHEEL", "WHEEL", "WHEEL"]);
const POT_POS = [120, 207];                     // where meter / pot flights land (left card)
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
    this.idx = idx; this.x = GX + idx * PITCH; this.L = 40;
    this.strip = Array.from({ length: this.L }, () => FILLER[rint(0, FILLER.length - 1)]);
    this.pos = rint(0, this.L - 1); this.state = "idle"; this.speed = 24; this.orbAt = {}; this.t = 0; this.dur = 0.7; this.p0 = this.p1 = 0; this.anticipate = false;
  }
  setIdle(syms, orbs) {
    const P = Math.floor(this.pos); this.orbAt = {};
    for (let r = 0; r < 3; r++) { const j = (((P - r) % this.L) + this.L) % this.L; this.strip[j] = syms[r]; if (orbs && orbs[r]) this.orbAt[j] = orbs[r]; }
    this.pos = P;
  }
  start(speed, free = false) {
    this.state = "spinning"; this.speed = speed;
    const P = Math.floor(this.pos), keep = new Set(), pool = free ? FILLER_FREE : FILLER;
    for (let k = 0; k < 4; k++) keep.add((((P + 1 - k) % this.L) + this.L) % this.L);
    for (let j = 0; j < this.L; j++) if (!keep.has(j)) this.strip[j] = pool[rint(0, pool.length - 1)];
    this.orbAt = {}; this.anticipate = false;
  }
  requestStop(syms, orbs, turbo) {
    const P = Math.ceil(this.pos) + 5; this.orbAt = {};
    for (let r = 0; r < 3; r++) { const j = (((P - r) % this.L) + this.L) % this.L; this.strip[j] = syms[r]; if (orbs[r]) this.orbAt[j] = orbs[r]; }
    this.p0 = this.pos; this.p1 = P; this.dur = turbo ? 0.42 : 0.72; this.t = 0; this.state = "stopping";
  }
  update(dt) {
    if (this.state === "spinning") this.pos += this.speed * dt;
    else if (this.state === "stopping") {
      this.t += dt; const u = Math.min(1, this.t / this.dur);
      this.pos = this.p0 + (this.p1 - this.p0) * easeOutBack(u, 1.15);
      if (u >= 1) { this.pos = ((this.p1 % this.L) + this.L) % this.L; this.state = "idle"; this.anticipate = false; return true; }
    }
    return false;
  }
  moving() { return this.state === "spinning" || (this.state === "stopping" && this.t < this.dur * 0.55); }
  draw(ctx, game) {
    ctx.save(); ctx.beginPath(); ctx.rect(this.x, GY, CELL, 3 * PITCH - GAP); ctx.clip();
    const P = Math.floor(this.pos), frac = this.pos - P, blur = this.moving();
    for (let off = 0; off < 4; off++) {
      const j = P + 1 - off, jj = ((j % this.L) + this.L) % this.L, y = GY + (off - 1 + frac) * PITCH, sym = this.strip[jj];
      if (sym === "ORB" && !blur) game.drawOrb(ctx, this.orbAt[jj] || null, this.x + CELL / 2, y + CELL / 2, { slotAt: [this.x, y] });
      else ctx.drawImage(blur ? game.art.blur[sym] : game.art.sym[sym], this.x, Math.round(y), CELL, CELL);
    }
    ctx.restore();
  }
}

class Banner {
  constructor(title, sub = "", color = ORANGE, life = 2.4, size = 84, y = 300) { this.title = title; this.sub = sub; this.color = color; this.life = this.max = life; this.size = size; this.y = y; }
  draw(ctx, t) {
    const age = this.max - this.life, a = Math.max(0, Math.min(Math.min(1, age / 0.25), Math.min(1, this.life / 0.4)));
    const sc = easeOutBack(Math.min(1, age / 0.35), 1.7) * (1 + 0.015 * Math.sin(t * 9));
    ctx.fillStyle = `rgba(0,0,0,${0.65 * a})`; ctx.fillRect(0, this.y - this.size * 0.95, W, this.size * 1.9);
    addGlow(ctx, W / 2, this.y, this.size * 5 * a, scaleC(this.color, 0.35));
    drawText(ctx, this.title, this.size, W / 2, this.y - (this.sub ? 14 : 0), { color: this.color, ow: 5, outline: [40, 10, 0], alpha: a, scale: Math.max(0.01, sc) });
    if (this.sub) drawText(ctx, this.sub, this.size * 0.42, W / 2, this.y + this.size * 0.6, { ow: 3, alpha: a });
  }
}

class SmokeyActor {
  constructor(art) { this.art = art; this.active = false; this.t = 0; this.x = -300; this.targetX = 118; this.y = 420; this.howling = 0; this.rings = []; }
  enter() { this.active = true; }
  update(dt, present) {
    this.t += dt; this.x += ((present ? this.targetX : -320) - this.x) * Math.min(1, dt * 7);
    this.howling = Math.max(0, this.howling - dt);
    this.rings.forEach((r) => (r[2] += dt)); this.rings = this.rings.filter((r) => r[2] < 1);
    if (!present && this.x < -280) this.active = false;
  }
  howl(s = 1.8) { this.howling = s; }
  ring() { this.rings.push([this.x + 60, this.y - 80, 0]); }
  draw(ctx, idle = false) {
    if (!this.active && !idle) return;
    const x = idle ? 118 : this.x, y = (idle ? 410 : this.y) + Math.sin(this.t * 2.2) * 4, howl = this.howling > 0;
    addGlow(ctx, x, y, 190, [60, 40, 10], 0.8);
    ctx.save(); ctx.translate(x, y); if (howl) ctx.rotate(-(14 + Math.sin(this.t * 14) * 2) * Math.PI / 180);
    const sc = howl ? 1.06 : 1; ctx.drawImage(howl ? this.art.smokey.howl : this.art.smokey.idle, -130 * sc, -130 * sc, 260 * sc, 260 * sc); ctx.restore();
    for (const [rx, ry, age] of this.rings) { ctx.strokeStyle = rgb([255, 160, 40], 1 - age); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(rx + age * 60, ry - age * 50, 30 + age * 260, 0, 6.283); ctx.stroke(); }
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.cfg = loadConfig(); this.engine = new Engine(this.cfg, new RNG());
    this.art = new Art(); this.reels = Array.from({ length: 5 }, (_, i) => new Reel(i));
    this.particles = new Particles(); this.bolts = []; this.banners = []; this.toasts = [];
    this.smokey = new SmokeyActor(this.art); this.smokeyPresent = false;
    this.audio = new GameAudio(this.cfg.general.music_volume, this.cfg.general.sfx_volume);
    this.embers = new Embers(); this.flashes = [];
    this.t = 0; this.dt = 0.016; this.state = "title"; this.flow = null; this.skip = false; this.timers = [];
    this.shake = 0; this.flash = 0; this.theme = "base"; this.prevTheme = "base"; this.themeMix = 1; this.auto = false; this.autoTimer = 0;
    this.forceNext = null; this.helpOpen = false; this.quitArmed = 0; this.mouse = [0, 0];
    this.balance = 0; this.winDisp = 0;
    const z = () => ({ spins: 0, wagered: 0, won: 0, biggest: 0, orb_bonuses: 0, free_games: 0, jackpots: 0, meter_bonuses: 0, wheel_spins: 0 });
    this.stats = z(); this.session = z(); this.meter = 0; this.meterDisp = 0; this.fliers = []; this.potDisp = 0; this.potCountDisp = 0; this.wheel = null;
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
      }
    } catch (e) {}
  }
  saveState() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ balance: this.balance, denom: this.denomCents, level: this.levelIdx, stats: this.stats, meter: this.meter })); } catch (e) {} }
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
    this.reels.forEach((r, i) => { const o = {}; for (let k = 0; k < 3; k++) if (g[i][k] === "ORB") o[k] = this.engine.newOrb(); r.setIdle(g[i], o); });
  }
  makeBackgrounds() {
    this.bgs = {};
    const themes = { base: [[34, 12, 56], [6, 3, 14], ORANGE], orb: [[6, 26, 62], [3, 4, 16], [90, 170, 255]], free: [[84, 28, 0], [18, 4, 0], [255, 180, 50]] };
    for (const [name, [top, bot, acc]] of Object.entries(themes)) {
      const c = mkCanvas(W, H), x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot)); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.09; x.drawImage(this.art.powerTBig, W / 2 - 310, 70, 620, 620); x.globalAlpha = 1;
      for (let i = -6; i < 24; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) {
        const y0 = H - 150 + j * 30, sk = (3 - j) * 20 + 40; x.fillStyle = rgb(acc, (14 + j * 5) / 255);
        x.beginPath(); x.moveTo(i * 80 - sk, y0 + 30); x.lineTo(i * 80 + 80 - sk, y0 + 30); x.lineTo(i * 80 + 80 - sk * 0.8, y0); x.lineTo(i * 80 - sk * 0.8, y0); x.closePath(); x.fill();
      }
      const v = x.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
      x.fillStyle = v; x.fillRect(0, 0, W, H);
      this.bgs[name] = { canvas: c, acc };
    }
  }
  resize() {
    const dpr = window.devicePixelRatio || 1, cssW = Math.min(window.innerWidth, window.innerHeight * 16 / 9);
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
  noteRoundWin(credits) { const c = Math.floor(credits) * this.spinDenom; for (const d of [this.stats, this.session]) d.biggest = Math.max(d.biggest, c); }
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
    this.noteRoundWin(roundTotal); this.saveState(); this.state = "idle"; this.autoTimer = 0;
  }
  *reelSpin(grid, orbs) {
    const turbo = this.cfg.general.turbo_spin, speed = turbo ? 34 : 24;
    this.ctxInfo = { grid, orbs, orbCount: 0, tCount: 0 };
    const freeMode = !!this.fgInfo;
    for (const r of this.reels) { r.start(speed, freeMode); yield* this.sleep(turbo ? 0.01 : 0.04); }
    this.audio.spinLoop(true);
    yield* this.sleep(turbo ? 0.15 : 0.5);
    const gap = turbo ? 0.11 : 0.32; let oSeen = 0, tSeen = 0, wSeen = 0;
    for (let i = 0; i < 5; i++) {
      const remaining = 5 - i, needO = 6 - oSeen;
      if ((oSeen >= 3 && needO > 0 && needO <= remaining) || (tSeen === 2 && remaining >= 1) || (freeMode && wSeen === 2 && remaining >= 1)) {
        for (let k = i; k < 5; k++) this.reels[k].anticipate = true;
        this.sfx("thunder", 0.35); yield* this.sleep(turbo ? 0.5 : 1.2);
      }
      const col = grid[i], omap = {};
      for (let r = 0; r < 3; r++) if (orbs[pk([i, r])]) omap[r] = orbs[pk([i, r])];
      this.reels[i].requestStop(col, omap, turbo); this.reels[i].anticipate = false;
      oSeen += Object.keys(omap).length; tSeen += col.filter((s) => s === "POWERT").length; wSeen += col.filter((s) => s === "WHEEL").length;
      yield* this.sleep(gap);
    }
    yield* this.until(() => this.reels.every((r) => r.state === "idle"));
    this.audio.spinLoop(false);
  }
  onLand(i) {
    this.sfx("stop" + i, 0.9, (i - 2) * 0.25);
    const grid = this.ctxInfo.grid; if (!grid) return;
    for (let r = 0; r < 3; r++) {
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
    const cells = []; for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) if (grid[c][r] === "CHECKER") cells.push([c, r]);
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
      for (let i = 0; i < 8; i++) { this.particles.burst(rint(250, 1030), rint(200, 560), 18, i % 2 ? WHITE : ORANGE, 280, 0.9, 4, 150); }
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
    this.banner("JACKPOT WHEEL", "JACKPOTS ONLY  -  MINI  MINOR  MAJOR  GRAND", [255, 215, 110], 2.4, 84, 120);
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
    this.banner(spin.kind.toUpperCase() + " JACKPOT!", money(credits * this.spinDenom), col, 3.6, 96, 130);
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
    this.banner(title, sub, [255, 190, 80], 2.4, 70, 170);
    yield* this.sleep(0.5); s.ring(); yield* this.sleep(0.5);
    const mouth = [s.x + 40, s.y - 60];
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
        this.hlCells = new Set(); for (let c = 0; c < 5; c++) for (let rr = 0; rr < 3; rr++) if (r.grid[c][rr] === "WHEEL") this.hlCells.add(pk([c, rr]));
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
    this.banner("SMOKEY'S WILDS!", "STICKY WILDS FOR THE REST OF THE ROUND", [255, 200, 80], 2.0, 62, 170); yield* this.sleep(0.6);
    const mouth = [s.x + 40, s.y - 60];
    for (const p of positions) {
      this.bolts.push(new Bolt(mouth, cellCenter(p[0], p[1]), 0.4, [255, 190, 80], 6)); this.sfx("zap");
      this.sticky.add(pk(p)); this.stickyBorn[pk(p)] = this.t; const [cx, cy] = cellCenter(p[0], p[1]);
      this.particles.burst(cx, cy, 30, [255, 240, 130], 320, 0.8, 5, 150); this.shakeScreen(5); yield* this.sleep(0.4);
    }
    yield* this.sleep(0.4); this.smokeyPresent = false; yield* this.sleep(0.3);
  }
  randomBolt(color = [150, 210, 255]) { this.bolts.push(new Bolt([rint(100, 1180), 0], [rint(100, 1180), rint(300, 640)], 0.5, color, 6)); this.sfx("zap", 0.4); }
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
      { r: [228, 664, 26, 36], label: "<", fn: () => this.changeDenom(-1), kind: "arrow", en: idle }, { r: [372, 664, 26, 36], label: ">", fn: () => this.changeDenom(1), kind: "arrow", en: idle },
      { r: [414, 664, 26, 36], label: "<", fn: () => this.changeLevel(-1), kind: "arrow", en: idle }, { r: [552, 664, 26, 36], label: ">", fn: () => this.changeLevel(1), kind: "arrow", en: idle },
      { r: [582, 622, 116, 98], label: "SPIN", fn: () => this.onSpinButton(), kind: "spin", en: on },
      { r: [1088, 636, 78, 30], label: "AUTO", fn: () => this.toggleAuto(), kind: "small", en: on }, { r: [1174, 636, 86, 30], label: "MAX BET", fn: () => this.maxBet(), kind: "small", en: idle },
      { r: [1088, 676, 78, 30], label: "MUSIC", fn: () => this.toggleMusic(), kind: "small", en: on }, { r: [1174, 676, 86, 30], label: "SOUND", fn: () => this.toggleSfx(), kind: "small", en: on },
      { r: [1218, 6, 56, 22], label: "ADMIN", fn: () => this.openAdmin(), kind: "tiny", en: idle }, { r: [1156, 6, 56, 22], label: "HELP", fn: () => (this.helpOpen = !this.helpOpen), kind: "tiny", en: on },
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
    c.addEventListener("pointerdown", (e) => { e.preventDefault(); this.audio.unlock(); if (e.button === 0 || e.pointerType !== "mouse") this.onClick(this.toLogical(e)); });
    c.addEventListener("pointermove", (e) => { this.mouse = this.toLogical(e); });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => { if (this.state === "admin" || e.ctrlKey || e.metaKey || e.altKey) return; this.audio.unlock(); if (this.onKey(e)) e.preventDefault(); });
  }
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
  /* --------------------------------------------------------------------- draw */
  drawOrb(ctx, orb, cx, cy, o = {}) {
    const scale = o.scale || 1, kind = orb ? orb.kind : "cash";
    if (o.slotAt) ctx.drawImage(this.art.empty, o.slotAt[0], o.slotAt[1], CELL, CELL);
    addGlow(ctx, cx, cy, CELL * 0.62 * scale, scaleC(ORB_COLORS[kind][1], 0.28));
    const sz = CELL * scale; ctx.drawImage(this.art.orb[kind], cx - sz / 2, cy - sz / 2, sz, sz);
    if (orb) {
      const cents = o.cents !== undefined ? o.cents : this.orbCents(orb);
      if (kind === "cash") { const label = money(cents, true); drawText(ctx, label, (label.length <= 6 ? 30 : label.length <= 7 ? 26 : 22) * scale, cx, cy, { ow: 3, outline: [70, 25, 0] }); }
      else { drawText(ctx, kind.toUpperCase(), 26 * scale, cx, cy - 8 * scale, { ow: 3, outline: [30, 0, 40] }); drawText(ctx, money(cents, true), 18 * scale, cx, cy + 16 * scale, { color: [255, 240, 180], ow: 2, outline: [30, 0, 40] }); }
    }
    if (o.flash > 0) addGlow(ctx, cx, cy, CELL * 0.8, [255, 255, 255], 0.9 * Math.min(1, o.flash));
  }
  draw() {
    const ctx = this.ctx; ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    this.drawBackground(ctx);
    if (this.state === "title") this.drawTitle(ctx);
    else {
      this.drawTitleBar(ctx); this.drawJackpots(ctx); this.drawSidePanels(ctx); this.drawReelFrame(ctx);
      if (this.hold) this.drawHold(ctx);
      else { this.reels.forEach((r) => r.draw(ctx, this)); this.drawSticky(ctx); this.drawHighlights(ctx); this.drawAnticipation(ctx); }
      this.drawFliers(ctx); if (this.wheel) this.drawWheel(ctx);
      this.smokey.draw(ctx); this.bolts.forEach((b) => b.draw(ctx)); this.particles.draw(ctx);
      this.drawHud(ctx); this.banners.forEach((b) => b.draw(ctx, this.t)); this.drawToasts(ctx);
      if (this.flash > 0) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,255,220,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      if (this.broke() && this.state === "idle") this.drawBroke(ctx);
      if (this.helpOpen) this.drawHelp(ctx);
    }
    ctx.restore();
  }
  drawBackground(ctx) {
    const bg = this.bgs[this.theme], prev = this.bgs[this.prevTheme];
    if (this.themeMix < 1) { ctx.drawImage(prev.canvas, 0, 0); ctx.globalAlpha = this.themeMix; ctx.drawImage(bg.canvas, 0, 0); ctx.globalAlpha = 1; } else ctx.drawImage(bg.canvas, 0, 0);
    const intensity = this.state === "busy" && this.theme !== "base" ? 1.4 : 1, beam = this.art.beams[this.theme][0].canvas;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const x = 150 + i * 245 + Math.sin(this.t * 0.5 + i * 1.7) * 70, ang = Math.sin(this.t * 0.37 + i * 2.1) * 26;
      ctx.save(); ctx.translate(x, 0); ctx.rotate(ang * Math.PI / 180); ctx.globalAlpha = Math.min(1, (0.6 + 0.3 * Math.sin(this.t * 1.3 + i)) * intensity); ctx.drawImage(beam, -150, 0, 300, 560 * 1.15); ctx.restore();
      addGlow(ctx, x, 8, 60, scaleC(bg.acc, 0.8), 0.9);
    }
    ctx.restore();
    this.embers.update(this.dt, 0.6 + intensity); this.embers.draw(ctx, bg.acc);
    if (Math.random() < 0.08 * intensity) this.flashes.push([Math.random() < 0.5 ? rint(10, 230) : rint(1050, 1270), rint(300, 640), 0.18]);
    for (const f of this.flashes) { f[2] -= this.dt; const a = Math.max(0, f[2] / 0.18); addGlow(ctx, f[0], f[1], 16, [255 * a, 255 * a, 230 * a], 1); }
    this.flashes = this.flashes.filter((f) => f[2] > 0);
  }
  drawTitle(ctx) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 250, W, 210);
    ctx.drawImage(this.art.powerTOutline, W / 2 - 100, 40, 200, 200);
    drawText(ctx, "VOLS POWER LINK", 110, W / 2, 330, { color: ORANGE, ow: 6, outline: [60, 20, 0], scale: 1 + 0.01 * Math.sin(this.t * 3) });
    drawText(ctx, "TENNESSEE EDITION  -  SMOKEY'S ORB LINK  &  POWER T FREE GAMES", 26, W / 2, 410);
    drawText(ctx, "CLICK OR PRESS ANY KEY TO PLAY", 34, W / 2, 560, { color: [255, 220, 160], alpha: (150 + 100 * Math.sin(this.t * 4)) / 255 });
    if (this.audio.enabled) drawText(ctx, this.audio.started ? (this.audio.ready ? "SOUND READY" : "SYNTHESISING SOUNDS...") : "SOUND STARTS AFTER YOUR FIRST CLICK", 18, W / 2, 640, { color: [150, 150, 170], outline: null });
  }
  drawTitleBar(ctx) { drawText(ctx, "VOLS POWER LINK", 38, W / 2, 30, { color: ORANGE, ow: 3, outline: [50, 18, 0] }); for (const sx of [W / 2 - 230, W / 2 + 230]) ctx.drawImage(this.art.powerTOutline, sx - 25, 5, 50, 50); }
  drawJackpots(ctx) {
    const pw = 188, x0 = (W - 4 * pw - 3 * 14) / 2;
    JACKPOTS.forEach((k, i) => {
      const x = x0 + i * (pw + 14), [hi, mid] = ORB_COLORS[k];
      fillRR(ctx, x, 62, pw, 60, 12, "rgb(10,6,20)", null); fillRR(ctx, x + 3, 65, pw - 6, 54, 10, rgb(scaleC(mid, 0.2)), null); fillRR(ctx, x + 1, 63, pw - 2, 58, 12, null, rgb(mid), 2);
      drawText(ctx, k.toUpperCase(), 17, x + pw / 2, 76, { color: hi }); drawText(ctx, money(this.engine.orbCredits(new Orb(k, 0), this.betCredits, this.levelIdx) * this.denomCents), 26, x + pw / 2, 101);
    });
  }
  drawReelFrame(ctx) {
    const x = GX - 16, y = GY - 14, w = 5 * CELL + 4 * GAP + 32, h = 3 * PITCH - GAP + 28, col = { base: ORANGE, orb: [110, 190, 255], free: [255, 200, 60] }[this.theme];
    addGlow(ctx, x + w / 2, y + h / 2, 560, scaleC(col, 0.2), 0.6);
    fillRR(ctx, x, y, w, h, 18, "rgb(6,3,12)", null);
    for (let i = 0; i < 5; i++) fillRR(ctx, GX + i * PITCH - 4, GY - 4, CELL + 8, 3 * PITCH - GAP + 8, 10, "rgb(20,12,34)", null);
    fillRR(ctx, x, y, w, h, 18, null, rgb(col), 4); fillRR(ctx, x - 5, y - 5, w + 10, h + 10, 22, null, rgb(scaleC(col, 0.5)), 2);
  }
  drawAnticipation(ctx) {
    for (const r of this.reels) if (r.anticipate) {
      const a = 0.5 + 0.5 * Math.sin(this.t * 14);
      fillRR(ctx, r.x - 5, GY - 5, CELL + 10, 3 * PITCH - GAP + 10, 8, null, rgb([255 * a, 190 * a, 60 * a]), 5);
      addGlow(ctx, r.x + CELL / 2, GY + 1.5 * PITCH, 280, [60 * a, 40 * a, 8 * a], 0.8);
    }
  }
  drawHighlights(ctx) {
    if (!this.hlCells.size) return;
    if (this.reels.every((r) => r.state === "idle") && (this.state === "idle" || this.winDisp > 0))
      for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) if (!this.hlCells.has(pk([c, r]))) { const [x, y] = cellPos(c, r); fillRR(ctx, x, y, CELL, CELL, 14, "rgba(0,0,0,0.59)", null); }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8);
    for (const key of this.hlCells) {
      const [c, r] = unpk(key), [x, y] = cellPos(c, r);
      fillRR(ctx, x - 3, y - 3, CELL + 6, CELL + 6, 14, null, rgb(scaleC([255, 200, 80], 0.6 + 0.4 * pulse)), 4); addGlow(ctx, x + CELL / 2, y + CELL / 2, 110, [60, 36, 6], 0.8);
    }
    if (this.hlLine && this.state === "idle") {
      const pts = PAYLINES[this.hlLine.line].map((row, c) => cellCenter(c, row));
      for (const [col, w] of [[[255, 235, 150], 5], [[255, 150, 30], 2]]) { ctx.strokeStyle = rgb(col); ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
      const lw = this.hlLine; drawText(ctx, `LINE ${lw.line + 1}  -  ${lw.count} x ${lw.symbol}  -  ${money(Math.round(lw.credits) * this.spinDenom)}`, 22, W / 2, GY + 3 * PITCH + 10, { color: [255, 235, 170], ow: 3 });
    }
  }
  drawSticky(ctx) {
    for (const key of this.sticky) {
      const [c, r] = unpk(key), [x, y] = cellPos(c, r), age = this.t - (this.stickyBorn[key] === undefined ? -9 : this.stickyBorn[key]);
      const sc = age < 0.35 ? easeOutBack(Math.min(1, age / 0.35)) : 1, sz = CELL * Math.max(0.05, sc);
      ctx.drawImage(this.art.sym.WILD, x + CELL / 2 - sz / 2, y + CELL / 2 - sz / 2, sz, sz);
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5 + c); fillRR(ctx, x - 2, y - 2, CELL + 4, CELL + 4, 14, null, rgb([255, 180 + 70 * pulse, 60]), 3); addGlow(ctx, x + CELL / 2, y + CELL / 2, 100, [60 * pulse, 40 * pulse, 4], 0.8);
    }
  }
  drawHold(ctx) {
    for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) {
      const key = pk([c, r]), [x, y] = cellPos(c, r), d = this.hold[key];
      ctx.drawImage(this.art.empty, x, y, CELL, CELL);
      if (d) { const age = this.t - d.born, sc = age < 0.4 ? easeOutBack(Math.min(1, age / 0.4), 2) : 1; this.drawOrb(ctx, d.orb, x + CELL / 2, y + CELL / 2, { scale: Math.max(0.1, sc), flash: d.flash }); }
      else if (this.holdSpinning.has(key)) {
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, CELL, CELL); ctx.clip(); ctx.strokeStyle = "rgb(60,90,140)"; ctx.lineWidth = 2;
        for (let k = -1; k < 4; k++) { const yy = y + ((this.t * 700 + k * 60 + c * 23 + r * 41) % 240) - 60; ctx.beginPath(); ctx.moveTo(x + 10, yy); ctx.lineTo(x + CELL - 10, yy); ctx.stroke(); }
        const ph = (this.t * 900 + c * 130 + r * 77) % 330 - 90; ctx.globalAlpha = 0.43; ctx.drawImage(this.art.blur.ORB, x, y + ph - 90, CELL, CELL); ctx.restore();
      } else { ctx.strokeStyle = "rgb(36,28,60)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 18, 0, 6.283); ctx.stroke(); }
    }
  }
  drawSidePanels(ctx) {
    if (!this.smokey.active) { this.smokey.draw(ctx, true); drawText(ctx, "SMOKEY", 26, 118, 568, { color: [200, 220, 255], ow: 3 }); }
    this.drawLeftCard(ctx);
    const px = 1058, py = 150, cx = px + 103;
    fillRR(ctx, px, py, 206, 420, 14, "rgb(10,6,20)", "rgb(90,56,20)", 2);
    const T = (s, sz, y, col = WHITE, o = {}) => drawText(ctx, s, sz, cx, py + y, Object.assign({ color: col }, o));
    if (this.hold) {
      T("ORB LINK", 30, 28, [140, 210, 255], { ow: 3 }); T("RESPINS", 20, 76);
      for (let i = 0; i < 3; i++) { const on = i < this.respinsDisp; ctx.fillStyle = on ? "rgb(255,190,60)" : "rgb(40,30,56)"; ctx.beginPath(); ctx.arc(cx - 50 + i * 50, py + 118, 17, 0, 6.283); ctx.fill(); ctx.strokeStyle = on ? "#fff" : "rgb(90,90,110)"; ctx.lineWidth = 2; ctx.stroke(); }
      T("ORBS", 20, 176); T(`${Object.keys(this.hold).length} / 15`, 34, 212, [255, 210, 120], { ow: 3 }); T("TOTAL", 20, 272);
      T(money(this.holdTotal() * this.spinDenom, true), 30, 308, GOLD, { ow: 3 }); T("FILL ALL 15 FOR", 15, 360, [200, 200, 220], { outline: null }); T("THE GRAND!", 22, 384, [255, 90, 90]);
    } else if (this.fgInfo) {
      const fi = this.fgInfo;
      T("FREE GAMES", 28, 28, [255, 200, 80], { ow: 3 }); T("SPINS LEFT", 18, 76); T(String(fi.left), 60, 124, WHITE, { ow: 4 }); T("MULTIPLIER", 18, 188);
      T(`x${fi.mult}`, 54, 232, [255, 160, 40], { ow: 4 }); T("ROUND WIN", 18, 292); T(money(Math.floor(this.winDisp) * this.spinDenom, true), 28, 328, GOLD, { ow: 3 });
      T("SMOKEY DROPS", 14, 376, [200, 200, 220], { outline: null }); T("STICKY WILDS!", 20, 398, [255, 220, 120]);
    } else {
      ctx.drawImage(this.art.sym.POWERT, cx - 42, py + 18, 84, 84); T("3 POWER T", 26, 122, [255, 200, 80], { ow: 3 }); T("FREE GAMES", 22, 148);
      ctx.drawImage(this.art.orb.cash, cx - 42, py + 188, 84, 84); T("6+ ORBS", 26, 292, [150, 210, 255], { ow: 3 }); T("ORB LINK", 22, 318);
      T("WIN UP TO", 15, 364, [200, 200, 220], { outline: null }); T(money(this.engine.orbCredits(new Orb("grand", 0), this.betCredits, this.levelIdx) * this.denomCents, true), 26, 390, [255, 90, 90], { ow: 3 });
    }
  }
  drawLeftCard(ctx) {
    const x = 12, y = 150, w = 216, h = 112, cx = x + w / 2;
    if (this.fgInfo && this.cfg.free_games.collect_orbs) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
      addGlow(ctx, cx, y + h / 2, 150, [70 + 30 * pulse, 50 + 20 * pulse, 6], 0.9);
      fillRR(ctx, x, y, w, h, 14, "rgb(24,14,4)", rgb([255, 190 + 40 * pulse, 60]), 3);
      drawText(ctx, "ORB POT", 24, cx, y + 20, { color: [255, 215, 90], ow: 3 });
      drawText(ctx, money(this.potDisp * this.spinDenom, true), 36, cx, y + 56, { ow: 4 });
      drawText(ctx, `${this.potCountDisp} ORB${this.potCountDisp === 1 ? "" : "S"} COLLECTED`, 14, cx, y + 88, { color: [255, 225, 160], outline: null });
      drawText(ctx, "PAYS AT THE END", 11, cx, y + 102, { color: [200, 190, 170], outline: null });
      return;
    }
    if (!this.cfg.collect.enabled) return;
    const target = Math.max(1, this.cfg.collect.target), frac = Math.min(1, this.meterDisp / target), near = frac > 0.85, pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    if (near) addGlow(ctx, cx, y + h / 2, 140, [60 * pulse, 34 * pulse, 4], 0.9);
    fillRR(ctx, x, y, w, h, 14, "rgb(10,6,20)", near ? rgb([255, 190, 60]) : "rgb(110,66,20)", 2);
    drawCheckerIcon(ctx, x + 12, y + 10, 22); drawText(ctx, "END ZONE METER", 15, x + 42, y + 21, { color: ORANGE, anchor: "left" });
    const bx = x + 12, by = y + 44, bw = w - 24, bh = 24;
    fillRR(ctx, bx, by, bw, bh, 8, "rgb(24,16,40)", "rgb(90,56,20)", 2);
    if (frac > 0) { const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, "rgb(255,150,0)"); g.addColorStop(1, near ? "rgb(255,240,150)" : "rgb(255,200,80)"); ctx.save(); rrect(ctx, bx + 2, by + 2, Math.max(8, (bw - 4) * frac), bh - 4, 6); ctx.fillStyle = g; ctx.fill(); ctx.restore(); }
    drawText(ctx, `${Math.floor(this.meterDisp)} / ${target}`, 22, cx, by + bh / 2 + 1, { ow: 3 });
    drawText(ctx, near ? "BONUS IS CLOSE!" : "COLLECT THE CHECKERBOARDS", 12, cx, y + 88, { color: near ? [255, 235, 140] : [190, 180, 210], outline: null });
    drawText(ctx, this.cfg.collect.bonus === "orb_link" ? "FOR AN ORB LINK" : this.cfg.collect.bonus === "random" ? "FOR A BONUS" : "FOR FREE GAMES", 11, cx, y + 102, { color: [160, 150, 185], outline: null });
  }
  drawFliers(ctx) {
    for (const f of this.fliers) {
      const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u), cx = (f.x0 + f.x1) / 2, cy = Math.min(f.y0, f.y1) - 90;
      const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * cx + e * e * f.x1, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * cy + e * e * f.y1;
      if (f.kind === "checker") { const s = 38 * (1 - 0.35 * e); addGlow(ctx, x, y, 34, [90, 50, 8], 0.9); drawCheckerIcon(ctx, x - s / 2, y - s / 2, s); }
      else {
        const s = 64 * (1 - 0.3 * e); addGlow(ctx, x, y, 50, scaleC(ORB_COLORS[f.orbKind][1], 0.4), 0.9); ctx.drawImage(this.art.orb[f.orbKind], x - s / 2, y - s / 2, s, s);
        drawText(ctx, f.label, 14, x, y, { ow: 2, outline: [60, 20, 0], alpha: 1 - e * 0.5 });
      }
    }
  }
  drawWheel(ctx) {
    const wh = this.wheel; ctx.fillStyle = `rgba(0,0,0,${0.8 * Math.min(1, wh.scale)})`; ctx.fillRect(0, 126, W, 500);
    const cx = W / 2, cy = 378, R = 226 * Math.max(0.01, wh.scale);
    addGlow(ctx, cx, cy, R * 1.6, [90, 60, 10], 0.9);
    ctx.fillStyle = "rgb(60,34,0)"; ctx.beginPath(); ctx.arc(cx, cy, R + 24, 0, 6.283); ctx.fill();
    const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R); rim.addColorStop(0, "rgb(255,236,150)"); rim.addColorStop(0.5, "rgb(205,140,20)"); rim.addColorStop(1, "rgb(255,220,110)");
    ctx.strokeStyle = rim; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, 6.283); ctx.stroke();
    drawWheelDisc(ctx, cx, cy, R, wh.layout, wh.angle, { labels: true });
    if (wh.hl >= 0) { const seg = Math.PI * 2 / wh.layout.length; ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(this.t * 14)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -Math.PI / 2 - seg / 2, -Math.PI / 2 + seg / 2); ctx.closePath(); ctx.fill(); ctx.restore(); }
    const nb = 28; for (let i = 0; i < nb; i++) { const a = i / nb * 6.283, on = (i + Math.floor(wh.bulbs * 8)) % 2 === 0; ctx.fillStyle = on ? "rgb(255,250,200)" : "rgb(150,100,20)"; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12), 4.5, 0, 6.283); ctx.fill(); if (on) addGlow(ctx, cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12), 14, [120, 90, 20], 0.8); }
    const hub = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 34); hub.addColorStop(0, "rgb(255,240,160)"); hub.addColorStop(1, "rgb(190,120,10)"); ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, 6.283); ctx.fill(); ctx.strokeStyle = "rgb(90,50,0)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.drawImage(this.art.powerTOutline, cx - 24, cy - 24, 48, 48);
    ctx.save(); ctx.translate(cx, cy - R - 16); ctx.rotate(-wh.flick * 0.35); ctx.fillStyle = "rgb(255,70,60)"; ctx.strokeStyle = "rgb(255,240,200)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, -22); ctx.lineTo(20, -22); ctx.lineTo(0, 30); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    if (wh.kind) { const i = JACKPOTS.indexOf(wh.kind), pw = 188, x0 = (W - 4 * pw - 3 * 14) / 2, x = x0 + i * (pw + 14); fillRR(ctx, x - 3, 59, pw + 6, 66, 14, null, rgb([255, 245, 200], 0.6 + 0.4 * Math.sin(this.t * 14)), 4); }
  }
  drawPanel(ctx, x, y, w, h, label, value, vs = 30, vc = WHITE) {
    fillRR(ctx, x, y, w, h, 10, "rgb(10,6,20)", "rgb(110,66,20)", 2); drawText(ctx, label, 15, x + w / 2, y + 15, { color: ORANGE }); drawText(ctx, value, vs, x + w / 2, y + 46, { color: vc, ow: 3 });
  }
  drawHud(ctx) {
    ctx.fillStyle = "rgb(8,5,16)"; ctx.fillRect(0, 628, W, 92); ctx.fillStyle = rgb(ORANGE); ctx.fillRect(0, 627, W, 3);
    this.drawPanel(ctx, 18, 640, 202, 68, "BALANCE", money(this.balance), 32);
    this.drawPanel(ctx, 224, 640, 178, 68, "DENOMINATION", this.denomLabel(), 32, [255, 210, 120]);
    this.drawPanel(ctx, 410, 640, 172, 68, `POWER LEVEL ${this.levelIdx + 1}`, `${this.betCredits} CR`, 30, [255, 170, 60]);
    this.drawPanel(ctx, 708, 640, 180, 68, "TOTAL BET", money(this.cost), 32);
    const wc = Math.floor(this.winDisp) * this.spinDenom; this.drawPanel(ctx, 896, 640, 186, 68, "WIN", money(wc), 32, wc ? GOLD : [120, 120, 140]);
    this.buttons.forEach((b) => this.drawButton(ctx, b));
  }
  drawButton(ctx, b) {
    const [x, y, w, h] = b.r, en = b.en(), hov = this.mouse[0] >= x && this.mouse[0] <= x + w && this.mouse[1] >= y && this.mouse[1] <= y + h;
    if (b.kind === "spin") {
      const cx = x + w / 2, cy = y + h / 2, pulse = 0.5 + 0.5 * Math.sin(this.t * 4), idle = this.state === "idle" && !this.broke();
      const col = idle ? [255, 120 + 50 * pulse, 0] : [110, 70, 30];
      if (idle) addGlow(ctx, cx, cy - 6, 90, [70 + 50 * pulse, 30 + 20 * pulse, 0], 0.9);
      ctx.fillStyle = "rgb(20,10,4)"; ctx.beginPath(); ctx.arc(cx, cy - 6, 56, 0, 6.283); ctx.fill();
      const g = ctx.createRadialGradient(cx, cy - 22, 4, cx, cy - 6, 52); g.addColorStop(0, rgb(scaleC(col, 1.35))); g.addColorStop(1, rgb(col)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - 6, 52, 0, 6.283); ctx.fill();
      ctx.strokeStyle = "rgb(255,235,200)"; ctx.lineWidth = 3; ctx.stroke();
      drawText(ctx, this.auto && this.state === "idle" ? "AUTO" : this.state === "idle" ? "SPIN" : this.state === "busy" ? "SKIP" : "...", 34, cx, cy - 6, { ow: 3, outline: [90, 30, 0] }); return;
    }
    if (b.kind === "tiny") { drawText(ctx, b.label, 13, x + w / 2, y + h / 2, { color: en ? [150, 140, 170] : [70, 70, 80], outline: null }); return; }
    let col = en ? (hov ? [110, 70, 130] : [60, 40, 90]) : [30, 24, 40];
    if (b.label === "AUTO" && this.auto) col = [200, 100, 0];
    if (b.label === "MUSIC" && this.audio.mutedMusic) col = [90, 20, 20]; if (b.label === "SOUND" && this.audio.mutedSfx) col = [90, 20, 20];
    fillRR(ctx, x, y, w, h, 8, rgb(col), en ? rgb(ORANGE) : "rgb(70,60,70)", 2); drawText(ctx, b.label, b.kind === "arrow" ? 20 : 15, x + w / 2, y + h / 2, { color: en ? WHITE : [110, 110, 120] });
  }
  drawToasts(ctx) { let y = 600; for (const [text, life] of this.toasts.slice(-3)) { drawText(ctx, text, 28, W / 2, y, { color: [255, 240, 200], ow: 3, alpha: Math.min(1, life / 0.4) }); y -= 34; } }
  drawBroke(ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, W, H); drawText(ctx, "OUT OF FUNDS", 90, W / 2, 290, { color: [255, 90, 60], ow: 5 });
    drawText(ctx, `CLICK OR PRESS R FOR A FRESH ${money(Math.round(this.cfg.general.starting_balance * 100))}`, 30, W / 2, 380);
  }
  drawHelp(ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.88)"; ctx.fillRect(0, 0, W, H); drawText(ctx, "HOW TO PLAY", 44, W / 2, 40, { color: ORANGE, ow: 4 });
    ["20 paylines, 5 reels. Wilds substitute for everything except Power T and Orbs.", "6+ ORBS anywhere  =  SMOKEY'S ORB LINK. Orbs lock, 3 respins (reset on every new orb).",
      "Smokey may appear at random to HOWL (boost orbs), FETCH (add orbs) or SUPER HOWL (boost all).", "Mini / Minor / Major jackpot orbs pay their jackpot. Fill all 15 spots for the GRAND.",
      "3+ POWER T anywhere  =  POWER T FREE GAMES with climbing multipliers and sticky Smokey wilds.", "Every orb in Free Games drops into the ORB POT, which pays in full at the end. 3 WHEEL symbols spin the JACKPOT WHEEL.", "Collect checkerboards in the base game: fill the END ZONE METER to force the bonus.", "All prizes are multiples of your bet, so POWER LEVEL and DENOMINATION scale every win."]
      .forEach((ln, i) => drawText(ctx, ln, 19, W / 2, 84 + i * 27, {}));
    const lb = this.betCredits / LINES * this.denomCents; drawText(ctx, `PAYTABLE at ${money(this.cost)} bet (line bet ${money(Math.floor(lb))})`, 24, W / 2, 302, { color: [255, 200, 120] }); 
    PAYING.slice().reverse().forEach((sym, i) => {
      const col = i % 5, row = Math.floor(i / 5), x = 190 + col * 225, yy = 334 + row * 150; ctx.drawImage(this.art.sym[sym], x - 110, yy, 70, 70);
      for (let k = 0; k < 3; k++) drawText(ctx, `${5 - k}: ${money(Math.round(this.cfg.paytable[sym][2 - k] * lb))}`, 17, x - 30, yy + 8 + k * 22, { anchor: "left" });
    });
    drawText(ctx, "SPACE spin/skip   UP/DOWN power level   LEFT/RIGHT denomination   A auto   B max bet   M music   S sound   F11 fullscreen   F1 admin", 15, W / 2, 665, { color: [180, 180, 200], outline: null });
    drawText(ctx, "CLICK OR PRESS ESC TO CLOSE", 18, W / 2, 695, { color: [255, 220, 160] });
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
