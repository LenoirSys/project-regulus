// ============================================
// Project Regulus GMAO - Superviseur (Corrigé)
// ============================================

function openAddUserModal() {
    const modal = document.getElementById('modalAddUser');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        const form = document.getElementById('formAddUser');
        if (form) form.reset();

        const btn = document.getElementById('btnSaveUser');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">➕</span> Créer le compte';
        }

        setTimeout(() => {
            const firstInput = document.getElementById('userNom');
            if (firstInput) firstInput.focus();
        }, 100);
    }
}

function closeAddUserModal() {
    const modal = document.getElementById('modalAddUser');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

window.openAddUserModal = openAddUserModal;
window.closeAddUserModal = closeAddUserModal;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('📊 Superviseur initialisé');

    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) addUserBtn.addEventListener('click', () => openAddUserModal());

    const closeAddUserModalBtn = document.getElementById('closeAddUserModalBtn');
    if (closeAddUserModalBtn) closeAddUserModalBtn.addEventListener('click', () => closeAddUserModal());

    const cancelAddUserBtn = document.getElementById('cancelAddUserBtn');
    if (cancelAddUserBtn) cancelAddUserBtn.addEventListener('click', () => closeAddUserModal());

    if (typeof checkAuth === 'function') {
        const session = checkAuth();
        if (!session || !['supervisor', 'admin'].includes(session.role)) {
            if (session && typeof showToast === 'function') {
                showToast('Accès non autorisé', 'error');
                setTimeout(() => window.location.href = 'login.html', 1000);
            }
            return;
        }
    }

    if (typeof initFirebase === 'function') await initFirebase();
    if (typeof initApp === 'function') initApp();

    renderSupervisorDashboard();
    renderSupervisorHistory();
    renderSupervisorTechnicians();

    window.addEventListener('regulus:page-change', function(e) {
        const page = e.detail.page;
        if (['dashboard', 'reports', 'alerts', 'technicians'].includes(page)) {
            renderSupervisorDashboard();
        }
        if (page === 'history') {
            renderSupervisorHistory();
        }
        if (page === 'calendar' && typeof renderActivityCalendar === 'function') {
            renderActivityCalendar('activityCalendar');
        }
    });

    window.addEventListener('regulus:data-updated', function() {
        renderSupervisorDashboard();
        renderSupervisorHistory();
        renderSupervisorTechnicians();
    });

    const exportBilanBtn = document.getElementById('btnExportBilanDocx');
    if (exportBilanBtn) {
        exportBilanBtn.addEventListener('click', async function() {
            if (!window.DocxReportService) {
                if (typeof showToast === 'function') showToast("Module de rapport non disponible", "error");
                return;
            }

            const period = document.getElementById('bilanPeriodSelect')?.value || 'week';
            const allRequests = (window.STATE && Array.isArray(STATE.requests)) ? STATE.requests : [];

            const now = new Date();
            let filtered = [];

            if (period === 'week') {
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - now.getDay() + 1);
                weekStart.setHours(0, 0, 0, 0);
                filtered = allRequests.filter(r => {
                    const d = new Date(r.date || r.createdAt);
                    return !isNaN(d.getTime()) && d >= weekStart;
                });
            } else if (period === 'month') {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                filtered = allRequests.filter(r => {
                    const d = new Date(r.date || r.createdAt);
                    return !isNaN(d.getTime()) && d >= monthStart;
                });
            } else {
                filtered = allRequests.filter(r => isClosedOrResolved(r.status) || (r.id && r.id.startsWith('HIST-')));
            }

            exportBilanBtn.disabled = true;
            exportBilanBtn.textContent = '⏳ Génération du Bilan...';

            try {
                await window.DocxReportService.generateActivitiesBilanReport(filtered);
            } catch (err) {
                console.error("Erreur export bilan :", err);
            } finally {
                exportBilanBtn.disabled = false;
                exportBilanBtn.textContent = '🚀 Télécharger le Bilan Word (.docx)';
            }
        });
    }

    initModalListeners();
});

function getActiveTechnicians() {
    const techs = {};
    if (!window.STATE || !Array.isArray(STATE.requests)) return techs;

    STATE.requests.forEach(r => {
        if (!r.assignedTo) return;
        if (!techs[r.assignedTo]) techs[r.assignedTo] = { active: 0, resolved: 0 };

        if (r.status === 'resolved') {
            techs[r.assignedTo].resolved += 1;
        } else if (['in_progress', 'on_hold', 'reported'].includes(r.status)) {
            techs[r.assignedTo].active += 1;
        }
    });
    return techs;
}

/**
 * Affiche l'ensemble des utilisateurs (Techniciens, Superviseurs, Admins)
 * avec statut (actif/inactif), spécialités et boutons d'actions.
 */
async function renderSupervisorTechnicians() {
    const container = document.getElementById('supervisorTechnicians');
    if (!container) return;

    const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : (str) => str || '';

    try {
        const db = window.firebase ? window.firebase.firestore() : null;
        if (!db) {
            container.innerHTML = '<div class="empty">Erreur de connexion à la base de données.</div>';
            return;
        }

        const snapshot = await db.collection('users').get();

        if (snapshot.empty) {
            container.innerHTML = '<div class="empty">Aucun utilisateur enregistré.</div>';
            return;
        }

        const activeStats = getActiveTechnicians();
        let html = '';

        snapshot.forEach(doc => {
            const user = doc.data();
            const userId = doc.id;
            const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email || 'Utilisateur';
            const initials = fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AG';
            
            const stats = activeStats[fullName] || { active: 0, resolved: 0 };
            const roleBadge = user.role === 'admin' 
                ? '🛡️ Admin' 
                : (user.role === 'supervisor' ? '📊 Superviseur' : (user.role === 'demandeur' ? '📋 Demandeur' : '🛠️ Technicien'));

            const isActif = (user.statut !== 'inactif' && user.actif !== false);
            const statusBadge = isActif 
                ? '<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.75rem; background:#E8F5E9; color:#2E7D32; font-weight:600;">🟢 Actif</span>' 
                : '<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.75rem; background:#FFEBEE; color:#C62828; font-weight:600;">🔴 Inactif</span>';

            const specialite = user.specialite || 'Polyvalent';
            const service = user.service || 'Project Regulus';

            html += `
                <div class="tech-card" style="border: 1px solid #E8EDF2; padding: 16px; border-radius: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; background:${isActif ? 'white' : '#FAFAFA'}; opacity:${isActif ? '1' : '0.75'};">
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <div class="tech-avatar" style="width:40px; height:40px; border-radius:50%; background:${isActif ? '#1565C0' : '#78909C'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">${initials}</div>
                        <div class="tech-info">
                            <h4 style="margin:0; display:flex; align-items:center; gap:8px;">
                                ${safeEscape(fullName)} 
                                <small style="font-weight:normal; color:#5A6B7C;">(${roleBadge})</small>
                                ${statusBadge}
                            </h4>
                            <p class="tech-stats" style="margin:4px 0; font-size:0.85rem; color:#5A6B7C;">
                                <strong>Spécialité :</strong> ${safeEscape(specialite)} · <strong>Service :</strong> ${safeEscape(service)} · ${stats.active} en cours · ${stats.resolved} clôturées
                            </p>
                            <small class="muted">📧 ${safeEscape(user.email)} | 📞 ${safeEscape(user.telephone || 'N/A')}</small>
                        </div>
                    </div>
                    <div class="tech-actions" style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn secondary small" onclick="toggleUserStatus('${userId}', '${user.statut || 'actif'}')">${isActif ? '⏸️ Désactiver' : '▶️ Activer'}</button>
                        <button class="btn secondary small" onclick="editUserPrompt('${userId}', '${safeEscape(user.nom || '')}', '${safeEscape(user.prenom || '')}', '${user.role || 'technician'}', '${safeEscape(user.telephone || '')}', '${safeEscape(user.specialite || '')}')">✏️ Modifier</button>
                        <button class="btn danger small" style="background:#FFCDD2; color:#B71C1C; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;" onclick="deleteUserAccount('${userId}')" title="Supprimer">🗑️</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error("❌ Erreur lors du chargement des utilisateurs :", error);
        container.innerHTML = '<div class="empty">Impossible de charger la liste des utilisateurs.</div>';
    }
}

/**
 * Activer / Désactiver un agent
 */
async function toggleUserStatus(uid, currentStatut) {
    const isActif = (currentStatut !== 'inactif');
    const action = isActif ? 'désactiver' : 'activer';
    if (!confirm(`Voulez-vous vraiment ${action} cet utilisateur ?`)) return;

    const nouveauStatut = isActif ? 'inactif' : 'actif';

    try {
        const db = window.firebase.firestore();
        await db.collection('users').doc(uid).update({
            statut: nouveauStatut,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

        if (typeof showToast === 'function') {
            showToast(`✅ Utilisateur ${nouveauStatut === 'actif' ? 'activé' : 'désactivé'}`, 'success');
        }
        renderSupervisorTechnicians();
    } catch (err) {
        console.error("Erreur de statut :", err);
        if (typeof showToast === 'function') showToast('Erreur lors du changement de statut', 'error');
    }
}

/**
 * Fonction de modification d'un profil utilisateur Firestore
 */
async function editUserPrompt(uid, nom, prenom, role, telephone, specialite, service) {
    const newNom = prompt("Nom de famille :", nom);
    if (newNom === null) return;

    const newPrenom = prompt("Prénom :", prenom);
    if (newPrenom === null) return;

    const newSpec = prompt("Spécialité (ex: Biomédicale, Fluides, Électricité, Froid, etc.) :", specialite || 'Polyvalent');
    if (newSpec === null) return;

    const newTel = prompt("Téléphone :", telephone);
    if (newTel === null) return;

    try {
        const db = window.firebase.firestore();
        await db.collection('users').doc(uid).update({
            nom: newNom.trim(),
            prenom: newPrenom.trim(),
            specialite: newSpec.trim(),
            telephone: newTel.trim(),
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

        if (typeof showToast === 'function') showToast('✅ Profil mis à jour', 'success');
        renderSupervisorTechnicians();
    } catch (err) {
        console.error("Erreur de modification :", err);
        if (typeof showToast === 'function') showToast('Erreur lors de la mise à jour', 'error');
    }
}

/**
 * Suppression du document utilisateur dans Firestore
 */
async function deleteUserAccount(uid) {
    if (!confirm("Voulez-vous vraiment supprimer cet utilisateur de la base de données ?")) return;

    try {
        const db = window.firebase.firestore();
        await db.collection('users').doc(uid).delete();

        if (typeof showToast === 'function') showToast('🗑️ Utilisateur supprimé de Firestore', 'success');
        renderSupervisorTechnicians();
    } catch (err) {
        console.error("Erreur de suppression :", err);
        if (typeof showToast === 'function') showToast('Erreur de suppression', 'error');
    }
}

function isClosedOrResolved(status) {
    if (!status) return false;
    const s = String(status).toLowerCase();
    return ['resolved', 'closed', 'cloture', 'clôturé', 'termine', 'terminé'].includes(s);
}

function renderSupervisorDashboard() {
    if (!window.STATE) return;
    const requests = Array.isArray(STATE.requests) ? STATE.requests : [];

    // 1. Calcul des statistiques
    const total = requests.length;
    const inProgress = requests.filter(r => r.status === 'in_progress' || r.status === 'on_hold').length;
    const resolved = requests.filter(r => isClosedOrResolved(r.status) || (r.id && r.id.startsWith('HIST-'))).length;
    const critical = requests.filter(r => (r.isAlert || r.priority === 'critical' || r.priority === 'high') && !isClosedOrResolved(r.status) && !(r.id && r.id.startsWith('HIST-'))).length;
    
    // En retard (plus de 48h sans être résolue)
    const now = Date.now();
    const lateRequests = requests.filter(r => {
        if (isClosedOrResolved(r.status) || (r.id && r.id.startsWith('HIST-'))) return false;
        const created = new Date(r.createdAt || r.date || 0).getTime();
        return (now - created) > (48 * 3600 * 1000);
    });
    const late = lateRequests.length;

    // Techniciens actifs
    const techStats = getActiveTechnicians();
    const activeTechCount = Object.keys(techStats).length;

    // Mettre à jour les cartes statistiques
    const statCards = document.querySelectorAll('.supervisor-stats .stat-card .stat-number');
    if (statCards.length >= 6) {
        statCards[0].textContent = total;
        statCards[1].textContent = inProgress;
        statCards[2].textContent = late;
        statCards[3].textContent = resolved;
        statCards[4].textContent = critical;
        statCards[5].textContent = activeTechCount;
    }

    // 2. Répartition par domaine
    const domainContainer = document.getElementById('supervisorDomains');
    if (domainContainer) {
        const domainCounts = {};
        requests.forEach(r => {
            const domain = r.specialite || r.domain || 'Général';
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        });

        const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
        if (sortedDomains.length === 0) {
            domainContainer.innerHTML = '<p class="empty-text">Aucune donnée disponible</p>';
        } else {
            const maxVal = sortedDomains[0][1] || 1;
            domainContainer.innerHTML = sortedDomains.map(([name, count]) => `
                <div class="domain-bar" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.85rem;">
                        <strong>${escapeHtml(name)}</strong>
                        <span class="muted">${count} (${Math.round((count / (total || 1)) * 100)}%)</span>
                    </div>
                    <div style="height:8px; background:#E8EDF2; border-radius:4px; overflow:hidden;">
                        <div style="height:100%; width:${Math.round((count / maxVal) * 100)}%; background:#1565C0; border-radius:4px;"></div>
                    </div>
                </div>
            `).join('');
        }
    }

    // 3. Dernières actions / Activité
    const activityContainer = document.getElementById('supervisorActivity');
    if (activityContainer) {
        const recentReqs = [...requests].slice(0, 6);
        if (recentReqs.length === 0) {
            activityContainer.innerHTML = '<p class="empty-text">Aucune activité récente</p>';
        } else {
            activityContainer.innerHTML = recentReqs.map(r => `
                <div class="activity-item" style="padding:10px 0; border-bottom:1px solid #E8EDF2; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:600; font-size:0.9rem;">${escapeHtml(r.equipment || 'Intervention')}</div>
                        <div style="font-size:0.8rem; color:#5A6B7C;">${escapeHtml(r.service || r.structure || 'Project Regulus')} • 👤 ${escapeHtml(r.assignedTo || 'Non assigné')}</div>
                    </div>
                    <span class="badge ${r.status || 'reported'}" style="font-size:0.75rem;">${statusLabel(r.status || 'reported')}</span>
                </div>
            `).join('');
        }
    }

    // 4. Alertes en cours
    const alertsContainer = document.getElementById('supervisorAlerts');
    if (alertsContainer) {
        const activeAlerts = requests.filter(r => (r.isAlert || r.priority === 'critical' || r.priority === 'high') && !isClosedOrResolved(r.status) && !(r.id && r.id.startsWith('HIST-'))).slice(0, 4);
        if (activeAlerts.length === 0) {
            alertsContainer.innerHTML = '<p class="empty-text" style="padding:16px 0;">✅ Aucune alerte critique en cours</p>';
        } else {
            alertsContainer.innerHTML = activeAlerts.map(r => `
                <div class="request-card urgent" style="padding:12px; margin-bottom:8px; border:1px solid #FFCDD2; border-radius:8px; background:#FFEBEE;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>🚨 ${escapeHtml(r.equipment || 'Alerte')}</strong>
                        <span class="badge urgent">Critique</span>
                    </div>
                    <div style="font-size:0.85rem; color:#5A6B7C; margin-top:4px;">${escapeHtml(r.service || r.structure || 'Project Regulus')} • ${escapeHtml(r.description || '')}</div>
                </div>
            `).join('');
        }
    }

    // 5. Interventions en retard
    const lateContainer = document.getElementById('supervisorLate');
    if (lateContainer) {
        if (lateRequests.length === 0) {
            lateContainer.innerHTML = '<p class="empty-text" style="padding:16px 0;">✅ Aucune intervention en retard</p>';
        } else {
            lateContainer.innerHTML = lateRequests.slice(0, 4).map(r => `
                <div class="request-card aged" style="padding:12px; margin-bottom:8px; border:1px solid #FFE0B2; border-radius:8px; background:#FFF3E0;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>⏳ ${escapeHtml(r.equipment || 'Intervention')}</strong>
                        <span class="badge warning">> 48h</span>
                    </div>
                    <div style="font-size:0.85rem; color:#5A6B7C; margin-top:4px;">${escapeHtml(r.service || r.structure || 'Project Regulus')} • Assigné à : ${escapeHtml(r.assignedTo || 'Non assigné')}</div>
                </div>
            `).join('');
        }
    }

    // 6. Section Rapports
    const reportsContainer = document.getElementById('supervisorReports');
    if (reportsContainer) {
        const closedReqs = requests.filter(r => isClosedOrResolved(r.status) || (r.id && r.id.startsWith('HIST-')));
        const countBadge = document.getElementById('supervisorReportsCount');
        if (countBadge) countBadge.textContent = `${closedReqs.length} rapport(s) disponible(s)`;

        if (closedReqs.length === 0) {
            reportsContainer.innerHTML = '<p class="empty-text">Aucun rapport clôturé disponible</p>';
        } else {
            reportsContainer.innerHTML = closedReqs.slice(0, 40).map(r => `
                <div class="request-card" style="padding:14px; margin-bottom:10px; border:1px solid #E8EDF2; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:600; color:#1565C0;">📄 ${escapeHtml(r.equipment || 'Intervention')} <span class="muted" style="font-weight:normal; font-size:0.8rem;">(${r.id})</span></div>
                        <div style="font-size:0.85rem; color:#5A6B7C;">🏥 ${escapeHtml(r.service || r.structure || 'Project Regulus')} • Technicien : ${escapeHtml(r.assignedTo || 'Service Technique')}</div>
                        <div style="font-size:0.8rem; color:#8A9BAB; margin-top:2px;">📅 ${r.date || (r.createdAt ? r.createdAt.split('T')[0] : '')}</div>
                    </div>
                    <button class="btn ghost small" onclick="generateSupervisorReport('${r.id}')" title="Télécharger la fiche d'intervention Word">📄 Télécharger Word</button>
                </div>
            `).join('');
        }
    }

    // 7. Section Toutes les Alertes
    const allAlertsContainer = document.getElementById('supervisorAllAlerts');
    if (allAlertsContainer) {
        const allAlerts = requests.filter(r => r.isAlert || r.priority === 'critical' || r.priority === 'high');
        if (allAlerts.length === 0) {
            allAlertsContainer.innerHTML = '<p class="empty-text">Aucune alerte enregistrée</p>';
        } else {
            allAlertsContainer.innerHTML = allAlerts.map(r => `
                <div class="request-card" style="padding:14px; margin-bottom:10px; border:1px solid #E8EDF2; border-radius:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>🚨 ${escapeHtml(r.equipment || 'Alerte')} (${r.id})</strong>
                        <span class="badge ${r.status || 'reported'}">${statusLabel(r.status || 'reported')}</span>
                    </div>
                    <div style="font-size:0.85rem; color:#5A6B7C; margin-top:4px;">${escapeHtml(r.service || r.structure || 'Project Regulus')} • ${escapeHtml(r.description || '')}</div>
                </div>
            `).join('');
        }
    }

    // 8. Techniciens
    renderSupervisorTechnicians();
}

let supHistoryLimit = 40;
let supHistorySearchQuery = '';
let supHistoryDomain = 'all';
let supHistoryStatus = 'all';

function renderSupervisorHistory() {
    const container = document.getElementById('supervisorHistory');
    if (!container) return;

    setupSupervisorHistoryControls();

    const allRequests = Array.isArray(STATE.requests) ? STATE.requests : [];

    let history = allRequests.filter(r => {
        if (!r) return false;

        // Filtre de statut
        if (supHistoryStatus !== 'all') {
            if (supHistoryStatus === 'resolved' && !isClosedOrResolved(r.status) && !(r.id && r.id.startsWith('HIST-'))) return false;
            if (supHistoryStatus === 'in_progress' && r.status !== 'in_progress' && r.status !== 'on_hold') return false;
            if (supHistoryStatus === 'reported' && r.status !== 'reported') return false;
        }

        // Filtre de domaine
        if (supHistoryDomain !== 'all') {
            const spec = (r.specialite || r.domain || '').toLowerCase();
            const filterDom = supHistoryDomain.toLowerCase();
            if (!spec.includes(filterDom)) return false;
        }

        // Filtre de recherche texte
        if (supHistorySearchQuery) {
            const q = supHistorySearchQuery.toLowerCase();
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

    const counterEl = document.getElementById('supervisorHistoryCounter');
    if (counterEl) {
        counterEl.textContent = `${history.length} intervention(s) répertoriée(s) dans l'historique complet`;
    }

    if (!history.length) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);"><span style="font-size:2rem;">📜</span><p style="margin:8px 0 0;">Aucune intervention trouvée pour ces critères</p></div>`;
        const pagEl = document.getElementById('supervisorHistoryPagination');
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    const displayed = history.slice(0, supHistoryLimit);
    container.innerHTML = displayed.map(r => `
        <div class="request-card ${r.isAlert || r.priority === 'critical' ? 'urgent' : ''}" style="padding:14px; margin-bottom:10px; border:1px solid #E8EDF2; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div class="request-left" style="display:flex; gap:12px; align-items:center;">
                <span class="request-icon" style="font-size:1.5rem;">${r.isAlert ? '🚨' : (typeof getEquipmentIcon === 'function' ? getEquipmentIcon(r.equipment) : '🛠️')}</span>
                <div class="request-info">
                    <h4 style="margin:0;">${r.isAlert ? '🚨 ALERTE - ' : ''}${escapeHtml(r.equipment || 'Intervention')} <span class="muted" style="font-weight:normal; font-size:0.75rem;">(${r.id})</span></h4>
                    <div class="meta" style="font-size:0.85rem; color:#5A6B7C; margin-top:4px;">
                        <span>🏥 ${escapeHtml(r.service || r.structure || 'Project Regulus')}</span>
                        <span>•</span>
                        <span>📅 ${r.date || (r.createdAt ? r.createdAt.split('T')[0] : '')}</span>
                        ${r.assignedTo ? `<span>• 👤 ${escapeHtml(r.assignedTo)}</span>` : ''}
                        ${r.specialite || r.domain ? `<span>• 🛠️ ${escapeHtml(r.specialite || r.domain)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="request-right" style="display:flex; gap:8px; align-items:center;">
                <span class="badge ${r.status || 'resolved'}">${typeof statusLabel === 'function' ? statusLabel(r.status || 'resolved') : (r.status || 'resolved')}</span>
                <button class="btn ghost small" onclick="generateSupervisorReport('${r.id}')" title="Télécharger le rapport Word">📄 Rapport</button>
                <button class="btn secondary small" onclick="openEditInterventionModal('${r.id}')" title="Modifier l'intervention">✏️ Modifier</button>
                <button class="btn danger small" style="background:#FFCDD2; color:#B71C1C; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;" onclick="deleteIntervention('${r.id}')" title="Supprimer définitivement">🗑️</button>
            </div>
        </div>
    `).join('');

    const paginationContainer = document.getElementById('supervisorHistoryPagination');
    if (paginationContainer) {
        if (history.length > supHistoryLimit) {
            paginationContainer.innerHTML = `
                <button type="button" class="btn secondary" onclick="loadMoreSupervisorHistory()" style="padding:10px 24px; margin: 12px 0;">
                    ➕ Afficher plus d'interventions (${displayed.length} sur ${history.length})
                </button>
            `;
        } else {
            paginationContainer.innerHTML = `<span class="muted" style="font-size:0.85rem;">Fin de l'historique (${history.length} interventions)</span>`;
        }
    }
}

function loadMoreSupervisorHistory() {
    supHistoryLimit += 50;
    renderSupervisorHistory();
}

function setupSupervisorHistoryControls() {
    const searchInput = document.getElementById('supHistorySearchInput');
    const domainSelect = document.getElementById('supHistoryDomainFilter');
    const statusSelect = document.getElementById('supHistoryStatusFilter');

    if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        searchInput.addEventListener('input', (e) => {
            supHistorySearchQuery = e.target.value.trim();
            supHistoryLimit = 40;
            renderSupervisorHistory();
        });
    }

    if (domainSelect && !domainSelect._bound) {
        domainSelect._bound = true;
        domainSelect.addEventListener('change', (e) => {
            supHistoryDomain = e.target.value;
            supHistoryLimit = 40;
            renderSupervisorHistory();
        });
    }

    if (statusSelect && !statusSelect._bound) {
        statusSelect._bound = true;
        statusSelect.addEventListener('change', (e) => {
            supHistoryStatus = e.target.value;
            supHistoryLimit = 40;
            renderSupervisorHistory();
        });
    }
}

async function generateSupervisorReport(requestId) {
    const req = (STATE.requests || []).find(r => r && r.id === requestId);
    if (!req) {
        if (typeof showToast === 'function') showToast('Intervention introuvable', 'error');
        return;
    }

    // Utilisation prioritaire du générateur de rapports Word (.docx) officiel
    if (window.DocxReportService) {
        try {
            const ok = await window.DocxReportService.generateInterventionReport(req);
            if (ok) return;
        } catch (err) {
            console.warn("Échec DocxReportService, bascule vers rapport secours :", err);
        }
    }

    if (typeof generateTechReport === 'function') {
        generateTechReport(req);
        return;
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
                    <div class="value">${typeof statusLabel === 'function' ? statusLabel(req.status || 'resolved') : (req.status || 'resolved')}</div>
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
                <span>Visa Superviseur : ___________________</span>
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
        if (typeof showToast === 'function') showToast('📄 Fiche d\'intervention téléchargée', 'success');
    } catch (e) {
        if (typeof showToast === 'function') showToast('Erreur de génération', 'error');
    }
}

// Fonction de création
async function createNewUserByAdmin(email, password, userData) {
    let secondaryApp = null;
    try {
        const mainApp = window.firebase.apps[0];
        const config = {
            apiKey: mainApp.options.apiKey,
            authDomain: mainApp.options.authDomain,
            projectId: mainApp.options.projectId,
            storageBucket: mainApp.options.storageBucket,
            messagingSenderId: mainApp.options.messagingSenderId,
            appId: mainApp.options.appId
        };
        
        secondaryApp = window.firebase.initializeApp(config, "SecondaryApp");
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
        const newUser = userCredential.user;

        const mainDb = window.firebase.firestore();
        await mainDb.collection('users').doc(newUser.uid).set({
            nom: userData.nom || '',
            prenom: userData.prenom || '',
            email: email,
            role: userData.role || 'technician',
            specialite: userData.specialite || 'Général',
            telephone: userData.telephone || '',
            service: userData.service || 'Project Regulus',
            statut: 'actif',
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

        await secondaryApp.delete();
        return { success: true, uid: newUser.uid };
    } catch (error) {
        if (secondaryApp) try { await secondaryApp.delete(); } catch (e) {}
        return { success: false, error: error.message || 'Erreur inconnue' };
    }
}

function openEditInterventionModal(requestId) {
    const req = (STATE.requests || []).find(r => r && r.id === requestId);
    if (!req) {
        if (typeof showToast === 'function') showToast('Intervention introuvable', 'error');
        return;
    }

    const modal = document.getElementById('modalEditIntervention');
    if (!modal) return;

    document.getElementById('editIntId').value = req.id;
    document.getElementById('modalEditInterventionTitle').textContent = `✏️ Modifier l'intervention (${req.id})`;
    document.getElementById('editIntDate').value = req.date || (req.createdAt ? req.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
    document.getElementById('editIntStatus').value = req.status || 'resolved';
    document.getElementById('editIntEquipment').value = req.equipment || '';
    document.getElementById('editIntService').value = req.service || req.structure || '';
    document.getElementById('editIntSpecialite').value = req.specialite || req.domain || 'Biomédical';
    document.getElementById('editIntAssignedTo').value = req.assignedTo || '';
    document.getElementById('editIntPriority').value = req.priority || 'medium';

    const diagDesc = typeof req.diagnostic === 'string' ? req.diagnostic : (req.diagnostic?.desc || req.description || '');
    const solutionDesc = req.solution || (typeof req.diagnostic === 'object' ? req.diagnostic?.solution : '') || '';
    const obsDesc = req.observation || (typeof req.diagnostic === 'object' ? req.diagnostic?.observations : '') || 'Fonctionnel';

    document.getElementById('editIntDesc').value = diagDesc;
    document.getElementById('editIntSolution').value = solutionDesc;
    document.getElementById('editIntObservation').value = obsDesc;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeEditInterventionModal() {
    const modal = document.getElementById('modalEditIntervention');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function deleteIntervention(requestId) {
    const req = (STATE.requests || []).find(r => r && r.id === requestId);
    const equip = req ? req.equipment : requestId;
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer définitivement l'intervention ${requestId} (${equip}) ?\nCette action est irréversible.`)) {
        return;
    }

    try {
        if (window.firebase && window.firebase.firestore) {
            const db = window.firebase.firestore();
            await db.collection('requests').doc(requestId).delete();
        }

        // Mise à jour de l'état local
        if (Array.isArray(STATE.requests)) {
            STATE.requests = STATE.requests.filter(r => r && r.id !== requestId);
        }
        if (typeof saveAppState === 'function') saveAppState();

        if (typeof showToast === 'function') showToast(`🗑️ Intervention ${requestId} supprimée`, 'success');
        renderSupervisorDashboard();
        renderSupervisorHistory();

    } catch (err) {
        console.error('Erreur suppression intervention :', err);
        if (typeof showToast === 'function') showToast('Erreur lors de la suppression', 'error');
    }
}

function initModalListeners() {
    const form = document.getElementById('formAddUser');
    if (form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const email = document.getElementById('userEmail').value.trim();
            const password = document.getElementById('userPassword').value;

            const userData = {
                nom: document.getElementById('userNom').value.trim(),
                prenom: document.getElementById('userPrenom').value.trim(),
                role: document.getElementById('userRole').value,
                specialite: document.getElementById('userSpecialite').value.trim(),
                telephone: document.getElementById('userTelephone').value.trim(),
                service: document.getElementById('userService').value.trim() || 'Project Regulus'
            };

            const result = await createNewUserByAdmin(email, password, userData);

            if (result.success) {
                if (typeof showToast === 'function') showToast('✅ Nouveau compte créé !', 'success');
                newForm.reset();
                closeAddUserModal();
                renderSupervisorTechnicians();
            } else {
                if (typeof showToast === 'function') showToast('❌ Erreur : ' + result.error, 'error');
            }
        });
    }

    // Modal Édition Intervention
    const closeEditBtn = document.getElementById('closeEditInterventionBtn');
    if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditInterventionModal);

    const cancelEditBtn = document.getElementById('cancelEditInterventionBtn');
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditInterventionModal);

    const formEdit = document.getElementById('formEditIntervention');
    if (formEdit) {
        const newFormEdit = formEdit.cloneNode(true);
        formEdit.parentNode.replaceChild(newFormEdit, formEdit);

        newFormEdit.addEventListener('submit', async function(e) {
            e.preventDefault();

            const id = document.getElementById('editIntId').value;
            const date = document.getElementById('editIntDate').value;
            const status = document.getElementById('editIntStatus').value;
            const equipment = document.getElementById('editIntEquipment').value.trim();
            const service = document.getElementById('editIntService').value.trim();
            const specialite = document.getElementById('editIntSpecialite').value;
            const assignedTo = document.getElementById('editIntAssignedTo').value.trim();
            const priority = document.getElementById('editIntPriority').value;
            const desc = document.getElementById('editIntDesc').value.trim();
            const solution = document.getElementById('editIntSolution').value.trim();
            const observation = document.getElementById('editIntObservation').value.trim() || 'Fonctionnel';

            const saveBtn = document.getElementById('btnSaveEditIntervention');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Enregistrement...';
            }

            try {
                const reqIndex = (STATE.requests || []).findIndex(r => r && r.id === id);
                const existing = reqIndex >= 0 ? STATE.requests[reqIndex] : {};

                const updatedReq = {
                    ...existing,
                    id: id,
                    date: date,
                    status: status,
                    equipment: equipment,
                    service: service,
                    structure: service,
                    specialite: specialite,
                    domain: specialite,
                    assignedTo: assignedTo,
                    priority: priority,
                    description: desc,
                    solution: solution,
                    observation: observation,
                    diagnostic: {
                        desc: desc,
                        cause: existing.diagnostic?.cause || 'Intervention mise à jour par superviseur',
                        solution: solution,
                        observations: observation
                    },
                    updatedAt: new Date().toISOString()
                };

                // Écriture Firestore
                if (window.firebase && window.firebase.firestore) {
                    const db = window.firebase.firestore();
                    await db.collection('requests').doc(id).set(updatedReq, { merge: true });
                }

                // Mise à jour locale
                if (reqIndex >= 0) {
                    STATE.requests[reqIndex] = updatedReq;
                } else if (Array.isArray(STATE.requests)) {
                    STATE.requests.unshift(updatedReq);
                }
                if (typeof saveAppState === 'function') saveAppState();

                closeEditInterventionModal();
                if (typeof showToast === 'function') showToast('✅ Intervention mise à jour avec succès', 'success');

                renderSupervisorDashboard();
                renderSupervisorHistory();

            } catch (err) {
                console.error('Erreur mise à jour intervention :', err);
                if (typeof showToast === 'function') showToast('Erreur lors de la mise à jour', 'error');
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = '💾 Enregistrer les modifications';
                }
            }
        });
    }
}

// Expositions globales
window.toggleUserStatus = toggleUserStatus;
window.editUserPrompt = editUserPrompt;
window.deleteUserAccount = deleteUserAccount;
window.createNewUserByAdmin = createNewUserByAdmin;
window.renderSupervisorTechnicians = renderSupervisorTechnicians;
window.renderSupervisorDashboard = renderSupervisorDashboard;
window.renderSupervisorHistory = renderSupervisorHistory;
window.generateSupervisorReport = generateSupervisorReport;
window.openEditInterventionModal = openEditInterventionModal;
window.closeEditInterventionModal = closeEditInterventionModal;
window.deleteIntervention = deleteIntervention;