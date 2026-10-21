// ============================================
// Project Regulus GMAO - Technicien (Firestore Live)
// ============================================

let selectedRequestId = null;
let currentFilter = 'all';
let unsubscribeTechListener = null;

function getTechnicianName() {
    return (STATE.currentUser && STATE.currentUser.name) || 'Technicien Laurent';
}

function isOwnedByCurrentTech(req) {
    const name = getTechnicianName();
    return !req.assignedTo || req.assignedTo === name;
}

function canTechEditOrDelete(req) {
    if (!req) return false;
    const name = (getTechnicianName() || '').trim().toLowerCase();
    const currentUid = (STATE.currentUser && STATE.currentUser.uid) || '';
    const currentEmail = ((STATE.currentUser && STATE.currentUser.email) || '').trim().toLowerCase();

    // Vérifier auteur ou assignation
    const createdBy = (req.createdBy || '').toLowerCase();
    const reporterName = ((req.reporter && req.reporter.name) || '').trim().toLowerCase();
    const assignedTo = (req.assignedTo || '').trim().toLowerCase();

    if (createdBy && (createdBy === currentUid || createdBy === currentEmail || createdBy === name)) {
        return true;
    }
    if (reporterName && (reporterName === name || reporterName === currentEmail)) {
        return true;
    }
    if (assignedTo && assignedTo === name && !assignedTo.startsWith('service ')) {
        return true;
    }
    return false;
}

function matchesFilter(request, filter) {
    if (!request || request.status === 'resolved') return false;
    if (filter === 'urgent') return request.isAlert || request.priority === 'high';
    if (filter === 'active') return request.status === 'in_progress' || request.status === 'on_hold';
    return true;
}

function sortActiveRequests(requests) {
    return requests.sort((a, b) => {
        if (a.isAlert && !b.isAlert) return -1;
        if (b.isAlert && !a.isAlert) return 1;
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (b.priority === 'high' && a.priority !== 'high') return 1;
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
}

function renderRequestCard(r, options = {}) {
    const { selectable = false, showReportBtn = false } = options;
    const selectedClass = selectable && selectedRequestId === r.id ? 'selected' : '';
    const clickAttr = selectable ? `onclick="selectRequest('${r.id}')"` : '';
    const reportBtn = showReportBtn
        ? `<button class="btn ghost small" onclick="generateTechReport(getSelectedRequestById('${r.id}'))" title="Télécharger la fiche">📄 Rapport</button>`
        : '';

    const dateDisplay = r.date || (r.createdAt ? (r.createdAt.includes('T') ? r.createdAt.split('T')[0] : r.createdAt) : '');

    const isOwned = canTechEditOrDelete(r);
    const techActions = isOwned ? `
        <button class="btn secondary small" onclick="event.stopPropagation(); openEditTechModal('${r.id}')" title="Modifier mon intervention">✏️</button>
        <button class="btn danger small" style="background:#FFCDD2; color:#B71C1C; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="event.stopPropagation(); deleteTechIntervention('${r.id}')" title="Supprimer mon intervention">🗑️</button>
    ` : '';

    return `
        <div class="request-card ${isUrgent(r) || r.isAlert ? 'urgent' : ''} ${isAged(r) ? 'aged' : ''} ${selectedClass}"
             ${clickAttr} style="${selectable ? 'cursor:pointer;' : ''}">
            <div class="request-left">
                <span class="request-icon">${r.isAlert ? '🚨' : getEquipmentIcon(r.equipment)}</span>
                <div class="request-info">
                    <h4>${r.isAlert ? '🚨 ALERTE - ' : ''}${escapeHtml(r.equipment || 'Intervention')} <span class="muted" style="font-weight:normal; font-size:0.75rem;">(${r.id})</span></h4>
                    <div class="meta">
                        <span>🏥 ${escapeHtml(r.service || r.structure || 'Project Regulus')}</span>
                        <span>•</span>
                        <span>📅 ${dateDisplay || relativeTime(r.createdAt)}</span>
                        ${r.assignedTo ? `<span>• 👤 ${escapeHtml(r.assignedTo)}</span>` : ''}
                        ${r.specialite || r.domain ? `<span>• 🛠️ ${escapeHtml(r.specialite || r.domain)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="request-right" style="display:flex; gap:6px; align-items:center;">
                ${r.isAlert ? '<span class="badge urgent">🚨 ALERTE</span>' : ''}
                ${isUrgent(r) ? '<span class="badge urgent">🔴 Urgent</span>' : ''}
                <span class="badge ${r.status || 'resolved'}">${statusLabel(r.status || 'resolved')}</span>
                ${reportBtn}
                ${techActions}
            </div>
        </div>
    `;
}

function renderEmptyState(message, icon = '✅') {
    return `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
            <span style="font-size:2rem;">${icon}</span>
            <p style="margin:8px 0 0;">${message}</p>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', async function() {
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'technicien.html') return;

    console.log('🔧 Technicien initialisé');

    const session = checkAuth();
    if (!session || session.role !== 'technician') {
        if (session) {
            showToast('Accès non autorisé', 'error');
            setTimeout(() => window.location.href = 'login.html', 1000);
        }
        return;
    }

    if (typeof initFirebase === 'function') await initFirebase();
    if (typeof initApp === 'function') initApp();

    listenToTechnicianRequests();

    setupTechnicianEvents();
    setupDetailTabs();
    setupFilters();
    disablePhotoFeaturesUI(); // Griser l'UI des photos

    window.addEventListener('regulus:page-change', function(e) {
        onTechnicianPageChange(e.detail.page);
    });

    window.addEventListener('regulus:data-updated', function() {
        refreshTechnicianUI();
    });
});

/**
 * Griser les fonctionnalités d'upload d'images
 */
function disablePhotoFeaturesUI() {
    // Désactiver le champ photo dans le modal d'alerte
    const alertPhotoGroup = document.getElementById('alertPhoto')?.closest('.form-group');
    if (alertPhotoGroup) {
        alertPhotoGroup.style.opacity = '0.5';
        alertPhotoGroup.style.pointerEvents = 'none';
        const label = alertPhotoGroup.querySelector('label');
        if (label) label.textContent += ' (Indisponible pour le moment)';
    }

    // Désactiver l'onglet photo s'il existe
    const photoTabBtn = document.querySelector('.tab-btn[data-tab="photos"]');
    if (photoTabBtn) {
        photoTabBtn.style.opacity = '0.4';
        photoTabBtn.style.cursor = 'not-allowed';
        photoTabBtn.title = 'Fonctionnalité photo désactivée temporairement';
    }
}

/**
 * Synchronisation Temps Réel Firestore
 */
async function listenToTechnicianRequests() {
    if (typeof window.ensureFirestoreReady === 'function') {
        const isReady = await window.ensureFirestoreReady();
        if (!isReady) {
            console.warn('⚠️ Firestore non prêt, chargement local');
            refreshTechnicianUI();
            return;
        }
    }

    const db = window.firebase && window.firebase.firestore ? window.firebase.firestore() : null;
    if (!db) {
        console.warn('⚠️ Firebase/Firestore non disponible');
        refreshTechnicianUI();
        return;
    }

    if (unsubscribeTechListener) unsubscribeTechListener();

    unsubscribeTechListener = db.collection('requests')
        .onSnapshot((snapshot) => {
            const firestoreRequests = [];
            snapshot.forEach((doc) => {
                firestoreRequests.push({ id: doc.id, ...doc.data() });
            });

            console.log(`📡 ${firestoreRequests.length} demandes synchronisées (Firestore)`);

            if (typeof mergeRequests === 'function') {
                STATE.requests = mergeRequests(STATE.requests, firestoreRequests);
            } else {
                STATE.requests = firestoreRequests;
            }

            if (typeof saveAppState === 'function') saveAppState();
            refreshTechnicianUI();
        }, (error) => {
            console.error('❌ Erreur de synchronisation Firestore :', error);
            refreshTechnicianUI();
        });
}

function refreshTechnicianUI() {
    renderTechnicianRequests();
    renderTechHistory();
    renderTechReports();
    renderCriticalAlerts();
    renderTechCalendar();
    updateAlertBadgeCount();
}

function updateAlertBadgeCount() {
    const alerts = STATE.requests.filter(r => r && (r.isAlert || (r.priority === 'high' && r.status !== 'resolved')));
    const badge = document.querySelector('#notifBtn .notif-dot');
    if (badge) {
        badge.textContent = alerts.length;
        badge.style.display = alerts.length > 0 ? 'inline-block' : 'none';
    }
}

function onTechnicianPageChange(page) {
    if (page === 'workbench') renderTechnicianRequests();
    if (page === 'history') renderTechHistory();
    if (page === 'calendar') renderTechCalendar();
    if (page === 'reports') renderTechReports();
    if (page === 'alerts') renderCriticalAlerts();
}

function renderTechCalendar() {
    if (typeof renderActivityCalendar !== 'function') return;
    renderActivityCalendar('activityCalendar', {
        technicianName: getTechnicianName()
    });
}

function renderTechnicianRequests() {
    const container = document.getElementById('technicianRequests');
    if (!container) return;

    const activeRequests = sortActiveRequests(
        STATE.requests.filter(r => r && matchesFilter(r, currentFilter))
    );

    if (!activeRequests.length) {
        container.innerHTML = renderEmptyState('Aucune intervention pour ce filtre');
        selectedRequestId = null;
        const detailContent = document.getElementById('detailContent');
        const detailEmpty = document.querySelector('.detail-empty');
        if (detailContent) detailContent.style.display = 'none';
        if (detailEmpty) detailEmpty.style.display = 'flex';
        return;
    }

    container.innerHTML = activeRequests.map(r => renderRequestCard(r, { selectable: true })).join('');

    const stillVisible = activeRequests.some(r => r.id === selectedRequestId);
    if (!stillVisible) {
        selectedRequestId = activeRequests[0].id;
    }
    if (selectedRequestId) {
        selectRequest(selectedRequestId);
    }
}

let historyLimit = 40;
let reportsLimit = 40;
let historySearchQuery = '';
let historyDomain = 'all';
let historyScope = 'all';
let reportsSearchQuery = '';

function isClosedOrResolved(status) {
    if (!status) return false;
    const s = String(status).toLowerCase();
    return ['resolved', 'closed', 'cloture', 'clôturé', 'termine', 'terminé'].includes(s);
}

function renderTechHistory() {
    const container = document.getElementById('techHistory');
    if (!container) return;

    setupHistoryControls();

    const techName = getTechnicianName();
    const allRequests = Array.isArray(STATE.requests) ? STATE.requests : [];

    // Filtrer les interventions closes ou historiques
    let history = allRequests.filter(r => {
        if (!r) return false;
        const isClosed = isClosedOrResolved(r.status) || (r.id && r.id.startsWith('HIST-'));
        if (!isClosed) return false;

        // Filtre de portée (Toutes vs Mes interventions)
        if (historyScope === 'mine') {
            if (r.assignedTo !== techName && r.reporter?.name !== techName) return false;
        }

        // Filtre de domaine
        if (historyDomain !== 'all') {
            const spec = (r.specialite || r.domain || '').toLowerCase();
            const filterDom = historyDomain.toLowerCase();
            if (!spec.includes(filterDom)) return false;
        }

        // Filtre de recherche texte
        if (historySearchQuery) {
            const q = historySearchQuery.toLowerCase();
            const textToSearch = [
                r.id,
                r.equipment,
                r.description,
                r.service,
                r.structure,
                r.assignedTo,
                r.specialite,
                r.domain,
                r.date,
                r.observation,
                typeof r.diagnostic === 'string' ? r.diagnostic : (r.diagnostic?.desc || '')
            ].filter(Boolean).join(' ').toLowerCase();

            if (!textToSearch.includes(q)) return false;
        }

        return true;
    });

    // Tri par date décroissante
    history.sort((a, b) => {
        const dateA = new Date(a.date || a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.date || b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
    });

    // Mettre à jour le compteur
    const counterEl = document.getElementById('historyCounter');
    if (counterEl) {
        counterEl.textContent = `${history.length} intervention(s) trouvée(s) dans l'historique`;
    }

    if (!history.length) {
        container.innerHTML = renderEmptyState('Aucune intervention trouvée pour ces critères', '📜');
        const pagEl = document.getElementById('historyPagination');
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    // Pagination
    const displayed = history.slice(0, historyLimit);
    container.innerHTML = displayed.map(r => renderRequestCard(r, { showReportBtn: true })).join('');

    const paginationContainer = document.getElementById('historyPagination');
    if (paginationContainer) {
        if (history.length > historyLimit) {
            paginationContainer.innerHTML = `
                <button type="button" class="btn secondary" onclick="loadMoreHistory()" style="padding:10px 24px; margin: 12px 0;">
                    ➕ Afficher plus d'interventions (${displayed.length} sur ${history.length})
                </button>
            `;
        } else {
            paginationContainer.innerHTML = `<span class="muted" style="font-size:0.85rem;">Fin de l'historique (${history.length} interventions)</span>`;
        }
    }
}

function loadMoreHistory() {
    historyLimit += 50;
    renderTechHistory();
}

function setupHistoryControls() {
    const searchInput = document.getElementById('historySearchInput');
    const domainSelect = document.getElementById('historyDomainFilter');
    const scopeSelect = document.getElementById('historyScopeFilter');

    if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        searchInput.addEventListener('input', (e) => {
            historySearchQuery = e.target.value.trim();
            historyLimit = 40;
            renderTechHistory();
        });
    }

    if (domainSelect && !domainSelect._bound) {
        domainSelect._bound = true;
        domainSelect.addEventListener('change', (e) => {
            historyDomain = e.target.value;
            historyLimit = 40;
            renderTechHistory();
        });
    }

    if (scopeSelect && !scopeSelect._bound) {
        scopeSelect._bound = true;
        scopeSelect.addEventListener('change', (e) => {
            historyScope = e.target.value;
            historyLimit = 40;
            renderTechHistory();
        });
    }
}

function renderTechReports() {
    const container = document.getElementById('techReports');
    if (!container) return;

    setupReportsControls();

    const allRequests = Array.isArray(STATE.requests) ? STATE.requests : [];

    let reports = allRequests.filter(r => {
        if (!r) return false;
        const isClosed = isClosedOrResolved(r.status) || (r.id && r.id.startsWith('HIST-'));
        if (!isClosed) return false;

        if (reportsSearchQuery) {
            const q = reportsSearchQuery.toLowerCase();
            const textToSearch = [
                r.id,
                r.equipment,
                r.service,
                r.structure,
                r.assignedTo,
                r.specialite,
                r.date
            ].filter(Boolean).join(' ').toLowerCase();

            if (!textToSearch.includes(q)) return false;
        }

        return true;
    });

    reports.sort((a, b) => {
        const dateA = new Date(a.date || a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.date || b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
    });

    const counterEl = document.getElementById('reportsCounter');
    if (counterEl) {
        counterEl.textContent = `${reports.length} rapport(s) disponible(s) au téléchargement`;
    }

    if (!reports.length) {
        container.innerHTML = renderEmptyState('Aucun rapport trouvé', '📄');
        const pagEl = document.getElementById('reportsPagination');
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    const displayed = reports.slice(0, reportsLimit);
    container.innerHTML = displayed.map(r => `
        <div class="request-card" style="padding:14px; margin-bottom:10px; border:1px solid #E8EDF2; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div class="request-left">
                <span class="request-icon">📄</span>
                <div class="request-info">
                    <h4>${escapeHtml(r.equipment || 'Intervention')} <span class="muted" style="font-weight:normal; font-size:0.8rem;">(${r.id})</span></h4>
                    <div class="meta">
                        <span>🏥 ${escapeHtml(r.service || r.structure || 'Project Regulus')}</span>
                        <span>•</span>
                        <span>📅 ${r.date || (r.createdAt ? r.createdAt.split('T')[0] : '')}</span>
                        ${r.assignedTo ? `<span>• 👤 ${escapeHtml(r.assignedTo)}</span>` : ''}
                        ${r.specialite ? `<span>• 🛠️ ${escapeHtml(r.specialite)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="request-right">
                <button class="btn ghost small" onclick="generateTechReport(getSelectedRequestById('${r.id}'))">📥 Télécharger</button>
            </div>
        </div>
    `).join('');

    const paginationContainer = document.getElementById('reportsPagination');
    if (paginationContainer) {
        if (reports.length > reportsLimit) {
            paginationContainer.innerHTML = `
                <button type="button" class="btn secondary" onclick="loadMoreReports()" style="padding:10px 24px; margin: 12px 0;">
                    ➕ Afficher plus de rapports (${displayed.length} sur ${reports.length})
                </button>
            `;
        } else {
            paginationContainer.innerHTML = `<span class="muted" style="font-size:0.85rem;">Fin de la liste (${reports.length} rapports)</span>`;
        }
    }
}

function loadMoreReports() {
    reportsLimit += 50;
    renderTechReports();
}

function setupReportsControls() {
    const searchInput = document.getElementById('reportsSearchInput');
    if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        searchInput.addEventListener('input', (e) => {
            reportsSearchQuery = e.target.value.trim();
            reportsLimit = 40;
            renderTechReports();
        });
    }
}

function renderCriticalAlerts() {
    const container = document.getElementById('criticalAlerts');
    if (!container) return;

    const alerts = sortActiveRequests(
        STATE.requests.filter(r => r && (r.isAlert || (r.priority === 'high' && r.status !== 'resolved')))
    );

    container.innerHTML = alerts.length
        ? alerts.map(r => renderRequestCard(r, { selectable: true }))
        : renderEmptyState('Aucune alerte critique', '✅');
}

function setupFilters() {
    document.querySelectorAll('.filter-badge').forEach(badge => {
        badge.addEventListener('click', function() {
            currentFilter = this.dataset.filter || 'all';
            document.querySelectorAll('.filter-badge').forEach(b => {
                b.classList.toggle('active', b.dataset.filter === currentFilter);
            });
            renderTechnicianRequests();
        });
    });
}

function setupDetailTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.dataset.tab === 'photos') return; // Bloquer la navigation vers l'onglet photo
            const tab = this.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === this));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `tab-${tab}`);
            });
        });
    });
}

function selectRequest(id) {
    selectedRequestId = id;
    const req = STATE.requests.find(r => r && r.id === id);
    if (!req) return;

    document.querySelectorAll('#technicianRequests .request-card').forEach(el => {
        const onclick = el.getAttribute('onclick') || '';
        el.classList.toggle('selected', onclick.includes(id));
    });

    const detailContent = document.getElementById('detailContent');
    const detailEmpty = document.querySelector('.detail-empty');
    if (detailContent) detailContent.style.display = 'block';
    if (detailEmpty) detailEmpty.style.display = 'none';

    const fields = {
        'dEquipment': req.equipment,
        'dInventory': req.inventory || '—',
        'dBrand': req.brand || '—',
        'dService': req.service,
        'dDescription': req.description
    };
    Object.entries(fields).forEach(([fieldId, value]) => {
        const el = document.getElementById(fieldId);
        if (el) el.textContent = value;
    });

    const priorityEl = document.getElementById('dPriority');
    if (priorityEl) {
        priorityEl.textContent = req.isAlert ? '🚨 ALERTE CRITIQUE' : priorityLabel(req.priority);
        priorityEl.className = `badge ${req.isAlert || req.priority === 'high' ? 'urgent' : 'on_hold'}`;
    }

    const techEl = document.getElementById('dTechnician');
    if (techEl) techEl.textContent = req.assignedTo || 'Non assignée';

    const statusEl = document.getElementById('dStatus');
    if (statusEl) {
        statusEl.textContent = statusLabel(req.status);
        statusEl.className = `badge ${req.status}`;
    }

    const techName = getTechnicianName();
    const ownedByOther = !!(req.assignedTo && req.assignedTo !== techName && req.status !== 'resolved');
    const takeBtn = document.getElementById('takeOwnershipBtn');
    const holdBtn = document.getElementById('holdBtn');
    const resolveBtn = document.getElementById('resolveBtn');
    
    if (takeBtn) takeBtn.disabled = !!req.assignedTo || req.status === 'resolved';
    if (holdBtn) holdBtn.disabled = !req.assignedTo || req.status === 'resolved' || ownedByOther;
    if (resolveBtn) resolveBtn.disabled = !req.assignedTo || req.status === 'resolved' || ownedByOther;

    const timelineContainer = document.getElementById('detailTimeline');
    if (timelineContainer) {
        timelineContainer.innerHTML = (req.events || []).map(ev => `
            <div class="timeline-item">
                <div class="time">${new Date(ev.at).toLocaleString('fr-FR')}</div>
                <div class="title">${escapeHtml(ev.title)}</div>
                <div class="desc">${escapeHtml(ev.text || '')}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(ev.author)}</div>
            </div>
        `).join('');
    }

    if (req.diagnostic) {
        const diagFields = ['diagDesc', 'diagCause', 'diagSolution', 'diagObservations'];
        const diagKeys = ['desc', 'cause', 'solution', 'observations'];
        diagFields.forEach((fieldId, i) => {
            const el = document.getElementById(fieldId);
            if (el) el.value = req.diagnostic[diagKeys[i]] || '';
        });
    } else {
        ['diagDesc', 'diagCause', 'diagSolution', 'diagObservations'].forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el) el.value = '';
        });
    }

    const partsBody = document.getElementById('partsList');
    if (partsBody) {
        if (req.parts && req.parts.length) {
            partsBody.innerHTML = req.parts.map(p => `
                <tr>
                    <td>${escapeHtml(p.ref)}</td>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${p.qty}</td>
                    <td><button class="btn ghost small" onclick="removePart('${req.id}','${escapeHtml(p.ref)}')">✕</button></td>
                </tr>
            `).join('');
        } else {
            partsBody.innerHTML = `<tr><td colspan="4" class="empty-text">Aucune pièce enregistrée</td></tr>`;
        }
    }

    const reportPreviewEl = document.getElementById('reportPreview');
    if (reportPreviewEl) {
        reportPreviewEl.innerHTML = `
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:16px;">
                <h4 style="margin:0 0 8px 0; color:#1565C0;">📄 Fiche d'intervention prête à générer</h4>
                <p style="margin:4px 0; font-size:0.9rem;"><strong>Référence :</strong> ${escapeHtml(req.id)}</p>
                <p style="margin:4px 0; font-size:0.9rem;"><strong>Équipement :</strong> ${escapeHtml(req.equipment || '—')}</p>
                <p style="margin:4px 0; font-size:0.9rem;"><strong>Structure :</strong> ${escapeHtml(req.service || req.structure || '—')}</p>
                <p style="margin:4px 0; font-size:0.9rem;"><strong>Intervenant :</strong> ${escapeHtml(req.assignedTo || 'Non assigné')}</p>
                <p style="margin:4px 0; font-size:0.9rem;"><strong>Pièces détachées :</strong> ${(req.parts && req.parts.length) ? req.parts.length + ' référence(s)' : 'Main d’œuvre / Entretien standard'}</p>
                <p style="margin:8px 0 0 0; font-size:0.8rem; color:#64748B;">Format : Microsoft Word (.docx) avec en-tête officiel Project Regulus</p>
            </div>
        `;
    }
}


/**
 * Persistance DIRECTE des modifications dans Firestore et LocalStorage
 */
async function syncRequestUpdate(req, toastMsg) {
    try {
        // 1. Nettoyage strict pour éliminer les valeurs `undefined`
        const cleanReq = JSON.parse(JSON.stringify(req));

        // 2. Écriture DIRECTE dans Firestore sans passer par un intermédiaire
        if (window.firebase && window.firebase.firestore) {
            const db = window.firebase.firestore();
            await db.collection('requests').doc(cleanReq.id).set(cleanReq, { merge: true });
            console.log(`✅ Succès Firestore pour le document : ${cleanReq.id}`);
        } else {
            console.warn('⚠️ Firestore non disponible pour l\'écriture');
        }

        // 3. Sauvegarde dans le localStorage local s'il existe
        if (typeof saveAppState === 'function') {
            saveAppState();
        }

        if (toastMsg) showToast(toastMsg, 'success');
    } catch (error) {
        console.error('❌ ERREUR ECRITURE FIRESTORE :', error);
        if (typeof showToast === 'function') {
            showToast('Erreur de synchronisation Firestore', 'error');
        }
    }
}

function setupTechnicianEvents() {
    const takeBtn = document.getElementById('takeOwnershipBtn');
    if (takeBtn) {
        takeBtn.addEventListener('click', async function() {
            const req = getSelectedRequest();
            if (!req) return;
            const techName = getTechnicianName();
            if (req.assignedTo && req.assignedTo !== techName) {
                showToast('Déjà pris en charge par un autre technicien', 'error');
                return;
            }
            req.assignedTo = techName;
            req.status = 'in_progress';
            req.updatedAt = new Date().toISOString();
            if (!req.events) req.events = [];
            req.events.push({
                type: 'status',
                title: '🛠️ Prise en charge',
                author: techName,
                at: new Date().toISOString(),
                text: 'Demande prise en charge par ' + techName
            });
            await syncRequestUpdate(req, '✅ Demande prise en charge');
            selectRequest(req.id);
        });
    }

    const holdBtn = document.getElementById('holdBtn');
    if (holdBtn) {
        holdBtn.addEventListener('click', async function() {
            const req = getSelectedRequest();
            if (!req) return;
            const note = prompt('Raison de la mise en attente :');
            if (note === null) return;
            const techName = getTechnicianName();
            req.status = 'on_hold';
            req.updatedAt = new Date().toISOString();
            if (!req.events) req.events = [];
            req.events.push({
                type: 'status',
                title: '⏸️ Mise en attente',
                author: techName,
                at: new Date().toISOString(),
                text: note || 'En attente d\'information'
            });
            await syncRequestUpdate(req, '⏸️ Demande mise en attente');
            selectRequest(req.id);
        });
    }

    const resolveBtn = document.getElementById('resolveBtn');
    if (resolveBtn) {
        resolveBtn.addEventListener('click', async function() {
            const req = getSelectedRequest();
            if (!req) return;
            const note = prompt('Note de fin d\'intervention :');
            if (note === null) return;
            const techName = getTechnicianName();
            req.status = 'resolved';
            req.updatedAt = new Date().toISOString();
            if (!req.events) req.events = [];
            req.events.push({
                type: 'status',
                title: '✅ Clôture',
                author: techName,
                at: new Date().toISOString(),
                text: note || 'Intervention terminée'
            });
            await syncRequestUpdate(req, '✅ Intervention clôturée');
            refreshTechnicianUI();
        });
    }

    const saveDiagBtn = document.getElementById('saveDiagnostic');
    if (saveDiagBtn) {
        saveDiagBtn.addEventListener('click', async function() {
            const req = getSelectedRequest();
            if (!req) return;
            const techName = getTechnicianName();
            req.diagnostic = {
                desc: document.getElementById('diagDesc').value.trim(),
                cause: document.getElementById('diagCause').value.trim(),
                solution: document.getElementById('diagSolution').value.trim(),
                observations: document.getElementById('diagObservations').value.trim()
            };
            req.updatedAt = new Date().toISOString();
            if (!req.events) req.events = [];
            req.events.push({
                type: 'note',
                title: '📋 Diagnostic enregistré',
                author: techName,
                at: new Date().toISOString(),
                text: 'Diagnostic mis à jour'
            });
            await syncRequestUpdate(req, '📋 Diagnostic enregistré');
            selectRequest(req.id);
        });
    }

    const addPartBtn = document.getElementById('addPartBtn');
    if (addPartBtn) {
        addPartBtn.addEventListener('click', async function() {
            const req = getSelectedRequest();
            if (!req) return;
            const ref = prompt('Référence :');
            if (!ref) return;
            const name = prompt('Nom de la pièce :');
            if (!name) return;
            const qty = parseInt(prompt('Quantité :')) || 1;
            if (!req.parts) req.parts = [];
            req.parts.push({ ref, name, qty });
            req.updatedAt = new Date().toISOString();
            await syncRequestUpdate(req, '🔧 Pièce ajoutée');
            selectRequest(req.id);
        });
    }

    const genReportBtn = document.getElementById('generateReportBtn');
    if (genReportBtn) {
        genReportBtn.addEventListener('click', () => {
            const req = getSelectedRequest();
            if (req) {
                generateTechReport(req);
            } else {
                showToast('Veuillez d\'abord sélectionner une intervention', 'warning');
            }
        });
    }

    setupInterventionModal();
    setupAlertModal();
    setupEditTechModal();
}

function getSelectedRequest() {
    return STATE.requests.find(r => r && r.id === selectedRequestId);
}

function getSelectedRequestById(id) {
    return STATE.requests.find(r => r && r.id === id);
}

/**
 * Modal 1 : Saisie d'une intervention achevée (FAB Saisir intervention)
 */
function setupInterventionModal() {
    const fab = document.getElementById('fabIntervention');
    const modal = document.getElementById('modalIntervention');
    const close = document.getElementById('modalInterventionClose');
    const cancel = document.getElementById('modalInterventionCancel');
    const form = document.getElementById('formDeclareIntervention');

    if (fab && modal) {
        fab.addEventListener('click', () => {
            modal.classList.add('open');
            const dateInput = document.getElementById('intDate');
            if (dateInput && !dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
        });
        if (close) close.addEventListener('click', () => modal.classList.remove('open'));
        if (cancel) cancel.addEventListener('click', () => modal.classList.remove('open'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });

        if (form) {
            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                const dateVal = document.getElementById('intDate')?.value || new Date().toISOString().split('T')[0];
                const type = document.getElementById('intType')?.value || 'Curative / Dépannage';
                const equipment = document.getElementById('intEquipment')?.value?.trim() || '';
                const service = document.getElementById('intService')?.value?.trim() || '';
                const specialite = document.getElementById('intSpecialite')?.value || 'Biomédical';
                const status = document.getElementById('intStatus')?.value || 'resolved';
                const desc = document.getElementById('intDesc')?.value?.trim() || '';
                const solution = document.getElementById('intSolution')?.value?.trim() || '';
                const observation = document.getElementById('intObservation')?.value?.trim() || 'Fonctionnel';
                const generateReport = document.getElementById('intGenerateReport')?.checked ?? true;

                if (!equipment || !service || !desc || !solution) {
                    showToast('Veuillez renseigner les champs obligatoires (*)', 'error');
                    return;
                }

                const submitBtn = document.getElementById('btnSubmitIntervention');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Enregistrement...';
                }

                const techName = getTechnicianName();
                const currentUid = (STATE.currentUser && STATE.currentUser.uid) || '';
                const reqId = `REQ-${Date.now().toString().slice(-6)}`;
                const createdIso = new Date(dateVal).toISOString();

                const newReq = {
                    id: reqId,
                    equipment: equipment,
                    inventory: 'INST-' + Date.now().toString().slice(-4),
                    service: service,
                    structure: service,
                    specialite: specialite,
                    domain: specialite,
                    type: type,
                    description: desc,
                    solution: solution,
                    observation: observation,
                    status: status,
                    priority: 'medium',
                    createdAt: createdIso,
                    updatedAt: new Date().toISOString(),
                    date: dateVal,
                    assignedTo: techName,
                    createdBy: currentUid || techName,
                    reporter: { name: techName, service: service },
                    events: [
                        {
                            type: 'status',
                            title: `Intervention ${type} (${statusLabel(status)})`,
                            author: techName,
                            at: new Date().toISOString(),
                            text: desc + (solution ? ` | Travaux : ${solution}` : '')
                        }
                    ],
                    photos: { before: null, after: null },
                    parts: [],
                    diagnostic: {
                        desc: desc,
                        cause: 'Intervention déclarée par le technicien',
                        solution: solution || 'Travaux effectués selon diagnostic',
                        observations: observation
                    },
                    isAlert: false
                };

                // 1. Ajouter à l'état local
                if (!Array.isArray(STATE.requests)) STATE.requests = [];
                STATE.requests.unshift(newReq);

                // 2. Synchroniser directement avec Firestore
                await syncRequestUpdate(newReq, 'Intervention enregistrée avec succès !');

                // 3. Télécharger le rapport si demandé
                if (generateReport) {
                    generateTechReport(newReq);
                }

                // Réinitialiser le formulaire
                form.reset();
                modal.classList.remove('open');
                
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '💾 Enregistrer l\'intervention';
                }

                refreshTechnicianUI();
            });
        }
    }
}

/**
 * Modal 2 : Déclarer une alerte critique (FAB Déclarer alerte)
 */
function setupAlertModal() {
    const fab = document.getElementById('fabAlert');
    const modal = document.getElementById('modalAlert');
    const close = document.getElementById('modalAlertClose');
    const cancel = document.getElementById('modalAlertCancel');
    const form = document.getElementById('formDeclareAlert');

    if (fab && modal) {
        fab.addEventListener('click', () => {
            modal.classList.add('open');
        });
        if (close) close.addEventListener('click', () => modal.classList.remove('open'));
        if (cancel) cancel.addEventListener('click', () => modal.classList.remove('open'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });

        if (form) {
            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                const alertType = document.getElementById('alertType')?.value || 'other';
                const alertService = document.getElementById('alertService')?.value?.trim() || '';
                const alertDesc = document.getElementById('alertDesc')?.value?.trim() || '';
                const alertUrgency = document.getElementById('alertUrgency')?.value || 'high';

                if (!alertService || !alertDesc) {
                    showToast('Veuillez renseigner tous les champs obligatoires (*)', 'error');
                    return;
                }

                const submitBtn = document.getElementById('btnSubmitAlert');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Déclenchement...';
                }

                const techName = getTechnicianName();
                const reqId = `ALT-${Date.now().toString().slice(-6)}`;
                const nowIso = new Date().toISOString();

                const typeLabels = {
                    power: '⚡ Coupure électrique générale',
                    gas: '💨 Panne centrale / Fuite Gaz médicaux',
                    water: '💧 Coupure / Fuite d\'eau critique',
                    ac: '❄️ Panne climatisation Bloc / Réa',
                    generator: '🔋 Défaut Groupe électrogène',
                    network: '🌐 Panne réseau / Système',
                    other: '📌 Incident technique urgent'
                };
                const alertLabel = typeLabels[alertType] || 'Alerte technique urgente';

                let specialite = 'Autre';
                if (alertType === 'ac') specialite = 'Froid & Climatisation';
                else if (alertType === 'gas') specialite = 'Fluides & PSA';
                else if (alertType === 'power' || alertType === 'generator') specialite = 'Électricité';
                else if (alertType === 'network') specialite = 'Électromécanique';

                const newReq = {
                    id: reqId,
                    equipment: alertLabel,
                    inventory: 'URG-' + Date.now().toString().slice(-4),
                    service: alertService,
                    structure: alertService,
                    specialite: specialite,
                    domain: specialite,
                    type: 'Urgence / Alerte',
                    description: alertDesc,
                    solution: '',
                    observation: 'Alerte critique en cours de traitement',
                    status: 'reported',
                    priority: alertUrgency === 'high' ? 'high' : 'medium',
                    isAlert: true,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    date: nowIso.split('T')[0],
                    assignedTo: '',
                    reporter: { name: techName, service: alertService },
                    events: [
                        {
                            type: 'alert',
                            title: `🚨 Alerte critique déclenchée : ${alertLabel}`,
                            author: techName,
                            at: nowIso,
                            text: alertDesc
                        }
                    ],
                    photos: { before: null, after: null },
                    parts: [],
                    diagnostic: {
                        desc: alertDesc,
                        cause: 'Déclaration d\'urgence critique',
                        solution: '',
                        observations: `Alerte déclenchée par ${techName}`
                    }
                };

                // 1. Ajouter à l'état local
                if (!Array.isArray(STATE.requests)) STATE.requests = [];
                STATE.requests.unshift(newReq);

                // 2. Synchroniser directement avec Firestore
                await syncRequestUpdate(newReq, '🚨 Alerte critique transmise avec succès !');

                // Réinitialiser et fermer
                form.reset();
                modal.classList.remove('open');

                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '🚨 Déclencher l\'alerte';
                }

                refreshTechnicianUI();
            });
        }
    }
}

async function removePart(requestId, ref) {
    const req = STATE.requests.find(r => r && r.id === requestId);
    if (!req) return;
    req.parts = req.parts.filter(p => p.ref !== ref);
    req.updatedAt = new Date().toISOString();
    await syncRequestUpdate(req, 'Pièce supprimée');
    selectRequest(requestId);
}

async function generateTechReport(req) {
    if (!req) {
        showToast('Aucune intervention sélectionnée', 'error');
        return;
    }

    // Utilisation prioritaire du générateur de rapports Word (.docx) natif
    if (window.DocxReportService) {
        try {
            const ok = await window.DocxReportService.generateInterventionReport(req);
            if (ok) return;
        } catch (err) {
            console.warn("Échec DocxReportService, bascule vers l'export HTML de secours :", err);
        }
    }

    const diagDesc = typeof req.diagnostic === 'string' ? req.diagnostic : (req.diagnostic?.desc || req.description || 'Non renseigné');
    const solutionDesc = req.solution || (typeof req.diagnostic === 'object' ? req.diagnostic?.solution : '') || req.observation || 'Intervention terminée';
    const dateFormatted = req.date || (req.createdAt ? (req.createdAt.includes('T') ? req.createdAt.split('T')[0] : req.createdAt) : new Date().toLocaleDateString('fr-FR'));

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Fiche d'Intervention - ${req.id}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: auto; color: #1A2332; line-height: 1.6; }
                .header { border-bottom: 3px solid #1565C0; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
                h1 { color: #1565C0; margin: 0; font-size: 1.8rem; }
                .subtitle { color: #5A6B7C; font-size: 0.9rem; margin-top: 4px; }
                .section-title { font-size: 1.1rem; font-weight: bold; color: #1565C0; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #E8EDF2; padding-bottom: 6px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
                .card-box { background: #F8FAFC; border: 1px solid #E8EDF2; border-radius: 8px; padding: 12px 16px; }
                .label { font-weight: 600; color: #5A6B7C; font-size: 0.85rem; text-transform: uppercase; }
                .value { font-size: 1rem; color: #1A2332; font-weight: 500; margin-top: 2px; }
                .footer { margin-top: 40px; border-top: 1px solid #E8EDF2; padding-top: 16px; color: #8A9BAB; font-size: 0.85rem; display: flex; justify-content: space-between; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>PROJECT REGULUS — GMAO</h1>
                    <div class="subtitle">Centre Régional d'Infrastructure des Équipements et de la Maintenance</div>
                </div>
                <div style="text-align: right;">
                    <strong style="color: #1565C0; font-size: 1.1rem;">FICHE D'INTERVENTION</strong><br />
                    <span style="font-size: 0.85rem; color: #5A6B7C;">Réf : ${escapeHtml(req.id)}</span>
                </div>
            </div>

            <div class="section-title">Informations Générales</div>
            <div class="grid">
                <div class="card-box">
                    <div class="label">Équipement / Installation</div>
                    <div class="value">${escapeHtml(req.equipment || 'Non spécifié')}</div>
                </div>
                <div class="card-box">
                    <div class="label">Date d'intervention</div>
                    <div class="value">${escapeHtml(dateFormatted)}</div>
                </div>
                <div class="card-box">
                    <div class="label">Structure / Service</div>
                    <div class="value">${escapeHtml(req.service || req.structure || 'Project Regulus')}</div>
                </div>
                <div class="card-box">
                    <div class="label">Domaine / Spécialité</div>
                    <div class="value">${escapeHtml(req.specialite || req.domain || 'Maintenance générale')}</div>
                </div>
                <div class="card-box">
                    <div class="label">Technicien / Intervenant</div>
                    <div class="value">${escapeHtml(req.assignedTo || 'Service Technique Regulus')}</div>
                </div>
                <div class="card-box">
                    <div class="label">Statut</div>
                    <div class="value">${statusLabel(req.status || 'resolved')}</div>
                </div>
            </div>

            <div class="section-title">Constat & Diagnostic</div>
            <div class="card-box" style="margin-bottom: 16px;">
                <p style="margin: 0;">${escapeHtml(diagDesc)}</p>
            </div>

            <div class="section-title">Travaux Réalisés & Solution</div>
            <div class="card-box" style="margin-bottom: 16px;">
                <p style="margin: 0;">${escapeHtml(solutionDesc)}</p>
            </div>

            ${req.observation ? `
                <div class="section-title">Observations</div>
                <div class="card-box">
                    <p style="margin: 0;">${escapeHtml(req.observation)}</p>
                </div>
            ` : ''}

            <div class="footer">
                <span>Généré le ${new Date().toLocaleString('fr-FR')} via Project Regulus GMAO</span>
                <span>Signature du Technicien : ___________________</span>
            </div>
        </body>
        </html>
    `;

    try {
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Fiche-${req.id}.doc`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('📄 Fiche d\'intervention téléchargée', 'success');
    } catch (e) {
        showToast('Erreur de génération', 'error');
    }
}

/**
 * Modal 3 : Modifier / Supprimer mon intervention (Technicien)
 */
function openEditTechModal(requestId) {
    const req = getSelectedRequestById(requestId);
    if (!req) {
        showToast('Intervention introuvable', 'error');
        return;
    }

    if (!canTechEditOrDelete(req)) {
        showToast('Vous ne pouvez modifier que les interventions que vous avez vous-même créées.', 'error');
        return;
    }

    const modal = document.getElementById('modalEditTechIntervention');
    if (!modal) return;

    document.getElementById('editTechIntId').value = req.id;
    document.getElementById('modalEditTechTitle').textContent = `✏️ Modifier mon intervention (${req.id})`;
    document.getElementById('editTechIntDate').value = req.date || (req.createdAt ? req.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
    document.getElementById('editTechIntType').value = req.type || 'Curative / Dépannage';
    document.getElementById('editTechIntEquipment').value = req.equipment || '';
    document.getElementById('editTechIntService').value = req.service || req.structure || '';
    document.getElementById('editTechIntSpecialite').value = req.specialite || req.domain || 'Biomédical';
    document.getElementById('editTechIntStatus').value = req.status || 'resolved';

    const diagDesc = typeof req.diagnostic === 'string' ? req.diagnostic : (req.diagnostic?.desc || req.description || '');
    const solutionDesc = req.solution || (typeof req.diagnostic === 'object' ? req.diagnostic?.solution : '') || '';
    const obsDesc = req.observation || (typeof req.diagnostic === 'object' ? req.diagnostic?.observations : '') || 'Fonctionnel';

    document.getElementById('editTechIntDesc').value = diagDesc;
    document.getElementById('editTechIntSolution').value = solutionDesc;
    document.getElementById('editTechIntObservation').value = obsDesc;

    modal.classList.add('open');
}

function closeEditTechModal() {
    const modal = document.getElementById('modalEditTechIntervention');
    if (modal) modal.classList.remove('open');
}

async function deleteTechIntervention(requestId) {
    const req = getSelectedRequestById(requestId);
    if (!req) {
        showToast('Intervention introuvable', 'error');
        return;
    }

    if (!canTechEditOrDelete(req)) {
        showToast('Vous ne pouvez supprimer que les interventions que vous avez vous-même créées.', 'error');
        return;
    }

    if (!confirm(`⚠️ Voulez-vous vraiment supprimer votre intervention ${requestId} (${req.equipment}) ?\nCette action est irréversible.`)) {
        return;
    }

    try {
        if (window.firebase && window.firebase.firestore) {
            const db = window.firebase.firestore();
            await db.collection('requests').doc(requestId).delete();
        }

        if (Array.isArray(STATE.requests)) {
            STATE.requests = STATE.requests.filter(r => r && r.id !== requestId);
        }
        if (typeof saveAppState === 'function') saveAppState();

        showToast(`🗑️ Intervention ${requestId} supprimée`, 'success');
        refreshTechnicianUI();

    } catch (err) {
        console.error('Erreur suppression technicien :', err);
        showToast('Erreur lors de la suppression', 'error');
    }
}

function setupEditTechModal() {
    const modal = document.getElementById('modalEditTechIntervention');
    const close = document.getElementById('modalEditTechClose');
    const cancel = document.getElementById('modalEditTechCancel');
    const form = document.getElementById('formEditTechIntervention');

    if (close) close.addEventListener('click', closeEditTechModal);
    if (cancel) cancel.addEventListener('click', closeEditTechModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeEditTechModal();
        });
    }

    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            const id = document.getElementById('editTechIntId').value;
            const req = getSelectedRequestById(id);
            if (!req || !canTechEditOrDelete(req)) {
                showToast('Action non autorisée', 'error');
                return;
            }

            const date = document.getElementById('editTechIntDate').value;
            const type = document.getElementById('editTechIntType').value;
            const equipment = document.getElementById('editTechIntEquipment').value.trim();
            const service = document.getElementById('editTechIntService').value.trim();
            const specialite = document.getElementById('editTechIntSpecialite').value;
            const status = document.getElementById('editTechIntStatus').value;
            const desc = document.getElementById('editTechIntDesc').value.trim();
            const solution = document.getElementById('editTechIntSolution').value.trim();
            const observation = document.getElementById('editTechIntObservation').value.trim() || 'Fonctionnel';

            const submitBtn = document.getElementById('btnSubmitEditTech');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Enregistrement...';
            }

            try {
                req.date = date;
                req.type = type;
                req.equipment = equipment;
                req.service = service;
                req.structure = service;
                req.specialite = specialite;
                req.domain = specialite;
                req.status = status;
                req.description = desc;
                req.solution = solution;
                req.observation = observation;
                req.diagnostic = {
                    desc: desc,
                    cause: typeof req.diagnostic === 'object' && req.diagnostic?.cause ? req.diagnostic.cause : 'Modifié par le technicien',
                    solution: solution,
                    observations: observation
                };
                req.updatedAt = new Date().toISOString();

                await syncRequestUpdate(req, '✅ Intervention modifiée avec succès');
                closeEditTechModal();
                refreshTechnicianUI();

            } catch (err) {
                console.error('Erreur mise à jour technicien :', err);
                showToast('Erreur lors de la modification', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '💾 Enregistrer les modifications';
                }
            }
        });
    }
}

// Exports globaux
window.selectRequest = selectRequest;
window.renderTechnicianRequests = renderTechnicianRequests;
window.getSelectedRequest = getSelectedRequest;
window.getSelectedRequestById = getSelectedRequestById;
window.removePart = removePart;
window.generateTechReport = generateTechReport;
window.refreshTechnicianUI = refreshTechnicianUI;
window.openEditTechModal = openEditTechModal;
window.closeEditTechModal = closeEditTechModal;
window.deleteTechIntervention = deleteTechIntervention;
window.canTechEditOrDelete = canTechEditOrDelete;