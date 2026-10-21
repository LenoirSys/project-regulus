// ============================================
// Project Regulus GMAO - Calendrier d'Activités Multi-Événements (Live)
// ============================================

let calCurrentDate = new Date();
let selectedDayEvents = null;
let cachedLivraisons = [];
let cachedControlesPSA = [];
let isFetchingRemoteCalendarData = false;

/**
 * Récupère les livraisons et contrôles PSA depuis Firestore si disponible
 */
async function fetchAdditionalCalendarEvents() {
    if (isFetchingRemoteCalendarData) return;
    isFetchingRemoteCalendarData = true;

    try {
        if (window.firebase && window.firebase.firestore) {
            const db = window.firebase.firestore();

            // 1. Livraisons
            try {
                const livSnap = await db.collection('livraisons').get();
                cachedLivraisons = livSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.warn('Calendrier: livraisons non disponibles', e);
            }

            // 2. Contrôles PSA
            try {
                const psaSnap = await db.collection('controles_psa').get();
                cachedControlesPSA = psaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.warn('Calendrier: contrôles PSA non disponibles', e);
            }
        }
    } catch (err) {
        console.warn('Erreur chargement données calendrier :', err);
    } finally {
        isFetchingRemoteCalendarData = false;
    }
}

function normalizeDateKey(dateVal) {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') {
        return dateVal.includes('T') ? dateVal.split('T')[0] : dateVal.slice(0, 10);
    }
    if (dateVal.toDate && typeof dateVal.toDate === 'function') {
        return dateVal.toDate().toISOString().split('T')[0];
    }
    if (dateVal instanceof Date) {
        return dateVal.toISOString().split('T')[0];
    }
    return null;
}

/**
 * Affiche le calendrier dans le conteneur donné
 */
async function renderActivityCalendar(containerId = 'activityCalendar', options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { technicianName = null } = options;

    // Charger les livraisons et PSA en arrière-plan si pas encore chargés
    if (cachedLivraisons.length === 0 && cachedControlesPSA.length === 0) {
        await fetchAdditionalCalendarEvents();
    }

    // 1. Filtrer les interventions
    let requestsToDisplay = (window.STATE && Array.isArray(STATE.requests)) ? STATE.requests : [];
    if (technicianName) {
        requestsToDisplay = requestsToDisplay.filter(r => !r.assignedTo || r.assignedTo === technicianName);
    }

    // 2. Regrouper les événements par date (YYYY-MM-DD)
    const eventsByDate = {};

    const addEvent = (dateStr, eventObj) => {
        if (!dateStr) return;
        if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
        eventsByDate[dateStr].push(eventObj);
    };

    // Interventions
    requestsToDisplay.forEach(req => {
        const dKey = normalizeDateKey(req.date || req.createdAt || req.updatedAt);
        if (dKey) {
            addEvent(dKey, {
                category: 'intervention',
                title: req.equipment || 'Intervention',
                service: req.service || 'Service non spécifié',
                tech: req.assignedTo || 'Non assigné',
                status: req.status || 'reported',
                priority: req.priority || 'medium',
                isAlert: Boolean(req.isAlert),
                raw: req
            });
        }
    });

    // Livraisons
    cachedLivraisons.forEach(liv => {
        const dKey = normalizeDateKey(liv.date || liv.dateLivraison || liv.createdAt);
        if (dKey) {
            addEvent(dKey, {
                category: 'livraison',
                title: `Livraison O₂ (${liv.quantite || liv.nbBouteilles || 0} Bouteilles)`,
                service: liv.destination || liv.fournisseur || 'Dépôt',
                tech: liv.receptionnaire || liv.technicien || 'Technicien Fluides',
                status: liv.statut || 'reçu',
                raw: liv
            });
        }
    });

    // Contrôles PSA
    cachedControlesPSA.forEach(psa => {
        const dKey = normalizeDateKey(psa.date || psa.createdAt);
        if (dKey) {
            addEvent(dKey, {
                category: 'psa',
                title: `Contrôle PSA (${psa.typeControle || 'Quotidien'})`,
                service: 'Centrale PSA',
                tech: psa.technicien || psa.inspecteur || 'Technicien Fluides',
                status: psa.statut || 'conforme',
                raw: psa
            });
        }
    });

    const today = new Date();
    const currentMonth = calCurrentDate.getMonth();
    const currentYear = calCurrentDate.getFullYear();

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

    const monthNames = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    // Calculer les totaux du mois
    let totalInterventionsMonth = 0;
    let totalLivraisonsMonth = 0;
    let totalPsaMonth = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayEvts = eventsByDate[dStr] || [];
        dayEvts.forEach(e => {
            if (e.category === 'intervention') totalInterventionsMonth++;
            if (e.category === 'livraison') totalLivraisonsMonth++;
            if (e.category === 'psa') totalPsaMonth++;
        });
    }

    let html = `
        <div class="calendar-card" style="background:white; border-radius:16px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <!-- Barre de navigation du mois -->
            <div class="calendar-nav-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; border-bottom:1px solid #E8EDF2; padding-bottom:14px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" class="btn ghost small" onclick="changeCalendarMonth(-1, '${containerId}')" style="font-weight:bold;">◀ Mois préc.</button>
                    <button type="button" class="btn ghost small" onclick="changeCalendarMonth(0, '${containerId}')" style="font-weight:600;">🏠 Aujourd'hui</button>
                    <button type="button" class="btn ghost small" onclick="changeCalendarMonth(1, '${containerId}')" style="font-weight:bold;">Mois suiv. ▶</button>
                </div>
                <h3 style="margin:0; font-size:1.3rem; color:#1565C0;">📅 ${monthNames[currentMonth]} ${currentYear}</h3>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <span class="badge" style="background:#E3F2FD; color:#1565C0;">🔧 ${totalInterventionsMonth} Interv.</span>
                    <span class="badge" style="background:#E8F5E9; color:#2E7D32;">🚚 ${totalLivraisonsMonth} Livr.</span>
                    <span class="badge" style="background:#FFF3E0; color:#E65100;">🧪 ${totalPsaMonth} PSA</span>
                </div>
            </div>

            <!-- Grille du calendrier -->
            <div class="calendar-grid" style="display:grid; grid-template-columns:repeat(7, 1fr); gap:6px; text-align:center;">
                <div style="font-weight:700; padding:6px; color:#5A6B7C; font-size:0.85rem;">Dim</div>
                <div style="font-weight:700; padding:6px; color:#5A6B7C; font-size:0.85rem;">Lun</div>
                <div style="font-weight:700; padding:6px; color:#5A6B7C; font-size:0.85rem;">Mar</div>
                <div style="font-weight:700; padding:6px; color:#5A6B7C; font-size:0.85rem;">Mer</div>
                <div style="font-weight:700; padding:6px; color:#5A6B7C; font-size:0.85rem;">Jeu</div>
                <div style="font-weight:700; padding:6px; color:#5A6B7C; font-size:0.85rem;">Ven</div>
                <div style="font-weight:700; padding:6px; color:#5A6B7C; font-size:0.85rem;">Sam</div>
    `;

    // Cases vides avant le 1er du mois
    for (let i = 0; i < firstDayIndex; i++) {
        html += `<div class="calendar-day empty" style="padding:10px; background:#F8FAFC; border-radius:8px; min-height:75px;"></div>`;
    }

    // Jours du mois
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = eventsByDate[dateStr] || [];
        const isToday = (day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear());

        const intervCount = dayEvents.filter(e => e.category === 'intervention').length;
        const livCount = dayEvents.filter(e => e.category === 'livraison').length;
        const psaCount = dayEvents.filter(e => e.category === 'psa').length;

        let badgesHtml = '';
        if (intervCount > 0) {
            badgesHtml += `<div style="font-size:0.7rem; background:#E3F2FD; color:#1565C0; border-radius:4px; padding:2px 4px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🔧 ${intervCount} interv.</div>`;
        }
        if (livCount > 0) {
            badgesHtml += `<div style="font-size:0.7rem; background:#E8F5E9; color:#2E7D32; border-radius:4px; padding:2px 4px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🚚 ${livCount} livr.</div>`;
        }
        if (psaCount > 0) {
            badgesHtml += `<div style="font-size:0.7rem; background:#FFF3E0; color:#E65100; border-radius:4px; padding:2px 4px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🧪 ${psaCount} PSA</div>`;
        }

        const hasEvents = dayEvents.length > 0;
        const cursorStyle = hasEvents ? 'cursor:pointer;' : '';
        const borderHighlight = isToday ? 'border:2px solid #1565C0;' : 'border:1px solid #E8EDF2;';
        const bgStyle = isToday ? '#F0F7FF' : (hasEvents ? '#FFFFFF' : '#FAFAFA');

        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}" 
                 onclick="showCalendarDayDetails('${dateStr}', '${containerId}')"
                 style="padding:6px; border-radius:8px; ${borderHighlight} background:${bgStyle}; min-height:75px; text-align:left; display:flex; flex-direction:column; justify-content:flex-start; ${cursorStyle} transition:transform 0.15s ease;"
                 title="${dayEvents.length ? `${dayEvents.length} événement(s) le ${dateStr}` : dateStr}">
                <div style="font-weight:${isToday ? 'bold' : '600'}; font-size:0.85rem; color:${isToday ? '#1565C0' : '#1A2332'}; display:flex; justify-content:space-between; align-items:center;">
                    <span>${day}</span>
                    ${isToday ? '<span style="font-size:0.65rem; background:#1565C0; color:white; border-radius:999px; padding:1px 5px;">Auj.</span>' : ''}
                </div>
                <div style="margin-top:2px;">
                    ${badgesHtml}
                </div>
            </div>
        `;
    }

    html += `
            </div>

            <!-- Détail du jour sélectionné -->
            <div id="${containerId}-day-detail" style="margin-top:20px; display:none;"></div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Changement de mois (+1, -1, ou 0 pour aujourd'hui)
 */
function changeCalendarMonth(offset, containerId) {
    if (offset === 0) {
        calCurrentDate = new Date();
    } else {
        calCurrentDate.setMonth(calCurrentDate.getMonth() + offset);
    }
    const techName = (typeof getTechnicianName === 'function') ? getTechnicianName() : null;
    renderActivityCalendar(containerId, { technicianName: techName });
}

/**
 * Affiche les événements détaillés d'un jour sous le calendrier
 */
function showCalendarDayDetails(dateStr, containerId) {
    const detailEl = document.getElementById(`${containerId}-day-detail`);
    if (!detailEl) return;

    const events = [];

    // 1. Interventions
    const reqs = (window.STATE && Array.isArray(STATE.requests)) ? STATE.requests : [];
    reqs.forEach(r => {
        if (normalizeDateKey(r.date || r.createdAt || r.updatedAt) === dateStr) {
            events.push({
                type: '🔧 Intervention',
                title: r.equipment || 'Équipement non précisé',
                desc: r.description || r.diagnostic?.desc || 'Aucune description',
                service: r.service || 'Service Regulus',
                author: r.assignedTo || 'Non assigné',
                status: r.status || 'reported',
                priority: r.priority || 'medium'
            });
        }
    });

    // 2. Livraisons
    cachedLivraisons.forEach(liv => {
        if (normalizeDateKey(liv.date || liv.dateLivraison || liv.createdAt) === dateStr) {
            events.push({
                type: '🚚 Livraison O₂',
                title: `${liv.quantite || liv.nbBouteilles || 0} bouteilles d'oxygène`,
                desc: `Fournisseur : ${liv.fournisseur || 'Standard'} - Pression : ${liv.pression || 'N/A'} bar`,
                service: liv.destination || 'Stock central',
                author: liv.receptionnaire || liv.technicien || 'Technicien Fluides',
                status: liv.statut || 'reçu'
            });
        }
    });

    // 3. Contrôles PSA
    cachedControlesPSA.forEach(psa => {
        if (normalizeDateKey(psa.date || psa.createdAt) === dateStr) {
            events.push({
                type: '🧪 Contrôle PSA',
                title: `Vérification ${psa.typeControle || 'Quotidienne'} PSA`,
                desc: `Pureté O₂: ${psa.pureteO2 || psa.purete_o2 || 'N/A'}% | Temp: ${psa.temperature || 'N/A'}°C`,
                service: 'Centrale de production PSA',
                author: psa.technicien || psa.inspecteur || 'Technicien Fluides',
                status: psa.statut || 'conforme'
            });
        }
    });

    if (events.length === 0) {
        detailEl.style.display = 'block';
        detailEl.innerHTML = `
            <div style="padding:16px; background:#F8FAFC; border:1px solid #E8EDF2; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#5A6B7C;">📅 Aucun événement enregistré pour le <strong>${dateStr}</strong>.</span>
                <button class="btn ghost small" onclick="document.getElementById('${containerId}-day-detail').style.display='none'">✕ Fermer</button>
            </div>
        `;
        return;
    }

    let itemsHtml = events.map(e => `
        <div style="border-left:4px solid #1565C0; background:#F8FAFC; padding:12px 16px; border-radius:0 8px 8px 0; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#1565C0;">${e.type} : ${escapeHtml(e.title)}</strong>
                <span class="badge in_progress" style="font-size:0.75rem;">${escapeHtml(e.status)}</span>
            </div>
            <div style="font-size:0.85rem; color:#5A6B7C; margin-top:4px;">
                <span>🏥 ${escapeHtml(e.service)}</span> • 
                <span>👤 ${escapeHtml(e.author)}</span>
            </div>
            <div style="font-size:0.85rem; color:#1A2332; margin-top:4px;">${escapeHtml(e.desc)}</div>
        </div>
    `).join('');

    detailEl.style.display = 'block';
    detailEl.innerHTML = `
        <div style="padding:16px; background:white; border:1px solid #E8EDF2; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; color:#1A2332;">📋 Activités du ${dateStr} (${events.length})</h4>
                <button class="btn ghost small" onclick="document.getElementById('${containerId}-day-detail').style.display='none'">✕ Fermer</button>
            </div>
            <div>${itemsHtml}</div>
        </div>
    `;
}

// Écouter les mises à jour de données Firestore pour rafraîchir le calendrier automatiquement
window.addEventListener('regulus:data-updated', () => {
    const calendarEl = document.getElementById('activityCalendar');
    if (calendarEl) {
        const techName = (typeof getTechnicianName === 'function') ? getTechnicianName() : null;
        renderActivityCalendar('activityCalendar', { technicianName: techName });
    }
});

// Expositions globales
window.renderActivityCalendar = renderActivityCalendar;
window.changeCalendarMonth = changeCalendarMonth;
window.showCalendarDayDetails = showCalendarDayDetails;
window.fetchAdditionalCalendarEvents = fetchAdditionalCalendarEvents;