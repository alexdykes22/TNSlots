@echo off
cd /d "%~dp0"
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install --quiet -r requirements.txt
python main.py %*
pause
