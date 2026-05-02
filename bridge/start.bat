@echo off
setlocal EnableDelayedExpansion
title Claude Bridge

REM Claude Bridge launcher for Windows — double-click to start the bridge.

cd /d "%USERPROFILE%\PremiereClaude" 2>nul
if errorlevel 1 (
    echo ERROR: %USERPROFILE%\PremiereClaude not found.
    echo Make sure you copied bridge.js to that folder during install.
    pause
    exit /b 1
)

REM Find node.exe — try common install locations, then PATH
set "NODE_BIN="
for %%P in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
    "%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
) do (
    if exist "%%~P" (
        set "NODE_BIN=%%~P"
        goto :found_node
    )
)
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_BIN=node"
    goto :found_node
)
echo ERROR: node.exe not found. Install Node.js from https://nodejs.org
pause
exit /b 1

:found_node
echo --------------------------------------
echo   Claude Bridge
echo --------------------------------------
echo   Node:    !NODE_BIN!
echo   Bridge:  %CD%\bridge.js
echo   Stop:    close this window
echo --------------------------------------
echo.

REM If port 3737 is already taken, surface that instead of a cryptic crash
netstat -ano | findstr :3737 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo Port 3737 is already in use — the bridge is probably already running.
    echo If you want to restart it, run:
    echo     for /f "tokens=5" %%%%a in ('netstat -ano ^^^| findstr :3737 ^^^| findstr LISTENING') do taskkill /F /PID %%%%a
    echo.
    pause
    exit /b 0
)

"!NODE_BIN!" bridge.js
echo.
echo Bridge stopped.
pause
