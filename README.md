# VOLS POWER LINK

## Play in your browser (easiest - nothing to install)

Open **`web/vols-power-link.html`** by double-clicking it (Chrome, Edge or Firefox). That single file is the whole game:
same maths, art, music, Smokey and admin panel as the desktop version. Click once on the title screen to start the sound.

* Your balance, settings and stats are saved in the browser (localStorage), so use the same browser each time.
* Admin panel: press **F1** (or click the small ADMIN label), default PIN `1234`.
* Editing the source? Use `web/index.html` + `web/js/*.js`, then run `python3 web/build_single.py` to rebuild the one-file version.
* Want a link you can open anywhere? Turn on GitHub Pages for the `web/` folder (or just upload the single file to any static host).

## Desktop version (Python + pygame)

The original build below still works if you prefer a native window.

A personal, local-play Tennessee Vols themed video slot, modelled on the "Zeus Charged Link" style of game:
5 reels x 3 rows, 20 paylines, a money-orb **hold & spin** bonus and a scatter-triggered **free games** bonus.
Everything (art, sound effects, ominous music) is generated in code - there are no asset files to download.

Runs on **Windows 11** and **Linux**. Python 3.9+ with `pygame-ce` (imported as `pygame`) and `numpy`.

## Run it

**Windows 11**: install Python 3 from python.org (tick *Add python.exe to PATH*), then double-click `run_windows.bat`.

**Linux**: `./run_linux.sh`

Or by hand, on either OS:

```
pip install -r requirements.txt
python main.py
```

The first launch synthesises the music (about 10 s, shown on the title screen) and caches it, so later starts are fast.
Options: `--windowed`, `--no-audio`, `--config path/to/config.json`, `--reset-config`, `--simulate 200000 --level 3`.

## Controls

| Key | Action |
|---|---|
| `Space` / `Enter` | Spin (or skip win animations) |
| `Up` / `Down` | Power level (bet size) |
| `Left` / `Right` | Denomination |
| `B` | Max bet you can afford |
| `A` | Auto spin |
| `M` / `S` | Mute music / sound effects |
| `H` | Paytable and how-to-play |
| `F11` | Fullscreen |
| `F1` | Admin panel |
| `Esc` (twice) | Quit |

Everything is also clickable with the mouse.

## The game

* **Bets are real dollars.** Nine denominations: 1c, 2c, 5c, 10c, 25c, 50c, $1, $5, $10.
  Ten **power levels** (20-500 credits). Total bet = denomination x credits.
  Every prize - line wins, orb values, jackpots - is a multiple of the bet, so winnings scale with both,
  and jackpots grow a little more at higher power levels.
* **Smokey's Orb Link** - land **6+ money orbs** anywhere. Orbs lock, you get 3 respins, and each new orb resets the respins.
  Orbs carry cash values or Mini / Minor / Major jackpots. Fill all 15 spots for the **Grand**.
  **Smokey** (the hound) shows up at random during the bonus to **howl** (power up some orbs), **fetch** (drop new orbs)
  or **super howl** (power up every orb).
* **Power T Free Games** - land **3+ Power T** symbols (the scatter) anywhere. Free games with a climbing win multiplier,
  Smokey dropping **sticky wilds**, retriggers, and even the Orb Link can hit inside free games.
* Teaser mechanics: reels slow down with a glowing frame when a bonus is one symbol away.
* Wilds substitute for everything except Power T and orbs.

## Admin panel (`F1` or the small ADMIN label, default PIN `1234`)

Every number is editable and saved to `config.json`:

* **General** - starting bankroll, PIN, volumes, turbo reels, reset bankroll / stats / factory defaults.
* **Bonus Hit Rates** - Orb Link and Power T bonuses are forced on a "1 in N spins" basis, so you set the frequency directly.
  Also how many orbs / Power Ts the trigger lands, and the hit rates inside free games.
* **Reel Weights** (base and free games) - per-symbol, per-reel frequency; controls line wins and near-misses.
* **Paytable**, **Orbs & Jackpots** (value ladder, weights, jackpot sizes, per-power-level jackpot boost, respins, fill chance),
  **Smokey** (appearance chance, howl / fetch / super weights, how many orbs and how big a boost),
  **Free Games** (spins, retriggers, multiplier ladder, sticky wild chance), **Bets & Denoms**.
* **Simulator** - plays up to a million spins of your *unsaved* settings in a background thread and reports total RTP and the
  split between line wins, Orb Link and Free Games, bonus frequency and volatility. Dial in, then **Save & Apply**.
* **Tools & Stats** - force the next spin to trigger either bonus (handy for testing), session and lifetime statistics.

Edit by clicking a value or using the arrow keys, type a number and press `Enter`, or use `+` / `-` (`Shift` = x10). `Ctrl+S` saves.
The factory settings come out near 95% RTP.

The same simulator from a terminal: `python main.py --simulate 500000 --level 3`.

## Where files live

| | Windows | Linux |
|---|---|---|
| config, save game, cache | `%APPDATA%\TNSlots` | `~/.local/share/tnslots` |

Set `TNSLOTS_HOME` to use another folder. Deleting `config.json` restores the defaults.

## Using your own art

Symbols are drawn procedurally. To replace any of them with your own artwork, drop square PNGs into
`<data folder>/assets/symbols/` named `J, Q, K, A, CHECKER, FOOTBALL, HELMET, TROPHY, SMOKEY, WILD, POWERT`
(and `ORB_CASH, ORB_MINI, ORB_MINOR, ORB_MAJOR, ORB_GRAND` for the orbs).

## Tests

`python -m unittest discover -s tests`

## A note on play money

This is a single-player toy: the balance is pretend money stored in a local save file. No real-money wagering of any kind.
