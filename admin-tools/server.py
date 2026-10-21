#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
===========================================================
  PROJECT REGULUS — GMAO
  Serveur Web d'Administration Locale (server.py)
===========================================================
Ce micro-serveur Flask fournit :
  - L'interface web locale (HTML/CSS/JS) sur http://localhost:5000
  - L'API REST locale pour le listing, la création, la modification,
    l'activation/désactivation et l'importation de fichiers.
===========================================================
"""

import os
import sys
import webbrowser
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory

# Windows console encoding configuration
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
import core

WEB_DIR = BASE_DIR / "web"
WEB_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(WEB_DIR))


# =========================================================
# ROUTES STATIQUES (UI WEB)
# =========================================================

@app.route("/")
def index():
    return send_from_directory(str(WEB_DIR), "index.html")

@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(str(WEB_DIR), path)


# =========================================================
# ROUTES API REST
# =========================================================

@app.route("/api/users", methods=["GET"])
def api_list_users():
    try:
        users = core.list_users()
        return jsonify({"success": True, "users": users, "count": len(users)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users", methods=["POST"])
def api_create_user():
    data = request.get_json() or {}
    try:
        result = core.create_single_user(data)
        return jsonify({"success": True, "user": result}), 201
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users/<uid>/status", methods=["POST"])
def api_set_user_status(uid):
    data = request.get_json() or {}
    actif = data.get("actif", True)
    try:
        result = core.set_user_status(uid, actif)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users/<uid>", methods=["PUT"])
def api_update_user(uid):
    data = request.get_json() or {}
    try:
        result = core.update_user_profile(uid, data)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users/<uid>/reset-password", methods=["POST"])
def api_reset_password(uid):
    data = request.get_json() or {}
    new_password = data.get("password", "")
    try:
        core.reset_user_password(uid, new_password)
        return jsonify({"success": True, "message": "Mot de passe mis à jour avec succès."})
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users/<uid>", methods=["DELETE"])
def api_delete_user(uid):
    try:
        core.delete_user(uid)
        return jsonify({"success": True, "message": "Utilisateur supprimé."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users/import", methods=["POST"])
def api_import_users():
    try:
        # 1. Cas upload de fichier
        if "file" in request.files:
            uploaded_file = request.files["file"]
            if uploaded_file.filename == "":
                return jsonify({"success": False, "error": "Aucun fichier sélectionné."}), 400
            content = uploaded_file.read().decode("utf-8")
            report = core.import_users_from_file(content, filename=uploaded_file.filename)
            return jsonify({"success": True, "report": report})

        # 2. Cas JSON direct dans le corps de la requête
        elif request.is_json:
            data = request.get_json()
            if isinstance(data, list):
                report = core.import_users_from_records(data)
            elif isinstance(data, dict) and "users" in data:
                report = core.import_users_from_records(data["users"])
            else:
                return jsonify({"success": False, "error": "Format JSON non reconnu (liste attendue)."}), 400
            return jsonify({"success": True, "report": report})

        return jsonify({"success": False, "error": "Veuillez envoyer un fichier ou des données JSON."}), 400

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/sync", methods=["POST"])
def api_sync():
    try:
        results = core.sync_and_repair()
        return jsonify({"success": True, "results": results, "count": len(results)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/interventions/count", methods=["GET"])
def api_count_interventions():
    try:
        count = core.count_requests()
        return jsonify({"success": True, "count": count})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/interventions/import", methods=["POST"])
def api_import_interventions():
    try:
        # 1. Cas upload de fichier
        if "file" in request.files:
            uploaded_file = request.files["file"]
            if uploaded_file.filename == "":
                return jsonify({"success": False, "error": "Aucun fichier sélectionné."}), 400
            content = uploaded_file.read().decode("utf-8")
            report = core.import_interventions_file(content, filename=uploaded_file.filename)
            return jsonify({"success": True, "report": report})

        # 2. Cas JSON direct dans la requête
        elif request.is_json:
            data = request.get_json()
            if isinstance(data, list):
                report = core.import_interventions_records(data)
            elif isinstance(data, dict):
                items = data.get("requests") or data.get("interventions") or data.get("data")
                if isinstance(items, list):
                    report = core.import_interventions_records(items)
                else:
                    return jsonify({"success": False, "error": "Format JSON non reconnu (liste attendue)."}), 400
            else:
                return jsonify({"success": False, "error": "Format JSON non reconnu (liste attendue)."}), 400
            return jsonify({"success": True, "report": report})

        # 3. Cas import du fichier local admin-tools/data/import_interventions.example.json
        elif request.form.get("use_local_data_json") == "true":
            local_json = BASE_DIR / "data" / "import_interventions.example.json"
            if not local_json.exists():
                return jsonify({"success": False, "error": f"Fichier {local_json} introuvable."}), 404
            report = core.import_interventions_file(local_json)
            return jsonify({"success": True, "report": report})

        return jsonify({"success": False, "error": "Veuillez fournir un fichier ou des données JSON."}), 400

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



def lancer_serveur(port=5000, open_browser=True):
    mode_label = (
        f"ÉMULATEUR LOCAL HORS-LIGNE (Projet: {core.PROJECT_ID} | Firestore: {core.FIRESTORE_EMULATOR_HOST} | Auth: {core.FIREBASE_AUTH_EMULATOR_HOST})"
        if core.USE_EMULATOR
        else "CLOUD FIREBASE (serviceAccountKey.json)"
    )
    print("\n" + "=" * 70)
    print("      🏥 SERVEUR D'ADMINISTRATION LOCALE - PROJECT REGULUS GMAO")
    print("=" * 70)
    url = f"http://127.0.0.1:{port}"
    print(f"  👉 Mode de connexion : {mode_label}")
    print(f"  👉 Interface Web     : {url}")
    print("  👉 Appuyez sur Ctrl+C dans ce terminal pour arrêter le serveur.")
    print("=" * 70 + "\n")

    if open_browser and os.environ.get("NO_AUTO_BROWSER") != "1":
        try:
            webbrowser.open(url)
        except Exception:
            pass

    app.run(host="127.0.0.1", port=port, debug=False)


if __name__ == "__main__":
    lancer_serveur()

