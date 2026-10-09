/* Run with:  node web/tests/run.js   - checks the maths of the browser build (no browser needed). */
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "js") + path.sep;
const code = fs.readFileSync(dir + "config.js", "utf8") + "\n" + fs.readFileSync(dir + "engine.js", "utf8") + `
;(function () {
  let fails = 0;
  const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok  :", m); };
  const cfg = clone(DEFAULT_CONFIG), e = new Engine(cfg, new RNG(5));

  // paylines / wild
  let g = Array.from({ length: 5 }, () => ["J", "J", "J"]);
  const [w20, t20] = e.evaluate(g, 20); ok(w20.length === 20 && Math.abs(t20 - 20 * 50) < 1e-9, "5 J on all 20 lines pays 20 x 50 line bets");
  ok(Math.abs(e.evaluate(g, 500)[1] / t20 - 25) < 1e-9, "line pays scale with the bet");

  // forced triggers and no accidental ones
  for (let i = 0; i < 300; i++) {
    const o = e.spinBase(40, 2, "orb"), t = e.spinBase(40, 2, "power_t");
    if (o.trigger !== "orb" || Object.keys(o.orbs).length < 6 || t.trigger !== "power_t" || t.tCells.length < 3) { ok(false, "forced triggers"); break; }
  }
  const c2 = clone(cfg); c2.hit_rates.orb_bonus_one_in = 0; c2.hit_rates.power_t_bonus_one_in = 0; const e2 = new Engine(c2, new RNG(2)); let bad = 0;
  for (let i = 0; i < 4000; i++) { const r = e2.spinBase(40, 0); if (r.trigger || Object.keys(r.orbs).length >= 6 || r.tCells.length >= 3) bad++; }
  ok(bad === 0, "with hit rates set to 0 (off) no bonus ever triggers");

  // wheel
  const lay = wheelLayout([9, 5, 1, 1]);
  ok(lay.length === 16 && lay.filter((k) => k === "mini").length === 9 && lay.filter((k) => k === "grand").length === 1, "wheel layout honours segment counts");
  ok(lay.every((k, i) => k === "mini" || lay[(i + 1) % 16] === "mini"), "rare segments are spread (no two rare segments side by side)");
  ok(wheelLayout([2, 2, 2, 2]).length === 8 && wheelLayout([0, 0, 0, 0]).length === 1, "odd wheel configs still produce a valid wheel");
  const cw = clone(cfg); cw.wheel.segments = [0, 0, 0, 1]; const ew = new Engine(cw, new RNG(1)), sp = ew.spinWheel(100, 0);
  ok(sp.kind === "grand" && sp.credits === Math.round(2500 * 100), "a grand-only wheel always lands on the Grand and pays its jackpot x bet");
  const cj = clone(cfg); cj.wheel.segments = [3, 0, 0, 0]; ok(new Engine(cj, new RNG(1)).spinWheel(100, 0).credits === 2000, "wheel jackpots scale with the bet");

  // free games: wheel trigger, pot accumulation, sticky
  const cf = clone(cfg); cf.hit_rates.free_wheel_one_in = 1; cf.hit_rates.free_retrigger_one_in = 0; cf.hit_rates.free_orb_bonus_one_in = 0; cf.weights.free.ORB = [20, 20, 20, 20, 20];
  const ef = new Engine(cf, new RNG(8)), fg = ef.startFreeGames(8, 100, 0); let wheels = 0, potSum = 0;
  while (!fg.done) { const r = fg.playSpin(); if (r.trigger === "wheel") { wheels++; ok(r.grid.flat().filter((s) => s === "WHEEL").length >= 3 && r.wheelSpins >= 1, "wheel spin lands >= 3 WHEEL symbols") ; } potSum += r.potOrbs.reduce((a, p) => a + p[2], 0); for (const k of fg.sticky) { const [c, rr] = unpk(k); if (r.grid[c][rr] !== "WILD") fails++; } }
  ok(wheels === 8, "every free spin triggered the wheel when set to 1 in 1");
  ok(potSum === fg.potTotal && fg.potTotal > 0, "orb pot accumulates every landed orb across all free spins (" + fg.potTotal + " credits)");
  ok(fg.finalTotal() === fg.totalCredits + fg.potTotal, "final free-games total = spin wins + pot");

  // base game never lands WHEEL; free game does not trigger on 1-2 naturally
  let wb = 0; for (let i = 0; i < 3000; i++) wb += e.countSymbol(e.spinBase(20, 0).grid, "WHEEL"); ok(wb === 0, "no WHEEL symbols in the base game");

  // meter in the simulator
  const cm = clone(cfg); cm.collect.target = 50; cm.hit_rates.orb_bonus_one_in = 0; cm.hit_rates.power_t_bonus_one_in = 0;
  const st = newSim(cm, 20000, 0, 3); simulateChunk(st, 20000);
  const expected = st.s.meter + st.s.meterBonuses * 50; ok(st.s.meterBonuses > 50 && expected > 0, "checker meter forces bonuses (" + st.s.meterBonuses + " in 20k spins at target 50)");
  const cd = clone(cm); cd.collect.enabled = false; const sd = newSim(cd, 5000, 0, 3); simulateChunk(sd, 5000); ok(sd.s.meterBonuses === 0, "meter disabled = no meter bonuses");
  const cl = clone(cm); cl.collect.bonus = "orb_link"; const sl = newSim(cl, 5000, 0, 3); simulateChunk(sl, 5000); ok(sl.s.meterBonuses > 0 && sl.s.meterOrb > 0 && sl.s.meterFree === 0, "meter can force the Orb Link instead of Free Games");

  // default RTP
  const sr = newSim(clone(cfg), 200000, 0, 9); simulateChunk(sr, 200000); const rtp = simResult(sr).rtp;
  ok(rtp > 85 && rtp < 105, "default RTP is in range (" + rtp.toFixed(1) + "%)");
  console.log(fails ? "\\n" + fails + " FAILED" : "\\nall passed"); if (fails) throw new Error("tests failed");
})();`;
new Function("console", "localStorage", code)(console, {});
