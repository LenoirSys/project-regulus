// ============================================================
// PROJECT REGULUS — Configuration Firebase & Émulateurs Locaux (100% Hors-Ligne)
// ============================================================
// Par défaut, l'application utilise l'ID de projet fictif "demo-project-regulus"
// et le drapeau USE_EMULATOR = true pour rediriger tous les appels vers la
// Firebase Local Emulator Suite (Firestore :8080, Auth :9099) sans aucun
// compte ni connexion cloud requise.
// ============================================================

window.USE_EMULATOR = window.USE_EMULATOR !== undefined
    ? Boolean(window.USE_EMULATOR)
    : true;

window.EMULATOR_CONFIG = window.EMULATOR_CONFIG || {
    host: '127.0.0.1',
    firestorePort: 8080,
    authUrl: 'http://127.0.0.1:9099'
};

window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
    apiKey: "demo-regulus-offline-api-key",
    authDomain: "demo-project-regulus.firebaseapp.com",
    projectId: "demo-project-regulus",
    storageBucket: "demo-project-regulus.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:demo000000000000"
};

/**
 * Adaptateurs compatibles SDK Modulaire / SDK Compat v10
 * pour connecter Firestore et Authentication aux émulateurs locaux.
 */
function connectFirestoreEmulator(db, host = '127.0.0.1', port = 8080) {
    if (!db || window.__regulusFirestoreEmulatorConnected) return;
    if (typeof db.useEmulator === 'function') {
        db.useEmulator(host, port);
        window.__regulusFirestoreEmulatorConnected = true;
    }
}

function connectAuthEmulator(auth, url = 'http://127.0.0.1:9099') {
    if (!auth) return;
    if (typeof auth.useEmulator === 'function') {
        try {
            auth.useEmulator(url, { disableWarnings: true });
        } catch (_) {
            auth.useEmulator(url);
        }
    }
}

(function initFirebaseLayer() {
    window.__regulusFirebaseState = {
        ready: false,
        mode: 'demo',
        emulator: false,
        reason: 'not-initialized'
    };

    function getStatus() {
        return { ...window.__regulusFirebaseState };
    }

    function initFirebase() {
        const config = window.FIREBASE_CONFIG || null;
        const useEmulator = Boolean(
            window.USE_EMULATOR ||
            (config && String(config.projectId || '').startsWith('demo-'))
        );

        if (!config || !config.apiKey || !config.projectId) {
            window.__regulusFirebaseState = {
                ready: false,
                mode: 'demo',
                emulator: false,
                reason: 'missing-config',
                message: 'Configuration Firebase absente (mode démo local actif).'
            };
            return getStatus();
        }

        if (typeof window.firebase === 'undefined') {
            window.__regulusFirebaseState = {
                ready: false,
                mode: 'demo',
                emulator: false,
                reason: 'missing-sdk',
                message: 'SDK Firebase non chargé (mode démo local actif).'
            };
            return getStatus();
        }

        try {
            if (!window.firebase.apps.length) {
                window.__regulusFirebaseApp = window.firebase.initializeApp(config);
            } else {
                window.__regulusFirebaseApp = window.firebase.app();
            }

            window.__regulusFirebaseAuth = window.firebase.auth();
            window.__regulusFirebaseDb = window.firebase.firestore();

            // Redirection vers la Firebase Local Emulator Suite si USE_EMULATOR = true
            if (useEmulator) {
                const emuHost = window.EMULATOR_CONFIG?.host || '127.0.0.1';
                const firestorePort = window.EMULATOR_CONFIG?.firestorePort || 8080;
                const authUrl = window.EMULATOR_CONFIG?.authUrl || `http://${emuHost}:9099`;

                connectFirestoreEmulator(window.__regulusFirebaseDb, emuHost, firestorePort);
                if (!window.__regulusAuthEmulatorConnected) {
                    connectAuthEmulator(window.__regulusFirebaseAuth, authUrl);
                    window.__regulusAuthEmulatorConnected = true;
                }
            }

            window.__regulusFirebaseState = {
                ready: Boolean(window.__regulusFirebaseDb),
                mode: window.__regulusFirebaseDb ? 'firebase' : 'partial',
                emulator: useEmulator,
                app: window.__regulusFirebaseApp,
                auth: window.__regulusFirebaseAuth,
                db: window.__regulusFirebaseDb,
                message: useEmulator
                    ? 'Connecté aux émulateurs locaux Firebase (Firestore :8080, Auth :9099).'
                    : 'Connexion Firebase Cloud initialisée.'
            };
        } catch (error) {
            window.__regulusFirebaseState = {
                ready: false,
                mode: 'demo',
                emulator: false,
                reason: 'init-error',
                message: error.message
            };
        }

        return getStatus();
    }

    async function seedDemoData() {
        if (!window.__regulusFirebaseDb) {
            console.error("❌ Firestore n'est pas initialisé.");
            return;
        }
        const db = window.__regulusFirebaseDb;

        try {
            console.log("⏳ Récupération des fichiers JSON de démonstration Project Regulus...");
            const reqResponse = await fetch('data/demo-requests.json');
            if (!reqResponse.ok) throw new Error("Impossible de trouver data/demo-requests.json");
            const requestsData = await reqResponse.json();

            const usersResponse = await fetch('data/demo-users.json');
            if (!usersResponse.ok) throw new Error("Impossible de trouver data/demo-users.json");
            const usersData = await usersResponse.json();

            console.log("⏳ Envoi des données vers Firestore (Émulateur / Base) en cours...");
            const batch = db.batch();

            if (requestsData.requests) {
                requestsData.requests.forEach(req => {
                    const docRef = db.collection('requests').doc(req.id);
                    batch.set(docRef, req);
                });
            }

            if (requestsData.criticalAlerts) {
                requestsData.criticalAlerts.forEach(alert => {
                    const docRef = db.collection('criticalAlerts').doc(alert.id);
                    batch.set(docRef, alert);
                });
            }

            if (usersData.users) {
                usersData.users.forEach(user => {
                    const docRef = db.collection('users').doc(user.id);
                    batch.set(docRef, user);
                });
            }

            await batch.commit();
            console.log("✅ SUCCÈS ! Les données de démonstration Project Regulus ont été injectées dans Firestore.");
        } catch (error) {
            console.error("❌ Erreur lors de l'importation :", error);
        }
    }

    async function adminCreateUser(userData) {
        if (!window.FIREBASE_CONFIG) {
            throw new Error("Configuration Firebase manquante.");
        }

        const secondaryAppName = "SecondaryAdminApp_" + Date.now();
        const secondaryApp = window.firebase.initializeApp(window.FIREBASE_CONFIG, secondaryAppName);
        const secondaryAuth = secondaryApp.auth();
        const mainDb = window.__regulusFirebaseDb;

        if (window.USE_EMULATOR) {
            const authUrl = window.EMULATOR_CONFIG?.authUrl || 'http://127.0.0.1:9099';
            connectAuthEmulator(secondaryAuth, authUrl);
        }

        try {
            const userCredential = await secondaryAuth.createUserWithEmailAndPassword(userData.email, userData.password);
            const uid = userCredential.user.uid;

            await secondaryAuth.signOut();
            await secondaryApp.delete();

            const newProfile = {
                uid: uid,
                nom: userData.nom,
                prenom: userData.prenom,
                email: userData.email,
                role: userData.role,
                specialite: userData.specialite || null,
                service: userData.service || 'Pôle Maintenance Regulus',
                telephone: userData.telephone || null,
                statut: 'actif',
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            };

            await mainDb.collection('users').doc(uid).set(newProfile);
            return { success: true, uid: uid };
        } catch (error) {
            if (secondaryApp) await secondaryApp.delete().catch(() => {});
            throw error;
        }
    }

    window.FirebaseService = {
        init: initFirebase,
        status: getStatus,
        seed: seedDemoData,
        createUser: adminCreateUser,
        connectFirestoreEmulator,
        connectAuthEmulator
    };
})();
