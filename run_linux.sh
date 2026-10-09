#!/usr/bin/env bash
# Creates a private virtualenv on first run, then starts the game.
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
pip install --quiet -r requirements.txt
exec python main.py "$@"
