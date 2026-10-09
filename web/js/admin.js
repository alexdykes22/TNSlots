/* Admin / operator panel (DOM overlay). Every number that drives the maths is editable. */
"use strict";
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}
const getp = (o, p) => p.split(".").reduce((a, k) => a[k], o);
const setp = (o, p, v) => { const ks = p.split("."); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const fmtMoney = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneIn = (p) => (w) => `= ${(100 / Math.max(1, getp(w, p))).toFixed(3)}% of spins (about every ${getp(w, p)} spins)`;

class Admin {
  constructor(game) {
    this.g = game; this.root = document.getElementById("admin"); this.page = 0; this.dirty = false; this.work = null;
    this.sim = { running: false, cancel: false, progress: 0, result: null, spins: 100000, level: 1 };
    this.buildPages();
    window.addEventListener("keydown", (e) => { if (this.g.state === "admin" && e.key === "Escape") { e.preventDefault(); this.tryClose(); } });
  }
  buildPages() {
    const num = (label, path, lo, hi, step, extra = {}) => Object.assign({ label, path, kind: "num", lo, hi, step }, extra);
    const int = (label, path, lo, hi, extra = {}) => Object.assign({ label, path, kind: "int", lo, hi, step: 1 }, extra);
    const bool = (label, path) => ({ label, path, kind: "bool" });
    const vec = (label, path, lo, hi, step, cols) => ({ label, path, kind: "vec", lo, hi, step, cols });
    const info = (text) => ({ kind: "info", text });
    const weights = (mode) => [info("Relative weights per reel (higher = more frequent). Columns are reels 1-5. Wilds default to reels 2-4 only."),
      ...SYMBOLS.map((s) => vec(s === "POWERT" ? "POWER T" : s === "ORB" ? "MONEY ORB" : s, "weights." + mode + "." + s, 0, 10000, 1, ["R1", "R2", "R3", "R4", "R5"])),
      info("Only the hit-rates page forces bonuses. These weights decide how often orbs / Power Ts / wilds show up as near-misses and line wins.")];
    this.pages = [
      ["General", [
        num("Starting balance ($)", "general.starting_balance", 0, 1e7, 100), { label: "Admin PIN (blank = no PIN)", path: "general.admin_pin", kind: "str" },
        bool("Remember balance between sessions", "general.persist_balance"), num("Starting denomination ($)", "general.start_denom", 0.01, 10, 0.01),
        int("Starting power level", "general.start_power_level", 1, 99), num("Music volume (0-1)", "general.music_volume", 0, 1, 0.05), num("Sound-effect volume (0-1)", "general.sfx_volume", 0, 1, 0.05),
        bool("Turbo reels", "general.turbo_spin"),
        { kind: "action", label: "Reset bankroll to starting balance now", fn: () => this.g.resetBankroll() },
        { kind: "action", label: "Reset lifetime statistics", fn: () => { this.g.resetStats(); this.g.toast("STATS CLEARED"); this.render(); } },
        { kind: "action", label: "Restore ALL settings to factory defaults", confirm: true, fn: () => { this.work = resetConfig(); this.dirty = true; this.render(); } }]],
      ["Bonus Hit Rates", [
        info("Bonuses are forced on a '1 in N spins' basis. Lower N = more often. These do not depend on the reel weights."),
        num("Smokey's Orb Link (6+ orbs): 1 in", "hit_rates.orb_bonus_one_in", 1, 1e6, 5, { note: oneIn("hit_rates.orb_bonus_one_in") }),
        num("Power T Free Games (3 T): 1 in", "hit_rates.power_t_bonus_one_in", 1, 1e6, 5, { note: oneIn("hit_rates.power_t_bonus_one_in") }),
        vec("Orb count on trigger (weights for 6 / 7 / 8 / 9 / 10 / 11)", "hit_rates.orb_count_weights", 0, 1e5, 1, ["6", "7", "8", "9", "10", "11"]),
        vec("Power T count on trigger (weights for 3 / 4 / 5)", "hit_rates.power_t_count_weights", 0, 1e5, 1, ["3 T", "4 T", "5 T"]),
        info("Inside Free Games:"),
        num("Orb Link during free games: 1 in", "hit_rates.free_orb_bonus_one_in", 1, 1e6, 5, { note: oneIn("hit_rates.free_orb_bonus_one_in") }),
        num("Retrigger (3 T) during free games: 1 in", "hit_rates.free_retrigger_one_in", 1, 1e6, 5, { note: oneIn("hit_rates.free_retrigger_one_in") })]],
      ["Reel Weights: Base", weights("base")], ["Reel Weights: Free", weights("free")],
      ["Paytable", [info("Line pays are multiples of the LINE bet (total bet / 20). Columns: 3, 4, 5 of a kind."),
        ...PAYING.slice().reverse().map((s) => vec(s, "paytable." + s, 0, 1e7, 5, ["3x", "4x", "5x"])), vec("Power T scatter (x TOTAL bet)", "scatter_pay", 0, 1e7, 1, ["3 T", "4 T", "5 T"])]],
      ["Orbs & Jackpots", [info("Orb values are multiples of the TOTAL bet, so every denomination and power level scales automatically."),
        vec("Cash orb value ladder (x total bet)", "orbs.value_ladder", 0, 1e6, 0.5), vec("Cash orb value weights", "orbs.value_weights", 0, 1e6, 1),
        vec("Orb type weights", "orbs.type_weights", 0, 1e6, 1, ["CASH", "MINI", "MINOR", "MAJOR", "GRAND"]), vec("Jackpot values (x total bet)", "orbs.jackpots", 0, 1e7, 5, ["MINI", "MINOR", "MAJOR", "GRAND"]),
        vec("Jackpot boost per power level", "orbs.jackpot_level_boost", 0, 1000, 0.05), int("Respins (reset when an orb lands)", "orbs.respins", 1, 9),
        num("Orb chance per empty cell / respin", "orbs.respin_orb_chance", 0, 1, 0.005, { note: (w) => `= ${(100 * w.orbs.respin_orb_chance).toFixed(1)}% per empty cell` }),
        bool("Filling all 15 spots pays the GRAND", "orbs.fill_board_grand")]],
      ["Smokey", [info("Smokey shows up at random during the Orb Link and in Free Games."),
        num("Chance Smokey appears each respin", "smokey.appear_chance", 0, 1, 0.01), num("Smokey greets bonus start chance", "smokey.intro_chance", 0, 1, 0.01),
        num("Howl weight (boost some orbs)", "smokey.howl_weight", 0, 1e4, 5), num("Fetch weight (drop new orbs)", "smokey.fetch_weight", 0, 1e4, 5), num("Super Howl weight (boost ALL orbs)", "smokey.super_howl_weight", 0, 1e4, 5),
        int("Howl boosts this many orbs: min", "smokey.boost_orbs_min", 0, 15), int("Howl boosts this many orbs: max", "smokey.boost_orbs_max", 0, 15),
        int("Boost raises the value ladder by: min", "smokey.boost_tiers_min", 0, 12), int("Boost raises the value ladder by: max", "smokey.boost_tiers_max", 0, 12),
        num("Boost upgrades Mini/Minor chance", "smokey.jackpot_upgrade_chance", 0, 1, 0.05), int("Fetch drops this many orbs: min", "smokey.fetch_orbs_min", 0, 15), int("Fetch drops this many orbs: max", "smokey.fetch_orbs_max", 0, 15)]],
      ["Free Games", [vec("Free games awarded (3 / 4 / 5 T)", "free_games.spins_awarded", 1, 999, 1, ["3 T", "4 T", "5 T"]), vec("Retrigger spins (3 / 4 / 5 T)", "free_games.retrigger_spins", 0, 999, 1, ["3 T", "4 T", "5 T"]),
        vec("Win multiplier by free-spin number", "free_games.multipliers", 1, 1000, 1, [1, 2, 3, 4, 5, 6, 7, 8].map((i) => "#" + i)), num("Smokey sticky-wild chance / spin", "free_games.smokey_wild_chance", 0, 1, 0.01),
        int("Sticky wilds dropped: min", "free_games.smokey_wild_min", 1, 9), int("Sticky wilds dropped: max", "free_games.smokey_wild_max", 1, 9), bool("Multiplier also boosts Orb Link", "free_games.multiplier_on_orbs")]],
      ["Bets & Denoms", [info("Total bet = denomination x power-level credits. Every prize is a multiple of the bet, so wins scale with both."),
        vec("Denominations ($)", "bet.denominations", 0.01, 1000, 0.01), vec("Power levels (credits per spin)", "bet.power_levels", 1, 1e6, 5)]],
      ["Simulator", "sim"], ["Tools & Stats", "tools"],
    ];
  }
  /* ------------------------------------------------------------------ open / close */
  open() {
    this.work = clone(this.g.cfg); this.dirty = false; this.pinOk = !String(this.g.cfg.general.admin_pin || ""); this.page = 0;
    this.g.state = "admin"; this.g.audio.spinLoop(false); this.g.sfx("click"); this.root.classList.add("open"); this.render();
    const f = this.root.querySelector("input"); if (f) f.focus();
  }
  close() { this.root.classList.remove("open"); this.root.replaceChildren(); this.sim.cancel = true; this.g.state = "idle"; this.g.canvas.focus(); }
  tryClose() {
    if (this.dirty && !this.closeArmed) { this.closeArmed = true; this.flash("Unsaved changes. Click CLOSE again to discard them, or SAVE & APPLY."); return; }
    this.closeArmed = false; this.close();
  }
  save() { this.closeArmed = false; this.g.applyConfig(clone(this.work)); this.dirty = false; this.g.sfx("collect"); this.render(); this.flash("Saved. New settings are live."); }
  flash(msg) { const el = this.root.querySelector(".flash"); if (el) { el.textContent = msg; clearTimeout(this.flashT); this.flashT = setTimeout(() => { el.textContent = ""; }, 4000); } }
  /* ------------------------------------------------------------------ rendering */
  render() {
    const keepScroll = this.root.querySelector(".content") ? this.root.querySelector(".content").scrollTop : 0;
    this.root.replaceChildren();
    if (!this.pinOk) return this.renderPin();
    const tabs = h("div", { class: "tabs" }, this.pages.map(([t], i) => h("button", { class: "tab" + (i === this.page ? " on" : ""), text: t, onclick: () => { this.page = i; this.g.sfx("click", 0.5); this.render(); } })));
    const body = this.pages[this.page][1], content = h("div", { class: "content" });
    if (body === "sim") content.append(...this.simView()); else if (body === "tools") content.append(...this.toolsView()); else body.forEach((f) => content.append(this.row(f)));
    const bar = h("div", { class: "bar" },
      h("button", { class: "btn go", text: "SAVE & APPLY", onclick: () => this.save() }), h("button", { class: "btn", text: "REVERT", onclick: () => { this.work = clone(this.g.cfg); this.dirty = false; this.render(); this.flash("Changes discarded."); } }),
      h("button", { class: "btn stop", text: "CLOSE", onclick: () => this.tryClose() }), h("span", { class: "flash" }), this.dirty ? h("span", { class: "dirty", text: "UNSAVED CHANGES" }) : null);
    this.root.append(h("div", { class: "head", text: "ADMIN / OPERATOR SETTINGS" }), h("div", { class: "main" }, tabs, content), bar);
    content.scrollTop = keepScroll;
  }
  renderPin() {
    const inp = h("input", { type: "password", class: "pin", autocomplete: "off", maxlength: 12 }), msg = h("div", { class: "pinmsg" });
    const go = () => { if (inp.value === String(this.g.cfg.general.admin_pin)) { this.pinOk = true; this.g.sfx("collect"); this.render(); } else { inp.value = ""; msg.textContent = "Wrong PIN"; this.g.sfx("buzz"); } };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    this.root.append(h("div", { class: "pinbox" }, h("h2", { text: "ENTER ADMIN PIN" }), inp, msg, h("div", { class: "row" }, h("button", { class: "btn go", text: "UNLOCK", onclick: go }), h("button", { class: "btn stop", text: "CANCEL", onclick: () => this.close() }))));
    setTimeout(() => inp.focus(), 0);
  }
  clamp(f, v, cur) {
    v = Math.max(f.lo, Math.min(f.hi, v));
    return f.kind === "int" || (Number.isInteger(cur) && Number.isInteger(v) && f.step >= 1) ? Math.round(v) : v;
  }
  numInput(f, get, set) {
    const inp = h("input", { type: "number", class: "num", step: f.step, min: f.lo, max: f.hi, value: get() });
    inp.addEventListener("change", () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) { const c = this.clamp(f, v, get()); set(c); inp.value = c; this.dirty = true; this.closeArmed = false; this.markDirty(); } else inp.value = get(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    return inp;
  }
  markDirty() { if (!this.root.querySelector(".dirty")) { const bar = this.root.querySelector(".bar"); if (bar) bar.append(h("span", { class: "dirty", text: "UNSAVED CHANGES" })); } const n = this.root.querySelector(".note-live"); if (n) n.dispatchEvent(new Event("refresh")); }
  row(f) {
    if (f.kind === "info") return h("div", { class: "info", text: f.text });
    if (f.kind === "action") { let armed = false; const b = h("button", { class: "btn action", text: "[ " + f.label + " ]", onclick: () => { if (f.confirm && !armed) { armed = true; b.textContent = "[ CLICK AGAIN TO CONFIRM: " + f.label + " ]"; setTimeout(() => { armed = false; b.textContent = "[ " + f.label + " ]"; }, 4000); return; } f.fn(); } }); return b; }
    const w = this.work, label = h("div", { class: "label", text: f.label });
    if (f.kind === "bool") { const cb = h("input", { type: "checkbox" }); cb.checked = !!getp(w, f.path); cb.addEventListener("change", () => { setp(w, f.path, cb.checked); this.dirty = true; this.markDirty(); }); return h("div", { class: "row" }, label, h("label", { class: "tog" }, cb, h("span"))); }
    if (f.kind === "str") { const t = h("input", { type: "text", class: "txt", value: getp(w, f.path) }); t.addEventListener("input", () => { setp(w, f.path, t.value); this.dirty = true; this.markDirty(); }); return h("div", { class: "row" }, label, t); }
    if (f.kind === "vec") {
      const arr = getp(w, f.path), cells = h("div", { class: "vec" });
      arr.forEach((_, i) => cells.append(h("div", { class: "cell" }, f.cols && f.cols[i] ? h("small", { text: f.cols[i] }) : null, this.numInput(f, () => getp(this.work, f.path)[i], (v) => (getp(this.work, f.path)[i] = v)))));
      return h("div", { class: "row vrow" }, label, cells);
    }
    const note = f.note ? h("span", { class: "note note-live" }) : null;
    const inp = this.numInput(f, () => getp(this.work, f.path), (v) => setp(this.work, f.path, v));
    if (note) { const upd = () => (note.textContent = f.note(this.work)); note.addEventListener("refresh", upd); upd(); }
    return h("div", { class: "row" }, label, inp, note);
  }
  /* ----------------------------------------------------------------- simulator */
  simView() {
    const s = this.sim, cfgLevels = this.work.bet.power_levels.length;
    const run = h("button", { class: "btn " + (s.running ? "warn" : "go"), text: s.running ? "STOP" : "RUN SIMULATION", onclick: () => (s.running ? (s.cancel = true) : this.startSim()) });
    const spins = h("select", { onchange: (e) => (s.spins = parseInt(e.target.value, 10)) }, [10000, 100000, 500000, 1000000].map((n) => h("option", { value: n, text: n.toLocaleString() + " spins", selected: n === s.spins })));
    const lvl = h("select", { onchange: (e) => (s.level = parseInt(e.target.value, 10)) }, Array.from({ length: cfgLevels }, (_, i) => h("option", { value: i + 1, text: "Power level " + (i + 1), selected: i + 1 === s.level })));
    this.simOut = h("div", { class: "simout" });
    const out = [h("div", { class: "info", text: "Plays the full game maths (base game + Orb Link + Free Games) with your UNSAVED settings. Use it to dial in RTP (return to player) and bonus frequency before you save." }),
      h("div", { class: "row" }, run, spins, lvl), h("div", { class: "progress" }, (this.simBar = h("div", { class: "pbar" }))), this.simOut];
    this.simPaint(); return out;
  }
  simPaint() {
    const s = this.sim, o = this.simOut; if (!o) return;
    this.simBar.style.width = (s.running ? s.progress * 100 : s.result ? 100 : 0) + "%"; o.replaceChildren();
    const r = s.result; if (!r) return;
    const rows = [["TOTAL RTP", r.rtp.toFixed(2) + "%", true], ["  line wins + scatters", r.rtpBase.toFixed(2) + "%"], ["  Orb Link bonus", r.rtpOrb.toFixed(2) + "%"], ["  Power T Free Games", r.rtpFree.toFixed(2) + "%"],
      ["Base hit frequency", r.hitFreq.toFixed(1) + "% of spins"], ["Orb Link frequency", `1 in ${r.orbOneIn.toFixed(0)}   (avg pay ${r.avgOrbX.toFixed(1)}x bet)`], ["Free Games frequency", `1 in ${r.freeOneIn.toFixed(0)}   (avg pay ${r.avgFreeX.toFixed(1)}x bet)`],
      ["20x+ bet win", `1 in ${r.bigOneIn.toFixed(0)} spins`], ["Biggest win seen", `${Math.round(r.maxWinX).toLocaleString()}x bet   (${r.full} full boards)`], ["Volatility (std dev)", r.volatility.toFixed(1)], ["Simulated", `${r.spins.toLocaleString()} spins in ${r.seconds.toFixed(1)}s`]];
    rows.forEach(([a, b, big]) => o.append(h("div", { class: "srow" + (big ? " big" : "") }, h("span", { text: a }), h("b", { text: b }))));
  }
  startSim() {
    const s = this.sim, cfg = clone(this.work), lvl = Math.max(0, Math.min(cfg.bet.power_levels.length - 1, s.level - 1));
    const st = newSim(cfg, s.spins, lvl); s.running = true; s.cancel = false; s.progress = 0; s.result = null; this.render();
    const step = () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 30 && st.s.done < st.s.spins && !s.cancel) simulateChunk(st, 500);
      s.progress = st.s.done / st.s.spins;
      if (st.s.done >= st.s.spins || s.cancel) { s.running = false; s.result = simResult(st); if (this.g.state === "admin") this.render(); return; }
      if (this.g.state === "admin") this.simPaint();
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }
  /* --------------------------------------------------------------------- tools */
  toolsView() {
    const g = this.g, stat = (title, d) => {
      const rtp = d.wagered ? (100 * d.won / d.wagered).toFixed(1) + "%" : "0.0%";
      return h("div", { class: "stat" }, h("h3", { text: title }), ...[["Spins", d.spins.toLocaleString()], ["Wagered", fmtMoney(d.wagered)], ["Won", fmtMoney(d.won)], ["Actual RTP", rtp], ["Biggest win", fmtMoney(d.biggest)],
        ["Orb Links", d.orb_bonuses], ["Free Games", d.free_games], ["Jackpots", d.jackpots]].map(([a, b]) => h("div", { class: "srow" }, h("span", { text: a }), h("b", { text: String(b) }))));
    };
    return [h("h3", { text: "TEST TOOLS" }), h("div", { class: "info", text: "Force the next spin to trigger a bonus (closes this panel):" }),
      h("div", { class: "row" }, h("button", { class: "btn go", text: "FORCE ORB LINK", onclick: () => { g.forceNext = "orb"; g.toast("NEXT SPIN FORCES THE ORB LINK"); this.close(); } }),
        h("button", { class: "btn go", text: "FORCE FREE GAMES", onclick: () => { g.forceNext = "power_t"; g.toast("NEXT SPIN FORCES FREE GAMES"); this.close(); } })),
      h("h3", { text: "STATISTICS" }), h("div", { class: "stats2" }, stat("SESSION", g.session), stat("LIFETIME (this browser)", g.stats)),
      h("div", { class: "info", text: "Settings and your balance are stored in this browser (localStorage). Clearing site data resets them." })];
  }
}
