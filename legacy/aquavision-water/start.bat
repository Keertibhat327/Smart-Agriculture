@echo off
title AquaVision Full Stack
set "ROOT=%~dp0"
echo Starting AquaVision backend and frontend...
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
start "AquaVision Backend" cmd /k ""%ROOT%start-backend.bat""
timeout /t 3 /nobreak >nul
start "AquaVision Frontend" cmd /k ""%ROOT%start-frontend.bat""
echo Both services are starting in separate windows.
echo Open http://localhost:3000 in your browser.
pause
