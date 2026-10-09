"""Sound + music playback. Everything is synthesised at start-up (cached on disk afterwards)."""
import os
import threading

import numpy as np
import pygame

from . import __version__, paths, synth


class Audio:
    MUSIC = ("base", "orb", "free")

    def __init__(self, music_volume=0.55, sfx_volume=0.85):
        self.enabled = False
        self.music_volume = music_volume
        self.sfx_volume = sfx_volume
        self.muted_music = False
        self.muted_sfx = False
        self.sounds = {}
        self.music = {}
        self.current_music = None
        self.wanted_music = None
        self._lock = threading.Lock()
        try:
            pygame.mixer.pre_init(synth.SR, -16, 2, 512)
            pygame.mixer.init(synth.SR, -16, 2, 512)
            pygame.mixer.set_num_channels(40)
            self.enabled = True
        except pygame.error:
            return
        self.music_channels = [pygame.mixer.Channel(0), pygame.mixer.Channel(2)]
        self._mc = 0
        self.spin_channel = pygame.mixer.Channel(1)
        self.loaded = False
        self._thread = threading.Thread(target=self._build, daemon=True)
        self._thread.start()

    # ------------------------------------------------------------- building
    def _cache_file(self, name):
        d = os.path.join(paths.data_dir(), "cache")
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, f"{name}-{__version__}-{synth.SR}.npy")

    def _cached(self, name, fn):
        f = self._cache_file(name)
        try:
            if os.path.exists(f):
                return np.load(f)
        except (OSError, ValueError):
            pass
        arr = fn()
        try:
            np.save(f, arr)
        except OSError:
            pass
        return arr

    def _mk(self, arr):
        return pygame.mixer.Sound(buffer=np.ascontiguousarray(arr).tobytes())

    def _build(self):
        S = self.sounds
        try:
            def add(name, fn, cache=False):
                arr = self._cached("sfx_" + name, fn) if cache else fn()
                S[name] = self._mk(arr)

            for i in range(5):
                add(f"stop{i}", lambda i=i: synth.reel_stop(i))
            add("spinloop", synth.reel_spin_loop)
            for i in range(15):
                add(f"orb{i}", lambda i=i: synth.orb_land(i))
            for i in range(5):
                add(f"tland{i}", lambda i=i: synth.power_t_land(i))
            for i in range(5):
                add(f"coin{i}", lambda i=i: synth.coin(i * 2))
            add("click", synth.click)
            add("tick", lambda: synth.click(-5))
            add("spin", synth.spin_button)
            for i in range(4):
                add(f"fanfare{i}", lambda i=i: synth.fanfare(i))
            add("trigger", synth.bonus_trigger)
            add("thunder", synth.thunder)
            add("zap", synth.zap)
            add("howl", synth.howl)
            add("bark", synth.bark)
            add("boost", synth.orb_boost)
            add("collect", synth.collect)
            add("buzz", synth.error_buzz)
            with self._lock:
                self.loaded = True
            self._apply_wanted_music()
            for key, fn in (("base", synth.music_base), ("orb", lambda: synth.music_bonus("orb")),
                            ("free", lambda: synth.music_bonus("free"))):
                self.music[key] = self._mk(self._cached("music_" + key, fn))
                self._apply_wanted_music()
        except Exception as exc:  # never let audio crash the game
            print("audio build failed:", exc)

    # -------------------------------------------------------------- playback
    def play(self, name, vol=1.0, pan=None):
        if not self.enabled or self.muted_sfx:
            return None
        snd = self.sounds.get(name)
        if snd is None:
            return None
        ch = snd.play()
        if ch is not None:
            v = max(0.0, min(1.0, vol * self.sfx_volume))
            if pan is None:
                ch.set_volume(v)
            else:
                ch.set_volume(v * (1 - max(0, pan)), v * (1 + min(0, pan)))
        return ch

    def spin_loop(self, on):
        if not self.enabled:
            return
        if on and not self.muted_sfx and "spinloop" in self.sounds:
            if not self.spin_channel.get_busy():
                self.spin_channel.play(self.sounds["spinloop"], loops=-1)
                self.spin_channel.set_volume(0.35 * self.sfx_volume)
        else:
            self.spin_channel.fadeout(120)

    def set_music(self, key):
        self.wanted_music = key
        self._apply_wanted_music()

    def _apply_wanted_music(self):
        if not self.enabled:
            return
        key = self.wanted_music
        if key == self.current_music or key not in self.music:
            return
        self.current_music = key
        self.music_channels[self._mc].fadeout(900)
        self._mc = 1 - self._mc
        ch = self.music_channels[self._mc]
        ch.play(self.music[key], loops=-1, fade_ms=1400)
        self._volume()

    def _volume(self):
        if self.enabled:
            self.music_channels[self._mc].set_volume(0.0 if self.muted_music else self.music_volume)

    def set_volumes(self, music, sfx):
        self.music_volume, self.sfx_volume = music, sfx
        self._volume()

    def toggle_music(self):
        self.muted_music = not self.muted_music
        self._volume()
        return self.muted_music

    def toggle_sfx(self):
        self.muted_sfx = not self.muted_sfx
        if self.muted_sfx:
            self.spin_loop(False)
        return self.muted_sfx
