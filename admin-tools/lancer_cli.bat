@echo off
title Project Regulus GMAO - Console Admin CLI (Emulateur Hors-Ligne)
cd /d "%~dp0"

set USE_EMULATOR=true
set GCLOUD_PROJECT=demo-project-regulus
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

if exist "..\venv\Scripts\python.exe" (
    "..\venv\Scripts\python.exe" user.py
) else (
    python user.py
)

pause
