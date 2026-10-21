// ============================================
// Project Regulus GMAO - Utilitaires partagés (Firestore Live)
// ============================================

const STORAGE_KEYS = {
    appState: 'regulus-app-state',
    clientRequests: 'regulus-client-requests'
};

// État global
const STATE = {
    requests: [],
    selectedId: null,
    currentUser: null,
    alerts: []
};

window.useDemoData = false; // Définir sur true pour utiliser les données de démonstration
const DEMO_DATA_URL = 'data/demo-requests.json';
let unsubscribeGlobalListener = null;

// ===== DONNÉES DE DÉMONSTRATION =====
async function loadDemoRequests() {
    try {
        const response = await fetch(DEMO_DATA_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Le fichier de démonstration ne retourne pas un tableau');
        }

        return data;
    } catch (error) {
        console.warn('Erreur chargement données de démonstration :', error);
        return [];
    }
}

// ===== FUSION DES REQUÊTES (LOCAL / FIRESTORE) =====
function mergeRequests(localList = [], incomingList = []) {
    const map = new Map();

    // Placer les locaux
    localList.forEach(r => { if (r && r.id) map.set(r.id, r); });

    // Fusionner/Remplacer par les données entrantes plus récentes
    incomingList.forEach(inc => {
        if (!inc || !inc.id) return;
        if (!map.has(inc.id)) {
            map.set(inc.id, inc);
        } else {
            const existing = map.get(inc.id);
            const timeExisting = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
            const timeIncoming = new Date(inc.updatedAt || inc.createdAt || 0).getTime();

            if (timeIncoming >= timeExisting) {
                map.set(inc.id, inc);
            }
        }
    });

    return Array.from(map.values());
}

// ===== PERSISTANCE ET FIRESTORE LIVE =====
async function loadPersistedState() {
    if (window.useDemoData) {
        const demoRequests = await loadDemoRequests();
        STATE.requests = demoRequests;
        return STATE.requests;
    }

    // Charger les requêtes réelles depuis Firestore
    const realRequests = await loadRealRequests();
    if (realRequests && realRequests.length > 0) {
        STATE.requests = realRequests;
        return STATE.requests;
    }

    try {
        const saved = localStorage.getItem(STORAGE_KEYS.appState);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                STATE.requests = parsed;
                return STATE.requests;
            }
        }
    } catch (e) {
        console.warn('Erreur chargement état persistant :', e);
    }

    return STATE.requests;
}

function saveAppState() {
    if (window.useDemoData) return;

    try {
        // Sauvegarder un extrait léger si la liste est volumineuse (> 500)
        const toSave = (STATE.requests || []).slice(0, 300);
        localStorage.setItem(STORAGE_KEYS.appState, JSON.stringify(toSave));
    } catch (e) {
        console.warn('Erreur sauvegarde état local (quota dépassé ignoré) :', e);
    }
}

async function loadRealRequests() {
    if (typeof window.loadFirestoreRequests === 'function') {
        return await window.loadFirestoreRequests();
    }
    return [];
}

/**
 * Sauvegarde/Mise à jour d'une requête spécifique directement sur Firestore
 */
async function saveRequestToFirestore(req) {
    if (!req || !req.id) return;
    
    // Sauvegarde Firestore si la fonction d'aide globale existe
    if (typeof window.saveFirestoreRequest === 'function') {
        try {
            await window.saveFirestoreRequest(req);
        } catch (e) {
            console.error('❌ Erreur lors de la sauvegarde Firestore :', e);
        }
    }
    saveAppState();
}

/**
 * Écoute globale Firestore pour les vues générales
 */
async function listenToFirestoreGlobal() {
    if (window.useDemoData) return;

    if (typeof window.ensureFirestoreReady === 'function') {
        const isReady = await window.ensureFirestoreReady();
        if (!isReady) return;
    }

    const db = window.firebase && window.firebase.firestore ? window.firebase.firestore() : null;
    if (!db) return;

    if (unsubscribeGlobalListener) unsubscribeGlobalListener();

    unsubscribeGlobalListener = db.collection('requests').onSnapshot((snapshot) => {
        const firestoreRequests = [];
        snapshot.forEach((doc) => {
            firestoreRequests.push({ id: doc.id, ...doc.data() });
        });

        console.log(`📡 Snapshot global Firestore: ${firestoreRequests.length} demandes synchronisées`);
        STATE.requests = firestoreRequests;
        saveAppState();

        // Notifier tous les modules abonnés au changement de données
        window.dispatchEvent(new CustomEvent('regulus:data-updated', { detail: { requests: STATE.requests } }));
    }, (error) => {
        console.error('❌ Erreur Snapshot Global :', error);
    });
}

// ===== FONCTIONS UTILITAIRES =====
function generateId() {
    const max = STATE.requests.reduce((maxVal, r) => {
        if (!r.id || !r.id.includes('-')) return maxVal;
        const num = parseInt(r.id.split('-')[1]);
        return !isNaN(num) && num > maxVal ? num : maxVal;
    }, 0);
    return `REQ-${String(max + 1).padStart(3, '0')}`;
}

function relativeTime(date) {
    if (!date) return '—';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (mins < 1) return 'À l\'instant';
    if (mins < 60) return `Il y a ${mins} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return new Date(date).toLocaleDateString('fr-FR');
}

function statusLabel(status) {
    const map = {
        reported: 'Signalée',
        in_progress: 'En cours',
        on_hold: 'En attente',
        resolved: 'Résolue',
        closed: 'Clôturée',
        cloture: 'Clôturée',
        termine: 'Terminée'
    };
    return map[status] || status || 'Statut inconnu';
}

function priorityLabel(priority) {
    const map = {
        critical: '🚨 Critique',
        high: '🔴 Urgent',
        medium: '🟠 Normal',
        low: '🟢 Basse'
    };
    return map[priority] || priority || 'Normal';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = type === 'error' ? '#D32F2F' : type === 'success' ? '#2E7D32' : '#1A2332';
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function isAged(request) {
    if (!request || !request.updatedAt) return false;
    const hours = (Date.now() - new Date(request.updatedAt).getTime()) / 3600000;
    return request.status !== 'resolved' && hours >= 24;
}

function isUrgent(request) {
    return request && request.priority === 'high' && request.status !== 'resolved';
}

function getEquipmentIcon(equipment) {
    if (!equipment) return '🔧';
    const lower = equipment.toLowerCase();
    if (lower.includes('respirateur') || lower.includes('respir')) return '🫁';
    if (lower.includes('autoclave')) return '🧪';
    if (lower.includes('climatiseur') || lower.includes('clim')) return '❄️';
    if (lower.includes('pompe')) return '💧';
    if (lower.includes('scanner') || lower.includes('radio')) return '📋';
    if (lower.includes('groupe') || lower.includes('generateur')) return '🔋';
    if (lower.includes('incubateur')) return '👶';
    if (lower.includes('stérilisateur') || lower.includes('steril')) return '🧪';
    if (lower.includes('électrique') || lower.includes('elect')) return '⚡';
    if (lower.includes('eau')) return '💧';
    if (lower.includes('gaz')) return '💨';
    if (lower.includes('réseau') || lower.includes('reseaux')) return '🌐';
    return '🔧';
}

// ===== SIDEBAR =====
function initSidebar() {
    const hamburger = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const closeBtn = document.getElementById('closeSidebar');

    if (!hamburger || !sidebar) return;

    function openSidebar() {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            const page = link.dataset.page;

            if (href && href !== '#' && href !== '') {
                closeSidebar();
                return;
            }

            e.preventDefault();
            if (page && typeof navigateTo === 'function') {
                navigateTo(page);
            }
            closeSidebar();
        });
    });
}

function navigateTo(page) {
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });

    document.querySelectorAll('.page-content').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });

    const titles = {
        dashboard: '📊 Supervision',
        workbench: '🎯 File de travail',
        'my-requests': 'Mes signalements',
        new: 'Nouveau signalement',
        history: '📜 Historique',
        calendar: '📅 Calendrier',
        reports: '📄 Rapports',
        alerts: '🚨 Alertes critiques',
        technicians: '👥 Techniciens',
        profile: '👤 Profil'
    };
    const titleEl = document.querySelector('.page-title');
    if (titleEl && titles[page]) {
        titleEl.textContent = titles[page];
    }

    window.dispatchEvent(new CustomEvent('regulus:page-change', { detail: { page } }));
}

// ===== NETWORK =====
function updateNetworkPill() {
    const pill = document.querySelector('.network-pill');
    if (!pill) return;
    const online = navigator.onLine;
    pill.textContent = online ? '🟢 Connecté' : '🔴 Hors ligne';
    pill.style.background = online ? '#E8F5E9' : '#FFEBEE';
    pill.style.color = online ? '#2E7D32' : '#D32F2F';
}

// ===== INIT =====
async function initApp() {
    await loadPersistedState();

    if (typeof window.initFirebase === 'function') {
        await window.initFirebase();
    }

    // Démarrer l'écoute temps réel globale
    listenToFirestoreGlobal();

    initSidebar();
    updateNetworkPill();
    window.addEventListener('online', updateNetworkPill);
    window.addEventListener('offline', updateNetworkPill);

    if (typeof loadClientRequests === 'function') {
        loadClientRequests();
    }

    saveAppState();
    console.log('✅ Project Regulus GMAO initialisé');
    console.log(`📋 ${STATE.requests.length} demandes chargées`);
}

// Exporter les fonctions globalement
window.STATE = STATE;
window.mergeRequests = mergeRequests;
window.showToast = showToast;
window.relativeTime = relativeTime;
window.statusLabel = statusLabel;
window.priorityLabel = priorityLabel;
window.escapeHtml = escapeHtml;
window.isAged = isAged;
window.isUrgent = isUrgent;
window.generateId = generateId;
window.navigateTo = navigateTo;
window.initApp = initApp;
window.getEquipmentIcon = getEquipmentIcon;
window.updateNetworkPill = updateNetworkPill;
window.loadPersistedState = loadPersistedState;
window.saveAppState = saveAppState;
window.saveRequestToFirestore = saveRequestToFirestore;
window.useDemoData = window.useDemoData;
window.loadRealRequests = loadRealRequests;