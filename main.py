#!/usr/bin/env python3
"""VOLS POWER LINK - Tennessee Vols themed video slot.  Run:  python main.py"""
import argparse
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser(description="VOLS POWER LINK slot game")
    ap.add_argument("--simulate", type=int, metavar="SPINS", help="run the maths simulator instead of the game")
    ap.add_argument("--level", type=int, default=1, help="power level for --simulate (1-based)")
    ap.add_argument("--config", help="path to a config.json to use")
    ap.add_argument("--no-audio", action="store_true", help="disable all sound")
    ap.add_argument("--windowed", action="store_true", help="ignore the fullscreen setting")
    ap.add_argument("--reset-config", action="store_true", help="restore factory settings and exit")
    args = ap.parse_args()

    from tnslots import config as C

    if args.reset_config:
        C.save_config(C.reset_config(), args.config)
        print("Settings restored to factory defaults.")
        return 0
    cfg = C.load_config(args.config)
    if args.simulate:
        from tnslots import simulate
        r = simulate.run(cfg, args.simulate, max(0, args.level - 1))
        print(json.dumps(r, indent=2))
        return 0
    if args.windowed:
        cfg["general"]["fullscreen"] = False

    import pygame
    pygame.init()
    from tnslots.game import Game
    game = Game(cfg, audio=not args.no_audio, config_path=args.config)
    game.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
