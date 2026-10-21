// ============================================
// Project Regulus GMAO - Contrôle du PSA
// ============================================

let unsubscribeControles = null;
const COLLECTION_CONTROLES = 'controles_psa';

// ===== DÉFINITION DES POINTS DE CONTRÔLE =====
const CHECKLIST = {
    quotidien: [
        { id: 'purete_o2', label: 'Pureté O₂ (%)', seuilMin: 90, seuilMax: 96, unite: '%' },
        { id: 'pression_air_entree', label: 'Pression d\'air en entrée (bar)', seuilMin: 7, seuilMax: 8.5, unite: 'bar' },
        { id: 'temperature_compresseur', label: 'Température compresseur (°C)', seuilMax: 90, unite: '°C' },
        { id: 'niveau_essence_groupe', label: 'Niveau d\'essence groupe électrogène', type: 'conforme' }
    ],
    hebdomadaire: [
        { id: 'niveau_huile_compresseur', label: 'Niveau d\'huile compresseur', type: 'conforme' },
        { id: 'purgeurs_condensats', label: 'Purgeurs et évacuation des condensats', type: 'conforme' },
        { id: 'raccords_flexibles', label: 'Inspection visuelle des raccords et flexibles', type: 'conforme' },
        { id: 'temperature_surpresseur', label: 'Température surpresseur (°C)', seuilMax: 60, unite: '°C' }
    ],
    mensuel: [
        { id: 'condenseur_chiller', label: 'Contrôle visuel condenseur chiller', type: 'conforme' },
        { id: 'filtres_air_compresseur', label: 'Contrôle visuel filtres à air compresseur', type: 'conforme' },
        { id: 'soupapes_securite', label: 'Vérification visuelle soupapes de sécurité', type: 'conforme' }
    ]
};

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', async function() {
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'PSA.html') return;

    const session = checkAuth();
    if (!session || !['technician', 'supervisor'].includes(session.role)) {
        if (session) {
            showToast('Accès non autorisé', 'error');
            setTimeout(() => window.location.href = 'login.html', 1000);
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    console.log('🧪 Module PSA initialisé');

    if (typeof initFirebase === 'function') await initFirebase();
    if (typeof initApp === 'function') await initApp();

    initSidebar();

    // Date par défaut = aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('controleDate').value = today;

    // Générer les check-lists
    renderChecklist('quotidien', 'checklistQuotidien');
    renderChecklist('hebdomadaire', 'checklistHebdomadaire');
    renderChecklist('mensuel', 'checklistMensuel');

    // Écouteurs
    document.getElementById('submitControleBtn').addEventListener('click', submitControle);
    document.getElementById('resetControleBtn').addEventListener('click', resetControles);
    document.getElementById('generateRapportControleBtn').addEventListener('click', genererRapportControle);

    // Navigation
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') && this.getAttribute('href') !== '#') return;
            e.preventDefault();
            const page = this.dataset.page;
            if (page) navigateToPage(page);
        });
    });

    // Écoute temps réel
    listenToControles();
});

// ===== NAVIGATION =====
function navigateToPage(page) {
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });
    document.querySelectorAll('.page-content').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });
    const titles = {
        controle: '🧪 Contrôle du jour',
        historique: '📜 Historique',
        rapports: '📄 Rapports'
    };
    const titleEl = document.querySelector('.page-title');
    if (titleEl && titles[page]) titleEl.textContent = titles[page];
}

// ===== RENDU D'UNE CHECK-LIST =====
function renderChecklist(frequence, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const items = CHECKLIST[frequence] || [];
    if (!items.length) {
        container.innerHTML = '<p class="muted">Aucun point de contrôle pour cette fréquence.</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        if (item.type === 'conforme') {
            return `
                <div class="checklist-item" data-id="${item.id}" style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid var(--border);">
                    <span style="flex:1; font-weight:500;">${item.label}</span>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="radio" name="${item.id}" value="conforme" checked />
                        <span>✅ Conforme</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="radio" name="${item.id}" value="anomalie" />
                        <span>⚠️ Anomalie</span>
                    </label>
                    <input type="text" class="anomalie-comment" placeholder="Commentaire..." style="display:none; padding:6px 10px; border:1px solid var(--border); border-radius:6px; width:200px;" />
                </div>
            `;
        } else {
            return `
                <div class="checklist-item" data-id="${item.id}" style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid var(--border);">
                    <span style="flex:1; font-weight:500;">${item.label}</span>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="radio" name="${item.id}" value="conforme" checked />
                        <span>✅ Conforme</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="radio" name="${item.id}" value="anomalie" />
                        <span>⚠️ Anomalie</span>
                    </label>
                    <input type="number" class="anomalie-valeur" step="0.1" placeholder="Valeur ${item.unite || ''}" style="display:none; padding:6px 10px; border:1px solid var(--border); border-radius:6px; width:120px;" />
                </div>
            `;
        }
    }).join('');

    // Écouteurs pour afficher/masquer les champs
    container.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const item = this.closest('.checklist-item');
            const isAnomalie = this.value === 'anomalie';
            const commentField = item.querySelector('.anomalie-comment');
            const valeurField = item.querySelector('.anomalie-valeur');
            if (commentField) commentField.style.display = isAnomalie ? 'block' : 'none';
            if (valeurField) valeurField.style.display = isAnomalie ? 'block' : 'none';
        });
    });
}

function resetControles() {
    renderChecklist('quotidien', 'checklistQuotidien');
    renderChecklist('hebdomadaire', 'checklistHebdomadaire');
    renderChecklist('mensuel', 'checklistMensuel');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('controleDate').value = today;
}

// ===== SOUMISSION DU CONTRÔLE =====
async function submitControle() {
    const date = document.getElementById('controleDate').value;

    if (!date) {
        showToast('Veuillez sélectionner une date', 'error');
        return;
    }

    const resultats = [];
    let hasAnomalie = false;

    // Parcourir toutes les fréquences
    for (const frequence of ['quotidien', 'hebdomadaire', 'mensuel']) {
        const items = CHECKLIST[frequence] || [];
        for (const item of items) {
            const selected = document.querySelector(`input[name="${item.id}"]:checked`);
            if (!selected) continue;

            const statut = selected.value;
            const resultat = { id: item.id, label: item.label, frequence, statut };

            if (statut === 'anomalie') {
                hasAnomalie = true;
                const itemEl = selected.closest('.checklist-item');
                const valeurField = itemEl.querySelector('.anomalie-valeur');
                const commentField = itemEl.querySelector('.anomalie-comment');
                if (valeurField) resultat.valeur = valeurField.value;
                if (commentField) resultat.commentaire = commentField.value;
            }

            resultats.push(resultat);
        }
    }

    const controle = {
        date,
        resultats,
        hasAnomalie,
        technicien: (STATE.currentUser && STATE.currentUser.name) || 'Technicien',
        createdAt: new Date().toISOString()
    };

    const btn = document.getElementById('submitControleBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Enregistrement...';

    try {
        const db = await ensureFirestoreReady();
        const docRef = await db.collection(COLLECTION_CONTROLES).add(controle);

        // Miroir automatique dans la collection 'requests' (Maintenance préventive) pour centralisation du rapport hebdomadaire
        const techName = (STATE.currentUser && STATE.currentUser.name) || 'Technicien Fluides';
        const anomalieList = resultats
            .filter(r => r.statut === 'anomalie')
            .map(r => `${r.label}: ${r.valeur || 'Non conforme'}${r.commentaire ? ' (' + r.commentaire + ')' : ''}`)
            .join(', ');

        const mirrorIntervention = {
            id: `PSA-${docRef.id.slice(-6).toUpperCase()}`,
            equipment: 'Centrale PSA (Production d\'Oxygène)',
            description: `Contrôle périodique du générateur PSA. Statut : ${hasAnomalie ? 'Anomalies détectées (' + anomalieList + ')' : 'Tous les paramètres sont conformes.'}`,
            domain: 'Biomédical',
            specialite: 'fluides',
            service: 'Centrale PSA / Fluides',
            structure: 'CHU Central',
            maintenanceType: 'preventive',
            priority: hasAnomalie ? 'high' : 'low',
            status: 'resolved',
            observation: hasAnomalie ? `Anomalies: ${anomalieList}` : 'Contrôle conforme - RAS',
            assignedTo: techName,
            createdBy: (STATE.currentUser && STATE.currentUser.uid) || 'system',
            reporter: {
                name: techName,
                service: 'Centrale PSA'
            },
            events: [
                {
                    type: 'status',
                    title: 'Contrôle PSA effectué',
                    author: techName,
                    at: new Date().toISOString(),
                    text: `Contrôle préventif enregistré. ${hasAnomalie ? 'Anomalies : ' + anomalieList : 'Paramètres conformes.'}`
                }
            ],
            category: 'preventive_psa',
            sourceControleId: docRef.id,
            createdAt: date ? `${date}T08:00:00.000Z` : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await db.collection('requests').doc(mirrorIntervention.id).set(mirrorIntervention);

        showToast('✅ Contrôle enregistré', 'success');
        resetControles();
    } catch (e) {
        console.error('❌ Erreur enregistrement contrôle :', e);
        showToast('Erreur lors de l\'enregistrement', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📤 Enregistrer le contrôle';
    }
}

// ===== ÉCOUTE FIRESTORE =====
async function listenToControles() {
    const db = await ensureFirestoreReady();
    if (!db) return;

    if (unsubscribeControles) unsubscribeControles();

    unsubscribeControles = db.collection(COLLECTION_CONTROLES)
        .orderBy('date', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            const controles = [];
            snapshot.forEach(doc => controles.push({ id: doc.id, ...doc.data() }));
            window.CONTROLES = controles;
            renderHistoriqueControles();
            renderRapportControle();
        }, error => console.error('❌ Erreur contrôles :', error));
}

// ===== HISTORIQUE =====
function renderHistoriqueControles() {
    const container = document.getElementById('controlesHistory');
    if (!container) return;

    const controles = window.CONTROLES || [];
    if (!controles.length) {
        container.innerHTML = '<div class="empty" style="padding:20px; text-align:center; color:var(--text-muted);">Aucun contrôle enregistré</div>';
        return;
    }

    container.innerHTML = controles.map(c => `
        <div class="request-card ${c.hasAnomalie ? 'urgent' : ''}">
            <div class="request-left">
                <span class="request-icon">${c.hasAnomalie ? '⚠️' : '✅'}</span>
                <div class="request-info">
                    <h4>Contrôle — ${new Date(c.date).toLocaleDateString('fr-FR')}</h4>
                    <div class="meta">
                        <span>👤 ${escapeHtml(c.technicien)}</span>
                        <span>•</span>
                        <span>${c.resultats.filter(r => r.statut === 'anomalie').length} anomalie(s)</span>
                    </div>
                </div>
            </div>
            <div class="request-right">
                <span class="badge ${c.hasAnomalie ? 'urgent' : 'resolved'}">
                    ${c.hasAnomalie ? '⚠️ Anomalie' : '✅ Conforme'}
                </span>
            </div>
        </div>
    `).join('');
}

// ===== RAPPORT =====
function renderRapportControle() {
    const container = document.getElementById('rapportControlePreview');
    if (!container) return;

    const controles = window.CONTROLES || [];
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);

    const controlesSemaine = controles.filter(c => new Date(c.date) >= weekStart);
    const anomalies = controlesSemaine.filter(c => c.hasAnomalie);

    container.innerHTML = `
        <div style="background:var(--bg); padding:16px; border-radius:8px;">
            <h3>Semaine du ${weekStart.toLocaleDateString('fr-FR')}</h3>
            <p><strong>Contrôles effectués :</strong> ${controlesSemaine.length}</p>
            <p><strong>Anomalies détectées :</strong> ${anomalies.length}</p>
            ${anomalies.length ? `
                <h4>Détail des anomalies</h4>
                ${anomalies.map(a => `
                    <div style="padding:8px; border-bottom:1px solid var(--border);">
                        <strong>${new Date(a.date).toLocaleDateString('fr-FR')}</strong><br>
                        ${a.resultats.filter(r => r.statut === 'anomalie').map(r => `
                            ⚠️ ${r.label} ${r.valeur ? `: ${r.valeur}` : ''} ${r.commentaire ? `(${r.commentaire})` : ''}
                        `).join('<br>')}
                    </div>
                `).join('')}
            ` : '<p class="muted">Aucune anomalie cette semaine</p>'}
        </div>
    `;
}

async function genererRapportControle() {
    const controles = window.CONTROLES || [];
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);

    const controlesSemaine = controles.filter(c => new Date(c.date) >= weekStart);
    const anomalies = controlesSemaine.filter(c => c.hasAnomalie);

    // Génération Word .docx officielle via DocxReportService
    if (window.DocxReportService && controlesSemaine.length > 0) {
        try {
            const fluidesItems = controlesSemaine.map(c => {
                const anomaliesTxt = (c.resultats || [])
                    .filter(r => r.statut === 'anomalie')
                    .map(r => `${r.label}: ${r.valeur || 'Anomalie'}${r.commentaire ? ' (' + r.commentaire + ')' : ''}`)
                    .join(', ');

                return {
                    id: `PSA-${c.id ? c.id.slice(-6) : '001'}`,
                    equipment: 'Centrale PSA (Production d\'Oxygène Médical)',
                    description: c.hasAnomalie ? `Contrôle périodique : Anomalies (${anomaliesTxt})` : 'Contrôle périodique des paramètres : Conforme',
                    specialite: 'fluides',
                    structure: 'Centrale PSA — Project Regulus',
                    service: 'Centrale PSA',
                    date: c.date,
                    maintenanceType: 'preventive',
                    category: 'preventive_psa',
                    assignedTo: c.technicien || 'Technicien PSA',
                    status: 'resolved',
                    observation: c.hasAnomalie ? `Anomalies détectées : ${anomaliesTxt}` : 'Contrôle conforme - RAS'
                };
            });

            await window.DocxReportService.generateActivitiesBilanReport(fluidesItems);
            return;
        } catch (err) {
            console.warn("Échec DocxReportService PSA, repli vers affichage secours :", err);
        }
    }

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Rapport de contrôle PSA</title>
            <style>
                body { font-family: 'Inter', Arial, sans-serif; padding: 40px; max-width: 800px; margin: auto; color: #1A2332; }
                h1 { color: #1565C0; }
                .header { border-bottom: 2px solid #1565C0; padding-bottom: 16px; margin-bottom: 24px; }
                .footer { margin-top: 40px; border-top: 1px solid #E8EDF2; padding-top: 16px; color: #8A9BAB; font-size: 0.85rem; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Rapport de contrôle PSA</h1>
                <p>Semaine du ${weekStart.toLocaleDateString('fr-FR')} | Généré le ${new Date().toLocaleString('fr-FR')}</p>
            </div>
            <p><strong>Contrôles effectués :</strong> ${controlesSemaine.length}</p>
            <p><strong>Anomalies détectées :</strong> ${anomalies.length}</p>
            ${anomalies.length ? `
                <h3>Détail des anomalies</h3>
                ${anomalies.map(a => `
                    <div style="margin-bottom:16px;">
                        <strong>${new Date(a.date).toLocaleDateString('fr-FR')}</strong><br>
                        ${a.resultats.filter(r => r.statut === 'anomalie').map(r => `
                            ⚠️ ${r.label} ${r.valeur ? `: ${r.valeur}` : ''} ${r.commentaire ? `(${r.commentaire})` : ''}
                        `).join('<br>')}
                    </div>
                `).join('')}
            ` : '<p>Aucune anomalie cette semaine</p>'}
            <div class="footer">
                <p>Document généré automatiquement par Project Regulus GMAO</p>
            </div>
        </body>
        </html>
    `;

    try {
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Rapport-PSA-${weekStart.toISOString().split('T')[0]}.doc`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('📄 Rapport généré', 'success');
    } catch (e) {
        showToast('Erreur de génération', 'error');
    }
}

// ===== EXPORTS =====
window.navigateToPage = navigateToPage;
window.renderChecklist = renderChecklist;
window.renderHistoriqueControles = renderHistoriqueControles;
window.renderRapportControle = renderRapportControle;