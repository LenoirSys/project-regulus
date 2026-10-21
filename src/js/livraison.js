// ============================================
// Project Regulus GMAO - Livraisons d'oxygène
// ============================================

let unsubscribeLivraisons = null;
let unsubscribeCommandes = null;

const COLLECTION_LIVRAISONS = 'livraisons';
const COLLECTION_COMMANDES = 'commandes';

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', async function() {
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'livraison.html') return;

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

    console.log('🚚 Module livraisons initialisé');

    if (typeof initFirebase === 'function') await initFirebase();
    if (typeof initApp === 'function') await initApp();

    initSidebar();
    setupLivraisonEvents();
    setupCommandeEvents();
    setupRapportEvents();

    // Écoute temps réel
    listenToLivraisons();
    listenToCommandes();

    // Navigation
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') && this.getAttribute('href') !== '#') return;
            e.preventDefault();
            const page = this.dataset.page;
            if (page) navigateToPage(page);
        });
    });

    // Date par défaut = aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    const livDate = document.getElementById('livDate');
    const cmdDate = document.getElementById('cmdDate');
    if (livDate) livDate.value = today;
    if (cmdDate) cmdDate.value = today;
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
        livraisons: '🚚 Livraisons d\'oxygène',
        commandes: '📋 Commandes',
        historique: '📜 Historique',
        rapports: '📄 Rapports'
    };
    const titleEl = document.querySelector('.page-title');
    if (titleEl && titles[page]) titleEl.textContent = titles[page];
}

// ===== ÉCOUTE FIRESTORE =====
async function listenToLivraisons() {
    const db = await ensureFirestoreReady();
    if (!db) return;

    if (unsubscribeLivraisons) unsubscribeLivraisons();

    unsubscribeLivraisons = db.collection(COLLECTION_LIVRAISONS)
        .orderBy('date', 'desc')
        .limit(100)
        .onSnapshot(snapshot => {
            const livraisons = [];
            snapshot.forEach(doc => livraisons.push({ id: doc.id, ...doc.data() }));
            window.LIVRAISONS = livraisons;
            renderLivraisonsHistory();
            renderRapportPreview();
        }, error => console.error('❌ Erreur livraisons :', error));
}

async function listenToCommandes() {
    const db = await ensureFirestoreReady();
    if (!db) return;

    if (unsubscribeCommandes) unsubscribeCommandes();

    unsubscribeCommandes = db.collection(COLLECTION_COMMANDES)
        .orderBy('date', 'desc')
        .limit(100)
        .onSnapshot(snapshot => {
            const commandes = [];
            snapshot.forEach(doc => commandes.push({ id: doc.id, ...doc.data() }));
            window.COMMANDES = commandes;
            renderCommandesHistory();
            renderRapportPreview();
        }, error => console.error('❌ Erreur commandes :', error));
}

// ===== SAISIE LIVRAISON =====
function setupLivraisonEvents() {
    const submitBtn = document.getElementById('livSubmitBtn');
    const resetBtn = document.getElementById('livResetBtn');

    if (submitBtn) {
        submitBtn.addEventListener('click', async function() {
            const structure = document.getElementById('livStructure').value;
            const type = document.getElementById('livType').value;
            const quantite = parseInt(document.getElementById('livQuantite').value) || 0;
            const vehicule = document.getElementById('livVehicule').value;
            const date = document.getElementById('livDate').value;
            const observation = document.getElementById('livObservation').value.trim();

            if (!structure || !type || quantite <= 0 || !date) {
                showToast('Veuillez remplir tous les champs obligatoires', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Enregistrement...';

            const livraison = {
                structure,
                type,
                quantite,
                vehicule,
                date,
                observation,
                technicien: (STATE.currentUser && STATE.currentUser.name) || 'Technicien',
                createdAt: new Date().toISOString()
            };

            try {
                const db = await ensureFirestoreReady();
                const docRef = await db.collection(COLLECTION_LIVRAISONS).add(livraison);

                // Miroir automatique dans la collection 'requests' pour centralisation du rapport hebdomadaire
                const techName = (STATE.currentUser && STATE.currentUser.name) || 'Technicien Fluides';
                const mirrorIntervention = {
                    id: `LIV-${docRef.id.slice(-6).toUpperCase()}`,
                    equipment: `Livraison de ${quantite} bouteille${quantite > 1 ? 's' : ''} d'oxygène ${type}`,
                    description: `Livraison de ${quantite} bouteille${quantite > 1 ? 's' : ''} d'oxygène ${type} à ${structure}. Véhicule : ${vehicule || 'N/A'}. ${observation ? 'Observation: ' + observation : ''}`.trim(),
                    domain: 'Biomédical',
                    specialite: 'fluides',
                    service: structure,
                    structure: structure,
                    maintenanceType: 'curative',
                    priority: 'medium',
                    status: 'resolved',
                    observation: observation || 'Livraison effectuée avec succès',
                    assignedTo: techName,
                    createdBy: (STATE.currentUser && STATE.currentUser.uid) || 'system',
                    reporter: {
                        name: techName,
                        service: structure
                    },
                    events: [
                        {
                            type: 'status',
                            title: 'Livraison effectuée',
                            author: techName,
                            at: new Date().toISOString(),
                            text: `Livraison de ${quantite} × ${type} effectuée à destination de ${structure}.`
                        }
                    ],
                    category: 'livraison',
                    sourceLivraisonId: docRef.id,
                    createdAt: livraison.date ? `${livraison.date}T08:00:00.000Z` : new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                await db.collection('requests').doc(mirrorIntervention.id).set(mirrorIntervention);

                showToast('✅ Livraison enregistrée', 'success');
                resetLivraisonForm();
            } catch (e) {
                console.error('❌ Erreur enregistrement livraison :', e);
                showToast('Erreur lors de l\'enregistrement', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '📤 Enregistrer la livraison';
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetLivraisonForm);
    }
}

function resetLivraisonForm() {
    document.getElementById('livStructure').value = '';
    document.getElementById('livType').value = 'B50';
    document.getElementById('livQuantite').value = 1;
    document.getElementById('livVehicule').value = 'Tricycle';
    document.getElementById('livObservation').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('livDate').value = today;
}

// ===== SAISIE COMMANDE =====
function setupCommandeEvents() {
    const submitBtn = document.getElementById('cmdSubmitBtn');
    const resetBtn = document.getElementById('cmdResetBtn');

    if (submitBtn) {
        submitBtn.addEventListener('click', async function() {
            const structure = document.getElementById('cmdStructure').value;
            const type = document.getElementById('cmdType').value;
            const quantite = parseInt(document.getElementById('cmdQuantite').value) || 0;
            const date = document.getElementById('cmdDate').value;
            const observation = document.getElementById('cmdObservation').value.trim();

            if (!structure || !type || quantite <= 0 || !date) {
                showToast('Veuillez remplir tous les champs obligatoires', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Enregistrement...';

            const commande = {
                structure,
                type,
                quantite,
                date,
                observation,
                saisiePar: (STATE.currentUser && STATE.currentUser.name) || 'Technicien',
                createdAt: new Date().toISOString()
            };

            try {
                const db = await ensureFirestoreReady();
                await db.collection(COLLECTION_COMMANDES).add(commande);
                showToast('✅ Commande enregistrée', 'success');
                resetCommandeForm();
            } catch (e) {
                console.error('❌ Erreur enregistrement commande :', e);
                showToast('Erreur lors de l\'enregistrement', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '📤 Enregistrer la commande';
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetCommandeForm);
    }
}

function resetCommandeForm() {
    document.getElementById('cmdStructure').value = '';
    document.getElementById('cmdType').value = 'B50';
    document.getElementById('cmdQuantite').value = 1;
    document.getElementById('cmdObservation').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('cmdDate').value = today;
}

// ===== AFFICHAGE HISTORIQUE =====
function renderLivraisonsHistory() {
    const container = document.getElementById('livraisonsHistory');
    if (!container) return;

    const livraisons = window.LIVRAISONS || [];
    if (!livraisons.length) {
        container.innerHTML = '<div class="empty" style="padding:20px; text-align:center; color:var(--text-muted);">Aucune livraison enregistrée</div>';
        return;
    }

    container.innerHTML = livraisons.map(l => `
        <div class="request-card">
            <div class="request-left">
                <span class="request-icon">🚚</span>
                <div class="request-info">
                    <h4>${escapeHtml(l.structure)} — ${l.quantite} × ${l.type}</h4>
                    <div class="meta">
                        <span>${new Date(l.date).toLocaleDateString('fr-FR')}</span>
                        <span>•</span>
                        <span>${escapeHtml(l.vehicule || '—')}</span>
                        <span>•</span>
                        <span>👤 ${escapeHtml(l.technicien || '—')}</span>
                    </div>
                </div>
            </div>
            <div class="request-right">
                <span class="badge resolved">Livré</span>
            </div>
        </div>
    `).join('');
}

function renderCommandesHistory() {
    const container = document.getElementById('commandesHistory');
    if (!container) return;

    const commandes = window.COMMANDES || [];
    if (!commandes.length) {
        container.innerHTML = '<div class="empty" style="padding:20px; text-align:center; color:var(--text-muted);">Aucune commande enregistrée</div>';
        return;
    }

    container.innerHTML = commandes.map(c => `
        <div class="request-card">
            <div class="request-left">
                <span class="request-icon">📋</span>
                <div class="request-info">
                    <h4>${escapeHtml(c.structure)} — ${c.quantite} × ${c.type}</h4>
                    <div class="meta">
                        <span>${new Date(c.date).toLocaleDateString('fr-FR')}</span>
                        <span>•</span>
                        <span>👤 ${escapeHtml(c.saisiePar || '—')}</span>
                    </div>
                </div>
            </div>
            <div class="request-right">
                <span class="badge reported">Commandé</span>
            </div>
        </div>
    `).join('');
}

// ===== RAPPORT HEBDOMADAIRE =====
function renderRapportPreview() {
    const container = document.getElementById('rapportPreview');
    if (!container) return;

    const livraisons = window.LIVRAISONS || [];
    const commandes = window.COMMANDES || [];

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);

    const livraisonsSemaine = livraisons.filter(l => new Date(l.date) >= weekStart);
    const commandesSemaine = commandes.filter(c => new Date(c.date) >= weekStart);

    const totalB50 = livraisonsSemaine.filter(l => l.type === 'B50').reduce((s, l) => s + l.quantite, 0);
    const totalB10 = livraisonsSemaine.filter(l => l.type === 'B10').reduce((s, l) => s + l.quantite, 0);

    container.innerHTML = `
        <div style="background:var(--bg); padding:16px; border-radius:8px;">
            <h3>Semaine du ${weekStart.toLocaleDateString('fr-FR')}</h3>
            <p><strong>Livraisons :</strong> ${livraisonsSemaine.length} (B50 : ${totalB50}, B10 : ${totalB10})</p>
            <p><strong>Commandes :</strong> ${commandesSemaine.length}</p>
            <h4>Détail des livraisons</h4>
            ${livraisonsSemaine.length ? livraisonsSemaine.map(l => `
                <div style="padding:4px 0; border-bottom:1px solid var(--border);">
                    ${new Date(l.date).toLocaleDateString('fr-FR')} — ${escapeHtml(l.structure)} : ${l.quantite} × ${l.type}
                </div>
            `).join('') : '<p class="muted">Aucune livraison cette semaine</p>'}
        </div>
    `;
}

function setupRapportEvents() {
    const genBtn = document.getElementById('generateRapportBtn');
    if (!genBtn) return;

    genBtn.addEventListener('click', async function() {
        if (!window.DocxReportService) {
            showToast('Module de rapport non disponible', 'error');
            return;
        }

        const livraisons = window.LIVRAISONS || [];
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);

        const livraisonsSemaine = livraisons.filter(l => new Date(l.date) >= weekStart);
        if (!livraisonsSemaine.length) {
            showToast('Aucune livraison trouvée cette semaine', 'warning');
            return;
        }

        // Adapter les livraisons pour la section Fluides du bilan Word
        const fluidesItems = livraisonsSemaine.map(l => ({
            id: `LIV-${l.id ? l.id.slice(-6) : '001'}`,
            equipment: `Livraison de ${l.quantite} bouteille(s) d'oxygène ${l.type}`,
            description: `Livraison effectuée avec véhicule ${l.vehicule || 'N/A'}. ${l.observation || ''}`.trim(),
            specialite: 'fluides',
            structure: l.structure,
            service: l.structure,
            date: l.date,
            category: 'livraison',
            assignedTo: l.technicien || 'Technicien Fluides',
            status: 'resolved',
            observation: `Conditionnement : ${l.quantite} × ${l.type} - RAS`
        }));

        genBtn.disabled = true;
        genBtn.textContent = '⏳ Génération Word en cours...';

        try {
            await window.DocxReportService.generateActivitiesBilanReport(fluidesItems);
        } catch (err) {
            console.error('Erreur génération rapport livraison :', err);
        } finally {
            genBtn.disabled = false;
            genBtn.textContent = '📄 Générer le rapport';
        }
    });
}

// ===== EXPORTS =====
window.navigateToPage = navigateToPage;
window.renderLivraisonsHistory = renderLivraisonsHistory;
window.renderCommandesHistory = renderCommandesHistory;
window.renderRapportPreview = renderRapportPreview;