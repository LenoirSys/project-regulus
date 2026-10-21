// ============================================
// Project Regulus GMAO - Client (Signaleur)
// ============================================

const CLIENT_STORAGE_KEY = 'regulus-client-requests';
let unsubscribeClientListener = null;

/**
 * S'abonne aux demandes enregistrées dans Firestore en temps réel
 */
function listenToClientRequests() {
    if (!window.firebase || !window.firebase.firestore) {
        console.warn('⚠️ Firebase non disponible, bascule sur localStorage');
        loadClientRequests();
        return;
    }

    const db = window.firebase.firestore();

    // Nettoyer l'écouteur précédent si existant
    if (unsubscribeClientListener) {
        unsubscribeClientListener();
    }

    // Écoute en temps réel de la collection 'requests'
    unsubscribeClientListener = db.collection('requests')
        .onSnapshot((snapshot) => {
            const firestoreRequests = [];
            snapshot.forEach((doc) => {
                firestoreRequests.push({ id: doc.id, ...doc.data() });
            });

            console.log(`📡 ${firestoreRequests.length} demandes chargées depuis Firestore`);

            // Fusionner avec STATE.requests
            if (typeof mergeRequests === 'function') {
                STATE.requests = mergeRequests(STATE.requests, firestoreRequests);
            } else {
                STATE.requests = firestoreRequests;
            }

            // Sauvegarder en cache local et rafraîchir l'interface
            saveClientRequestsLocal();
            renderClientRequests();
            updateEquipmentList();
        }, (error) => {
            console.error('❌ Erreur de synchronisation Firestore :', error);
            loadClientRequests(); // Fallback vers le local storage
        });
}

function loadClientRequests() {
    try {
        const saved = localStorage.getItem(CLIENT_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            const clientRequests = Array.isArray(data) ? data : [];
            if (typeof mergeRequests === 'function') {
                STATE.requests = mergeRequests(STATE.requests, clientRequests);
            }
            console.log(`📂 ${clientRequests.length} signalements client chargés localement`);
        }
    } catch (e) {
        console.warn('Erreur chargement signalements client local:', e);
    }
}

function saveClientRequestsLocal() {
    try {
        const clientReqs = STATE.requests.filter(r => r.reporter && r.reporter.isClient);
        localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(clientReqs));
        if (typeof saveAppState === 'function') saveAppState();
    } catch (e) {
        console.warn('Erreur sauvegarde signalements client local:', e);
    }
}

async function persistClientRequest(request) {
    if (window.useDemoData) {
        return { success: true, mode: 'demo' };
    }

    // 1. Tenter l'écriture via la helper global si disponible
    if (typeof window.writeRequestToFirestore === 'function') {
        const writeResult = await window.writeRequestToFirestore(request);
        if (writeResult && writeResult.success) {
            return { success: true, mode: 'firebase', id: writeResult.id };
        }
    }

    // 2. Écriture directe dans Firestore (si writeRequestToFirestore n'est pas défini)
    if (window.firebase && window.firebase.firestore) {
        try {
            const db = window.firebase.firestore();
            await db.collection('requests').doc(request.id).set(request);
            console.log(`✅ Signalement écrit dans Firestore avec succès : ${request.id}`);
            return { success: true, mode: 'firebase', id: request.id };
        } catch (error) {
            console.error('❌ Erreur écriture directe Firestore :', error);
        }
    }

    // 3. Fallback local en cas d'échec de connexion
    saveClientRequestsLocal();
    return { success: true, mode: 'local', id: request.id };
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('👤 Client initialisé');
    
    // Initialisation
    if (typeof initApp === 'function') initApp();
    
    // Démarrer l'écoute temps réel
    listenToClientRequests();
    
    renderClientRequests();
    setupClientEvents();
    updateEquipmentList();
});

function renderClientRequests() {
    const container = document.getElementById('clientRequests');
    if (!container) return;

    const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : (str) => str || '';
    const safeStatusLabel = typeof statusLabel === 'function' ? statusLabel : (s) => s || '';
    const safeRelativeTime = typeof relativeTime === 'function' ? relativeTime : (d) => d || '';
    const safeIsUrgent = typeof isUrgent === 'function' ? isUrgent : () => false;
    const safeIsAged = typeof isAged === 'function' ? isAged : () => false;
    const safeIcon = typeof getEquipmentIcon === 'function' ? getEquipmentIcon : () => '🔧';

    const myRequests = STATE.requests.filter(r => r.reporter && r.reporter.isClient);

    if (!myRequests.length) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; background:var(--bg); border-radius:var(--radius-sm);">
                <span style="font-size:2rem;">📭</span>
                <p style="margin:8px 0 0; color:var(--text-muted);">Aucun signalement pour le moment</p>
            </div>
        `;
        return;
    }

    container.innerHTML = myRequests.map(r => `
        <div class="request-card ${safeIsUrgent(r) ? 'urgent' : ''} ${safeIsAged(r) ? 'aged' : ''}" 
             onclick="viewClientRequest('${r.id}')" style="cursor:pointer;">
            <div class="request-left">
                <span class="request-icon">${safeIcon(r.equipment)}</span>
                <div class="request-info">
                    <h4>${safeEscape(r.equipment)}</h4>
                    <div class="meta">
                        <span>${safeEscape(r.service)}</span>
                        <span>•</span>
                        <span>${safeRelativeTime(r.createdAt)}</span>
                        <span>•</span>
                        <span>N° ${safeEscape(r.id)}</span>
                    </div>
                </div>
            </div>
            <div class="request-right">
                <span class="badge ${r.status}">${safeStatusLabel(r.status)}</span>
                ${safeIsUrgent(r) ? '<span class="badge urgent">Urgent</span>' : ''}
            </div>
        </div>
    `).join('');
}

function viewClientRequest(id) {
    const req = STATE.requests.find(r => r.id === id);
    if (!req) {
        if (typeof showToast === 'function') showToast('Demande introuvable', 'error');
        return;
    }

    const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : (str) => str || '';
    const safeStatusLabel = typeof statusLabel === 'function' ? statusLabel : (s) => s || '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${safeEscape(req.equipment)}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div style="display:grid; gap:8px; margin-bottom:16px;">
                    <div><strong>Service :</strong> ${safeEscape(req.service)}</div>
                    <div><strong>Statut :</strong> <span class="badge ${req.status}">${safeStatusLabel(req.status)}</span></div>
                    <div><strong>Signalé le :</strong> ${new Date(req.createdAt).toLocaleString('fr-FR')}</div>
                    <div><strong>Par :</strong> ${safeEscape(req.reporter ? req.reporter.name : 'Anonyme')}</div>
                    ${req.assignedTo ? `<div><strong>Technicien assigné :</strong> 👤 ${safeEscape(req.assignedTo)}</div>` : ''}
                    <div style="background:var(--bg); padding:12px; border-radius:var(--radius-sm); margin-top:8px;">
                        <strong>Description du problème :</strong>
                        <p style="margin:4px 0 0;">${safeEscape(req.description)}</p>
                    </div>
                </div>
                <h4>📜 Chronologie du traitement</h4>
                <div class="timeline">
                    ${(req.events || []).map(ev => `
                        <div class="timeline-item">
                            <div class="time">${new Date(ev.at).toLocaleString('fr-FR')}</div>
                            <div class="title">${safeEscape(ev.title)}</div>
                            <div class="desc">${safeEscape(ev.text || '')}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${safeEscape(ev.author)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function setupClientEvents() {
    const submitBtn = document.getElementById('clientSubmitBtn');
    if (submitBtn) {
        // Remplacement de l'événement pour éviter les doubles clics
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

        newSubmitBtn.addEventListener('click', async function() {
            const nameInput = document.getElementById('reporterName');
            const serviceInput = document.getElementById('reporterService');
            const equipmentInput = document.getElementById('equipmentName');
            const descInput = document.getElementById('problemDesc');

            const name = nameInput ? nameInput.value.trim() : '';
            const service = serviceInput ? serviceInput.value.trim() : '';
            const equipment = equipmentInput ? equipmentInput.value.trim() : '';
            const desc = descInput ? descInput.value.trim() : '';

            if (!name || !service || !equipment || !desc) {
                if (typeof showToast === 'function') showToast('Veuillez remplir tous les champs obligatoires', 'error');
                return;
            }

            newSubmitBtn.disabled = true;
            newSubmitBtn.textContent = '⏳ Envoi en cours...';

            const newRequest = {
                id: `CLI-${String(Date.now()).slice(-6)}`,
                equipment: equipment,
                inventory: `EQ-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
                brand: 'Non spécifié',
                service: service,
                domain: 'À qualifier',
                description: desc,
                status: 'reported',
                priority: 'medium',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                assignedTo: null,
                reporter: { 
                    name: name, 
                    service: service,
                    isClient: true
                },
                events: [
                    { 
                        type: 'status', 
                        title: '📢 Signalement créé', 
                        author: name, 
                        at: new Date().toISOString(), 
                        text: desc 
                    }
                ],
                photos: { before: null, after: null },
                parts: [],
                diagnostic: null,
                isAlert: false,
                isClient: true
            };

            const persistResult = await persistClientRequest(newRequest);
            
            if (persistResult.mode === 'firebase') {
                console.log('📡 Signalement créé dans Firestore :', persistResult.id);
            }

            // Vider les champs du formulaire
            if (nameInput) nameInput.value = '';
            if (serviceInput) serviceInput.value = '';
            if (equipmentInput) equipmentInput.value = '';
            if (descInput) descInput.value = '';
            
            const photoInput = document.getElementById('clientPhoto');
            if (photoInput) photoInput.value = '';

            newSubmitBtn.disabled = false;
            newSubmitBtn.textContent = 'Envoyer le signalement';
            
            if (typeof showToast === 'function') showToast('✅ Signalement transmis avec succès !', 'success');
        });
    }

    const resetBtn = document.getElementById('clientResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            const ids = ['reporterName', 'reporterService', 'equipmentName', 'problemDesc', 'clientPhoto'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        });
    }
}

function updateEquipmentList() {
    const list = document.getElementById('equipmentList');
    if (!list) return;
    const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : (str) => str || '';
    const names = [...new Set(STATE.requests.map(r => r.equipment).filter(Boolean))].sort();
    list.innerHTML = names.map(name => `<option value="${safeEscape(name)}"></option>`).join('');
}

// Export des fonctions
window.listenToClientRequests = listenToClientRequests;
window.loadClientRequests = loadClientRequests;
window.renderClientRequests = renderClientRequests;
window.viewClientRequest = viewClientRequest;
window.updateEquipmentList = updateEquipmentList;