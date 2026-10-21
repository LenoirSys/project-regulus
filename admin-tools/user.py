#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
===========================================================
  PROJECT REGULUS — GMAO
  Outil d'Administration des Utilisateurs & Agents (CLI)
===========================================================
Interface terminal interactive utilisant core.py :
  - Création / Listing / Modification de comptes
  - Activation / Désactivation des accès
  - Importation en masse (JSON / YAML)
  - Synchronisation et réparation
===========================================================
"""

import os
import sys
from pathlib import Path

# Configuration encodage console Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core

ROLES_CHOICES = {
    "1": ("technician", "🛠️ Technicien (Interventions terrain)"),
    "2": ("supervisor", "📊 Superviseur (Affectations, Rapports, Suivi)"),
    "3": ("admin", "🛡️ Administrateur (Gestion complète)")
}

SPECIALITES_CHOICES = {
    "1": ("biomedicale", "Biomédicale"),
    "2": ("fluides", "Fluides médicaux & PSA"),
    "3": ("electricite", "Électricité & Énergie"),
    "4": ("froid", "Froid & Climatisation"),
    "5": ("informatique", "Informatique & Réseaux"),
    "6": ("plomberie", "Plomberie & Sanitaire"),
    "7": ("polyvalent", "Maintenance générale / Polyvalent")
}


def choisir_role():
    print("\nChoisissez le rôle de l'agent :")
    for key, (role_val, role_label) in ROLES_CHOICES.items():
        print(f"  {key}. {role_label}")
    while True:
        choix = input("Votre choix (1-3) [défaut: 1] : ").strip() or "1"
        if choix in ROLES_CHOICES:
            return ROLES_CHOICES[choix][0]
        print("⚠️ Choix invalide, recommencez.")


def choisir_specialite():
    print("\nChoisissez la spécialité technique :")
    for key, (spec_val, spec_label) in SPECIALITES_CHOICES.items():
        print(f"  {key}. {spec_label}")
    while True:
        choix = input(f"Votre choix (1-{len(SPECIALITES_CHOICES)}) [défaut: 1] : ").strip() or "1"
        if choix in SPECIALITES_CHOICES:
            return SPECIALITES_CHOICES[choix][0]
        print("⚠️ Choix invalide, recommencez.")


def lister_utilisateurs():
    print("\n" + "=" * 80)
    print("                📋 LISTE DES UTILISATEURS DE PROJECT REGULUS (Firestore + Auth)")
    print("=" * 80)

    try:
        users = core.list_users()
        if not users:
            print("ℹ️ Aucun utilisateur enregistré dans la collection Firestore 'users'.")
            return

        for idx, u in enumerate(users, start=1):
            statut_badge = "🟢 Actif" if u["statut"] == "actif" else "🔴 Inactif"
            print(f"[{idx:02d}] {u['fullName']} <{u['email']}>")
            print(f"     UID        : {u['uid']}")
            print(f"     Rôle       : {u['role'].upper():12} | Spécialité : {u['specialite']:18} | Statut : {statut_badge}")
            print(f"     Téléphone  : {u['telephone'] or 'N/A':12} | Service    : {u['service']}")
            print("-" * 80)

        print(f"Total : {len(users)} agent(s) listé(s).")

    except Exception as e:
        print(f"❌ Erreur lors de la récupération des utilisateurs : {e}")


def ajouter_utilisateur():
    print("\n" + "=" * 80)
    print("                      ➕ AJOUT D'UN NOUVEL AGENT PROJECT REGULUS")
    print("=" * 80)

    nom = input("Nom de famille (ex: LAURENT)        : ").strip().upper()
    if not nom:
        print("❌ Le nom est obligatoire.")
        return

    prenom = input("Prénom(s) (ex: Jean-Paul)          : ").strip().title()
    email = input("Adresse email professionnelle      : ").strip().lower()
    if not email or "@" not in email:
        print("❌ Adresse email invalide.")
        return

    password = input("Mot de passe temporaire (min 6 car.) : ").strip()
    if len(password) < 6:
        print("❌ Le mot de passe doit comporter au moins 6 caractères.")
        return

    telephone = input("Téléphone (ex: 0708091011)         : ").strip()
    service = input("Service / Établissement [Project Regulus]    : ").strip() or "Project Regulus"

    role = choisir_role()
    specialite = choisir_specialite()

    print("\n--- Récapitulatif ---")
    print(f"Nom complet : {prenom} {nom}")
    print(f"Email       : {email}")
    print(f"Rôle        : {role}")
    print(f"Spécialité  : {specialite}")
    print(f"Téléphone   : {telephone}")
    print(f"Service     : {service}")

    confirmer = input("\nConfirmer la création ? (o/N) : ").strip().lower()
    if confirmer not in ("o", "oui", "y", "yes"):
        print("Création annulée.")
        return

    try:
        user_data = {
            "nom": nom,
            "prenom": prenom,
            "email": email,
            "password": password,
            "role": role,
            "specialite": specialite,
            "telephone": telephone,
            "service": service
        }
        res = core.create_single_user(user_data)
        print(f"\n✅ Compte créé avec succès ! (UID: {res['uid']})")

    except Exception as e:
        print(f"\n❌ Erreur lors de la création : {e}")


def modifier_statut_utilisateur():
    print("\n" + "=" * 80)
    print("                 ⚙️ ACTIVER / DÉSACTIVER UN AGENT")
    print("=" * 80)

    identifiant = input("Entrez l'UID ou l'email de l'agent : ").strip().lower()
    if not identifiant:
        return

    users = core.list_users()
    target = next((u for u in users if u["uid"] == identifiant or u["email"].lower() == identifiant), None)

    if not target:
        print("❌ Aucun agent trouvé.")
        return

    print(f"\nAgent trouvé : {target['fullName']} (Statut actuel : {target['statut']})")
    print("1. 🟢 Activer le compte (autoriser la connexion)")
    print("2. 🔴 Désactiver le compte (bloquer tout accès)")
    choix = input("Votre choix (1 ou 2) : ").strip()

    if choix not in ("1", "2"):
        print("Opération annulée.")
        return

    actif = (choix == "1")
    try:
        core.set_user_status(target["uid"], actif)
        etat = "ACTIVÉ" if actif else "DÉSACTIVÉ"
        print(f"\n✅ Le compte de {target['fullName']} est désormais {etat} !")
    except Exception as e:
        print(f"\n❌ Erreur : {e}")


def modifier_profil_utilisateur():
    print("\n" + "=" * 80)
    print("                  ✏️ MODIFIER LE RÔLE / SPÉCIALITÉ D'UN AGENT")
    print("=" * 80)

    identifiant = input("Entrez l'UID ou l'email de l'agent : ").strip().lower()
    if not identifiant:
        return

    users = core.list_users()
    target = next((u for u in users if u["uid"] == identifiant or u["email"].lower() == identifiant), None)

    if not target:
        print("❌ Agent introuvable.")
        return

    print(f"\nModification pour : {target['fullName']} ({target['email']})")
    print(f"Rôle actuel       : {target['role']}")
    print(f"Spécialité        : {target['specialite']}")

    changer_role = input("\nVoulez-vous modifier le rôle ? (o/N) : ").strip().lower() in ("o", "oui", "y")
    nouveau_role = choisir_role() if changer_role else target["role"]

    changer_spec = input("Voulez-vous modifier la spécialité ? (o/N) : ").strip().lower() in ("o", "oui", "y")
    nouvelle_spec = choisir_specialite() if changer_spec else target["specialite"]

    tel = input(f"Nouveau téléphone [{target['telephone']}] : ").strip() or target["telephone"]
    service = input(f"Nouveau service [{target['service']}] : ").strip() or target["service"]

    try:
        core.update_user_profile(target["uid"], {
            "role": nouveau_role,
            "specialite": nouvelle_spec,
            "telephone": tel,
            "service": service
        })
        print(f"\n✅ Profil mis à jour avec succès !")
    except Exception as e:
        print(f"\n❌ Erreur : {e}")


def reinitialiser_mot_de_passe():
    print("\n" + "=" * 80)
    print("                 🔑 RÉINITIALISATION DU MOT DE PASSE")
    print("=" * 80)

    identifiant = input("Email de l'agent : ").strip().lower()
    if not identifiant:
        return

    nouveau_pass = input("Nouveau mot de passe temporaire (min 6 car.) : ").strip()
    if len(nouveau_pass) < 6:
        print("❌ Mot de passe trop court.")
        return

    try:
        core.reset_user_password(identifiant, nouveau_pass)
        print(f"\n✅ Mot de passe mis à jour pour {identifiant} !")
    except Exception as e:
        print(f"\n❌ Erreur : {e}")


def importer_utilisateurs_fichier():
    print("\n" + "=" * 80)
    print("            📁 IMPORTATION D'UTILISATEURS EN MASSE (JSON / YAML)")
    print("=" * 80)

    print("Fichiers d'exemples disponibles dans : admin-tools/data/")
    print("  - admin-tools/data/import_utilisateurs.example.json")
    print("  - admin-tools/data/import_utilisateurs.example.yaml")

    chemin = input("\nChemin du fichier à importer : ").strip()
    if not chemin:
        print("Importation annulée.")
        return

    path = Path(chemin)
    if not path.is_file():
        # Essayer relatif à admin-tools
        alt_path = Path(__file__).resolve().parent / chemin
        if alt_path.is_file():
            path = alt_path
        else:
            print(f"❌ Fichier introuvable : '{chemin}'")
            return

    print(f"⏳ Lecture et traitement du fichier '{path.name}'...")
    try:
        report = core.import_users_from_file(path)
        print("\n" + "-" * 50)
        print("                RAPPORT D'IMPORTATION")
        print("-" * 50)
        print(f"  Total lignes détectées : {report['total']}")
        print(f"  Comptes créés          : {report['created']}")
        print(f"  Comptes mis à jour     : {report['updated']}")
        print(f"  Erreurs                : {len(report['errors'])}")

        if report["errors"]:
            print("\nDétail des erreurs :")
            for err in report["errors"]:
                line_info = f"Ligne {err.get('line', '?')}"
                email_info = f" ({err['email']})" if "email" in err else ""
                print(f"  ⚠️ {line_info}{email_info} : {err['error']}")

        print("\n🎉 Importation terminée !")

    except Exception as e:
        print(f"❌ Échec de l'importation : {e}")


def synchroniser_comptes():
    print("\n" + "=" * 80)
    print("             🔄 SYNCHRONISATION & RÉPARATION DES COMPTES")
    print("=" * 80)

    try:
        results = core.sync_and_repair()
        print(f"Total comptes synchronisés : {len(results)}")
        for r in results:
            print(f"  ✓ {r['email']:30} -> {r['role']:12} | {r['specialite']:15} | {r['statut']}")
        print("\n🎉 Tous les comptes sont synchronisés avec Firestore et les Custom Claims !")
    except Exception as e:
        print(f"❌ Erreur : {e}")


def supprimer_utilisateur():
    print("\n" + "=" * 80)
    print("                 🗑️ SUPPRIMER DÉFINITIVEMENT UN AGENT")
    print("=" * 80)

    identifiant = input("Entrez l'UID ou l'email de l'agent à supprimer : ").strip().lower()
    if not identifiant:
        return

    users = core.list_users()
    target = next((u for u in users if u["uid"] == identifiant or u["email"].lower() == identifiant), None)
    if not target:
        print("❌ Agent introuvable.")
        return

    print(f"\n⚠️ ATTENTION : Vous allez supprimer définitivement :")
    print(f"   Nom   : {target['fullName']}")
    print(f"   Email : {target['email']} (UID: {target['uid']})")
    confirmer = input("\nÊtes-vous certain ? Tapez 'SUPPRIMER' pour confirmer : ").strip()
    if confirmer != "SUPPRIMER":
        print("Suppression annulée.")
        return

    try:
        core.delete_user(target["uid"])
        print(f"✅ L'agent {target['fullName']} a été supprimé d'Auth et de Firestore.")
    except Exception as e:
        print(f"❌ Erreur : {e}")


def importer_interventions_fichier():
    print("\n" + "=" * 80)
    print("      🏥 IMPORTATION D'INTERVENTIONS DANS FIRESTORE (data.json / data.md)")
    print("=" * 80)

    print("Fichier préparé disponible par défaut : admin-tools/data/import_interventions.example.json")
    chemin = input("\nChemin du fichier JSON/YAML [défaut: data/import_interventions.example.json] : ").strip()
    if not chemin:
        chemin = "data/import_interventions.example.json"

    path = Path(chemin)
    if not path.is_file():
        alt_path = Path(__file__).resolve().parent / chemin
        if alt_path.is_file():
            path = alt_path
        else:
            print(f"❌ Fichier introuvable : '{chemin}'")
            return

    print(f"⏳ Traitement et injection par lots (Batches) de '{path.name}'...")
    try:
        report = core.import_interventions_file(path)
        print("\n" + "-" * 50)
        print("         RAPPORT D'IMPORTATION DES INTERVENTIONS")
        print("-" * 50)
        print(f"  Total analysé        : {report['total']}")
        print(f"  Injectés / Mis à jour: {report['created']}")
        print(f"  Erreurs              : {len(report['errors'])}")

        if report["errors"]:
            print("\nDétail des erreurs :")
            for err in report["errors"][:10]:
                print(f"  ⚠️ {err}")

        print("\n🎉 Importation des interventions terminée avec succès !")

    except Exception as e:
        print(f"❌ Échec de l'importation : {e}")


def lister_interventions_cli():
    print("\n" + "=" * 80)
    print("                     📋 RECHERCHE / LISTE DES INTERVENTIONS")
    print("=" * 80)
    search = input("Recherche par mot-clé (équipement, service, ID...) [Entrée pour tout voir] : ").strip()
    limit_str = input("Nombre maximum à afficher [défaut: 20] : ").strip()
    try:
        limit = int(limit_str) if limit_str else 20
    except ValueError:
        limit = 20

    try:
        items = core.list_interventions(limit=limit, search=search or None)
        if not items:
            print("ℹ️ Aucune intervention trouvée.")
            return

        for idx, item in enumerate(items, start=1):
            date_str = item.get("date") or (item.get("createdAt") or "")[:10]
            print(f"[{idx:02d}] Réf: {item.get('id')} | Date: {date_str} | Statut: {item.get('status')}")
            print(f"     Équipement : {item.get('equipment')}")
            print(f"     Service    : {item.get('service') or item.get('structure')} | Spécialité: {item.get('specialite') or item.get('domain')}")
            print(f"     Assigné à  : {item.get('assignedTo') or 'Non assigné'}")
            desc = item.get('description') or (item.get('diagnostic') if isinstance(item.get('diagnostic'), str) else '')
            if desc:
                print(f"     Panne/Diag : {str(desc)[:70]}...")
            print("-" * 80)

        print(f"Total affiché : {len(items)} intervention(s).")
    except Exception as e:
        print(f"❌ Erreur lors de la récupération : {e}")


def modifier_intervention_cli():
    print("\n" + "=" * 80)
    print("                     ✏️ MODIFIER UNE INTERVENTION")
    print("=" * 80)
    req_id = input("Identifiant de l'intervention (ex: REQ-123456, HIST-BIO-001) : ").strip()
    if not req_id:
        return

    try:
        item = core.get_intervention(req_id)
        if not item:
            print(f"❌ Aucune intervention trouvée avec l'identifiant '{req_id}'.")
            return

        print(f"\nIntervention trouvée : {item.get('id')} - {item.get('equipment')}")
        print(f"Service actuel     : {item.get('service') or item.get('structure')}")
        print(f"Statut actuel      : {item.get('status')}")
        print(f"Technicien actuel  : {item.get('assignedTo')}")
        print("\n(Appuyez sur Entrée pour conserver la valeur actuelle)")

        new_equipment = input(f"Nouvel équipement [{item.get('equipment')}] : ").strip()
        new_service = input(f"Nouveau service [{item.get('service') or item.get('structure')}] : ").strip()
        
        print("\nStatuts possibles : 1. resolved (Terminée) | 2. in_progress (En cours) | 3. on_hold (En attente) | 4. reported (Signalée)")
        st_choice = input(f"Statut [actuel: {item.get('status')}] : ").strip()
        st_map = {"1": "resolved", "2": "in_progress", "3": "on_hold", "4": "reported"}
        new_status = st_map.get(st_choice, st_choice if st_choice else item.get('status'))

        new_tech = input(f"Technicien assigné [{item.get('assignedTo') or 'Non assigné'}] : ").strip()
        new_desc = input(f"Description / Panne [laisser vide pour ne pas changer] : ").strip()
        new_solution = input(f"Travaux / Solution [laisser vide pour ne pas changer] : ").strip()
        new_obs = input(f"Observation finale [actuelle: {item.get('observation') or 'Fonctionnel'}] : ").strip()

        fields = {}
        if new_equipment: fields["equipment"] = new_equipment
        if new_service:
            fields["service"] = new_service
            fields["structure"] = new_service
        if new_status: fields["status"] = new_status
        if new_tech: fields["assignedTo"] = new_tech
        if new_desc: fields["description"] = new_desc
        if new_solution: fields["solution"] = new_solution
        if new_obs: fields["observation"] = new_obs

        if not fields:
            print("Aucune modification apportée.")
            return

        res = core.update_intervention(req_id, fields)
        print(f"\n✅ Intervention {req_id} mise à jour avec succès !")

    except Exception as e:
        print(f"❌ Erreur lors de la modification : {e}")


def supprimer_intervention_cli():
    print("\n" + "=" * 80)
    print("                 🗑️ SUPPRIMER DÉFINITIVEMENT UNE INTERVENTION")
    print("=" * 80)
    req_id = input("Identifiant de l'intervention à supprimer : ").strip()
    if not req_id:
        return

    try:
        item = core.get_intervention(req_id)
        if not item:
            print(f"❌ Aucune intervention trouvée avec l'identifiant '{req_id}'.")
            return

        print(f"\n⚠️ ATTENTION : Vous allez supprimer définitivement :")
        print(f"   ID         : {item.get('id')}")
        print(f"   Équipement : {item.get('equipment')}")
        print(f"   Service    : {item.get('service') or item.get('structure')}")
        print(f"   Date       : {item.get('date') or item.get('createdAt')}")
        confirmer = input("\nÊtes-vous certain ? Tapez 'SUPPRIMER' pour confirmer : ").strip()
        if confirmer != "SUPPRIMER":
            print("Suppression annulée.")
            return

        core.delete_intervention(req_id)
        print(f"✅ Intervention {req_id} supprimée définitivement de Firestore.")
    except Exception as e:
        print(f"❌ Erreur lors de la suppression : {e}")


def cloturer_toutes_interventions_cli():
    print("\n" + "=" * 80)
    print("         ✅ PASSER TOUTES LES INTERVENTIONS EN STATUT 'TERMINÉE'")
    print("=" * 80)
    print("Cette opération va mettre à jour toutes les interventions non résolues en statut 'resolved'.")
    confirmer = input("\nConfirmer l'opération ? (o/N) : ").strip().lower()
    if confirmer not in ("o", "oui", "y", "yes"):
        print("Opération annulée.")
        return

    try:
        print("⏳ Mise à jour en cours...")
        res = core.set_all_interventions_status("resolved")
        print(f"\n✅ Opération terminée avec succès !")
        print(f"   Total analysé : {res['total']}")
        print(f"   Mis à jour    : {res['updated']} intervention(s)")
    except Exception as e:
        print(f"❌ Erreur : {e}")


def menu_principal():
    while True:
        print("\n" + "=" * 60)
        print("   GESTION DES UTILISATEURS & INTERVENTIONS - PROJECT REGULUS GMAO")
        print("=" * 60)
        print("--- GESTION DES AGENTS ---")
        print("  1. 📋 Lister tous les agents")
        print("  2. ➕ Ajouter un nouvel agent")
        print("  3. ⚙️ Activer / Désactiver un agent")
        print("  4. ✏️ Modifier le rôle ou la spécialité d'un agent")
        print("  5. 🔑 Réinitialiser un mot de passe")
        print("  6. 📁 Importer des utilisateurs (Fichier JSON / YAML)")
        print("  7. 🗑️ Supprimer un agent")
        print("  8. 🔄 Synchroniser / Réparer les comptes")
        print("\n--- GESTION DES INTERVENTIONS ---")
        print("  9.  📋 Rechercher / Lister les interventions")
        print("  10. ✏️ Modifier une intervention")
        print("  11. 🗑️ Supprimer une intervention")
        print("  12. ✅ Mettre toutes les interventions en 'Terminée'")
        print("  13. 🏥 Importer l'historique depuis fichier (data.json)")
        print("\n  0. 🚪 Quitter")

        choix = input("\nFaites votre choix (0-13) : ").strip()

        if choix == "1":
            lister_utilisateurs()
        elif choix == "2":
            ajouter_utilisateur()
        elif choix == "3":
            modifier_statut_utilisateur()
        elif choix == "4":
            modifier_profil_utilisateur()
        elif choix == "5":
            reinitialiser_mot_de_passe()
        elif choix == "6":
            importer_utilisateurs_fichier()
        elif choix == "7":
            supprimer_utilisateur()
        elif choix == "8":
            synchroniser_comptes()
        elif choix == "9":
            lister_interventions_cli()
        elif choix == "10":
            modifier_intervention_cli()
        elif choix == "11":
            supprimer_intervention_cli()
        elif choix == "12":
            cloturer_toutes_interventions_cli()
        elif choix == "13":
            importer_interventions_fichier()
        elif choix == "0":
            print("\nAu revoir !")
            break
        else:
            print("⚠️ Choix invalide. Veuillez saisir un chiffre entre 0 et 13.")


if __name__ == "__main__":
    menu_principal()