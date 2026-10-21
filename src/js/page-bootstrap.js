(function() {
    const APP_PAGE_LABELS = {
        landing: 'Accueil',
        login: 'Connexion',
        client: 'Signalement',
        technician: 'Technicien',
        supervisor: 'Superviseur',
        controle: 'Contrôle PSA',
        livraisons: 'Livraisons',
        commandes: 'Commandes',
        historique: 'Historique',
        rapports: 'Rapports'
    };

    function getPageName() {
        const body = document.body;
        if (!body) return 'landing';
        return body.dataset.page || 'landing';
    }

    function printBootstrapState() {
        const page = getPageName();
        const mode = window.useDemoData ? 'Démo' : 'Live';
        console.log(`🧭 Bootstrap ${APP_PAGE_LABELS[page] || page} – mode ${mode}`);
    }

    document.addEventListener('DOMContentLoaded', function() {
        printBootstrapState();

        if (typeof window.initFirebase === 'function') {
            window.initFirebase().catch((error) => {
                console.warn('Firebase bootstrap non bloquant :', error);
            });
        }
    });
})();
