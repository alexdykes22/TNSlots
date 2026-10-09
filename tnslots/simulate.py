"""Monte-Carlo the whole game (base, orb bonus, free games) to see RTP and hit rates."""
import random
import time

from .engine import Engine


def run(cfg, spins=100000, level=0, seed=None, progress=None):
    e = Engine(cfg, random.Random(seed))
    bet = int(cfg["bet"]["power_levels"][level])
    s = dict(spins=spins, wagered=0, base=0.0, orb=0.0, free=0.0, free_orb=0.0, wins=0,
             orb_bonuses=0, free_bonuses=0, free_spins=0, max_win=0, big=0, sq=0.0, full=0)
    t0 = time.time()
    for i in range(spins):
        s["wagered"] += bet
        r = e.spin_base(bet, level)
        win = r.total_credits
        s["base"] += win
        total = win
        if win:
            s["wins"] += 1
        if r.trigger == "orb":
            hs = e.start_hold_and_spin(r.orbs, bet, level)
            v = hs.play_out()
            s["orb_bonuses"] += 1
            s["full"] += len(hs.orbs) >= 15
            s["orb"] += v
            total += v
        elif r.trigger == "power_t":
            fg = e.start_free_games(r.free_spins_awarded, bet, level)
            s["free_bonuses"] += 1
            while not fg.done:
                fr = fg.play_spin()
                s["free_spins"] += 1
                if fr.trigger == "orb":
                    hs = e.start_hold_and_spin(fr.orbs, bet, level)
                    v = hs.play_out()
                    if cfg["free_games"]["multiplier_on_orbs"]:
                        v *= fr.multiplier
                    fg.add_win(v)
                    s["free_orb"] += v
            s["free"] += fg.total_credits
            total += fg.total_credits
        s["max_win"] = max(s["max_win"], total / bet)
        s["big"] += total >= 20 * bet
        s["sq"] += (total / bet) ** 2
        if progress and i % 2000 == 0:
            if progress(i / spins) is False:
                s["spins"] = i + 1
                break
    n = s["spins"]
    w = s["wagered"] or 1
    mean = (s["base"] + s["orb"] + s["free"]) / w
    var = s["sq"] / n - (mean) ** 2
    return {
        "spins": n,
        "rtp": 100.0 * (s["base"] + s["orb"] + s["free"]) / w,
        "rtp_base_lines": 100.0 * s["base"] / w,
        "rtp_orb_bonus": 100.0 * s["orb"] / w,
        "rtp_free_games": 100.0 * s["free"] / w,
        "hit_freq": 100.0 * s["wins"] / n,
        "orb_bonus_one_in": n / s["orb_bonuses"] if s["orb_bonuses"] else 0,
        "free_games_one_in": n / s["free_bonuses"] if s["free_bonuses"] else 0,
        "avg_orb_bonus_x": s["orb"] / (s["orb_bonuses"] or 1) / bet,
        "avg_free_games_x": s["free"] / (s["free_bonuses"] or 1) / bet,
        "max_win_x": s["max_win"],
        "big_win_one_in": n / s["big"] if s["big"] else 0,
        "volatility": max(0.0, var) ** 0.5,
        "full_boards": s["full"],
        "seconds": time.time() - t0,
    }
