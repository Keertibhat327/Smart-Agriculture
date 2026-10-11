@echo off
title Smart Agricultural Climate Risk Visualization
set "ROOT=%~dp0"

echo.
echo ===============================================
echo  Smart Agricultural Climate Risk Visualization
echo ===============================================
echo.
echo Starting local app...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-local.ps1"

echo.
echo If the app did not open, visit:
echo http://127.0.0.1:5173/
echo.
pause
