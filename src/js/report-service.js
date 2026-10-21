/**
 * ==============================================================================
 * PROJECT REGULUS — GMAO
 * Module Unifié de Génération de Rapports Word (.docx) & Couche d'Adaptation
 * ==============================================================================
 * Rôles :
 *  1. ReportAdapter : Adapte les modèles Firestore ('requests', 'livraisons', etc.)
 *     vers les schémas attendus par docxtemplater.
 *  2. DocxReportService : Charge les modèles Word officiels (.docx),
 *     injecte les données via PizZip + Docxtemplater et gère la sauvegarde
 *     (showSaveFilePicker ou FileSaver/saveAs).
 * ==============================================================================
 */

(function (window) {
    'use strict';

    // Cache mémoire pour les templates ArrayBuffer afin d'éviter des requêtes réseau répétées
    const templateCache = new Map();

    /**
     * Utilitaire de formatage de date en DD/MM/YYYY
     */
    function formatDateFR(rawDate) {
        if (!rawDate) return new Date().toLocaleDateString('fr-FR');
        if (typeof rawDate === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(rawDate.trim())) {
            return rawDate.trim();
        }
        try {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}/${month}/${year}`;
            }
        } catch (e) {
            // fallback
        }
        return String(rawDate);
    }

    /**
     * Normalisation textuelle sécurisée
     */
    function safeString(val, fallback = '—') {
        if (val === null || val === undefined) return fallback;
        const str = String(val).trim();
        return str.length > 0 ? str : fallback;
    }

    /**
     * ==========================================================================
     * 1. COUCHE D'ADAPTATION (ReportAdapter)
     * ==========================================================================
     */
    const ReportAdapter = {
        /**
         * Adapte une intervention (Firestore requests) pour template_regulus_intervention.docx
         */
        toInterventionData(req, options = {}) {
            if (!req) throw new Error("Aucune intervention fournie pour l'adaptation du rapport.");

            const techUser = (window.STATE && window.STATE.currentUser) || {};
            const assignedTechName = safeString(req.assignedTo || (req.reporter && req.reporter.name) || techUser.name, 'Technicien Regulus');

            // Qualification intervenant
            let qualification = 'Technicien Supérieur Biomédical';
            const spec = (req.specialite || req.domain || '').toLowerCase();
            if (spec.includes('fluide') || req.category === 'livraison' || (req.id && req.id.startsWith('LIV-'))) {
                qualification = 'Technicien Spécialiste Fluides Médicaux';
            } else if (spec.includes('froid')) {
                qualification = 'Technicien Froid & Climatisation';
            } else if (spec.includes('electr')) {
                qualification = 'Technicien Électromécanique & Énergie';
            } else if (spec.includes('info')) {
                qualification = 'Technicien Informatique & Réseaux';
            }

            // Date de l'intervention
            const dateIntervention = formatDateFR(req.date || req.createdAt);

            // Structure / Établissement
            const etablissement = safeString(req.structure || req.service, 'CHU Central');

            // Nature de l'intervention
            let nature = 'Curative / Dépannage';
            if (req.isAlert || req.priority === 'critical') {
                nature = "Curative d'urgence";
            } else if (req.type) {
                nature = req.type;
            } else if (req.maintenanceType === 'preventive' || req.category === 'preventive_psa') {
                nature = 'Maintenance Préventive';
            }

            // Diagnostic et cause
            const diagDesc = (typeof req.diagnostic === 'object' && req.diagnostic?.desc)
                ? req.diagnostic.desc
                : safeString(req.description, 'Signalement enregistré');

            const diagCause = (typeof req.diagnostic === 'object' && req.diagnostic?.cause)
                ? req.diagnostic.cause
                : 'Usure normale ou défaut technique constaté';

            const diagSolution = (typeof req.diagnostic === 'object' && req.diagnostic?.solution)
                ? req.diagnostic.solution
                : safeString(req.solution, 'Intervention de remise en état réalisée');

            const diagObs = (typeof req.diagnostic === 'object' && req.diagnostic?.observations)
                ? req.diagnostic.observations
                : safeString(req.observation, 'Appareil testé et fonctionnel.');

            // Construction du tableau {#travaux}
            let travauxList = [];
            if (Array.isArray(req.parts) && req.parts.length > 0) {
                travauxList = req.parts.map((p, idx) => ({
                    index: String(idx + 1).padStart(2, '0'),
                    designation: safeString(p.name || p.designation, 'Pièce détachée'),
                    reference: safeString(p.ref || p.reference, '—'),
                    qte: String(p.qty || p.qte || '1'),
                    description: safeString(p.desc || diagSolution, 'Remplacement standard et essai'),
                    observation: safeString(p.observation || p.obs, 'Pièce conforme issue du stock Regulus')
                }));
            } else {
                // Ligne de travaux synthétique si aucune pièce n'a été spécifiée
                travauxList.push({
                    index: '01',
                    designation: 'Main d’œuvre technique & Réglages',
                    reference: 'MO-REGULUS',
                    qte: '1',
                    description: diagSolution,
                    observation: 'Vérification et remise en marche RAS'
                });
            }

            // État de réparation
            const isResolved = req.status === 'resolved' || req.status === 'cloture';
            const panneReparee = isResolved ? 'Oui (Remis en service)' : 'Non (En cours de traitement)';
            const panneNonReparee = isResolved ? 'Néant' : (req.observation || 'En attente de pièces ou tests complémentaires');

            // ID et Références
            const cleanId = String(req.id || 'REQ-000');
            const numFiche = req.num_fiche || ('F-' + cleanId.replace(/\D/g, '').slice(-4) || '101');

            return {
                num_rapport: req.num_rapport || cleanId,
                region: req.region || 'Pôle Hospitalier Central',
                district: req.district || 'Secteur Sanitaire Nord',
                localite: req.localite || 'Campus Hospitalier',
                etablissement: etablissement,
                nom_intervenant: assignedTechName,
                qualification: req.qualification || qualification,
                date_intervention: dateIntervention,
                equipement: safeString(req.equipment, 'Équipement biomédical'),
                marque: safeString(req.brand || req.marque, '—'),
                modele: safeString(req.model || req.modele, '—'),
                num_serie: safeString(req.serialNumber || req.num_serie || req.inventory, '—'),
                emetteur_appel: safeString(req.emetteur_appel || (req.reporter && req.reporter.name), 'Direction / Service hospitalier'),
                contact_emetteur: safeString(req.contact_emetteur || (req.reporter && req.reporter.phone), '—'),
                num_fiche: numFiche,
                ref_demande: req.ref_demande || cleanId,
                num_bc: req.num_bc || '—',
                nature_intervention: nature,
                motif_appel: safeString(req.description, 'Panne signalée'),
                panne_constatee: diagDesc,
                cause_panne: diagCause,
                travaux: travauxList,
                duree_heures: req.duree_heures || req.duree || '2h30',
                panne_reparee: panneReparee,
                panne_non_reparee: panneNonReparee,
                commentaire_general: diagObs
            };
        },

        /**
         * Adapte une liste d'interventions/livraisons/contrôles pour template_regulus_activites.docx
         */
        toActivitiesBilanData(requestsList, options = {}) {
            const list = Array.isArray(requestsList) ? requestsList : [];

            // Pôles de spécialités du template
            const groups = {
                biomedicales: [],
                fluides: [],
                informatique: [],
                electricite: [],
                menuiserie: [],
                chaudronnerie: [],
                froid: [],
                electromecanique: []
            };

            list.forEach(item => {
                if (!item) return;
                const spec = String(item.specialite || item.domain || '').toLowerCase();
                const id = String(item.id || '');
                const cat = String(item.category || '');

                if (spec.includes('fluide') || cat === 'livraison' || cat === 'preventive_psa' || id.startsWith('LIV-') || id.startsWith('PSA-')) {
                    groups.fluides.push(item);
                } else if (spec.includes('froid') || spec.includes('climatisation')) {
                    groups.froid.push(item);
                } else if (spec.includes('electricite') || spec.includes('énergie') || spec.includes('energie')) {
                    groups.electricite.push(item);
                } else if (spec.includes('electromecanique') || spec.includes('mecanique')) {
                    groups.electromecanique.push(item);
                } else if (spec.includes('informatique') || spec.includes('reseau')) {
                    groups.informatique.push(item);
                } else if (spec.includes('menuiserie')) {
                    groups.menuiserie.push(item);
                } else if (spec.includes('chaudronnerie')) {
                    groups.chaudronnerie.push(item);
                } else {
                    // Par défaut sur Project Regulus : biomédicale
                    groups.biomedicales.push(item);
                }
            });

            // Ligne de repli obligatoire pour éviter les tableaux cassés dans Word
            const defaultEmptyRow = (hasLieu = false) => [{
                index: '-',
                activite_lieu: 'Néant',
                type_maintenance: 'RAS',
                date: '-',
                structure: 'Regulus GMAO',
                lieu: 'Regulus GMAO',
                observation: 'RAS'
            }];

            const mapGroupToRows = (items, hasLieu = false) => {
                if (!items || items.length === 0) return defaultEmptyRow(hasLieu);

                return items.map((r, idx) => {
                    const struct = safeString(r.structure || r.service, 'CHU Central');
                    let activiteLieu = safeString(r.equipment, 'Intervention');
                    if (r.description && r.description !== r.equipment) {
                        activiteLieu += ` (${r.description.slice(0, 80)})`;
                    }

                    let typeMaint = 'Curative';
                    if (r.maintenanceType === 'preventive' || r.category === 'preventive_psa') {
                        typeMaint = 'Préventive';
                    } else if (r.category === 'livraison') {
                        typeMaint = 'Exploitation / Suivi';
                    } else if (r.type) {
                        typeMaint = r.type;
                    }

                    const obs = (typeof r.diagnostic === 'object' && r.diagnostic?.observations)
                        ? r.diagnostic.observations
                        : safeString(r.observation || r.solution, (r.status === 'resolved' ? 'Fonctionnel / Conforme' : 'En cours'));

                    const row = {
                        index: String(idx + 1).padStart(2, '0'),
                        activite_lieu: activiteLieu,
                        type_maintenance: typeMaint,
                        date: formatDateFR(r.date || r.createdAt),
                        observation: obs
                    };

                    if (hasLieu) {
                        row.lieu = struct;
                    } else {
                        row.structure = struct;
                    }

                    return row;
                });
            };

            return {
                activites_biomedicales: mapGroupToRows(groups.biomedicales, false),
                activites_fluides: mapGroupToRows(groups.fluides, false),
                activites_informatique: mapGroupToRows(groups.informatique, true),
                activites_electricite: mapGroupToRows(groups.electricite, false),
                activites_menuiserie: mapGroupToRows(groups.menuiserie, true),
                activites_chaudronnerie: mapGroupToRows(groups.chaudronnerie, true),
                activites_froid: mapGroupToRows(groups.froid, false),
                activites_electromecanique: mapGroupToRows(groups.electromecanique, true)
            };
        }
    };

    /**
     * ==========================================================================
     * 2. MOTEUR DOCX & SERVICE DE RENDU (DocxReportService)
     * ==========================================================================
     */
    const DocxReportService = {
        /**
         * Télécharge ou récupère du cache le modèle Word (.docx) sous forme d'ArrayBuffer
         */
        async loadTemplate(url) {
            if (templateCache.has(url)) {
                return templateCache.get(url).slice(0); // Copie pour éviter altération
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Impossible de charger le modèle Word : ${url} (HTTP ${response.status})`);
            }

            const buffer = await response.arrayBuffer();
            templateCache.set(url, buffer);
            return buffer.slice(0);
        },

        /**
         * Déclenche la boîte de dialogue de sauvegarde native (showSaveFilePicker)
         * ou le fallback via FileSaver (saveAs)
         */
        async saveBlob(blob, defaultName = "Rapport_Regulus.docx") {
            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: defaultName,
                        types: [{
                            description: 'Document Microsoft Word (.docx)',
                            accept: {
                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
                            }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return true;
                } catch (err) {
                    if (err.name === 'AbortError') return false; // Annulation utilisateur
                    console.warn("showSaveFilePicker non disponible ou erreur, bascule vers FileSaver:", err);
                }
            }

            // Fallback classique
            if (typeof window.saveAs === 'function') {
                window.saveAs(blob, defaultName);
                return true;
            }

            // Fallback ultime sans librairie
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = defaultName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            return true;
        },

        /**
         * Génère un fichier DOCX à partir d'une URL de template et d'un objet de données
         */
        async renderAndDownload(templateUrl, data, outputFilename) {
            const PizZipConstructor = window.PizZip || (window.pizzip && window.pizzip.default) || window.pizzip;
            const DocxConstructor = window.docxtemplater || window.Docxtemplater;

            if (!PizZipConstructor) {
                throw new Error("PizZip n'est pas chargé dans l'environnement.");
            }
            if (!DocxConstructor) {
                throw new Error("Docxtemplater n'est pas chargé dans l'environnement.");
            }

            const buffer = await this.loadTemplate(templateUrl);
            const zip = new PizZipConstructor(buffer);
            const doc = new DocxConstructor(zip, {
                paragraphLoop: true,
                linebreaks: true
            });

            doc.render(data);

            const outBlob = doc.getZip().generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });

            return await this.saveBlob(outBlob, outputFilename);
        },

        /**
         * 📄 Génère la fiche Word d'une intervention individuelle
         */
        async generateInterventionReport(req, options = {}) {
            if (!req) {
                if (typeof window.showToast === 'function') window.showToast("Aucune intervention spécifiée", "error");
                return false;
            }

            if (typeof window.showToast === 'function') {
                window.showToast("📄 Génération de la fiche d'intervention Word en cours...", "info");
            }

            try {
                const data = ReportAdapter.toInterventionData(req, options);
                const templateUrl = options.templateUrl || 'templates/template_regulus_intervention.docx';
                const filename = `Fiche_Intervention_${data.num_rapport.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.docx`;

                const saved = await this.renderAndDownload(templateUrl, data, filename);
                if (saved && typeof window.showToast === 'function') {
                    window.showToast("✅ Fiche d'intervention Word enregistrée !", "success");
                }
                return saved;
            } catch (err) {
                console.error("❌ Erreur génération rapport intervention :", err);
                if (typeof window.showToast === 'function') {
                    window.showToast(`❌ Erreur génération Word : ${err.message}`, "error");
                }
                return false;
            }
        },

        /**
         * 📊 Génère le bilan périodique d'activités (hebdomadaire/mensuel)
         */
        async generateActivitiesBilanReport(requestsList, options = {}) {
            if (typeof window.showToast === 'function') {
                window.showToast("📊 Génération du bilan consolidé Word en cours...", "info");
            }

            try {
                const data = ReportAdapter.toActivitiesBilanData(requestsList, options);
                const templateUrl = options.templateUrl || 'templates/template_regulus_activites.docx';
                const dateSuffix = new Date().toISOString().split('T')[0];
                const filename = `Bilan_Activites_Regulus_${dateSuffix}.docx`;

                const saved = await this.renderAndDownload(templateUrl, data, filename);
                if (saved && typeof window.showToast === 'function') {
                    window.showToast("✅ Bilan d'activités Word généré avec succès !", "success");
                }
                return saved;
            } catch (err) {
                console.error("❌ Erreur génération bilan d'activités :", err);
                if (typeof window.showToast === 'function') {
                    window.showToast(`❌ Erreur génération Bilan Word : ${err.message}`, "error");
                }
                return false;
            }
        }
    };

    // Export global sur window
    window.ReportAdapter = ReportAdapter;
    window.DocxReportService = DocxReportService;

})(window);
