@echo off
REM ============================================================
REM  Flimify for Premiere Pro - Windows installer (DOUBLE-CLICK)
REM  Just double-click this file. It runs install.ps1 for you so
REM  you never have to open PowerShell or type any commands.
REM ============================================================
title Flimify for Premiere Pro - Installer
cd /d "%~dp0"

echo ============================================================
echo   Flimify for Premiere Pro  -  Windows Installer
echo ============================================================
echo.
echo This installs Node.js, the Claude CLI, ffmpeg and the
echo Premiere panel. The first run can take a few minutes (it
echo runs npm install). If Windows asks for permission, click Yes.
echo.
echo *** Close Adobe Premiere Pro before continuing. ***
echo.
pause

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set "RC=%ERRORLEVEL%"

echo.
echo ============================================================
if "%RC%"=="0" (
  echo   Done. Open Premiere Pro -^> Window -^> Extensions -^> Flimify.
  echo   The panel starts the bridge for you automatically.
) else (
  echo   The installer reported a problem ^(code %RC%^).
  echo   Scroll up to read the red lines, fix the issue, and
  echo   double-click this file again - it is safe to re-run.
)
echo ============================================================
echo.
pause
