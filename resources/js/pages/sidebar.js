// ─────────────────────────────────────────────────────────────────────
// Shared sidebar navigation — single source of truth.
//
// Every page should import { renderSidebar, initSidebar } from this file
// instead of hand-rolling its own sidebar markup. That's the root cause
// of the drift between pages (different item sets, different taglines,
// different ordering): each page had its own copy that evolved on its
// own. This file is the fix — one component, one place to update.
//
// Usage in a page's render():
//   import { renderSidebar, initSidebar } from './sidebar.js';
//   app.innerHTML = renderSidebar(navigate, 'analysis') + '<div>...page...</div>';
//   initSidebar(app, navigate);
// ─────────────────────────────────────────────────────────────────────

// ── Icon set — one consistent stroke-based family, shared across the app
const ICONS = {
    dashboard:  '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    bots:       '<rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9" cy="13" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1.1" fill="currentColor" stroke="none"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><path d="M2 13h3M19 13h3"/>',
    analysis:   '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
    signals:    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    strategy:   '<path d="M9 2v6L4 20a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L15 8V2"/><path d="M9 2h6"/><path d="M7 15h10"/>',
    journal:    '<path d="M2 5c2-1 5-1 7 0v14c-2-1-5-1-7 0V5Z"/><path d="M22 5c-2-1-5-1-7 0v14c2-1 5-1 7 0V5Z"/>',
    alerts:     '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    community:  '<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14c2.7.5 4.5 2.6 4.5 6"/>',
    billing:    '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    settings:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    catalog:    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    accounts:   '<path d="M9 17H7a5 5 0 0 1 0-10h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>',
    admin:      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"/>',
    logout:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};

function icon(name, size, color) {
    size = size || 15;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">' + (ICONS[name] || '') + '</svg>';
}

// ── Navigation structure — grouped by job-to-be-done, not feature dump.
// 8 primary items across 3 groups keeps each group scannable; Account
// utilities sit apart at the bottom per convention, Admin further apart
// still, since it's a different audience (design rule: don't mix a
// power-user/admin area into the main flow).
const NAV_GROUPS = [
    {
        label: null, // no header — single item, reads as "home"
        items: [
            { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
        ],
    },
    {
        label: 'TRADING',
        items: [
            { id: 'bots',          label: 'Bots',          icon: 'bots' },
            { id: 'catalog',       label: 'Bot Catalog',   icon: 'catalog' },
            { id: 'analysis',      label: 'Analysis',      icon: 'analysis' },
            { id: 'signals',       label: 'Signals',       icon: 'signals' },
            { id: 'strategy-lab',  label: 'Strategy Lab',  icon: 'strategy' },
        ],
    },
    {
        label: 'TRACKING',
        items: [
            { id: 'journal', label: 'Journal', icon: 'journal' },
            { id: 'alerts',  label: 'Alerts',  icon: 'alerts' },
        ],
    },
    {
        label: 'COMMUNITY',
        items: [
            { id: 'community', label: 'Community', icon: 'community' },
        ],
    },
];

const ACCOUNT_ITEMS = [
    { id: 'accounts', label: 'Accounts', icon: 'accounts' },
    { id: 'billing',  label: 'Billing',  icon: 'billing' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
];

const ADMIN_ITEM = { id: 'admin', label: 'Admin', icon: 'admin' };

// ── Theme — accent color only. This never overrides semantic colors
// (profit/loss/warning) elsewhere in the app; it only drives selection,
// focus, and "active" states, per the design system's color rules.
//
// These keys/colors/storage-key/application-method match the theme
// system that already exists in dashboard.js and settings.js — do not
// change them independently in this file, or the sidebar's theme
// swatches will silently stop affecting the rest of the app.
const THEMES = {
    'obsidian':      '#D9A441',
    'titanium-blue': '#4FC3F7',
    'carbon-redline':'#FF7043',
};
const THEME_LABELS = {
    'obsidian': 'Obsidian Command',
    'titanium-blue': 'Titanium Blue',
    'carbon-redline': 'Carbon Redline',
};
const THEME_STORAGE_KEY = 'qp-theme';
const THEME_DATA_ATTR_MAP = { obsidian: '', 'titanium-blue': 'titanium-blue', 'carbon-redline': 'carbon-redline' };

function navItemHTML(item, activePage) {
    const active = item.id === activePage;
    return '<div class="qp-nav-item" data-nav="' + item.id + '" style="' +
            'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;' +
            'font-size:12.5px;font-weight:' + (active ? '700' : '400') + ';' +
            'color:' + (active ? 'var(--accent)' : 'var(--text-secondary)') + ';' +
            'background:' + (active ? 'var(--bg-panel)' : 'transparent') + ';' +
            'border-left:2px solid ' + (active ? 'var(--accent)' : 'transparent') + ';' +
            'margin-left:-2px;transition:background 0.15s,color 0.15s;">' +
        icon(item.icon, 15, active ? 'var(--accent)' : 'var(--text-muted)') +
        '<span>' + item.label + '</span>' +
    '</div>';
}

function groupHTML(group, activePage) {
    return (
        (group.label
            ? '<div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--text-muted);padding:12px 10px 4px;">' + group.label + '</div>'
            : '') +
        group.items.map(function(item) { return navItemHTML(item, activePage); }).join('')
    );
}

/**
 * Render the sidebar. Call once per page render, then call initSidebar()
 * on the returned DOM to wire up clicks.
 *
 * @param {string} activePage   - id of the current page, e.g. 'analysis'
 * @param {object} [opts]
 * @param {boolean} [opts.isAdmin] - show the Admin section (separate, muted-off group)
 */
export function renderSidebar(activePage, opts) {
    opts = opts || {};
    const theme = getStoredTheme();

    return '<aside id="qpSidebar" style="width:200px;background:var(--bg-secondary);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;height:100vh;">' +
        '<div style="padding:16px 14px;border-bottom:1px solid var(--border);">' +
            '<div style="font-size:18px;font-weight:700;color:var(--accent);">Quant<span style="color:var(--text-primary);">Pesa</span></div>' +
            '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;letter-spacing:0.08em;">DECISION OS</div>' +
        '</div>' +

        '<div style="padding:8px 8px 8px;flex:1;overflow-y:auto;">' +
            (opts.extraTopHTML || '') +
            (opts.extraTopHTML ? '<div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--text-muted);padding:12px 10px 4px;">NAVIGATE</div>' : '') +
            NAV_GROUPS.map(function(g) { return groupHTML(g, activePage); }).join('') +

            '<div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--text-muted);padding:12px 10px 4px;">ACCOUNT</div>' +
            ACCOUNT_ITEMS.map(function(item) { return navItemHTML(item, activePage); }).join('') +

            (opts.isAdmin
                ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">' +
                    '<div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--text-muted);padding:0 10px 4px;">ADMIN</div>' +
                    navItemHTML(ADMIN_ITEM, activePage) +
                  '</div>'
                : '') +
        '</div>' +

        '<div style="padding:12px 14px;border-top:1px solid var(--border);">' +
            '<div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:6px;">THEME</div>' +
            '<div id="qpThemeSwatches" style="display:flex;gap:8px;margin-bottom:12px;">' +
                Object.keys(THEMES).map(function(key) {
                    const isActive = key === theme;
                    return '<span data-theme="' + key + '" title="' + THEME_LABELS[key] + '" style="' +
                        'width:16px;height:16px;border-radius:50%;cursor:pointer;background:' + THEMES[key] + ';' +
                        'display:inline-block;box-sizing:border-box;' +
                        'border:2px solid ' + (isActive ? 'var(--text-primary)' : 'transparent') + ';' +
                        'box-shadow:' + (isActive ? '0 0 0 2px var(--bg-secondary)' : 'none') + ';"></span>';
                }).join('') +
            '</div>' +
            '<button id="qpLogoutBtn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;">' +
                icon('logout', 14) + '<span>Logout</span>' +
            '</button>' +
        '</div>' +
    '</aside>';
}

/**
 * Wire up click handlers after renderSidebar()'s HTML is in the DOM.
 * @param {HTMLElement} root - container the sidebar was inserted into
 * @param {function} navigate - the app's page-navigation function
 * @param {object} [opts]
 * @param {function} [opts.onLogout] - called on logout click (defaults to no-op; page should provide its own)
 */
export function initSidebar(root, navigate, opts) {
    opts = opts || {};

    root.querySelectorAll('.qp-nav-item').forEach(function(el) {
        el.addEventListener('mouseenter', function() {
            if (el.dataset.nav !== getActiveFromDOM(root)) el.style.background = 'var(--bg-panel)';
        });
        el.addEventListener('mouseleave', function() {
            if (el.dataset.nav !== getActiveFromDOM(root)) el.style.background = 'transparent';
        });
        el.addEventListener('click', function() { navigate(el.dataset.nav); });
    });

    root.querySelectorAll('#qpThemeSwatches [data-theme]').forEach(function(el) {
        el.addEventListener('click', function() { applyTheme(el.dataset.theme); });
    });

    const logoutBtn = root.querySelector('#qpLogoutBtn');
    if (logoutBtn && opts.onLogout) {
        logoutBtn.addEventListener('click', opts.onLogout);
    }

    applyTheme(getStoredTheme()); // ensure CSS var matches on every page load
}

function getActiveFromDOM(root) {
    const active = root.querySelector('.qp-nav-item[style*="var(--accent)"]');
    return active ? active.dataset.nav : null;
}

function getStoredTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY) || 'obsidian';
    } catch (e) {
        return 'obsidian';
    }
}

// Applies via the same data-theme attribute mechanism already used by
// dashboard.js / settings.js, so switching from any page is consistent
// with switching from those pages. The actual --accent value per theme
// is expected to be defined in the app's global stylesheet against
// [data-theme="..."] selectors — this function does not set --accent
// directly, to avoid fighting that stylesheet.
function applyTheme(key) {
    if (!THEMES[key]) return;
    document.documentElement.setAttribute('data-theme', THEME_DATA_ATTR_MAP[key] || '');
    try { localStorage.setItem(THEME_STORAGE_KEY, key); } catch (e) {}

    // Refresh swatch borders without a full re-render
    document.querySelectorAll('#qpThemeSwatches [data-theme]').forEach(function(el) {
        const isActive = el.dataset.theme === key;
        el.style.border = '2px solid ' + (isActive ? 'var(--text-primary)' : 'transparent');
        el.style.boxShadow = isActive ? '0 0 0 2px var(--bg-secondary)' : 'none';
    });
}