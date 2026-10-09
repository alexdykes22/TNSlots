import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tnslots import config, simulate  # noqa: E402
from tnslots.engine import ALL_CELLS, LINES, Engine, Orb  # noqa: E402


def cfg():
    return config.reset_config()


def blank(sym="J"):
    return [[sym] * 3 for _ in range(5)]


class Paylines(unittest.TestCase):
    def setUp(self):
        self.e = Engine(cfg(), random.Random(1))

    def test_three_of_a_kind_pays_line_bet_multiple(self):
        g = [["Q", "Q", "Q"], ["K", "K", "K"], ["A", "A", "A"], ["CHECKER", "J", "J"], ["Q", "K", "A"]]
        wins, total = self.e.evaluate(g, 200)
        # lines through row 0 and row 1... only symbols that repeat 3x from reel 1 pay, no 3-in-row here
        self.assertEqual(total, 0)
        g = blank("J")
        wins, total = self.e.evaluate(g, 200)
        self.assertEqual(len(wins), LINES)
        self.assertAlmostEqual(total, 20 * 50 * (200 / 20))

    def test_wild_substitutes_and_orbs_scatters_do_not(self):
        g = blank("J")
        g[1] = ["WILD"] * 3
        g[0] = ["K"] * 3
        g[2] = ["K"] * 3
        wins, total = self.e.evaluate(g, 20)
        self.assertTrue(all(w.symbol == "K" and w.count == 3 for w in wins))
        g = blank("J")
        g[2] = ["ORB"] * 3
        wins, total = self.e.evaluate(g, 20)
        for w in wins:
            self.assertLess(w.count, 3)

    def test_pays_scale_with_bet(self):
        g = blank("A")
        _, a = self.e.evaluate(g, 20)
        _, b = self.e.evaluate(g, 500)
        self.assertAlmostEqual(b / a, 25)


class Triggers(unittest.TestCase):
    def test_forced_bonuses_and_no_accidental_triggers(self):
        e = Engine(cfg(), random.Random(7))
        for _ in range(300):
            r = e.spin_base(40, 2, force="orb")
            self.assertEqual(r.trigger, "orb")
            self.assertGreaterEqual(len(r.orbs), 6)
            r = e.spin_base(40, 2, force="power_t")
            self.assertEqual(r.trigger, "power_t")
            self.assertGreaterEqual(len(r.t_cells), 3)
            self.assertGreater(r.free_spins_awarded, 0)
        c = cfg()
        c["hit_rates"]["orb_bonus_one_in"] = 1e9
        c["hit_rates"]["power_t_bonus_one_in"] = 1e9
        e = Engine(c, random.Random(3))
        for _ in range(3000):
            r = e.spin_base(40, 0)
            self.assertIsNone(r.trigger)
            self.assertLess(len(r.orbs), 6)
            self.assertLess(len(r.t_cells), 3)

    def test_hit_rate_is_configurable(self):
        c = cfg()
        c["hit_rates"]["orb_bonus_one_in"] = 20
        c["hit_rates"]["power_t_bonus_one_in"] = 1e9
        e = Engine(c, random.Random(11))
        n = 20000
        hits = sum(e.spin_base(20, 0).trigger == "orb" for _ in range(n))
        self.assertAlmostEqual(hits / n, 1 / 20, delta=0.01)


class Bonuses(unittest.TestCase):
    def test_hold_and_spin_invariants(self):
        e = Engine(cfg(), random.Random(5))
        for level in (0, 5, 9):
            for _ in range(200):
                r = e.spin_base(100, level, force="orb")
                hs = e.start_hold_and_spin(r.orbs, 100, level)
                start = len(hs.orbs)
                total = hs.play_out()
                self.assertGreaterEqual(len(hs.orbs), start)
                self.assertTrue(hs.done)
                self.assertEqual(total, sum(hs.value(o) for o in hs.orbs.values()) +
                                 (hs.grand_bonus() if len(hs.orbs) == 15 else 0))
                self.assertTrue(set(hs.orbs) <= set(ALL_CELLS))

    def test_jackpots_scale_with_bet_and_level(self):
        e = Engine(cfg(), random.Random(1))
        a = e.orb_credits(Orb("mini"), 20, 0)
        b = e.orb_credits(Orb("mini"), 200, 0)
        self.assertEqual(b, a * 10)
        self.assertGreater(e.orb_credits(Orb("grand"), 100, 9), e.orb_credits(Orb("grand"), 100, 0))

    def test_smokey_never_lowers_orbs(self):
        c = cfg()
        c["smokey"]["appear_chance"] = 1.0
        c["smokey"]["intro_chance"] = 1.0
        e = Engine(c, random.Random(2))
        for _ in range(100):
            r = e.spin_base(100, 0, force="orb")
            hs = e.start_hold_and_spin(r.orbs, 100, 0)
            before = {p: hs.value(o) for p, o in hs.orbs.items()}
            hs.play_out()
            for p, v in before.items():
                self.assertGreaterEqual(hs.value(hs.orbs[p]), v)

    def test_free_games_run_to_completion(self):
        e = Engine(cfg(), random.Random(9))
        for _ in range(100):
            fg = e.start_free_games(8, 100, 2)
            n = 0
            while not fg.done:
                r = fg.play_spin()
                for p in fg.sticky:
                    self.assertEqual(r.grid[p[0]][p[1]], "WILD")
                n += 1
                self.assertLess(n, 500)
            self.assertGreaterEqual(fg.total_credits, 0)


class Config(unittest.TestCase):
    def test_default_rtp_is_reasonable(self):
        r = simulate.run(cfg(), 60000, 0, seed=4)
        self.assertGreater(r["rtp"], 70)
        self.assertLess(r["rtp"], 125)

    def test_partial_config_merges(self):
        merged = config.deep_merge(config.DEFAULT_CONFIG, {"hit_rates": {"orb_bonus_one_in": 12}})
        self.assertEqual(merged["hit_rates"]["orb_bonus_one_in"], 12)
        self.assertIn("power_t_bonus_one_in", merged["hit_rates"])

    def test_nine_denominations(self):
        self.assertEqual(config.DEFAULT_CONFIG["bet"]["denominations"], [0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 1.0, 5.0, 10.0])


if __name__ == "__main__":
    unittest.main()
