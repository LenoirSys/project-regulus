# ✨ Project Regulus — Plateforme GMAO Biomédicale, Technique & Fluides Médicaux (100 % Hors-Ligne)

> **Version vitrine publique Open-Architecture** — Gestion de la Maintenance Assistée par Ordinateur (GMAO) pour infrastructures hospitalières, pôles d'ingénierie biomédicale et unités de production de fluides médicaux.  
> ⚡ **Fonctionne à 100 % hors ligne** grâce à la **Firebase Local Emulator Suite** (`demo-project-regulus`) et aux librairies clientes embarquées localement (`src/js/vendor/`), sans dépendre d'aucun compte Google Cloud / Firebase réel.

🔗 **Dépôt GitHub associé** : [https://github.com/LenoirSys/project-regulus](https://github.com/LenoirSys/project-regulus) • **Profil GitHub** : [@LenoirSys](https://github.com/LenoirSys)

---

## 🚀 Démarrage Rapide (100 % Hors-Ligne sans compte Firebase)

### 1. Prérequis & Dépendances Système
Pour exécuter l'intégralité de la pile localement hors connexion (après installation initiale des outils), vous avez besoin de :
- **Node.js** (v18+ recommandé) et **Firebase CLI** (`npm install -g firebase-tools`)
- **Java JRE / JDK (version 11 ou supérieure, 21 recommandé)** : requis par la Firebase Local Emulator Suite pour faire tourner l'émulateur Cloud Firestore en local (`java -version`)
- **Python 3.10+** : requis pour l'outil d'administration local (`admin-tools/`)

### 2. Installation & Lancement en 3 commandes

```bash
# 1. Cloner le dépôt et se placer dans le dossier
git clone https://github.com/LenoirSys/project-regulus.git
cd project-regulus

# 2. (Optionnel) Installer les dépendances Python de l'outil d'administration
pip install -r admin-tools/requirements.txt

# 3. Démarrer la pile complète (Émulateurs Firebase + Hosting Web + Console Admin Flask)
npm run dev:full
```

### 3. Commandes NPM disponibles (`package.json`)

| Commande | Description |
| :--- | :--- |
| `npm run emulators:start` | Démarre la **Firebase Local Emulator Suite** (`demo-project-regulus`) avec persistance automatique dans `./demo-data` (`--import=./demo-data --export-on-exit=./demo-data`). |
| `npm run dev:full` | Démarre simultanément la **Firebase Local Emulator Suite** (Firestore, Auth, UI, Hosting) **et** le **Serveur Web d'Administration Python/Flask** (`admin-tools/server.py`). |
| `npm run admin:web` | Démarre uniquement l'interface Web locale d'administration sur `http://127.0.0.1:5000`. |
| `npm run admin:cli` | Lance la console interactive CLI d'administration en terminal (`admin-tools/user.py`). |
| `npm run emulators:export` | Sauvegarde manuellement à chaud l'état des émulateurs dans `./demo-data`. |

### 4. Ports & Interfaces locales accessibles

| Service | Adresse locale | Rôle |
| :--- | :--- | :--- |
| **Application Web Project Regulus** | [`http://127.0.0.1:5002`](http://127.0.0.1:5002) | Vitrine publique, Portail Technicien, Supervision, PSA & Livraisons |
| **Console d'Administration Web** | [`http://127.0.0.1:5000`](http://127.0.0.1:5000) | Gestion locale des utilisateurs, Custom Claims et imports par lots |
| **Firebase Emulator UI** | [`http://127.0.0.1:4000`](http://127.0.0.1:4000) | Interface graphique officielle d'inspection Firestore & Authentication |
| **Firestore Emulator** | `127.0.0.1:8080` | Base de données NoSQL temps réel locale |
| **Authentication Emulator** | `http://127.0.0.1:9099` | Serveur d'authentification et de jetons JWT local |

> 💡 **Comptes de démonstration préconfigurés** (créés et peuplés automatiquement dans l'émulateur dès la première connexion sur `http://127.0.0.1:5002/login.html`) :
> - **Technicien** : `tech@regulus-gmao.org` / Mot de passe : `password`
> - **Superviseur** : `super@regulus-gmao.org` / Mot de passe : `password`

---

## 📌 Présentation Générale

**Project Regulus** est une solution web complète de gestion et de supervision de la maintenance hospitalière. Conçue autour d'une architecture réactive **Firebase Authentication + Cloud Firestore** (exécutable à 100 % en local via la **Firebase Local Emulator Suite**), complétée par un **moteur documentaire Word (`.docx`) embarqué** et un **système d'administration hybride (Web local Flask & Console CLI Python)**, la plateforme couvre l'ensemble des besoins opérationnels d'un service biomédical et technique :

- **7 Domaines de spécialité pris en charge** : Biomédical, Fluides médicaux & PSA, Froid & Climatisation, Électromécanique, Électricité & Énergie, Informatique & Réseaux, Plomberie & Infrastructures.
- **Autonomie 100 % Hors-Ligne** :
  - Utilise le préfixe réservé `demo-project-regulus` reconnu nativement par Firebase CLI pour désactiver tout appel réseau vers Google Cloud.
  - Embarque localement les SDKs `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js`, `pizzip.js`, `docxtemplater.js` et `FileSaver.min.js` dans `src/js/vendor/`.
  - L'outil d'administration Python (`admin-tools/core.py`) utilise des identifiants anonymes (`AnonymousCredentials`) couplés à `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` et `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` : **aucun fichier `serviceAccountKey.json` n'est requis**.

---

## 🛠️ Description Détaillée des Fonctionnalités

### 1. Portail Public & Signalement Rapide (`src/index.html`, `src/client.html`)
- **Vitrine publique (`index.html`)** : Présentation détaillée de l'architecture, des modules fonctionnels, du système d'administration et accès direct au dépôt GitHub.
- **Portail de signalement sans compte (`client.html`)** : Permet au personnel hospitalier de déclarer une panne en quelques secondes (nom, service, équipement, description, photo) avec suivi des demandes durant la session.

### 2. Atelier Technicien & Gestion des Interventions (`src/technicien.html`)
- **File de travail interactive** : Filtrage temps réel (*Toutes*, *Urgentes*, *En cours*), prise en charge en un clic, mise en attente ou clôture.
- **Diagnostic technique structuré** : Saisie du constat, de la cause probable, de la solution apportée et de l'observation finale.
- **Gestion des pièces détachées & Photos** : Nomenclature des pièces remplacées (référence, désignation, quantité) et captures photo Avant / Après.
- **Saisie directe d'interventions achevées** : Enregistrement complet avec génération immédiate de la fiche d'intervention Word.
- **Déclenchement d'alertes critiques** : Remontée immédiate des urgences vitales (coupure électrique, fuite de gaz médicaux, panne climatisation bloc, groupe électrogène).

### 3. Tour de Contrôle & Supervision (`src/superviseur.html`)
- **Tableau de bord analytique (KPIs en direct)** : Nombre total d'interventions, interventions en cours, interventions en retard (> 48h), interventions résolues, alertes critiques actives et techniciens actifs.
- **Répartition par domaine & Flux d'activité** : Barres de progression par spécialité et journal chronologique des dernières actions.
- **Gestion de l'équipe technique** : Suivi de la charge de travail par technicien et création directe de comptes utilisateurs dans l'émulateur Auth & Firestore.
- **Historique global & Édition Superviseur** : Recherche multicritère, filtrage par domaine/statut et modification complète de toute intervention.

### 4. Logistique des Fluides Médicaux & Oxygène (`src/livraison.html`)
- **Suivi des livraisons d'oxygène** : Enregistrement par établissement destinataire, type de bouteille (`B50`, `B20`, `B10`), quantité, véhicule de transport et date.
- **Gestion des commandes** : Suivi des demandes d'approvisionnement en oxygène émises par les structures sanitaires.
- **Traçabilité & Rapports** : Synchronisation automatique dans Firestore et intégration dans les bilans périodiques.

### 5. Contrôle Réglementaire des Centrales PSA (`src/PSA.html`)
- **Checklists normatives multi-fréquences** : Points de contrôle **Quotidiens**, **Hebdomadaires** et **Mensuels** (pureté O₂, pression réseau, point de rosée, compresseur, sécheur, filtres).
- **Remontée automatique d'anomalies** : Saisie des valeurs hors-normes et création automatique d'une demande d'intervention technique si une anomalie est détectée.

### 6. Moteur de Génération de Rapports Officiels Word `.docx` (`src/js/report-service.js`)
- Basé sur `PizZip`, `Docxtemplater` et `FileSaver.js` avec modèles Word officiels (`src/templates/`) :
  - **`template_regulus_intervention.docx`** : Fiche d'intervention individuelle normalisée (identification, diagnostic, tableau des travaux/pièces, visas).
  - **`template_regulus_activites.docx`** : Bilan périodique consolidé classant automatiquement toutes les interventions, livraisons d'oxygène et contrôles PSA par spécialité technique (semaine en cours, mois en cours ou historique complet).

---

## 🛡️ Système d'Administration Inclus (`admin-tools/`)

Le dossier [`admin-tools/`](admin-tools/) fournit une suite complète d'administration locale en Python préconfigurée pour dialoguer directement avec les **émulateurs locaux Firestore (`:8080`) et Auth (`:9099`)** :

1. **Moteur Central (`admin-tools/core.py`)** :
   - Connecté par défaut (`USE_EMULATOR = True`) au projet local `demo-project-regulus` sans nécessiter de clé `serviceAccountKey.json`.
   - Création et synchronisation des comptes entre **Firebase Auth Emulator**, **Custom Claims JWT** (`role`, `specialite`) et la collection Firestore `users`.
   - Importation en masse d'utilisateurs (`.json`, `.yaml`) et d'historiques d'interventions par lots Firestore (`db.batch()` de 400 documents).
2. **Interface Web Locale d'Administration (`admin-tools/server.py` + `admin-tools/web/`)** :
   - Serveur Flask local sur `http://127.0.0.1:5000` (lanceur rapide `npm run admin:web` ou `lancer_admin_ui.bat`).
   - Gestion visuelle des agents (création, édition de rôle/spécialité, réinitialisation de mot de passe, activation/désactivation, suppression).
   - Zone **Drag & Drop** pour importer des listes d'utilisateurs ou d'interventions en masse.
3. **Console Interactive CLI (`admin-tools/user.py`)** :
   - Menu terminal à **13 commandes** (lanceur rapide `npm run admin:cli` ou `lancer_cli.bat`) pour administrer les agents et auditer/modifier/clôturer les interventions directement en ligne de commande.
