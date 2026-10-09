/* Web Audio playback for the synthesised sounds. */
"use strict";
class GameAudio {
  constructor(musicVol = 0.55, sfxVol = 0.85) {
    this.musicVol = musicVol; this.sfxVol = sfxVol;
    this.mutedMusic = false; this.mutedSfx = false;
    this.buffers = {}; this.musicBufs = {}; this.musicSrc = null; this.currentMusic = null; this.wantedMusic = null;
    this.spinSrc = null; this.loaded = false; this.enabled = false; this.started = false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.enabled = true;
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
      this.reverb = this.ctx.createConvolver(); this.reverb.normalize = false;
      this.reverbGain = this.ctx.createGain(); this.reverbGain.gain.value = 0.9;
      this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.musicBus);
      this._vol();
    } catch (e) { this.enabled = false; }
  }
  /* Browsers only allow sound after a click / key press. */
  unlock() {
    if (!this.enabled) return;
    if (this.ctx.state !== "running") this.ctx.resume();
    if (!this.started) { this.started = true; this._build(); }
  }
  _buf(s) { const b = this.ctx.createBuffer(2, s.l.length, SR); b.copyToChannel(s.l, 0); b.copyToChannel(s.r, 1); return b; }
  async _build() {
    const B = this.buffers, add = (name, fn) => { B[name] = this._buf(fn()); };
    try {
      for (let i = 0; i < 5; i++) add("stop" + i, () => reelStop(i));
      add("spinloop", reelSpinLoop); await tick();
      for (let i = 0; i < 15; i++) add("orb" + i, () => orbLand(i));
      for (let i = 0; i < 5; i++) add("tland" + i, () => powerTLand(i));
      for (let i = 0; i < 5; i++) add("coin" + i, () => coin(i * 2));
      add("click", () => click()); add("tick", () => click(-5)); add("spin", spinButton); await tick();
      for (let i = 0; i < 4; i++) { add("fanfare" + i, () => fanfare(i)); await tick(); }
      add("trigger", bonusTrigger); await tick();
      add("thunder", thunder); add("zap", zap); await tick();
      add("howl", howl); add("bark", bark); add("boost", orbBoost); add("collect", collect); add("buzz", errorBuzz);
      this.loaded = true;
      const irs = reverbIR(3.0, this.ctx.sampleRate); const ir = this.ctx.createBuffer(2, irs.l.length, this.ctx.sampleRate); ir.copyToChannel(irs.l, 0); ir.copyToChannel(irs.r, 1); this.reverb.buffer = ir;
      this.musicBufs.base = this._buf(await musicBase()); this._applyMusic(); await tick();
      this.musicBufs.orb = this._buf(await musicBonus("orb")); this._applyMusic(); await tick();
      this.musicBufs.free = this._buf(await musicBonus("free")); this._applyMusic();
    } catch (e) { console.error("audio build failed", e); }
  }
  get ready() { return this.loaded && this.musicBufs.base && this.musicBufs.orb && this.musicBufs.free; }
  play(name, vol = 1, pan = 0) {
    if (!this.enabled || this.mutedSfx || !this.started) return;
    const b = this.buffers[name]; if (!b) return;
    const src = this.ctx.createBufferSource(); src.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = Math.max(0, Math.min(1, vol));
    let node = g; src.connect(g);
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.sfxBus); src.start();
  }
  spinLoop(on) {
    if (!this.enabled) return;
    if (on && !this.mutedSfx && this.buffers.spinloop) {
      if (this.spinSrc) return;
      const s = this.ctx.createBufferSource(); s.buffer = this.buffers.spinloop; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0.35; s.connect(g); g.connect(this.sfxBus); s.start();
      this.spinSrc = { s, g };
    } else if (this.spinSrc) {
      const { s, g } = this.spinSrc; this.spinSrc = null;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04); s.stop(this.ctx.currentTime + 0.3);
    }
  }
  setMusic(key) { this.wantedMusic = key; this._applyMusic(); }
  _applyMusic() {
    if (!this.enabled || !this.started) return;
    const key = this.wantedMusic;
    if (key === this.currentMusic || !this.musicBufs[key]) return;
    this.currentMusic = key;
    const t = this.ctx.currentTime;
    if (this.musicSrc) { const o = this.musicSrc; o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(o.g.gain.value, t); o.g.gain.linearRampToValueAtTime(0, t + 1.2); o.s.stop(t + 1.3); }
    const s = this.ctx.createBufferSource(); s.buffer = this.musicBufs[key]; s.loop = true;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.4);
    s.connect(g); g.connect(this.musicBus); g.connect(this.reverb); s.start();
    this.musicSrc = { s, g };
  }
  _vol() { if (!this.enabled) return; this.musicBus.gain.value = this.mutedMusic ? 0 : this.musicVol; this.sfxBus.gain.value = this.mutedSfx ? 0 : this.sfxVol; }
  setVolumes(m, s) { this.musicVol = m; this.sfxVol = s; this._vol(); }
  toggleMusic() { this.mutedMusic = !this.mutedMusic; this._vol(); return this.mutedMusic; }
  toggleSfx() { this.mutedSfx = !this.mutedSfx; if (this.mutedSfx) this.spinLoop(false); this._vol(); return this.mutedSfx; }
}
