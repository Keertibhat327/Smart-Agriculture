@echo off
title AquaVision Backend
set "BACKEND=%~dp0backend"
cd /d "%BACKEND%"
echo Starting GEE Backend on port 8000...
py app.py
pause
