#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
===========================================================
  PROJECT REGULUS — GMAO
  Noyau Métier d'Administration des Utilisateurs (core.py)
===========================================================
Moteur partagé entre la CLI (user.py) et l'interface Web (server.py) :
  - Communication Firebase Admin (Auth + Firestore + Custom Claims)
  - Validation et gestion de la collection 'users'
  - Import et synchronisation par lot (JSON / YAML)
===========================================================
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime

# Windows Console encoding configuration
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# =========================================================
# CONFIGURATION ÉMULATEUR LOCAL (100 % HORS-LIGNE) / CLOUD
# =========================================================
PROJECT_ID = os.environ.get("GCLOUD_PROJECT", "demo-project-regulus")
USE_EMULATOR = os.environ.get("USE_EMULATOR", "true").strip().lower() in ("true", "1", "yes", "on")
FIRESTORE_EMULATOR_HOST = os.environ.get("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
FIREBASE_AUTH_EMULATOR_HOST = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")

if USE_EMULATOR:
    os.environ["FIRESTORE_EMULATOR_HOST"] = FIRESTORE_EMULATOR_HOST
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = FIREBASE_AUTH_EMULATOR_HOST
    os.environ["GCLOUD_PROJECT"] = PROJECT_ID
    os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID

import firebase_admin
from firebase_admin import credentials, auth, firestore

try:
    from google.auth.credentials import AnonymousCredentials
except ImportError:
    AnonymousCredentials = None

try:
    import yaml
except ImportError:
    yaml = None

COLLECTION_USERS = "users"
COLLECTION_REQUESTS = "requests"

ROLES_DICT = {
    "technician": "🛠️ Technicien (Interventions)",
    "supervisor": "📊 Superviseur (Affectations, Rapports)",
    "admin": "🛡️ Administrateur (Gestion complète)"
}

SPECIALITES_LIST = [
    ("biomedicale", "Biomédicale"),
    ("fluides", "Fluides médicaux & PSA"),
    ("electricite", "Électricité & Énergie"),
    ("froid", "Froid & Climatisation"),
    ("informatique", "Informatique & Réseaux"),
    ("plomberie", "Plomberie & Sanitaire"),
    ("polyvalent", "Maintenance générale / Polyvalent")
]


class _EmulatorCredential(credentials.Base):
    """Identifiant anonyme permettant à firebase-admin de fonctionner 100 % hors-ligne avec les émulateurs."""
    def get_credential(self):
        if AnonymousCredentials is not None:
            return AnonymousCredentials()
        return None


def init_firebase():
    """Initialise Firebase Admin SDK (Mode Émulateur Local hors-ligne ou Mode Cloud via serviceAccountKey)."""
    if firebase_admin._apps:
        return firestore.client()

    if USE_EMULATOR:
        os.environ["FIRESTORE_EMULATOR_HOST"] = FIRESTORE_EMULATOR_HOST
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = FIREBASE_AUTH_EMULATOR_HOST
        os.environ["GCLOUD_PROJECT"] = PROJECT_ID
        os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
        firebase_admin.initialize_app(_EmulatorCredential(), {"projectId": PROJECT_ID})
        return firestore.client()

    base_dir = Path(__file__).resolve().parent
    key_candidates = (
        list(base_dir.glob("serviceAccountKey.json")) +
        list(base_dir.glob("*firebase-adminsdk*.json"))
    )

    if not key_candidates:
        raise FileNotFoundError(
            f"Aucune clé Firebase (*.json) trouvée dans {base_dir}. "
            "Activez USE_EMULATOR=true pour utiliser la Firebase Local Emulator Suite "
            "ou déposez 'serviceAccountKey.json' dans admin-tools."
        )

    key_path = key_candidates[0]
    cred = credentials.Certificate(str(key_path))
    firebase_admin.initialize_app(cred)
    return firestore.client()


# Initialisation paresseuse
_db = None

def get_db():
    global _db
    if _db is None:
        _db = init_firebase()
    return _db


# =========================================================
# LECTURE & LISTING
# =========================================================

def list_users():
    """Retourne la liste complète des utilisateurs avec infos Firestore et Auth."""
    db = get_db()
    users_list = []

    # Dictionnaire des utilisateurs Auth pour enrichissement rapide
    auth_users_dict = {}
    try:
        for u in auth.list_users().iterate_all():
            auth_users_dict[u.uid] = {
                "disabled": u.disabled,
                "email_verified": u.email_verified,
                "custom_claims": u.custom_claims or {}
            }
    except Exception as e:
        print(f"⚠️ Avertissement lecture Auth : {e}")

    try:
        docs = list(db.collection(COLLECTION_USERS).stream())
        for doc in docs:
            data = doc.to_dict()
            uid = doc.id
            auth_info = auth_users_dict.get(uid, {})

            # Formatage date
            created_at = data.get("createdAt")
            if hasattr(created_at, "strftime"):
                created_str = created_at.strftime("%Y-%m-%d %H:%M")
            elif isinstance(created_at, str):
                created_str = created_at
            else:
                created_str = ""

            is_actif = (data.get("statut", "actif") == "actif") and not auth_info.get("disabled", False)

            users_list.append({
                "uid": uid,
                "email": data.get("email", ""),
                "nom": data.get("nom", ""),
                "prenom": data.get("prenom", ""),
                "fullName": f"{data.get('prenom', '')} {data.get('nom', '')}".strip() or data.get("email", ""),
                "role": data.get("role", "technician"),
                "specialite": data.get("specialite", "polyvalent"),
                "telephone": data.get("telephone", ""),
                "service": data.get("service", "Project Regulus"),
                "statut": "actif" if is_actif else "inactif",
                "disabled": auth_info.get("disabled", False),
                "claims": auth_info.get("custom_claims", {}),
                "createdAt": created_str
            })

    except Exception as e:
        raise RuntimeError(f"Erreur lors de la lecture des utilisateurs : {e}")

    # Tri par nom
    users_list.sort(key=lambda u: u["fullName"].lower())
    return users_list


# =========================================================
# CRÉATION & MODIFICATION
# =========================================================

def create_single_user(user_data):
    """
    Crée un utilisateur dans Firebase Auth + Custom Claims + Firestore.
    user_data = { email, password, nom, prenom, role, specialite, telephone, service }
    """
    db = get_db()

    email = (user_data.get("email") or "").strip().lower()
    password = (user_data.get("password") or "").strip()
    nom = (user_data.get("nom") or "").strip().upper()
    prenom = (user_data.get("prenom") or "").strip().title()
    role = (user_data.get("role") or "technician").strip().lower()
    specialite = (user_data.get("specialite") or "polyvalent").strip().lower()
    telephone = (user_data.get("telephone") or "").strip()
    service = (user_data.get("service") or "Project Regulus").strip()

    if not email or "@" not in email:
        raise ValueError("Adresse email invalide.")
    if not password or len(password) < 6:
        raise ValueError("Le mot de passe doit comporter au moins 6 caractères.")
    if not nom:
        raise ValueError("Le nom de famille est obligatoire.")

    if role not in ROLES_DICT:
        role = "technician"

    display_name = f"{prenom} {nom}".strip()

    # 1. Firebase Auth
    user_record = auth.create_user(
        email=email,
        password=password,
        display_name=display_name,
        disabled=False
    )
    uid = user_record.uid

    # 2. Custom Claims
    claims = {
        "role": role,
        "specialite": specialite,
        "statut": "actif"
    }
    auth.set_custom_user_claims(uid, claims)

    # 3. Document Firestore
    firestore_data = {
        "nom": nom,
        "prenom": prenom,
        "email": email,
        "role": role,
        "specialite": specialite,
        "telephone": telephone,
        "service": service,
        "statut": "actif",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }
    db.collection(COLLECTION_USERS).document(uid).set(firestore_data)

    return {
        "uid": uid,
        "email": email,
        "fullName": display_name,
        "role": role,
        "specialite": specialite
    }


def set_user_status(uid, actif: bool):
    """Active ou désactive un utilisateur dans Auth et Firestore."""
    db = get_db()
    statut_str = "actif" if actif else "inactif"

    # Auth
    auth.update_user(uid, disabled=not actif)

    # Claims
    claims = auth.get_user(uid).custom_claims or {}
    claims["statut"] = statut_str
    auth.set_custom_user_claims(uid, claims)

    # Firestore
    db.collection(COLLECTION_USERS).document(uid).set({
        "statut": statut_str,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)

    return {"uid": uid, "statut": statut_str}


def update_user_profile(uid, profile_data):
    """Met à jour les informations d'un agent."""
    db = get_db()
    update_doc = {
        "updatedAt": firestore.SERVER_TIMESTAMP
    }

    if "nom" in profile_data:
        update_doc["nom"] = profile_data["nom"].strip().upper()
    if "prenom" in profile_data:
        update_doc["prenom"] = profile_data["prenom"].strip().title()
    if "role" in profile_data and profile_data["role"] in ROLES_DICT:
        update_doc["role"] = profile_data["role"]
    if "specialite" in profile_data:
        update_doc["specialite"] = profile_data["specialite"].strip().lower()
    if "telephone" in profile_data:
        update_doc["telephone"] = profile_data["telephone"].strip()
    if "service" in profile_data:
        update_doc["service"] = profile_data["service"].strip()

    # Mise à jour Firestore
    db.collection(COLLECTION_USERS).document(uid).set(update_doc, merge=True)

    # Mise à jour Auth si le nom ou le rôle ont changé
    doc_snap = db.collection(COLLECTION_USERS).document(uid).get()
    full_data = doc_snap.to_dict() or {}

    new_display = f"{full_data.get('prenom', '')} {full_data.get('nom', '')}".strip()
    if new_display:
        try:
            auth.update_user(uid, display_name=new_display)
        except Exception:
            pass

    # Claims
    claims = auth.get_user(uid).custom_claims or {}
    if "role" in update_doc:
        claims["role"] = update_doc["role"]
    if "specialite" in update_doc:
        claims["specialite"] = update_doc["specialite"]
    auth.set_custom_user_claims(uid, claims)

    return {"success": True, "uid": uid}


def reset_user_password(uid_or_email, new_password):
    """Modifie le mot de passe d'un utilisateur."""
    if len(new_password) < 6:
        raise ValueError("Le mot de passe doit comporter au moins 6 caractères.")

    if "@" in uid_or_email:
        user = auth.get_user_by_email(uid_or_email.lower())
        uid = user.uid
    else:
        uid = uid_or_email

    auth.update_user(uid, password=new_password)
    return {"success": True, "uid": uid}


def delete_user(uid):
    """Supprime définitivement un utilisateur de Firebase Auth et Firestore."""
    db = get_db()
    # Supprimer d'Auth
    try:
        auth.delete_user(uid)
    except Exception as e:
        print(f"⚠️ Erreur suppression Auth : {e}")

    # Supprimer de Firestore
    db.collection(COLLECTION_USERS).document(uid).delete()
    return {"success": True, "uid": uid}


# =========================================================
# IMPORTATION EN MASSE (JSON / YAML)
# =========================================================

def import_users_from_records(records):
    """
    Importe ou met à jour une liste d'utilisateurs.
    records = list of dicts.
    Retourne un compte-rendu : { created, updated, errors, total }
    """
    db = get_db()

    if not isinstance(records, list):
        raise ValueError("Le fichier doit contenir une liste d'utilisateurs.")

    report = {
        "created": 0,
        "updated": 0,
        "errors": [],
        "total": len(records)
    }

    for idx, item in enumerate(records, start=1):
        if not isinstance(item, dict):
            report["errors"].append({"line": idx, "error": "L'élément n'est pas un objet/dictionnaire valide."})
            continue

        email = (item.get("email") or "").strip().lower()
        if not email or "@" not in email:
            report["errors"].append({"line": idx, "error": f"Email manquant ou invalide : '{email}'"})
            continue

        nom = (item.get("nom") or "").strip().upper()
        prenom = (item.get("prenom") or "").strip().title()
        role = (item.get("role") or "technician").strip().lower()
        specialite = (item.get("specialite") or "polyvalent").strip().lower()
        telephone = str(item.get("telephone") or "").strip()
        service = (item.get("service") or "Project Regulus").strip()
        password = str(item.get("password") or "").strip()

        if role not in ROLES_DICT:
            role = "technician"

        display_name = f"{prenom} {nom}".strip() or email.split("@")[0]

        try:
            # Vérifier si l'utilisateur existe déjà dans Firebase Auth
            existing_user = None
            try:
                existing_user = auth.get_user_by_email(email)
            except auth.UserNotFoundError:
                existing_user = None

            if existing_user:
                # MISE À JOUR
                uid = existing_user.uid

                # Mise à jour Auth (password si fourni, display_name)
                auth_update_args = {}
                if password and len(password) >= 6:
                    auth_update_args["password"] = password
                if display_name:
                    auth_update_args["display_name"] = display_name

                if auth_update_args:
                    auth.update_user(uid, **auth_update_args)

                # Custom claims
                claims = existing_user.custom_claims or {}
                claims["role"] = role
                claims["specialite"] = specialite
                claims["statut"] = "actif"
                auth.set_custom_user_claims(uid, claims)

                # Firestore doc
                db.collection(COLLECTION_USERS).document(uid).set({
                    "nom": nom,
                    "prenom": prenom,
                    "email": email,
                    "role": role,
                    "specialite": specialite,
                    "telephone": telephone,
                    "service": service,
                    "statut": "actif",
                    "updatedAt": firestore.SERVER_TIMESTAMP
                }, merge=True)

                report["updated"] += 1

            else:
                # CRÉATION
                if not password or len(password) < 6:
                    password = "TempPassword123!"

                user_record = auth.create_user(
                    email=email,
                    password=password,
                    display_name=display_name,
                    disabled=False
                )
                uid = user_record.uid

                # Custom Claims
                claims = {
                    "role": role,
                    "specialite": specialite,
                    "statut": "actif"
                }
                auth.set_custom_user_claims(uid, claims)

                # Firestore doc
                db.collection(COLLECTION_USERS).document(uid).set({
                    "nom": nom,
                    "prenom": prenom,
                    "email": email,
                    "role": role,
                    "specialite": specialite,
                    "telephone": telephone,
                    "service": service,
                    "statut": "actif",
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "updatedAt": firestore.SERVER_TIMESTAMP
                })

                report["created"] += 1

        except Exception as e:
            report["errors"].append({
                "line": idx,
                "email": email,
                "error": str(e)
            })

    return report


def import_users_from_file(file_path_or_content, filename=""):
    """
    Parse un fichier JSON ou YAML et l'importe.
    file_path_or_content peut être un chemin de fichier (str/Path) ou une chaîne/bytes.
    """
    data = None
    ext = ""

    if isinstance(file_path_or_content, (str, Path)) and os.path.exists(str(file_path_or_content)):
        path = Path(file_path_or_content)
        ext = path.suffix.lower()
        content = path.read_text(encoding="utf-8")
    else:
        content = file_path_or_content
        if isinstance(content, bytes):
            content = content.decode("utf-8")
        if filename:
            ext = Path(filename).suffix.lower()

    # Détection format
    if ext in (".yaml", ".yml"):
        if yaml is None:
            raise RuntimeError("Le module 'pyyaml' n'est pas installé. Lancez 'pip install pyyaml'.")
        data = yaml.safe_load(content)
    elif ext == ".json":
        data = json.loads(content)
    else:
        # Essayer JSON puis YAML
        try:
            data = json.loads(content)
        except Exception:
            if yaml:
                data = yaml.safe_load(content)
            else:
                raise ValueError("Impossible de parser le contenu. Assurez-vous qu'il s'agit d'un format JSON ou YAML valide.")

    if not isinstance(data, list):
        # Si le fichier contient une clé racine {"users": [...]} ou {"utilisateurs": [...]}
        if isinstance(data, dict):
            for k in ("users", "utilisateurs", "agents", "data"):
                if k in data and isinstance(data[k], list):
                    data = data[k]
                    break

    return import_users_from_records(data)


# =========================================================
# SYNCHRONISATION & RÉPARATION
# =========================================================

def sync_and_repair():
    """Synchronise tous les comptes Firebase Auth avec Firestore 'users'."""
    db = get_db()
    results = []

    auth_users = list(auth.list_users().iterate_all())
    for user in auth_users:
        uid = user.uid
        email = (user.email or "").strip().lower()
        doc_ref = db.collection(COLLECTION_USERS).document(uid)
        doc_snap = doc_ref.get()

        data = doc_snap.to_dict() if doc_snap.exists else None

        if data and data.get("role"):
            role = data.get("role")
        elif "admin" in email or "super" in email:
            role = "supervisor"
        else:
            role = "technician"

        specialite = data.get("specialite") if data else "polyvalent"
        statut = "inactif" if user.disabled else (data.get("statut", "actif") if data else "actif")

        nom = data.get("nom") if data else ""
        prenom = data.get("prenom") if data else ""
        if not nom and not prenom:
            display = user.display_name or email.split("@")[0]
            parts = display.split(" ", 1)
            prenom = parts[0]
            nom = parts[1] if len(parts) > 1 else ""

        updated_fields = {
            "nom": nom,
            "prenom": prenom,
            "email": email,
            "role": role,
            "specialite": specialite,
            "telephone": data.get("telephone", "") if data else "",
            "service": data.get("service", "Project Regulus") if data else "Project Regulus",
            "statut": statut,
            "updatedAt": firestore.SERVER_TIMESTAMP
        }
        if not data or not data.get("createdAt"):
            updated_fields["createdAt"] = firestore.SERVER_TIMESTAMP

        doc_ref.set(updated_fields, merge=True)

        claims = {
            "role": role,
            "specialite": specialite,
            "statut": statut
        }
        auth.set_custom_user_claims(uid, claims)

        if not user.display_name and (prenom or nom):
            try:
                auth.update_user(uid, display_name=f"{prenom} {nom}".strip())
            except Exception:
                pass

        results.append({
            "uid": uid,
            "email": email,
            "role": role,
            "specialite": specialite,
            "statut": statut
        })

    return results


# =========================================================
# GESTION DES INTERVENTIONS (DEMANDES / REQUESTS)
# =========================================================

def count_requests():
    """Retourne le nombre total d'interventions dans Firestore."""
    db = get_db()
    try:
        # En Firestore, count() est ultra rapide et économique
        count_query = db.collection(COLLECTION_REQUESTS).count()
        results = count_query.get()
        return results[0][0].value
    except Exception:
        # Fallback
        docs = list(db.collection(COLLECTION_REQUESTS).stream())
        return len(docs)


def import_interventions_records(records, batch_size=400):
    """
    Injecte une liste d'interventions dans la collection Firestore 'requests'
    en utilisant des Batches pour des performances optimales.
    records: list de dictionnaires d'interventions
    """
    db = get_db()

    if not isinstance(records, list):
        raise ValueError("Les données doivent être une liste d'interventions.")

    report = {
        "total": len(records),
        "created": 0,
        "updated": 0,
        "errors": []
    }

    collection_ref = db.collection(COLLECTION_REQUESTS)
    
    # Découpage par lots (batches de 400 documents max)
    for i in range(0, len(records), batch_size):
        chunk = records[i:i + batch_size]
        batch = db.batch()
        
        for idx, item in enumerate(chunk, start=i + 1):
            if not isinstance(item, dict):
                report["errors"].append({"index": idx, "error": "L'élément n'est pas un objet JSON valide."})
                continue

            doc_id = item.get("id") or f"REQ-{String(Date.now()).slice(-6)}-{idx}"
            doc_ref = collection_ref.document(str(doc_id))
            
            # Nettoyage et préparation du document
            payload = {
                "id": str(doc_id),
                "equipment": item.get("equipment") or "Équipement non spécifié",
                "description": item.get("description") or "",
                "domain": item.get("domain") or "Technique",
                "specialite": (item.get("specialite") or "polyvalent").lower(),
                "service": item.get("service") or item.get("structure") or "Project Regulus",
                "structure": item.get("structure") or item.get("service") or "Project Regulus",
                "maintenanceType": item.get("maintenanceType") or "curative",
                "priority": item.get("priority") or "medium",
                "status": item.get("status") or "resolved",
                "observation": item.get("observation") or "",
                "assignedTo": item.get("assignedTo") or "Project Regulus",
                "createdAt": item.get("createdAt") or datetime.utcnow().isoformat() + "Z",
                "updatedAt": item.get("updatedAt") or datetime.utcnow().isoformat() + "Z",
                "reporter": item.get("reporter") or {
                    "name": "Historique Regulus",
                    "service": item.get("service") or "Project Regulus"
                },
                "events": item.get("events") or [],
                "photos": item.get("photos") or {"before": None, "after": None},
                "parts": item.get("parts") or [],
                "diagnostic": item.get("diagnostic") or item.get("observation") or ""
            }

            batch.set(doc_ref, payload, merge=True)
            report["created"] += 1

        try:
            batch.commit()
        except Exception as e:
            report["errors"].append({"batch_range": f"{i + 1}-{i + len(chunk)}", "error": str(e)})

    return report


def import_interventions_file(file_path_or_content, filename=""):
    """
    Parse et importe un fichier d'interventions JSON ou YAML.
    """
    data = None
    ext = ""

    if isinstance(file_path_or_content, (str, Path)) and os.path.exists(str(file_path_or_content)):
        path = Path(file_path_or_content)
        ext = path.suffix.lower()
        content = path.read_text(encoding="utf-8")
    else:
        content = file_path_or_content
        if isinstance(content, bytes):
            content = content.decode("utf-8")
        if filename:
            ext = Path(filename).suffix.lower()

    # Parsing
    if ext in (".yaml", ".yml"):
        if yaml is None:
            raise RuntimeError("PyYAML n'est pas installé.")
        data = yaml.safe_load(content)
    else:
        try:
            data = json.loads(content)
        except Exception:
            if yaml:
                data = yaml.safe_load(content)
            else:
                raise ValueError("Format de fichier non reconnu. JSON ou YAML attendu.")

    if isinstance(data, dict):
        for k in ("requests", "interventions", "data", "items"):
            if k in data and isinstance(data[k], list):
                data = data[k]
                break

    if not isinstance(data, list):
        raise ValueError("Le fichier doit contenir une liste d'interventions.")

    return import_interventions_records(data)


# =========================================================
# GESTION DES INTERVENTIONS (CLI & SERVEUR)
# =========================================================

def list_interventions(limit=50, status=None, search=None):
    """
    Retourne la liste des interventions depuis Firestore.
    """
    db = get_db()
    results = []

    try:
        query = db.collection(COLLECTION_REQUESTS)
        docs = list(query.stream())

        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            results.append(data)

        # Filtre statut
        if status:
            results = [r for r in results if r.get("status") == status]

        # Filtre texte
        if search:
            q = search.lower()
            results = [
                r for r in results
                if q in str(r.get("id", "")).lower()
                or q in str(r.get("equipment", "")).lower()
                or q in str(r.get("service", "")).lower()
                or q in str(r.get("assignedTo", "")).lower()
                or q in str(r.get("description", "")).lower()
            ]

        # Tri par date décroissante
        results.sort(
            key=lambda r: str(r.get("date") or r.get("createdAt") or ""),
            reverse=True
        )

        return results[:limit]

    except Exception as e:
        raise RuntimeError(f"Erreur lors de la lecture des interventions : {e}")


def get_intervention(request_id):
    """Récupère une intervention spécifique par son ID."""
    db = get_db()
    doc = db.collection(COLLECTION_REQUESTS).document(request_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id
    return data


def update_intervention(request_id, fields):
    """Met à jour une intervention dans Firestore."""
    db = get_db()
    doc_ref = db.collection(COLLECTION_REQUESTS).document(request_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise ValueError(f"Intervention {request_id} introuvable.")

    payload = dict(fields)
    payload["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    doc_ref.set(payload, merge=True)
    return {"id": request_id, **doc.to_dict(), **payload}


def delete_intervention(request_id):
    """Supprime définitivement une intervention dans Firestore."""
    db = get_db()
    doc_ref = db.collection(COLLECTION_REQUESTS).document(request_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise ValueError(f"Intervention {request_id} introuvable.")
    doc_ref.delete()
    return {"success": True, "id": request_id}


def set_all_interventions_status(new_status="resolved"):
    """Passe toutes les interventions actuelles au statut spécifié (par défaut: resolved)."""
    db = get_db()
    docs = list(db.collection(COLLECTION_REQUESTS).stream())
    updated_count = 0
    now_iso = datetime.utcnow().isoformat() + "Z"

    # Traitement par lots de 400
    for i in range(0, len(docs), 400):
        chunk = docs[i:i + 400]
        batch = db.batch()
        batch_has_ops = False

        for doc in chunk:
            d = doc.to_dict()
            if d.get("status") != new_status:
                batch.update(doc.reference, {"status": new_status, "updatedAt": now_iso})
                updated_count += 1
                batch_has_ops = True

        if batch_has_ops:
            batch.commit()

    return {"total": len(docs), "updated": updated_count, "status": new_status}


