// ============================================
// Project Regulus GMAO - Authentification (Firebase + Démo)
// ============================================

const DEMO_USERS_URL = 'data/demo-users.json';
let USERS = {};

async function loadDemoUsers() {
    try {
        const response = await fetch(DEMO_USERS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data && typeof data === 'object' ? data : {};
    } catch (error) {
        console.warn('Erreur chargement profils de démonstration :', error);
        return {};
    }
}

async function initDemoUsers() {
    USERS = await loadDemoUsers();
}

// 🟢 FONCTION DE LOGIN (Gère le mode Démo ET le vrai Firebase)
async function login(email, password) {
    const normalizedEmail = (email || '').trim().toLowerCase();

    // 1. Si on est en MODE DÉMO (JSON local)
    if (window.useDemoData) {
        const user = USERS[normalizedEmail];
        if (!user || user.password !== password) {
            return { success: false, message: 'Email ou mot de passe incorrect' };
        }
        const session = {
            email: normalizedEmail,
            role: user.role,
            name: user.name,
            avatar: user.avatar
        };
        localStorage.setItem('regulus-session', JSON.stringify(session));
        if (typeof STATE !== 'undefined') STATE.currentUser = session;
        return { success: true, role: user.role };
    }

    // 2. Si on est en MODE FIREBASE (Émulateur Local ou Cloud)
    try {
        let userCredential;
        try {
            userCredential = await firebase.auth().signInWithEmailAndPassword(normalizedEmail, password);
        } catch (signInErr) {
            const isDemoAccount = ['tech@regulus-gmao.org', 'super@regulus-gmao.org', 'client@regulus-gmao.org'].includes(normalizedEmail) && password === 'password';
            if (window.USE_EMULATOR && isDemoAccount && (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential')) {
                console.log("⚡ Initialisation automatique du compte de démo dans l'émulateur Auth local :", normalizedEmail);
                userCredential = await firebase.auth().createUserWithEmailAndPassword(normalizedEmail, password);
                const db = window.firebase.firestore();
                const isSup = normalizedEmail.startsWith('super');
                await db.collection('users').doc(userCredential.user.uid).set({
                    uid: userCredential.user.uid,
                    nom: isSup ? 'MOREAU' : 'LAURENT',
                    prenom: isSup ? 'Claire' : 'Jean-Paul',
                    email: normalizedEmail,
                    role: isSup ? 'supervisor' : 'technician',
                    specialite: isSup ? 'fluides' : 'biomedicale',
                    service: isSup ? 'Direction Technique Regulus' : 'Pôle Biomédical Regulus',
                    statut: 'actif',
                    createdAt: new Date().toISOString()
                });
                const reqSnap = await db.collection('requests').limit(1).get();
                if (reqSnap.empty && window.FirebaseService && typeof window.FirebaseService.seed === 'function') {
                    await window.FirebaseService.seed();
                }
            } else {
                throw signInErr;
            }
        }
        const firebaseUser = userCredential.user;

        // 2.1 Récupérer les Custom Claims du token Auth
        let claims = {};
        try {
            const tokenResult = await firebaseUser.getIdTokenResult(true);
            claims = tokenResult.claims || {};
        } catch (tokenErr) {
            console.warn("Impossible de récupérer les custom claims :", tokenErr);
        }

        // 2.2 Récupérer le document Firestore 'users'
        let userDoc = null;
        try {
            const db = window.firebase.firestore();
            const docSnap = await db.collection('users').doc(firebaseUser.uid).get();
            if (docSnap.exists) {
                userDoc = docSnap.data();
            }
        } catch (dbErr) {
            console.warn("Impossible de lire le profil Firestore :", dbErr);
        }

        // 2.3 Vérifier si le compte est désactivé
        const isInactive = (claims.statut === 'inactif') || (userDoc && (userDoc.statut === 'inactif' || userDoc.actif === false));
        if (isInactive) {
            await firebase.auth().signOut();
            return {
                success: false,
                message: "Ce compte a été désactivé. Veuillez contacter le superviseur ou l'administrateur."
            };
        }

        // 2.4 Résolution du rôle
        let role = userDoc?.role || claims.role;
        if (!role) {
            if (normalizedEmail.includes('super') || normalizedEmail.includes('admin')) {
                role = 'supervisor';
            } else {
                role = 'technician';
            }
        }

        // 2.5 Informations complémentaires (nom, spécialité, service)
        const specialite = userDoc?.specialite || claims.specialite || 'polyvalent';
        const service = userDoc?.service || 'Project Regulus';
        const fullName = (userDoc && (userDoc.prenom || userDoc.nom))
            ? `${userDoc.prenom || ''} ${userDoc.nom || ''}`.trim()
            : (firebaseUser.displayName || (['supervisor', 'admin'].includes(role) ? 'Superviseur Regulus' : 'Technicien Regulus'));

        const avatar = (role === 'supervisor' || role === 'admin') ? '🛡️' : '🔧';

        const session = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: role,
            specialite: specialite,
            service: service,
            name: fullName,
            avatar: avatar
        };

        localStorage.setItem('regulus-session', JSON.stringify(session));
        if (typeof STATE !== 'undefined') STATE.currentUser = session;

        return { success: true, role: role };

    } catch (error) {
        console.error("Erreur Firebase Auth:", error);
        let message = "Erreur de connexion";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = "Email ou mot de passe incorrect";
        } else if (error.code === 'auth/invalid-email') {
            message = "Format d'email invalide";
        } else if (error.code === 'auth/user-disabled') {
            message = "Ce compte utilisateur a été désactivé.";
        }
        return { success: false, message: message };
    }
}

function logout() {
    if (window.firebase && window.firebase.auth) {
        try { window.firebase.auth().signOut(); } catch (e) {}
    }
    localStorage.removeItem('regulus-session');
    if (typeof STATE !== 'undefined') STATE.currentUser = null;
    window.location.href = 'index.html';
}

function checkAuth() {
    try {
        const session = localStorage.getItem('regulus-session');
        if (!session) return null;
        const data = JSON.parse(session);
        if (typeof STATE !== 'undefined') STATE.currentUser = data;
        return data;
    } catch {
        return null;
    }
}

function redirectToRole(role) {
    const map = {
        admin: 'superviseur.html',
        supervisor: 'superviseur.html',
        technician: 'technicien.html'
    };
    const target = map[role] || 'index.html';
    window.location.href = target;
}

// ============================================
// ÉVÉNEMENTS DE LA PAGE (Une fois le HTML chargé)
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔐 Auth initialisé');

    // Masquer l'UI de démo si on utilise le vrai Firebase
    const demoHint = document.querySelector('.demo-hint');
    const roleBadges = document.querySelector('.role-badges');
    if (demoHint && roleBadges) {
        const showDemoUi = Boolean(window.useDemoData);
        demoHint.style.display = showDemoUi ? 'block' : 'none';
        roleBadges.style.display = showDemoUi ? 'flex' : 'none';
    }

    if (window.useDemoData) {
        await initDemoUsers();
    } else {
        const emailInput = document.getElementById('loginEmail');
        const passInput = document.getElementById('loginPassword');
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';
    }

    // Formulaire de Login
    const form = document.getElementById('loginForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value.trim();
            
            if (!email || !password) {
                showToast('Veuillez saisir votre email et votre mot de passe', 'error');
                return;
            }

            console.log(`🔑 Tentative de connexion: ${email}`);
            const result = await login(email, password);
            
            if (result.success) {
                showToast('Connexion réussie !', 'success');
                console.log(`✅ Connexion réussie pour ${email} (${result.role})`);
                setTimeout(() => redirectToRole(result.role), 600);
            } else {
                showToast(result.message, 'error');
                console.warn('❌ Échec de connexion');
            }
        });
    }

    // Badges de rôles (Démo)
    if (window.useDemoData) {
        document.querySelectorAll('.role-badge').forEach(badge => {
            badge.addEventListener('click', function() {
                const role = this.dataset.role;
                const emails = {
                    technician: 'tech@regulus-gmao.org',
                    supervisor: 'super@regulus-gmao.org'
                };
                const emailInput = document.getElementById('loginEmail');
                const passInput = document.getElementById('loginPassword');
                if (emailInput) emailInput.value = emails[role] || '';
                if (passInput) passInput.value = 'password';
                showToast(`Compte ${role} chargé, cliquez sur "Se connecter"`, 'info');
            });
        });
    }

    // Gestion du Bouton Déconnexion
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            logout();
        });
    });

    // Affichage des infos utilisateur connecté
    const session = checkAuth();
    if (session) {
        updateHeaderUserInfo(session);
        initProfilePage();
    }

    window.addEventListener('regulus:page-change', function(e) {
        if (e.detail && e.detail.page === 'profile') {
            initProfilePage();
        }
    });
});

function updateHeaderUserInfo(session) {
    if (!session) return;
    const avatars = document.querySelectorAll('.user-avatar');
    const names = document.querySelectorAll('.user-name');
    
    let initials = '👤';
    if (session.name) {
        const parts = session.name.trim().split(' ');
        if (parts.length >= 2) {
            initials = (parts[0][0] + parts[1][0]).toUpperCase();
        } else if (parts.length === 1 && parts[0].length > 0) {
            initials = parts[0].slice(0, 2).toUpperCase();
        }
    }

    avatars.forEach(av => { av.textContent = initials; });
    names.forEach(nm => { nm.textContent = session.name || session.email || 'Utilisateur'; });
}

/**
 * Initialisation et synchronisation de la page Profil
 */
async function initProfilePage() {
    const profileForm = document.getElementById('profileForm');
    if (!profileForm) return;

    const session = checkAuth();
    if (!session) return;

    let userDoc = null;
    if (session.uid && window.firebase && window.firebase.firestore) {
        try {
            const db = window.firebase.firestore();
            const snap = await db.collection('users').doc(session.uid).get();
            if (snap.exists) {
                userDoc = snap.data();
            }
        } catch (e) {
            console.warn('Impossible de charger le document utilisateur :', e);
        }
    }

    // Nom & Prénom
    const nomInput = document.getElementById('profileNom');
    const prenomInput = document.getElementById('profilePrenom');
    const emailInput = document.getElementById('profileEmail');
    const telInput = document.getElementById('profileTelephone');
    const serviceInput = document.getElementById('profileService');
    const specInput = document.getElementById('profileSpecialite');
    const roleBadge = document.getElementById('profileRoleBadge');

    if (nomInput && !nomInput.value) {
        nomInput.value = userDoc?.nom || (session.name ? session.name.split(' ').slice(1).join(' ') : '');
    }
    if (prenomInput && !prenomInput.value) {
        prenomInput.value = userDoc?.prenom || (session.name ? session.name.split(' ')[0] : '');
    }
    if (emailInput) {
        emailInput.value = session.email || userDoc?.email || '';
    }
    if (telInput && !telInput.value) {
        telInput.value = userDoc?.telephone || session.telephone || '';
    }
    if (serviceInput && !serviceInput.value) {
        serviceInput.value = userDoc?.service || session.service || 'Project Regulus';
    }
    if (specInput) {
        specInput.value = userDoc?.specialite || session.specialite || 'Biomédical';
    }
    if (roleBadge) {
        const role = userDoc?.role || session.role;
        roleBadge.textContent = role === 'supervisor' ? 'Superviseur' : (role === 'admin' ? 'Administrateur' : 'Technicien');
    }

    // Éviter les écouteurs dupliqués
    const newForm = profileForm.cloneNode(true);
    profileForm.parentNode.replaceChild(newForm, profileForm);

    newForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const newNom = document.getElementById('profileNom')?.value?.trim() || '';
        const newPrenom = document.getElementById('profilePrenom')?.value?.trim() || '';
        const newTel = document.getElementById('profileTelephone')?.value?.trim() || '';
        const newService = document.getElementById('profileService')?.value?.trim() || 'Project Regulus';
        const newSpec = document.getElementById('profileSpecialite')?.value || session.specialite || 'Général';

        if (!newNom || !newPrenom) {
            showToast('Veuillez renseigner votre nom et prénom', 'error');
            return;
        }

        const saveBtn = document.getElementById('btnSaveProfile');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Enregistrement...';
        }

        const fullName = `${newPrenom} ${newNom}`.trim();

        try {
            if (session.uid && window.firebase && window.firebase.firestore) {
                const db = window.firebase.firestore();
                await db.collection('users').doc(session.uid).update({
                    nom: newNom,
                    prenom: newPrenom,
                    telephone: newTel,
                    service: newService,
                    specialite: newSpec,
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Mettre à jour la session locale
            session.name = fullName;
            session.telephone = newTel;
            session.service = newService;
            session.specialite = newSpec;

            localStorage.setItem('regulus-session', JSON.stringify(session));
            if (typeof STATE !== 'undefined') STATE.currentUser = session;

            updateHeaderUserInfo(session);
            showToast('✅ Profil mis à jour avec succès !', 'success');

        } catch (err) {
            console.error('Erreur mise à jour profil :', err);
            showToast('Erreur lors de la mise à jour du profil', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Enregistrer les modifications';
            }
        }
    });
}

// Exporter les fonctions pour les autres scripts
window.login = login;
window.logout = logout;
window.checkAuth = checkAuth;
window.redirectToRole = redirectToRole;
window.initDemoUsers = initDemoUsers;
window.initProfilePage = initProfilePage;
window.updateHeaderUserInfo = updateHeaderUserInfo;