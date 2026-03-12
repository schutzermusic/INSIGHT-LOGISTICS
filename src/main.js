/**
 * Main Entry — SPA Router & App Shell
 */
import './styles/variables.css';
import './styles/base.css';
import './styles/components.css';

import * as dashboard from './modules/dashboard.js';
import * as collaborators from './modules/collaborators.js';
import * as comparator from './modules/comparator.js';
import * as routeIntelligence from './modules/route-intelligence.js';
import * as history from './modules/history.js';

const PAGES = {
    dashboard,
    collaborators,
    comparator,
    routeIntelligence,
    history,
};

let currentPage = 'dashboard';

function navigate(page) {
    if (!PAGES[page]) page = 'dashboard';
    currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    // Render page
    const container = document.getElementById('page-container');
    container.innerHTML = PAGES[page].render();

    // Bind events
    if (PAGES[page].bind) {
        PAGES[page].bind();
    }

    // Scroll to top
    document.querySelector('.main-content').scrollTo(0, 0);
}

// Hash-based routing
function handleHash() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const pageMap = {
        'dashboard': 'dashboard',
        'colaboradores': 'collaborators',
        'comparador': 'comparator',
        'ai-logistica': 'routeIntelligence',
        'inteligencia-rotas': 'routeIntelligence',
        'historico': 'history',
    };
    navigate(pageMap[hash] || hash);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Nav clicks
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            window.location.hash = link.getAttribute('href').replace('#', '');
            navigate(page);
        });
    });

    // Custom navigate events (from within modules)
    window.addEventListener('navigate', (e) => {
        const pageMap = {
            dashboard: 'dashboard',
            collaborators: 'collaborators',
            comparator: 'comparator',
            routeIntelligence: 'routeIntelligence',
            history: 'history',
        };
        const hashMap = {
            dashboard: 'dashboard',
            collaborators: 'colaboradores',
            comparator: 'comparador',
            routeIntelligence: 'inteligencia-rotas',
            history: 'historico',
        };
        const page = pageMap[e.detail] || e.detail;
        window.location.hash = hashMap[e.detail] || e.detail;
        navigate(page);
    });

    // Hash change
    window.addEventListener('hashchange', handleHash);

    // Initial render
    handleHash();
});
