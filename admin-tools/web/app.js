// ============================================================
// Project Regulus GMAO - Administration Locale Frontend JS
// ============================================================

let allUsers = [];
let currentFilter = 'all';
let selectedFile = null;

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadInterventionsCount();
    setupDropZone();
    setupFormAddUser();
    setupInterventionsImport();
    setupSearchAndFilters();
    setupSyncButton();
    setupModalForms();
});

// Affiche une alerte temporaire en haut de page
function showAlert(message, type = 'success') {
    const alertBox = document.getElementById('alertBox');
    alertBox.textContent = message;
    alertBox.className = `alert-box ${type}`;
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 4000);
}

// ============================================================
// 1. CHARGEMENT & AFFICHAGE DES UTILISATEURS
// ============================================================

async function loadUsers() {
    const tbody = document.getElementById('userTableBody');
    const countBadge = document.getElementById('userCount');

    try {
        const res = await fetch('/api/users');
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty">❌ Erreur : ${data.error}</td></tr>`;
            return;
        }

        allUsers = data.users || [];
        countBadge.textContent = `${allUsers.length} agent(s) enregistré(s)`;
        renderUsersTable();

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty">❌ Impossible de contacter le serveur local.</td></tr>`;
        console.error(err);
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('userTableBody');
    const searchVal = document.getElementById('searchInput').value.trim().toLowerCase();

    // Filtrage
    const filtered = allUsers.filter(u => {
        // Filtre de statut / rôle
        if (currentFilter === 'actif' && u.statut !== 'actif') return false;
        if (currentFilter === 'inactif' && u.statut === 'actif') return false;
        if (currentFilter === 'technician' && u.role !== 'technician') return false;
        if (currentFilter === 'supervisor' && !['supervisor', 'admin'].includes(u.role)) return false;

        // Filtre de recherche texte
        if (searchVal) {
            const matchName = u.fullName.toLowerCase().includes(searchVal);
            const matchEmail = u.email.toLowerCase().includes(searchVal);
            const matchSpec = (u.specialite || '').toLowerCase().includes(searchVal);
            const matchService = (u.service || '').toLowerCase().includes(searchVal);
            if (!matchName && !matchEmail && !matchSpec && !matchService) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color:#64748B;">Aucun utilisateur ne correspond aux critères.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const isActif = (u.statut === 'actif');
        const initials = (u.fullName || u.email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AG';

        const roleLabels = {
            admin: '🛡️ Admin',
            supervisor: '📊 Superviseur',
            technician: '🛠️ Technicien'
        };
        const roleLabel = roleLabels[u.role] || u.role;

        return `
            <tr style="opacity: ${isActif ? '1' : '0.65'}; background: ${isActif ? 'white' : '#FAFAFA'};">
                <td>
                    <div class="user-cell">
                        <div class="user-avatar" style="background: ${isActif ? '#1565C0' : '#94A3B8'};">${initials}</div>
                        <div class="user-names">
                            <h4>${escapeHtml(u.fullName)}</h4>
                            <small>${escapeHtml(u.email)}</small>
                        </div>
                    </div>
                </td>
                <td><span class="badge badge-role">${roleLabel}</span></td>
                <td><span class="badge badge-specialite">${escapeHtml(u.specialite || 'Polyvalent')}</span></td>
                <td>${escapeHtml(u.service || 'Project Regulus')}</td>
                <td>${escapeHtml(u.telephone || '-')}</td>
                <td>
                    <button class="btn small ${isActif ? 'success' : 'danger'}" onclick="toggleStatus('${u.uid}', ${isActif})">
                        ${isActif ? '🟢 Actif' : '🔴 Inactif'}
                    </button>
                </td>
                <td>
                    <div class="row-actions">
                        <button class="btn secondary small" onclick="openEditModal('${u.uid}')" title="Modifier profil">✏️</button>
                        <button class="btn secondary small" onclick="openPasswordModal('${u.uid}', '${escapeHtml(u.fullName)}') "title="Changer mot de passe">🔑</button>
                        <button class="btn danger small" onclick="deleteUser('${u.uid}', '${escapeHtml(u.fullName)}')" title="Supprimer">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}


// ============================================================
// 2. AJOUT INDIVIDUEL D'UN UTILISATEUR
// ============================================================

function setupFormAddUser() {
    const form = document.getElementById('formAddUser');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            nom: document.getElementById('userNom').value.trim(),
            prenom: document.getElementById('userPrenom').value.trim(),
            email: document.getElementById('userEmail').value.trim(),
            password: document.getElementById('userPassword').value.trim(),
            role: document.getElementById('userRole').value,
            specialite: document.getElementById('userSpecialite').value,
            telephone: document.getElementById('userTel').value.trim(),
            service: document.getElementById('userService').value.trim() || 'Project Regulus'
        };

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                showAlert(`✅ Compte de ${payload.prenom} ${payload.nom} créé avec succès !`, 'success');
                form.reset();
                document.getElementById('userService').value = 'Project Regulus';
                loadUsers();
            } else {
                showAlert(`❌ Erreur : ${data.error}`, 'error');
            }
        } catch (err) {
            showAlert("❌ Erreur lors de la création du compte.", 'error');
            console.error(err);
        }
    });
}


// ============================================================
// 3. IMPORTATION DE FICHIER (JSON / YAML)
// ============================================================

function setupDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const dropText = document.getElementById('dropText');
    const btnUpload = document.getElementById('btnUpload');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    function handleFileSelect(file) {
        selectedFile = file;
        dropText.innerHTML = `📄 <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(1)} Ko)`;
        btnUpload.disabled = false;
    }

    btnUpload.addEventListener('click', async () => {
        if (!selectedFile) return;

        btnUpload.disabled = true;
        btnUpload.textContent = '⏳ Importation en cours...';

        const formData = new FormData();
        formData.append('file', selectedFile);

        const reportEl = document.getElementById('importReport');
        reportEl.style.display = 'none';

        try {
            const res = await fetch('/api/users/import', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            btnUpload.textContent = '🚀 Lancer l\'importation';
            btnUpload.disabled = false;

            if (data.success && data.report) {
                const rep = data.report;
                let html = `<strong>🎉 Importation terminée avec succès !</strong><br>`;
                html += `• Total analysé : ${rep.total}<br>`;
                html += `• Créés : <strong>${rep.created}</strong><br>`;
                html += `• Mis à jour : <strong>${rep.updated}</strong><br>`;

                if (rep.errors && rep.errors.length) {
                    html += `<br><span style="color:#C62828;">⚠️ ${rep.errors.length} erreur(s) :</span><br>`;
                    html += rep.errors.map(e => `&nbsp;&nbsp;- Ligne ${e.line} (${e.email || 'N/A'}) : ${e.error}`).join('<br>');
                    reportEl.className = 'import-report warning';
                } else {
                    reportEl.className = 'import-report success';
                }

                reportEl.innerHTML = html;
                reportEl.style.display = 'block';

                loadUsers();
            } else {
                showAlert(`❌ Erreur : ${data.error || 'Échec de l\'import'}`, 'error');
            }
        } catch (err) {
            btnUpload.textContent = '🚀 Lancer l\'importation';
            btnUpload.disabled = false;
            showAlert("❌ Erreur de téléversement.", 'error');
            console.error(err);
        }
    });
}


// ============================================================
// 4. ACTIONS : STATUT, MODIFICATION, MOT DE PASSE, SUPPRESSION
// ============================================================

async function toggleStatus(uid, currentIsActif) {
    const action = currentIsActif ? "désactiver" : "activer";
    if (!confirm(`Confirmez-vous vouloir ${action} cet agent ?`)) return;

    try {
        const res = await fetch(`/api/users/${uid}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actif: !currentIsActif })
        });
        const data = await res.json();

        if (data.success) {
            showAlert(`✅ Statut de l'agent mis à jour.`, 'success');
            loadUsers();
        } else {
            showAlert(`❌ Erreur : ${data.error}`, 'error');
        }
    } catch (err) {
        showAlert("❌ Erreur de communication.", 'error');
    }
}

function openEditModal(uid) {
    const u = allUsers.find(x => x.uid === uid);
    if (!u) return;

    document.getElementById('editUid').value = u.uid;
    document.getElementById('editNom').value = u.nom || '';
    document.getElementById('editPrenom').value = u.prenom || '';
    document.getElementById('editRole').value = u.role || 'technician';
    document.getElementById('editSpecialite').value = u.specialite || 'polyvalent';
    document.getElementById('editTel').value = u.telephone || '';
    document.getElementById('editService').value = u.service || 'Project Regulus';

    document.getElementById('modalEdit').style.display = 'flex';
}

function openPasswordModal(uid, fullName) {
    document.getElementById('pwdUid').value = uid;
    document.getElementById('pwdTargetText').textContent = `Agent : ${fullName}`;
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('modalPassword').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function setupModalForms() {
    // Formulaire d'édition
    document.getElementById('formEditUser').addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = document.getElementById('editUid').value;
        const payload = {
            nom: document.getElementById('editNom').value.trim(),
            prenom: document.getElementById('editPrenom').value.trim(),
            role: document.getElementById('editRole').value,
            specialite: document.getElementById('editSpecialite').value,
            telephone: document.getElementById('editTel').value.trim(),
            service: document.getElementById('editService').value.trim()
        };

        try {
            const res = await fetch(`/api/users/${uid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showAlert("✅ Profil mis à jour.", 'success');
                closeModal('modalEdit');
                loadUsers();
            } else {
                showAlert(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            showAlert("❌ Erreur lors de la mise à jour.", 'error');
        }
    });

    // Formulaire mot de passe
    document.getElementById('formResetPassword').addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = document.getElementById('pwdUid').value;
        const password = document.getElementById('newPasswordInput').value.trim();

        try {
            const res = await fetch(`/api/users/${uid}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) {
                showAlert("✅ Mot de passe mis à jour.", 'success');
                closeModal('modalPassword');
            } else {
                showAlert(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            showAlert("❌ Erreur lors du changement de mot de passe.", 'error');
        }
    });
}

async function deleteUser(uid, fullName) {
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer définitivement ${fullName} ? Cette action est irréversible.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/users/${uid}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showAlert(`🗑️ Agent ${fullName} supprimé.`, 'success');
            loadUsers();
        } else {
            showAlert(`❌ ${data.error}`, 'error');
        }
    } catch (err) {
        showAlert("❌ Erreur lors de la suppression.", 'error');
    }
}


// ============================================================
// 5. RECHERCHE, FILTRES & SYNCHRONISATION
// ============================================================

function setupSearchAndFilters() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', () => renderUsersTable());

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderUsersTable();
        });
    });
}

function setupSyncButton() {
    const btnSync = document.getElementById('btnSyncAll');
    btnSync.addEventListener('click', async () => {
        btnSync.disabled = true;
        btnSync.textContent = '⏳ Synchronisation...';

        try {
            const res = await fetch('/api/sync', { method: 'POST' });
            const data = await res.json();
            btnSync.disabled = false;
            btnSync.textContent = '🔄 Synchroniser les comptes';

            if (data.success) {
                showAlert(`🎉 Synchronisation terminée : ${data.count} comptes vérifiés.`, 'success');
                loadUsers();
            } else {
                showAlert(`❌ Erreur : ${data.error}`, 'error');
            }
        } catch (err) {
            btnSync.disabled = false;
            btnSync.textContent = '🔄 Synchroniser les comptes';
            showAlert("❌ Erreur lors de la synchronisation.", 'error');
        }
    });
}

// ============================================================
// 6. GESTION DES INTERVENTIONS (REQUESTS)
// ============================================================

async function loadInterventionsCount() {
    const badge = document.getElementById('requestsCountBadge');
    if (!badge) return;

    try {
        const res = await fetch('/api/interventions/count');
        const data = await res.json();
        if (data.success) {
            badge.textContent = `${data.count} intervention(s) en base`;
        } else {
            badge.textContent = 'Erreur comptage';
        }
    } catch (e) {
        badge.textContent = 'Hors-ligne';
    }
}

function setupInterventionsImport() {
    const btnLocal = document.getElementById('btnImportLocalDataJson');
    const btnChoose = document.getElementById('btnChooseInterventionsFile');
    const fileInput = document.getElementById('interventionsFileInput');
    const reportEl = document.getElementById('interventionsReport');

    // 1. Bouton d'import rapide du data.json local (jeu de démo)
    if (btnLocal) {
        btnLocal.addEventListener('click', async () => {
            if (!confirm("Voulez-vous injecter le jeu d'interventions de démonstration ('admin-tools/data/import_interventions.example.json') dans Firestore ?")) {
                return;
            }

            btnLocal.disabled = true;
            btnLocal.textContent = '⏳ Injection par lots en cours...';
            reportEl.style.display = 'none';

            const formData = new FormData();
            formData.append('use_local_data_json', 'true');

            try {
                const res = await fetch('/api/interventions/import', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                btnLocal.disabled = false;
                btnLocal.textContent = '⚡ Importer le jeu d'interventions de démo';

                if (data.success && data.report) {
                    const rep = data.report;
                    let html = `<strong>🎉 Injection terminée avec succès !</strong><br>`;
                    html += `• Total analysé : <strong>${rep.total}</strong><br>`;
                    html += `• Injectées / Mises à jour : <strong>${rep.created}</strong><br>`;

                    if (rep.errors && rep.errors.length) {
                        html += `<br><span style="color:#C62828;">⚠️ ${rep.errors.length} erreur(s) :</span><br>`;
                        html += rep.errors.map(e => `&nbsp;&nbsp;- Lot ${e.batch_range} : ${e.error}`).join('<br>');
                        reportEl.className = 'import-report warning';
                    } else {
                        reportEl.className = 'import-report success';
                    }

                    reportEl.innerHTML = html;
                    reportEl.style.display = 'block';
                    loadInterventionsCount();
                } else {
                    showAlert(`❌ Erreur : ${data.error}`, 'error');
                }
            } catch (err) {
                btnLocal.disabled = false;
                btnLocal.textContent = '⚡ Importer le jeu d'interventions de démo';
                showAlert("❌ Erreur lors de l'injection.", 'error');
                console.error(err);
            }
        });
    }

    // 2. Bouton d'import via fichier personnalisé
    if (btnChoose && fileInput) {
        btnChoose.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async () => {
            if (!fileInput.files.length) return;
            const file = fileInput.files[0];

            btnChoose.disabled = true;
            btnChoose.textContent = `⏳ Traitement de ${file.name}...`;
            reportEl.style.display = 'none';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/api/interventions/import', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                btnChoose.disabled = false;
                btnChoose.textContent = '📁 Choisir un fichier...';

                if (data.success && data.report) {
                    const rep = data.report;
                    let html = `<strong>🎉 Importation de '${escapeHtml(file.name)}' terminée !</strong><br>`;
                    html += `• Total analysé : <strong>${rep.total}</strong><br>`;
                    html += `• Injectées / Mises à jour : <strong>${rep.created}</strong><br>`;

                    if (rep.errors && rep.errors.length) {
                        html += `<br><span style="color:#C62828;">⚠️ ${rep.errors.length} erreur(s) :</span><br>`;
                        html += rep.errors.map(e => `&nbsp;&nbsp;- Lot ${e.batch_range || e.index} : ${e.error}`).join('<br>');
                        reportEl.className = 'import-report warning';
                    } else {
                        reportEl.className = 'import-report success';
                    }

                    reportEl.innerHTML = html;
                    reportEl.style.display = 'block';
                    loadInterventionsCount();
                } else {
                    showAlert(`❌ Erreur : ${data.error}`, 'error');
                }
            } catch (err) {
                btnChoose.disabled = false;
                btnChoose.textContent = '📁 Choisir un fichier...';
                showAlert("❌ Erreur lors du téléversement.", 'error');
                console.error(err);
            }
        });
    }
}

// Fonction d'échappement XSS simple
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

