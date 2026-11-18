@echo off
title Kassensturz
cd /d "%~dp0"
if not exist "%~dp0app\beispiel\kontoauszug-oktober-2026.pdf" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\beispiel-pdf-erzeugen.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
