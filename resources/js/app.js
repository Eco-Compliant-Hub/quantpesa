import './echo.js';
import { auth } from './auth.js';

const routes = {
    login:          () => import('./pages/login.js'),
    dashboard:      () => import('./pages/dashboard.js'),
    bots:           () => import('./pages/bots.js'),
    catalog:        () => import('./pages/catalog.js'),
    accounts:       () => import('./pages/accounts.js'),
    analysis:       () => import('./pages/analysis.js'),
    signals:        () => import('./pages/signals.js'),
    journal:        () => import('./pages/journal.js'),
    alerts:         () => import('./pages/alerts.js'),
    community:      () => import('./pages/community.js'),
    'strategy-lab': () => import('./pages/strategy-lab.js'),
    billing:        () => import('./pages/billing.js'),
    settings:       () => import('./pages/settings.js'),
    admin:          () => import('./pages/admin.js'),
};

function navigate(page) {
    if (page === 'admin' && !auth.isAdmin()) {
        window.location.hash = 'dashboard';
        loadPage('dashboard');
        return;
    }
    window.location.hash = page;
    loadPage(page);
}
window._navigate = navigate;


async function loadPage(page) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="flex items-center justify-center h-screen"><p class="text-gray-400">Loading...</p></div>';

    try {
        const module = await routes[page]();
        app.innerHTML = '';
        module.render(app, navigate);
    } catch (e) {
        app.innerHTML = `<div class="p-8 text-red-400">Error loading page: ${e.message}</div>`;
    }
}

export function initApp() {
    const hash = window.location.hash.replace('#', '') || 'login';

    // Redirect to login if not logged in
    if (!auth.isLoggedIn() && hash !== 'login') {
        navigate('login');
        return;
    }

    // Redirect to dashboard if already logged in
    if (auth.isLoggedIn() && hash === 'login') {
        navigate('dashboard');
        return;
    }

    loadPage(hash);

    window.addEventListener('hashchange', () => {
        const page = window.location.hash.replace('#', '') || 'login';
        if (!auth.isLoggedIn() && page !== 'login') {
            navigate('login');
            return;
        }
        loadPage(page);
    });
}

export { navigate };
// Auto-start
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});