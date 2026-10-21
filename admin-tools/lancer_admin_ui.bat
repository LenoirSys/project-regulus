@echo off
title Project Regulus GMAO - Administration Web Locale (Emulateur Hors-Ligne)
cd /d "%~dp0"

set USE_EMULATOR=true
set GCLOUD_PROJECT=demo-project-regulus
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

echo ========================================================
echo   PROJECT REGULUS GMAO - Interface Web d'Administration
echo   Mode : Emulateur Local (Firestore :8080 / Auth :9099)
echo ========================================================
echo.

if exist "..\venv\Scripts\python.exe" (
    "..\venv\Scripts\python.exe" server.py
) else (
    python server.py
)

pause
