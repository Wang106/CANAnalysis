@echo off
setlocal
cd /d "%~dp0\.."
python -m pip install -r bridge\requirements.txt
if errorlevel 1 exit /b %errorlevel%
python -m bridge.cananalysis_bridge
