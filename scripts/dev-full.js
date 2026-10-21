#!/usr/bin/env node
/**
 * ============================================================
 * PROJECT REGULUS — Orchestrateur Local Complet (dev:full)
 * ============================================================
 * Démarre simultanément (sans dépendance npm externe) :
 *   1. Firebase Local Emulator Suite :
 *      - Application Web (Hosting) : http://127.0.0.1:5002
 *      - Emulator UI               : http://127.0.0.1:4000
 *      - Firestore Emulator        : 127.0.0.1:8080
 *      - Authentication Emulator   : http://127.0.0.1:9099
 *   2. Serveur Web d'Administration Python/Flask :
 *      - Console Admin Locale      : http://127.0.0.1:5000
 * ============================================================
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEMO_DATA_DIR = path.join(ROOT_DIR, 'demo-data');

if (!fs.existsSync(DEMO_DATA_DIR)) {
    fs.mkdirSync(DEMO_DATA_DIR, { recursive: true });
}

const isWin = process.platform === 'win32';
const firebaseCmd = isWin ? 'firebase.cmd' : 'firebase';
const pythonCmd = isWin ? 'python' : 'python3';

console.log('======================================================================');
console.log('  🚀 PROJECT REGULUS — DÉMARRAGE DE L\'ENVIRONNEMENT 100 % HORS-LIGNE');
console.log('======================================================================');
console.log('  🌐 Application Web GMAO (Hosting) : http://127.0.0.1:5002');
console.log('  🎛️  Firebase Emulator UI           : http://127.0.0.1:4000');
console.log('  🛡️  Console Admin Web (Flask)      : http://127.0.0.1:5000');
console.log('  🗄️  Firestore / Auth Emulators     : 127.0.0.1:8080 / :9099');
console.log('  💾 Persistance locale             : ./demo-data');
console.log('======================================================================\n');

const emulatorsProc = spawn(
    firebaseCmd,
    [
        'emulators:start',
        '--project', 'demo-project-regulus',
        '--import=./demo-data',
        '--export-on-exit=./demo-data'
    ],
    {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        shell: isWin
    }
);

const adminEnv = {
    ...process.env,
    USE_EMULATOR: 'true',
    GCLOUD_PROJECT: 'demo-project-regulus',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    NO_AUTO_BROWSER: '1'
};

const adminProc = spawn(
    pythonCmd,
    [path.join(ROOT_DIR, 'admin-tools', 'server.py')],
    {
        cwd: path.join(ROOT_DIR, 'admin-tools'),
        env: adminEnv,
        stdio: 'inherit',
        shell: isWin
    }
);

function shutdown() {
    if (adminProc && !adminProc.killed) {
        adminProc.kill('SIGINT');
    }
    if (emulatorsProc && !emulatorsProc.killed) {
        emulatorsProc.kill('SIGINT');
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
