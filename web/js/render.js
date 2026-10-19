/* Portrait renderer for VOLS POWER LINK (720 x 1140): HUD, hero zone, board, controls, overlays. */
"use strict";
const MSG_Y = 1012, CTRL_Y = 1062, STATUS_Y = 368;
const PLAQUE = { x: 372, w: 336, h: 46, gap: 5, y0: HERO_Y + 6 };
const KIND_COL = { mini: [60, 200, 90], minor: [60, 130, 255], major: [175, 80, 245], grand: [240, 50, 60] };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function goldPlate(ctx, x, y, w, h, r, fillTop = [24, 20, 54], fillBot = [10, 8, 28]) {
  fillRR(ctx, x, y, w, h, r, metalGradient(ctx, x, y, w, h), null);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgb(fillTop)); g.addColorStop(1, rgb(fillBot));
  fillRR(ctx, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(2, r - 2), g, null);
}
function icon(ctx, kind, cx, cy, s, col) {
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s * 0.12; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (kind === "gear") { ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 6.283); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36); ctx.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5); ctx.stroke(); } }
  else if (kind === "music") { ctx.beginPath(); ctx.ellipse(-s * 0.15, s * 0.28, s * 0.16, s * 0.12, -0.4, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.moveTo(-s * 0.01, s * 0.24); ctx.lineTo(-s * 0.01, -s * 0.38); ctx.lineTo(s * 0.32, -s * 0.28); ctx.stroke(); }
  else if (kind === "sound") { ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.12); ctx.lineTo(-s * 0.18, -s * 0.12); ctx.lineTo(s * 0.04, -s * 0.34); ctx.lineTo(s * 0.04, s * 0.34); ctx.lineTo(-s * 0.18, s * 0.12); ctx.lineTo(-s * 0.36, s * 0.12); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(s * 0.04, 0, s * 0.24, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(s * 0.04, 0, s * 0.42, -0.8, 0.8); ctx.stroke(); }
  else if (kind === "help") { ctx.font = `${s * 0.95}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", 0, s * 0.04); }
  ctx.restore();
}
function rankIcon(ctx, i, cx, cy, s, art) {
  const names = ["TROPHY", "HELMET", "FOOTBALL", "SMOKEY", "POWERT"]; ctx.drawImage(art.sym[names[i]], cx - s / 2, cy - s / 2, s, s);
}

Object.assign(Game.prototype, {
  /* ------------------------------------------------------------------ orbs */
  drawOrb(ctx, orb, cx, cy, o = {}) {
    const scale = o.scale || 1, kind = orb ? orb.kind : "cash";
    if (o.slotAt) ctx.drawImage(this.art.cellBg, o.slotAt[0], o.slotAt[1], CELL, CELL);
    addGlow(ctx, cx, cy, CELL * 0.62 * scale, scaleC(ORB_COLORS[kind][1], 0.28));
    const sz = CELL * 1.02 * scale; ctx.drawImage(this.art.orb[kind], cx - sz / 2, cy - sz / 2, sz, sz);
    if (orb) {
      const cents = o.cents !== undefined ? o.cents : this.orbCents(orb);
      if (kind === "cash") { const label = money(cents, true); drawText(ctx, label, (label.length <= 6 ? 24 : label.length <= 7 ? 20 : 17) * scale, cx, cy, { ow: 3, outline: [70, 25, 0] }); }
      else { drawText(ctx, kind.toUpperCase(), 19 * scale, cx, cy - 6 * scale, { ow: 3, outline: [30, 0, 40] }); drawText(ctx, money(cents, true), 14 * scale, cx, cy + 13 * scale, { color: [255, 240, 180], ow: 2, outline: [30, 0, 40] }); }
    }
    if (o.flash > 0) addGlow(ctx, cx, cy, CELL * 0.8, [255, 255, 255], 0.9 * Math.min(1, o.flash));
  },
  /* ------------------------------------------------------------------ frame */
  draw() {
    const ctx = this.ctx; ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    this.drawBackground(ctx);
    if (this.state === "title") this.drawTitle(ctx);
    else {
      this.drawHero(ctx); this.drawLeaderboard(ctx); this.drawTopBar(ctx); this.drawStatusBar(ctx); this.drawBoard(ctx);
      this.drawFliers(ctx); if (this.wheel) this.drawWheel(ctx);
      this.bolts.forEach((b) => b.draw(ctx)); this.particles.draw(ctx);
      this.drawBottom(ctx); this.banners.forEach((b) => b.draw(ctx, this.t)); this.drawToasts(ctx);
      if (this.flash > 0) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, this.flash)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      if (this.broke() && this.state === "idle") this.drawBroke(ctx);
      if (this.helpOpen) this.drawHelp(ctx);
    }
    ctx.restore();
  },
  drawBackground(ctx) {
    const bg = this.bgs[this.theme], prev = this.bgs[this.prevTheme];
    if (this.themeMix < 1) { ctx.drawImage(prev.canvas, 0, 0); ctx.globalAlpha = this.themeMix; ctx.drawImage(bg.canvas, 0, 0); ctx.globalAlpha = 1; } else ctx.drawImage(bg.canvas, 0, 0);
    this.embers.update(this.dt, 0.6); this.embers.draw(ctx, bg.acc);
  },
  /* -------------------------------------------------------------- hero zone */
  drawHero(ctx) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, HERO_Y, W, HERO_H); ctx.clip();
    const st = this.art.stadium;
    if (this.themeMix < 1) { ctx.drawImage(st[this.prevTheme], 0, HERO_Y); ctx.globalAlpha = this.themeMix; ctx.drawImage(st[this.theme], 0, HERO_Y); ctx.globalAlpha = 1; } else ctx.drawImage(st[this.theme], 0, HERO_Y);
    // flicker on the floodlights
    addGlow(ctx, 34, HERO_Y + 24, 60 + 6 * Math.sin(this.t * 3), [110, 100, 70], 0.8); addGlow(ctx, 686, HERO_Y + 24, 60 + 6 * Math.sin(this.t * 3.7), [110, 100, 70], 0.8);
    this.smokey.draw(ctx, this.art);
    ctx.restore();
    this.drawPlaques(ctx);
    const lx = PLAQUE.x + PLAQUE.w / 2; addGlow(ctx, lx, HERO_Y + HERO_H - 24, 120, [70, 34, 0], 0.9);
    drawText(ctx, "VOLS POWER LINK", 30, lx, HERO_Y + HERO_H - 30, { color: ORANGE, ow: 4, outline: [40, 14, 0] });
    drawText(ctx, "TENNESSEE EDITION", 12, lx, HERO_Y + HERO_H - 10, { color: [255, 225, 170], outline: null });
    // hero frame edge
    ctx.fillStyle = metalGradient(ctx, 0, HERO_Y - 2, W, 3); ctx.fillRect(0, HERO_Y - 2, W, 3);
  },
  drawPlaques(ctx) {
    const names = ["grand", "major", "minor", "mini"], bet = this.betCredits;
    names.forEach((k, i) => {
      const x = PLAQUE.x, y = PLAQUE.y0 + i * (PLAQUE.h + PLAQUE.gap), w = PLAQUE.w, h = PLAQUE.h, c = KIND_COL[k];
      const hot = this.wheel && this.wheel.kind === k, pulse = hot ? 0.5 + 0.5 * Math.sin(this.t * 14) : 0;
      if (hot) addGlow(ctx, x + w / 2, y + h / 2, 150, scaleC(c, 0.5), 0.9);
      goldPlate(ctx, x, y, w, h, 8, scaleC(c, 0.22 + 0.2 * pulse), scaleC(c, 0.08));
      fillRR(ctx, x + 6, y + 6, 92, h - 12, 5, rgb(scaleC(c, 0.85)), null);
      drawText(ctx, k.toUpperCase(), 19, x + 52, y + h / 2 + 1, { ow: 2, outline: [10, 10, 30] });
      const amt = this.engine.orbCredits(new Orb(k, 0), bet, this.levelIdx) * this.denomCents;
      drawText(ctx, money(amt), amt >= 1e7 ? 24 : 27, x + w - 12, y + h / 2 + 1, { anchor: "right", ow: 3, outline: [10, 6, 24], color: hot ? [255, 255, 160] : WHITE });
    });
  },
  /* -------------------------------------------------------------- top bars */
  drawTopBar(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 50); g.addColorStop(0, "rgb(30,22,70)"); g.addColorStop(1, "rgb(10,8,30)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 50);
    ctx.fillStyle = metalGradient(ctx, 0, 48, W, 3); ctx.fillRect(0, 48, W, 3);
    const cg = ctx.createRadialGradient(20, 16, 2, 22, 20, 14); cg.addColorStop(0, "rgb(255,240,150)"); cg.addColorStop(1, "rgb(210,140,10)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(22, 21, 13, 0, 6.283); ctx.fill(); ctx.strokeStyle = "rgb(120,70,0)"; ctx.lineWidth = 2; ctx.stroke();
    drawText(ctx, "$", 16, 22, 22, { color: [140, 80, 0], outline: null });
    drawText(ctx, money(this.balance), 27, 42, 20, { anchor: "left", ow: 3, color: [255, 245, 200] });
    const lv = this.xpInfo(); fillRR(ctx, 42, 37, 190, 8, 4, "rgb(30,22,60)", "rgb(120,90,40)", 1);
    if (lv.frac > 0.01) { const gg = ctx.createLinearGradient(42, 0, 232, 0); gg.addColorStop(0, "rgb(255,140,0)"); gg.addColorStop(1, "rgb(255,220,100)"); fillRR(ctx, 43, 38, Math.max(6, 188 * lv.frac), 6, 3, gg, null); }
    drawText(ctx, `LV ${lv.level}`, 11, 238, 41, { anchor: "left", color: [255, 220, 150], ow: 2 });
    drawText(ctx, "LAST WIN", 10, 400, 14, { color: [255, 200, 120], outline: null }); drawText(ctx, money(this.lastWinCents || 0, true), 20, 400, 32, { ow: 3, color: this.lastWinCents ? GOLD : [150, 150, 180] });
    this.buttons.filter((b) => b.kind === "icon").forEach((b) => this.drawButton(ctx, b));
  },
  drawLeaderboard(ctx) {
    const y = 54, h = 52;
    ctx.fillStyle = "rgb(8,8,26)"; ctx.fillRect(0, 51, W, 59);
    goldPlate(ctx, 6, y, 108, h, 8, [60, 30, 100], [24, 12, 50]);
    drawText(ctx, "GAME DAY", 15, 60, y + 17, { color: [255, 220, 120], ow: 2 }); drawText(ctx, "TOP WINS", 17, 60, y + 36, { ow: 2 });
    const cols = [[255, 205, 60], [200, 205, 220], [60, 200, 90], [205, 130, 60], [90, 140, 255]];
    for (let i = 0; i < 5; i++) {
      const x = 122 + i * 118, w = 112, c = cols[i], hot = this.bestFlash === i && this.t % 0.6 < 0.3;
      goldPlate(ctx, x, y, w, h, 8, hot ? [60, 80, 160] : [22, 36, 96], [10, 16, 52]);
      fillRR(ctx, x + 3, y + 3, w - 6, 3, 1.5, rgb(c), null);
      drawText(ctx, "#" + (i + 1), 17, x + 12, y + 20, { anchor: "left", color: c, ow: 2 });
      rankIcon(ctx, i, x + 24, y + 38, 26, this.art);
      const v = this.best[i]; drawText(ctx, v ? money(v, true) : "---", 17, x + w - 8, y + 36, { anchor: "right", ow: 2, color: v ? WHITE : [120, 120, 150] });
    }
  },
  /* ----------------------------------------------------------- status bar */
  drawStatusBar(ctx) {
    const x = 14, y = STATUS_Y, w = W - 28, h = 34, cx = W / 2;
    goldPlate(ctx, x, y, w, h, 8, [20, 16, 46], [8, 6, 24]);
    const T = (s, sz, px, col = WHITE, o = {}) => drawText(ctx, s, sz, px, y + h / 2 + 1, Object.assign({ color: col, ow: 2 }, o));
    if (this.hold) {
      T("RESPINS", 14, 70, [180, 200, 255]);
      for (let i = 0; i < 3; i++) { const on = i < this.respinsDisp; ctx.fillStyle = on ? "rgb(255,190,60)" : "rgb(40,30,56)"; ctx.beginPath(); ctx.arc(124 + i * 26, y + h / 2, 9, 0, 6.283); ctx.fill(); ctx.strokeStyle = on ? "#fff" : "rgb(90,90,110)"; ctx.lineWidth = 2; ctx.stroke(); }
      T(`ORBS ${Object.keys(this.hold).length} / ${ALL_CELLS.length}`, 18, cx + 10, [255, 215, 130]);
      T("TOTAL " + money(this.holdTotal() * this.spinDenom, true), 18, W - 110, GOLD);
    } else if (this.fgInfo) {
      const fi = this.fgInfo, pot = this.cfg.free_games.collect_orbs, pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
      T(`FREE GAMES  ${fi.left} LEFT`, 16, 112, [255, 215, 110]);
      if (pot) { T(`ORB POT ${money(this.potDisp * this.spinDenom, true)}`, 18, cx + 30, [255, 230, 120 + 100 * pulse], { ow: 3 }); drawText(ctx, `${this.potCountDisp} ORBS`, 11, cx + 30, y + h - 4, { color: [200, 190, 160], outline: null }); }
      T(`x${fi.mult}`, 22, W - 56, [255, 160, 40], { ow: 3 });
    } else if (this.cfg.collect.enabled) {
      const target = Math.max(1, this.cfg.collect.target), frac = clamp01(this.meterDisp / target), near = frac > 0.85, pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
      if (near) addGlow(ctx, cx, y + h / 2, 300, [60 * pulse, 34 * pulse, 4], 0.8);
      drawCheckerIcon(ctx, x + 10, y + 7, 20);
      const bx = x + 40, bw = w - 190, by = y + 8, bh = h - 16;
      fillRR(ctx, bx, by, bw, bh, 5, "rgb(20,14,40)", "rgb(120,80,30)", 1.5);
      if (frac > 0) { const gg = ctx.createLinearGradient(bx, 0, bx + bw, 0); gg.addColorStop(0, "rgb(255,140,0)"); gg.addColorStop(1, near ? "rgb(255,245,150)" : "rgb(255,205,90)"); fillRR(ctx, bx + 1.5, by + 1.5, Math.max(6, (bw - 3) * frac), bh - 3, 4, gg, null); }
      drawText(ctx, `END ZONE  ${Math.floor(this.meterDisp)} / ${target}`, 15, bx + bw / 2, by + bh / 2 + 1, { ow: 2 });
      drawText(ctx, near ? "BONUS IS CLOSE!" : this.cfg.collect.bonus === "orb_link" ? "= ORB LINK" : this.cfg.collect.bonus === "random" ? "= BONUS" : "= FREE GAMES", 13, W - 82, y + h / 2 + 1, { color: near ? [255, 240, 140] : [210, 190, 230], ow: 2 });
    }
  },
  /* ---------------------------------------------------------------- board */
  drawBoard(ctx) {
    const bw = 5 * CELL + 4 * GAP, bh = ROWS * CELL + (ROWS - 1) * GAP, fx = GX - 12, fy = GY - 12, fw = bw + 24, fh = bh + 24;
    const col = { base: ORANGE, orb: [110, 190, 255], free: [255, 200, 60] }[this.theme];
    addGlow(ctx, W / 2, fy + fh / 2, 460, scaleC(col, 0.16), 0.7);
    fillRR(ctx, fx - 4, fy - 4, fw + 8, fh + 8, 18, metalGradient(ctx, fx, fy, fw, fh), null);
    fillRR(ctx, fx + 3, fy + 3, fw - 6, fh - 6, 14, "rgb(6,6,20)", rgb(scaleC(col, 0.7)), 2);
    for (const [px, py] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) { ctx.fillStyle = metalGradient(ctx, px - 7, py - 7, 14, 14); ctx.beginPath(); ctx.arc(px, py, 7, 0, 6.283); ctx.fill(); }
    for (let c = 0; c < 5; c++) for (let r = 0; r < ROWS; r++) { const [x, y] = cellPos(c, r); ctx.drawImage(this.art.cellBg, x, y, CELL, CELL); }
    if (this.hold) this.drawHold(ctx);
    else { this.reels.forEach((r) => r.draw(ctx, this)); this.drawSticky(ctx); this.drawHighlights(ctx); this.drawAnticipation(ctx); }
  },
  drawAnticipation(ctx) {
    for (const r of this.reels) if (r.anticipate) {
      const a = 0.5 + 0.5 * Math.sin(this.t * 14), hgt = ROWS * PITCH - GAP;
      fillRR(ctx, r.x - 3, GY - 3, CELL + 6, hgt + 6, 8, null, rgb([255 * a, 190 * a, 60 * a]), 4); addGlow(ctx, r.x + CELL / 2, GY + hgt / 2, 220, [60 * a, 40 * a, 8 * a], 0.8);
    }
  },
  drawHighlights(ctx) {
    if (!this.hlCells.size) return;
    if (this.reels.every((r) => r.state === "idle") && (this.state === "idle" || this.winDisp > 0))
      for (let c = 0; c < 5; c++) for (let r = 0; r < ROWS; r++) if (!this.hlCells.has(pk([c, r]))) { const [x, y] = cellPos(c, r); fillRR(ctx, x, y, CELL, CELL, 6, "rgba(0,0,10,0.58)", null); }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 9);
    for (const key of this.hlCells) {
      const [c, r] = unpk(key), [x, y] = cellPos(c, r);
      fillRR(ctx, x - 2, y - 2, CELL + 4, CELL + 4, 6, `rgba(120,230,255,${0.1 + 0.08 * pulse})`, rgb(scaleC([120, 230, 255], 0.75 + 0.25 * pulse)), 3);
    }
    if (this.hlLine && this.state === "idle") {
      const pts = PAYLINES[this.hlLine.line].map((row, c) => cellCenter(c, row));
      for (const [cc, w] of [[[160, 240, 255], 4], [[255, 255, 255], 1.5]]) { ctx.strokeStyle = rgb(cc, 0.9); ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
    }
  },
  drawSticky(ctx) {
    for (const key of this.sticky) {
      const [c, r] = unpk(key), [x, y] = cellPos(c, r), age = this.t - (this.stickyBorn[key] === undefined ? -9 : this.stickyBorn[key]);
      const sc = age < 0.35 ? easeOutBack(Math.min(1, age / 0.35)) : 1, sz = CELL * Math.max(0.05, sc);
      ctx.drawImage(this.art.cellBg, x, y, CELL, CELL); ctx.drawImage(this.art.sym.WILD, x + CELL / 2 - sz / 2, y + CELL / 2 - sz / 2, sz, sz);
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5 + c); fillRR(ctx, x - 1, y - 1, CELL + 2, CELL + 2, 6, null, rgb([255, 180 + 70 * pulse, 60]), 3); addGlow(ctx, x + CELL / 2, y + CELL / 2, 80, [60 * pulse, 40 * pulse, 4], 0.8);
    }
  },
  drawHold(ctx) {
    for (let c = 0; c < 5; c++) for (let r = 0; r < ROWS; r++) {
      const key = pk([c, r]), [x, y] = cellPos(c, r), d = this.hold[key];
      if (d) { const age = this.t - d.born, sc = age < 0.4 ? easeOutBack(Math.min(1, age / 0.4), 2) : 1; this.drawOrb(ctx, d.orb, x + CELL / 2, y + CELL / 2, { scale: Math.max(0.1, sc), flash: d.flash }); }
      else if (this.holdSpinning.has(key)) {
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, CELL, CELL); ctx.clip(); ctx.strokeStyle = "rgb(60,90,140)"; ctx.lineWidth = 2;
        for (let k = -1; k < 4; k++) { const yy = y + ((this.t * 700 + k * 45 + c * 23 + r * 41) % 190) - 45; ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.lineTo(x + CELL - 8, yy); ctx.stroke(); }
        const ph = (this.t * 800 + c * 130 + r * 77) % 260 - 70; ctx.globalAlpha = 0.43; ctx.drawImage(this.art.blur.ORB, x, y + ph - 70, CELL, CELL); ctx.restore();
      } else { ctx.strokeStyle = "rgb(40,40,80)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 13, 0, 6.283); ctx.stroke(); }
    }
  },
  /* ---------------------------------------------------------- bottom: win bar + controls */
  drawBottom(ctx) {
    const x = 10, y = MSG_Y, w = W - 20, h = 44;
    goldPlate(ctx, x, y, w, h, 10, [20, 30, 100], [8, 10, 46]);
    const wc = Math.floor(this.winDisp) * this.spinDenom;
    if (wc > 0) {
      drawText(ctx, money(wc), 34, W / 2, y + 19, { color: [255, 226, 80], ow: 4, outline: [60, 30, 0], scale: 1 + 0.03 * Math.sin(this.t * 10) * (this.state === "busy" ? 1 : 0) });
      if (this.hlLine && this.state === "idle") drawText(ctx, `LINE ${this.hlLine.line + 1} PAYS ${money(Math.round(this.hlLine.credits) * this.spinDenom)}`, 12, W / 2, y + h - 7, { color: [190, 215, 255], outline: null });
      else if (this.winLabel) drawText(ctx, this.winLabel, 12, W / 2, y + h - 7, { color: [190, 215, 255], outline: null });
    } else drawText(ctx, this.state === "busy" ? "GOOD LUCK!" : this.auto ? "AUTO PLAY" : "PLACE YOUR BET", 20, W / 2, y + h / 2 + 1, { color: [200, 220, 255], ow: 2 });
    const bar = ctx.createLinearGradient(0, CTRL_Y - 4, 0, H); bar.addColorStop(0, "rgb(26,18,66)"); bar.addColorStop(1, "rgb(8,6,24)"); ctx.fillStyle = bar; ctx.fillRect(0, CTRL_Y - 4, W, H - CTRL_Y + 4);
    ctx.fillStyle = metalGradient(ctx, 0, CTRL_Y - 6, W, 3); ctx.fillRect(0, CTRL_Y - 6, W, 3);
    // bet display
    drawText(ctx, money(this.cost), 28, 236, CTRL_Y + 36, { ow: 3, color: WHITE });
    drawText(ctx, `BET  -  LEVEL ${this.levelIdx + 1}  -  ${this.betCredits} CR`, 11, 236, CTRL_Y + 62, { color: [190, 190, 230], outline: null });
    this.buttons.filter((b) => b.kind !== "icon").forEach((b) => this.drawButton(ctx, b));
  },
  drawButton(ctx, b) {
    const [x, y, w, h] = b.r, en = b.en(), hov = this.mouse[0] >= x && this.mouse[0] <= x + w && this.mouse[1] >= y && this.mouse[1] <= y + h;
    if (b.kind === "icon") {
      const muted = (b.icon === "music" && this.audio.mutedMusic) || (b.icon === "sound" && this.audio.mutedSfx);
      fillRR(ctx, x, y, w, h, 8, hov ? "rgb(60,50,110)" : "rgb(26,22,60)", "rgba(214,160,60,0.6)", 1.5); icon(ctx, b.icon, x + w / 2, y + h / 2, 20, muted ? "rgb(255,90,90)" : en ? "rgb(255,225,150)" : "rgb(90,90,110)");
      if (muted) { ctx.strokeStyle = "rgb(255,90,90)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 8, y + h - 8); ctx.lineTo(x + w - 8, y + 8); ctx.stroke(); } return;
    }
    if (b.kind === "spin") {
      const busy = this.state === "busy", spinning = busy && this.reels.some((r) => r.state !== "idle"), label = busy ? (spinning ? "STOP" : "SKIP") : this.state === "idle" ? "SPIN!" : "...";
      const c1 = busy ? [255, 80, 70] : [90, 235, 90], c2 = busy ? [170, 20, 20] : [20, 140, 30], pulse = 0.5 + 0.5 * Math.sin(this.t * 5), live = this.state === "idle" && !this.broke();
      if (live || busy) addGlow(ctx, x + w / 2, y + h / 2, 150, scaleC(c1, 0.22 + 0.12 * pulse), 0.9);
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgb(c1)); g.addColorStop(0.5, rgb(c2)); g.addColorStop(1, rgb(scaleC(c2, 0.7)));
      fillRR(ctx, x, y, w, h, 14, "rgb(20,10,10)", null); fillRR(ctx, x + 3, y + 3, w - 6, h - 6, 12, g, "rgb(255,235,200)", 2.5);
      ctx.fillStyle = "rgba(255,255,255,0.22)"; rrect(ctx, x + 8, y + 6, w - 16, h * 0.33, 8); ctx.fill();
      drawText(ctx, label, 32, x + w / 2, y + h / 2 - (this.auto || live ? 5 : 0), { ow: 4, outline: [60, 0, 0] });
      if (this.spinPress && this.spinPress.t) { const f = clamp01((performance.now() - this.spinPress.t) / 600); fillRR(ctx, x + 10, y + h - 9, (w - 20) * f, 4, 2, "rgb(255,255,255)", null); }
      if (this.auto) drawText(ctx, "AUTO ON - TAP TO STOP", 10, x + w / 2, y + h - 13, { outline: null, color: [255, 255, 200] }); else if (live) drawText(ctx, "Hold for Auto", 11, x + w / 2, y + h - 13, { outline: null, color: [235, 255, 235] });
      return;
    }
    if (b.kind === "round") {
      fillRR(ctx, x, y, w, h, w / 2, en ? (hov ? "rgb(70,90,200)" : "rgb(40,56,150)") : "rgb(30,30,60)", en ? "rgb(214,170,80)" : "rgb(70,70,90)", 2.5);
      drawText(ctx, b.label, 30, x + w / 2, y + h / 2 + 1, { color: en ? WHITE : [110, 110, 130], ow: 2 }); return;
    }
    let col = en ? (hov ? [90, 70, 160] : [52, 40, 110]) : [30, 26, 54];
    if (b.label === "AUTO" && this.auto) col = [200, 100, 0];
    fillRR(ctx, x, y, w, h, 8, rgb(col), en ? "rgb(214,160,60)" : "rgb(70,60,80)", 2);
    if (b.kind === "chip") { drawText(ctx, b.label, 11, x + w / 2, y + 12, { color: [255, 210, 130], ow: 2 }); drawText(ctx, this.denomLabel(), 26, x + w / 2, y + h - 18, { ow: 3 }); }
    else drawText(ctx, b.label, 14, x + w / 2, y + h / 2 + 1, { color: en ? WHITE : [110, 110, 120], ow: 2 });
  },
  drawToasts(ctx) { let y = MSG_Y - 24; for (const [text, life] of this.toasts.slice(-3)) { drawText(ctx, text, 20, W / 2, y, { color: [255, 240, 200], ow: 3, alpha: Math.min(1, life / 0.4) }); y -= 26; } },
  /* ---------------------------------------------------------------- overlays */
  drawFliers(ctx) {
    for (const f of this.fliers) {
      const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u), cx = (f.x0 + f.x1) / 2, cy = Math.min(f.y0, f.y1) - 70;
      const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * cx + e * e * f.x1, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * cy + e * e * f.y1;
      if (f.kind === "checker") { const s = 30 * (1 - 0.35 * e); addGlow(ctx, x, y, 28, [90, 50, 8], 0.9); drawCheckerIcon(ctx, x - s / 2, y - s / 2, s); }
      else { const s = 50 * (1 - 0.3 * e); addGlow(ctx, x, y, 40, scaleC(ORB_COLORS[f.orbKind][1], 0.4), 0.9); ctx.drawImage(this.art.orb[f.orbKind], x - s / 2, y - s / 2, s, s); drawText(ctx, f.label, 11, x, y, { ow: 2, outline: [60, 20, 0], alpha: 1 - e * 0.5 }); }
    }
  },
  drawWheel(ctx) {
    const wh = this.wheel, a = Math.min(1, wh.scale); ctx.fillStyle = `rgba(0,0,10,${0.82 * a})`; ctx.fillRect(0, HERO_Y, W, MSG_Y - HERO_Y); this.drawPlaques(ctx);
    const cx = W / 2, cy = 706, R = 262 * Math.max(0.01, wh.scale);
    addGlow(ctx, cx, cy, R * 1.5, [90, 60, 10], 0.9);
    ctx.fillStyle = "rgb(60,34,0)"; ctx.beginPath(); ctx.arc(cx, cy, R + 22, 0, 6.283); ctx.fill();
    ctx.strokeStyle = metalGradient(ctx, cx - R, cy - R, R * 2, R * 2); ctx.lineWidth = 15; ctx.beginPath(); ctx.arc(cx, cy, R + 11, 0, 6.283); ctx.stroke();
    drawWheelDisc(ctx, cx, cy, R, wh.layout, wh.angle, { labels: true });
    if (wh.hl >= 0) { const seg = Math.PI * 2 / wh.layout.length; ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(this.t * 14)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -Math.PI / 2 - seg / 2, -Math.PI / 2 + seg / 2); ctx.closePath(); ctx.fill(); ctx.restore(); }
    const nb = 26; for (let i = 0; i < nb; i++) { const an = i / nb * 6.283, on = (i + Math.floor(wh.bulbs * 8)) % 2 === 0, bx = cx + Math.cos(an) * (R + 11), by = cy + Math.sin(an) * (R + 11); ctx.fillStyle = on ? "rgb(255,250,200)" : "rgb(150,100,20)"; ctx.beginPath(); ctx.arc(bx, by, 4, 0, 6.283); ctx.fill(); if (on) addGlow(ctx, bx, by, 12, [120, 90, 20], 0.8); }
    const hub = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 30); hub.addColorStop(0, "rgb(255,240,160)"); hub.addColorStop(1, "rgb(190,120,10)"); ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 6.283); ctx.fill(); ctx.strokeStyle = "rgb(90,50,0)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.drawImage(this.art.powerTOutline, cx - 21, cy - 21, 42, 42);
    ctx.save(); ctx.translate(cx, cy - R - 14); ctx.rotate(-wh.flick * 0.35); ctx.fillStyle = "rgb(255,70,60)"; ctx.strokeStyle = "rgb(255,240,200)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-18, -20); ctx.lineTo(18, -20); ctx.lineTo(0, 28); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  },
  drawTitle(ctx) {
    ctx.fillStyle = "rgba(0,0,10,0.72)"; ctx.fillRect(0, 280, W, 420);
    ctx.drawImage(this.art.powerTOutline, W / 2 - 110, 120, 220, 220);
    drawText(ctx, "VOLS", 120, W / 2, 400, { color: ORANGE, ow: 7, outline: [60, 20, 0], scale: 1 + 0.01 * Math.sin(this.t * 3) });
    drawText(ctx, "POWER LINK", 86, W / 2, 500, { color: WHITE, ow: 6, outline: [60, 20, 0] });
    drawText(ctx, "SMOKEY'S ORB LINK  -  POWER T FREE GAMES", 19, W / 2, 580, { color: [255, 210, 150] });
    drawText(ctx, "TENNESSEE EDITION", 24, W / 2, 620, { color: ORANGE_HI, ow: 3 });
    drawText(ctx, "TAP TO PLAY", 44, W / 2, 800, { color: [255, 230, 170], alpha: (150 + 100 * Math.sin(this.t * 4)) / 255 });
    if (this.audio.enabled) drawText(ctx, this.audio.started ? (this.audio.ready ? "SOUND READY" : "SYNTHESISING SOUNDS...") : "SOUND STARTS AFTER YOUR FIRST TAP", 15, W / 2, 870, { color: [150, 150, 175], outline: null });
  },
  drawBroke(ctx) {
    ctx.fillStyle = "rgba(0,0,10,0.78)"; ctx.fillRect(0, 0, W, H); drawText(ctx, "OUT OF FUNDS", 66, W / 2, 520, { color: [255, 90, 60], ow: 5 });
    drawText(ctx, `TAP OR PRESS R FOR A FRESH ${money(Math.round(this.cfg.general.starting_balance * 100))}`, 20, W / 2, 590);
  },
  drawHelp(ctx) {
    ctx.fillStyle = "rgba(0,0,10,0.93)"; ctx.fillRect(0, 0, W, H); drawText(ctx, "HOW TO PLAY", 42, W / 2, 50, { color: ORANGE, ow: 4 });
    const lines = ["5 reels x 5 rows, 40 paylines, stacks of symbols. Wins pay left to right, 3 or more.", "Wilds substitute for everything except Power T, Wheel and Orbs.",
      "6+ ORBS = SMOKEY'S ORB LINK. Orbs lock, 3 respins (reset on every new orb).", "Smokey may HOWL (boost orbs), FETCH (add orbs) or SUPER HOWL (boost all).",
      "Mini / Minor / Major orbs pay their jackpot. Fill every spot for the GRAND.", "3+ POWER T = FREE GAMES: climbing multipliers, sticky Smokey wilds.",
      "In Free Games every orb drops into the ORB POT, paid in full at the end.", "3 WHEEL symbols on a free spin = the JACKPOT WHEEL (jackpots only).",
      "Collect checkerboards: fill the END ZONE meter to force the bonus.", "Every prize is a multiple of your bet, so LEVEL and DENOMINATION scale all wins."];
    lines.forEach((ln, i) => drawText(ctx, ln, 15, W / 2, 100 + i * 26));
    const lb = this.betCredits / LINES * this.denomCents; drawText(ctx, `PAYTABLE at ${money(this.cost)} bet`, 20, W / 2, 392, { color: [255, 200, 120] });
    PAYING.slice().reverse().forEach((sym, i) => {
      const col = i % 3, row = Math.floor(i / 3), x = 30 + col * 232, yy = 420 + row * 106; ctx.drawImage(this.art.sym[sym], x, yy, 80, 80);
      for (let k = 0; k < 3; k++) drawText(ctx, `${5 - k}: ${money(Math.round(this.cfg.paytable[sym][2 - k] * lb))}`, 15, x + 88, yy + 16 + k * 22, { anchor: "left" });
    });
    drawText(ctx, "SPACE spin/stop (hold = auto)   UP/DOWN level   LEFT/RIGHT denom   A auto   B max bet", 12, W / 2, 1090, { color: [180, 180, 200], outline: null });
    drawText(ctx, "M music   S sound   F11 fullscreen   F1 admin   ESC close", 12, W / 2, 1108, { color: [180, 180, 200], outline: null });
    drawText(ctx, "TAP ANYWHERE TO CLOSE", 16, W / 2, 1128, { color: [255, 220, 160] });
  },
});
