/* Pure game maths (no DOM). Mirrors tnslots/engine.py.
   Money is integer credits; dollars = credits * denomination. grid[reel][row]. */
"use strict";
const REELS = 5, ROWS = 3, LINES = 20;
const PAYLINES = [
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
  [0,0,1,0,0],[2,2,1,2,2],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0],
  [2,1,1,1,2],[1,0,1,0,1],[1,2,1,2,1],[0,1,0,1,0],[2,1,2,1,2],
  [1,1,0,1,1],[1,1,2,1,1],[0,0,1,2,2],[2,2,1,0,0],[0,2,0,2,0],
];
const ALL_CELLS = [];
for (let c = 0; c < REELS; c++) for (let r = 0; r < ROWS; r++) ALL_CELLS.push([c, r]);
const pk = (p) => p[0] * 10 + p[1];            // cell key
const unpk = (k) => [Math.floor(k / 10), k % 10];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class RNG {
  constructor(seed) { this.f = seed === undefined ? Math.random : mulberry32(seed); }
  random() { return this.f(); }
  int(lo, hi) { return lo + Math.floor(this.f() * (hi - lo + 1)); }
  choice(a) { return a[Math.floor(this.f() * a.length)]; }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}
function weightedIndex(rng, weights) {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return 0;
  const x = rng.random() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += Math.max(0, weights[i]);
    if (x < acc) return i;
  }
  return weights.length - 1;
}

class Orb {
  constructor(kind = "cash", tier = 0) { this.kind = kind; this.tier = tier; }
  copy() { return new Orb(this.kind, this.tier); }
}

class Engine {
  constructor(cfg, rng) { this.cfg = cfg; this.rng = rng || new RNG(); this.tables = {}; }

  levelBoost(level) {
    const b = this.cfg.orbs.jackpot_level_boost;
    return b.length ? Number(b[Math.min(level, b.length - 1)]) : 1;
  }
  jackpotMult(kind, level) { return Number(this.cfg.orbs.jackpots[JACKPOTS.indexOf(kind)]) * this.levelBoost(level); }
  orbCredits(orb, bet, level) {
    if (orb.kind === "cash") {
      const l = this.cfg.orbs.value_ladder;
      return Math.max(1, Math.round(Number(l[Math.min(orb.tier, l.length - 1)]) * bet));
    }
    return Math.max(1, Math.round(this.jackpotMult(orb.kind, level) * bet));
  }
  newOrb() {
    const o = this.cfg.orbs;
    const kind = ORB_TYPES[weightedIndex(this.rng, o.type_weights)];
    const tier = kind === "cash" ? weightedIndex(this.rng, o.value_weights) : 0;
    return new Orb(kind, tier);
  }
  _table(mode, reel, exclude) {
    const key = mode + "|" + reel + "|" + exclude.join(",");
    let t = this.tables[key];
    if (!t) {
      const w = this.cfg.weights[mode];
      const syms = [], cum = [];
      let acc = 0;
      for (const s of SYMBOLS) {
        if (exclude.includes(s)) continue;
        const v = Number(w[s][reel]);
        if (v > 0) { acc += v; syms.push(s); cum.push(acc); }
      }
      t = syms.length ? [syms, cum] : [["J"], [1]];
      this.tables[key] = t;
    }
    return t;
  }
  _pick(mode, reel, exclude = []) {
    const [syms, cum] = this._table(mode, reel, exclude);
    const x = this.rng.random() * cum[cum.length - 1];
    for (let i = 0; i < cum.length; i++) if (x < cum[i]) return syms[i];
    return syms[syms.length - 1];
  }

  naturalGrid(mode, fixed = {}) {
    for (let tries = 0; tries < 300; tries++) {
      const grid = []; let orbs = 0, ts = 0;
      for (let c = 0; c < REELS; c++) {
        const col = [];
        for (let r = 0; r < ROWS; r++) {
          const s = fixed[pk([c, r])] || this._pick(mode, c);
          col.push(s); if (s === "ORB") orbs++; if (s === "POWERT") ts++;
        }
        grid.push(col);
      }
      if (orbs < 6 && ts < 3) return grid;
    }
    return Array.from({ length: REELS }, (_, c) => Array.from({ length: ROWS }, (_, r) => ((c + r) % 2 ? "J" : "Q")));
  }
  orbTriggerGrid(mode, blocked = []) {
    const n = 6 + weightedIndex(this.rng, this.cfg.hit_rates.orb_count_weights);
    const bl = new Set(blocked.map(pk));
    const cells = ALL_CELLS.filter((p) => !bl.has(pk(p)));
    this.rng.shuffle(cells);
    const set = new Set(cells.slice(0, Math.min(n, 15)).map(pk));
    return Array.from({ length: REELS }, (_, c) => Array.from({ length: ROWS }, (_, r) =>
      set.has(pk([c, r])) ? "ORB" : this._pick(mode, c, ["ORB", "POWERT"])));
  }
  tTriggerGrid(mode, n = null, blocked = []) {
    if (n === null) n = 3 + weightedIndex(this.rng, this.cfg.hit_rates.power_t_count_weights);
    const reels = [0, 1, 2, 3, 4]; this.rng.shuffle(reels);
    const bl = new Set(blocked.map(pk));
    const tset = new Set();
    for (const c of reels.slice(0, n)) {
      let rows = [0, 1, 2].filter((r) => !bl.has(pk([c, r])));
      if (!rows.length) rows = [0, 1, 2];
      tset.add(pk([c, this.rng.choice(rows)]));
    }
    let grid;
    for (let tries = 0; tries < 300; tries++) {
      grid = []; let orbs = 0;
      for (let c = 0; c < REELS; c++) {
        const col = [];
        for (let r = 0; r < ROWS; r++) {
          if (tset.has(pk([c, r]))) col.push("POWERT");
          else { const s = this._pick(mode, c, ["POWERT"]); if (s === "ORB") orbs++; col.push(s); }
        }
        grid.push(col);
      }
      if (orbs < 6) return grid;
    }
    return grid;
  }

  evaluate(grid, bet) {
    const pays = this.cfg.paytable, lineBet = bet / LINES;
    const wins = []; let total = 0;
    PAYLINES.forEach((rows, li) => {
      const syms = rows.map((row, c) => grid[c][row]);
      let run = 0;
      while (run < REELS && syms[run] === "WILD") run++;
      let base = null, count = 0;
      if (run < REELS && PAYING.includes(syms[run])) {
        base = syms[run]; count = run;
        while (count < REELS && (syms[count] === base || syms[count] === "WILD")) count++;
      }
      let best = 0, bestSym = null, bestN = 0;
      if (base && count >= 3) { best = pays[base][count - 3]; bestSym = base; bestN = count; }
      if (run >= 3 && pays.WILD[run - 3] > best) { best = pays.WILD[run - 3]; bestSym = "WILD"; bestN = run; }
      if (best > 0) {
        const credits = best * lineBet;
        const cells = []; for (let c = 0; c < bestN; c++) cells.push([c, rows[c]]);
        wins.push({ line: li, symbol: bestSym, count: bestN, credits, cells });
        total += credits;
      }
    });
    return [wins, total];
  }

  finish(grid, bet, level, multiplier = 1, trigger = null, sticky = []) {
    const res = { grid, orbs: {}, lineWins: [], lineCredits: 0, scatterCredits: 0, tCells: [], multiplier, trigger,
      totalCredits: 0, freeSpinsAwarded: 0, newSticky: [], sticky: sticky.slice() };
    [res.lineWins, res.lineCredits] = this.evaluate(grid, bet);
    for (let c = 0; c < REELS; c++) for (let r = 0; r < ROWS; r++) {
      if (grid[c][r] === "POWERT") res.tCells.push([c, r]);
      if (grid[c][r] === "ORB") res.orbs[pk([c, r])] = this.newOrb();
    }
    if (res.tCells.length >= 3) res.scatterCredits = this.cfg.scatter_pay[Math.min(res.tCells.length, 5) - 3] * bet;
    const raw = res.lineCredits + res.scatterCredits;
    res.totalCredits = Math.round(raw * multiplier);
    if (res.totalCredits === 0 && raw > 0) res.totalCredits = 1;
    return res;
  }

  spinBase(bet, level, force = null) {
    const h = this.cfg.hit_rates;
    const pOrb = 1 / Math.max(1, Number(h.orb_bonus_one_in));
    const pT = 1 / Math.max(1, Number(h.power_t_bonus_one_in));
    let x = this.rng.random();
    if (force === "orb") x = 0; else if (force === "power_t") x = pOrb + 1e-12;
    let grid, trig = null;
    if (x < pOrb) { grid = this.orbTriggerGrid("base"); trig = "orb"; }
    else if (x < pOrb + pT) { grid = this.tTriggerGrid("base"); trig = "power_t"; }
    else grid = this.naturalGrid("base");
    const res = this.finish(grid, bet, level, 1, trig);
    if (trig === "power_t") res.freeSpinsAwarded = this.freeSpinsFor(res.tCells.length);
    return res;
  }
  freeSpinsFor(nT, retrigger = false) {
    const t = this.cfg.free_games[retrigger ? "retrigger_spins" : "spins_awarded"];
    return Math.floor(t[Math.min(Math.max(nT, 3), 5) - 3]);
  }
  startHoldAndSpin(orbs, bet, level) { return new HoldAndSpin(this, orbs, bet, level); }
  startFreeGames(spins, bet, level) { return new FreeGames(this, spins, bet, level); }
}

class HoldAndSpin {
  constructor(engine, orbs, bet, level) {
    this.e = engine; this.bet = bet; this.level = level;
    this.orbs = {};
    for (const k of Object.keys(orbs)) this.orbs[k] = orbs[k].copy();
    this.respinsTotal = Math.floor(engine.cfg.orbs.respins);
    this.respinsLeft = this.respinsTotal;
    this.done = false;
    this.introSmokey = engine.rng.random() < engine.cfg.smokey.intro_chance ? this._smokey() : null;
  }
  emptyCells() { return ALL_CELLS.filter((p) => !(pk(p) in this.orbs)); }
  count() { return Object.keys(this.orbs).length; }
  value(orb) { return this.e.orbCredits(orb, this.bet, this.level); }
  total() {
    let t = 0;
    for (const o of Object.values(this.orbs)) t += this.value(o);
    if (this.count() >= 15 && this.e.cfg.orbs.fill_board_grand) t += this.grandBonus();
    return t;
  }
  grandBonus() { return this.e.orbCredits(new Orb("grand"), this.bet, this.level); }

  _smokey() {
    const e = this.e, s = e.cfg.smokey, rng = e.rng;
    let action = ["howl", "fetch", "super"][weightedIndex(rng, [s.howl_weight, s.fetch_weight, s.super_howl_weight])];
    const ev = { action, boosted: [], newOrbs: [] };
    const ladderMax = e.cfg.orbs.value_ladder.length - 1;
    if (action === "fetch") {
      const empties = this.emptyCells();
      if (!empties.length) action = ev.action = "howl";
      else {
        rng.shuffle(empties);
        const n = rng.int(s.fetch_orbs_min, Math.max(s.fetch_orbs_min, s.fetch_orbs_max));
        for (const p of empties.slice(0, n)) {
          const o = e.newOrb(); this.orbs[pk(p)] = o; ev.newOrbs.push([p, o.copy()]);
        }
        return ev;
      }
    }
    const keys = Object.keys(this.orbs);
    if (!keys.length) return ev;
    let targets;
    if (action === "super") targets = keys;
    else {
      rng.shuffle(keys);
      targets = keys.slice(0, rng.int(s.boost_orbs_min, Math.max(s.boost_orbs_min, s.boost_orbs_max)));
    }
    for (const k of targets) {
      const o = this.orbs[k], before = o.copy();
      if (o.kind === "cash") {
        o.tier = Math.min(ladderMax, o.tier + rng.int(s.boost_tiers_min, Math.max(s.boost_tiers_min, s.boost_tiers_max)));
      } else if ((o.kind === "mini" || o.kind === "minor") && rng.random() < s.jackpot_upgrade_chance) {
        o.kind = JACKPOTS[JACKPOTS.indexOf(o.kind) + 1];
      }
      ev.boosted.push([unpk(Number(k)), before, o.copy()]);
    }
    return ev;
  }

  step() {
    const e = this.e, chance = Number(e.cfg.orbs.respin_orb_chance);
    const fresh = [];
    for (const p of this.emptyCells()) {
      if (e.rng.random() < chance) { const o = e.newOrb(); this.orbs[pk(p)] = o; fresh.push([p, o.copy()]); }
    }
    let ev = null;
    if (this.emptyCells().length && e.rng.random() < e.cfg.smokey.appear_chance) ev = this._smokey();
    if (fresh.length || (ev && ev.newOrbs.length)) this.respinsLeft = this.respinsTotal; else this.respinsLeft -= 1;
    const full = this.count() >= 15;
    if (full || this.respinsLeft <= 0) this.done = true;
    return { newOrbs: fresh, smokey: ev, respinsLeft: this.respinsLeft, full, done: this.done };
  }
  playOut() { while (!this.done) this.step(); return this.total(); }
}

class FreeGames {
  constructor(engine, spins, bet, level) {
    this.e = engine; this.bet = bet; this.level = level;
    this.spinsLeft = spins; this.spinsPlayed = 0; this.totalCredits = 0; this.sticky = new Set();
  }
  get done() { return this.spinsLeft <= 0; }
  multiplier() {
    const m = this.e.cfg.free_games.multipliers;
    return m.length ? Math.floor(m[Math.min(this.spinsPlayed, m.length - 1)]) : 1;
  }
  stickyCells() { return Array.from(this.sticky).map(unpk); }
  playSpin() {
    const e = this.e, cfg = e.cfg, fg = cfg.free_games;
    let newSticky = [];
    if (e.rng.random() < fg.smokey_wild_chance) {
      const cand = [];
      for (let c = 1; c < 4; c++) for (let r = 0; r < ROWS; r++) if (!this.sticky.has(pk([c, r]))) cand.push([c, r]);
      e.rng.shuffle(cand);
      const n = e.rng.int(fg.smokey_wild_min, Math.max(fg.smokey_wild_min, fg.smokey_wild_max));
      newSticky = cand.slice(0, n);
      newSticky.forEach((p) => this.sticky.add(pk(p)));
    }
    const h = cfg.hit_rates;
    const x = e.rng.random();
    const pOrb = 1 / Math.max(1, Number(h.free_orb_bonus_one_in));
    const pT = 1 / Math.max(1, Number(h.free_retrigger_one_in));
    const blocked = this.stickyCells();
    let grid, trig = null;
    if (x < pOrb) { grid = e.orbTriggerGrid("free", blocked); trig = "orb"; }
    else if (x < pOrb + pT) { grid = e.tTriggerGrid("free", null, blocked); trig = "power_t"; }
    else { const fixed = {}; this.sticky.forEach((k) => { fixed[k] = "WILD"; }); grid = e.naturalGrid("free", fixed); }
    blocked.forEach((p) => { grid[p[0]][p[1]] = "WILD"; });
    const res = e.finish(grid, this.bet, this.level, this.multiplier(), trig, blocked);
    res.newSticky = newSticky;
    this.spinsLeft -= 1; this.spinsPlayed += 1;
    if (trig === "power_t") { res.freeSpinsAwarded = e.freeSpinsFor(res.tCells.length, true); this.spinsLeft += res.freeSpinsAwarded; }
    this.totalCredits += res.totalCredits;
    return res;
  }
  addWin(c) { this.totalCredits += c; }
}

/* Monte-Carlo of the whole game. Async/chunked so the admin panel stays responsive. */
function simulateChunk(state, n) {
  const { e, cfg, bet, level, s } = state;
  for (let i = 0; i < n && s.done < s.spins; i++, s.done++) {
    s.wagered += bet;
    const r = e.spinBase(bet, level);
    const win = r.totalCredits;
    s.base += win; let total = win;
    if (win) s.wins++;
    if (r.trigger === "orb") {
      const hs = e.startHoldAndSpin(r.orbs, bet, level);
      const v = hs.playOut();
      s.orbBonuses++; if (hs.count() >= 15) s.full++;
      s.orb += v; total += v;
    } else if (r.trigger === "power_t") {
      const fg = e.startFreeGames(r.freeSpinsAwarded, bet, level);
      s.freeBonuses++;
      while (!fg.done) {
        const fr = fg.playSpin();
        if (fr.trigger === "orb") {
          const hs = e.startHoldAndSpin(fr.orbs, bet, level);
          let v = hs.playOut();
          if (cfg.free_games.multiplier_on_orbs) v *= fr.multiplier;
          fg.addWin(v);
        }
      }
      s.free += fg.totalCredits; total += fg.totalCredits;
    }
    s.maxWin = Math.max(s.maxWin, total / bet);
    if (total >= 20 * bet) s.big++;
    s.sq += (total / bet) ** 2;
  }
}
function newSim(cfg, spins, levelIdx, seed) {
  const bet = Math.floor(cfg.bet.power_levels[levelIdx]);
  return { e: new Engine(cfg, new RNG(seed)), cfg, bet, level: levelIdx, t0: Date.now(),
    s: { spins, done: 0, wagered: 0, base: 0, orb: 0, free: 0, wins: 0, orbBonuses: 0, freeBonuses: 0, maxWin: 0, big: 0, sq: 0, full: 0 } };
}
function simResult(st) {
  const s = st.s, n = Math.max(1, s.done), w = s.wagered || 1;
  const mean = (s.base + s.orb + s.free) / w;
  return {
    spins: s.done, rtp: 100 * (s.base + s.orb + s.free) / w, rtpBase: 100 * s.base / w, rtpOrb: 100 * s.orb / w, rtpFree: 100 * s.free / w,
    hitFreq: 100 * s.wins / n, orbOneIn: s.orbBonuses ? n / s.orbBonuses : 0, freeOneIn: s.freeBonuses ? n / s.freeBonuses : 0,
    avgOrbX: s.orb / (s.orbBonuses || 1) / st.bet, avgFreeX: s.free / (s.freeBonuses || 1) / st.bet,
    maxWinX: s.maxWin, bigOneIn: s.big ? n / s.big : 0, volatility: Math.sqrt(Math.max(0, s.sq / n - mean * mean)), full: s.full,
    seconds: (Date.now() - st.t0) / 1000,
  };
}
if (typeof module !== "undefined") module.exports = { Engine, RNG, Orb, HoldAndSpin, FreeGames, PAYLINES, ALL_CELLS, pk, unpk, newSim, simulateChunk, simResult, LINES };
