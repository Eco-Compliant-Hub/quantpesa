import { api } from './api.js';

// Floating bot monitor windows -- polling-based (proven pattern, same
// as accounts.js), one window per bot, cascading position, with
// minimize (hide, bot keeps running) vs close (confirm + actually stop).

const POLL_INTERVAL_MS = 3000;
const openWindows = new Map(); // botId -> { el, pollTimer, minimized }
let cascadeCount = 0;

function accountBadge(bot) {
    if (!bot.broker_account_id) return 'No account';
    const kind = bot.account_is_virtual ? 'Demo' : 'Real';
    return kind + ' - ' + bot.broker_account_id + ' - ' + (bot.account_currency || '');
}

function statusColor(status) {
    if (status === 'won') return 'text-emerald-400';
    if (status === 'lost') return 'text-red-400';
    return 'text-yellow-400'; // open/pending
}

function renderTradeRow(order) {
    const pnl = order.payout !== null && order.payout !== undefined
        ? (Number(order.payout) - Number(order.stake)).toFixed(2)
        : null;
    return '<div class="flex items-center justify-between text-xs py-1.5 border-b border-gray-800">' +
        '<span class="text-gray-400">' + (order.symbol || '-') + '</span>' +
        '<span class="text-gray-500">' + (order.contract_type || '-') + '</span>' +
        '<span class="text-gray-300">' + Number(order.stake).toFixed(2) + '</span>' +
        '<span class="' + statusColor(order.status) + '">' + order.status + '</span>' +
        '<span class="' + (pnl === null ? 'text-gray-600' : (pnl >= 0 ? 'text-emerald-400' : 'text-red-400')) + '">' +
            (pnl === null ? '-' : (pnl >= 0 ? '+' : '') + pnl) +
        '</span>' +
    '</div>';
}

function buildWindowHtml(botId) {
    const offset = (cascadeCount % 6) * 30;
    return '<div id="monitorWin-' + botId + '" class="fixed bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-40" ' +
        'style="top:' + (80 + offset) + 'px; left:' + (100 + offset) + 'px; width:384px; height:420px; min-width:320px; min-height:220px; max-width:90vw; max-height:85vh; resize:both; overflow:auto;">' +
        '<div class="flex items-center justify-between px-4 py-3 border-b border-gray-800 cursor-move" data-monitor-drag>' +
            '<div>' +
                '<p class="text-sm font-semibold text-white" data-monitor-title>Loading...</p>' +
                '<p class="text-xs text-gray-500" data-monitor-account>-</p>' +
            '</div>' +
            '<div class="flex gap-1">' +
                '<button data-monitor-minimize="' + botId + '" class="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded">Minimize</button>' +
                '<button data-monitor-close="' + botId + '" class="px-2 py-1 bg-red-500 hover:bg-red-400 text-white text-xs rounded">Stop</button>' +
            '</div>' +
        '</div>' +
        '<div class="px-4 py-3 border-b border-gray-800" data-monitor-pnl>' +
            '<p class="text-gray-500 text-xs">Loading session data...</p>' +
        '</div>' +
        '<div class="px-4 py-3 overflow-y-auto" data-monitor-feed style="max-height: calc(100% - 130px);">' +
            '<p class="text-gray-500 text-xs">No trades yet.</p>' +
        '</div>' +
    '</div>';
}

function renderWindowContent(botId, data) {
    const win = document.getElementById('monitorWin-' + botId);
    if (!win) return;

    win.querySelector('[data-monitor-title]').textContent = data.bot.bot_name;
    botNames.set(botId, data.bot.bot_name);
    win.querySelector('[data-monitor-account]').textContent = accountBadge(data.bot);

    const pnlEl = win.querySelector('[data-monitor-pnl]');
    if (data.session) {
        const pnl = Number(data.session.total_pnl || 0);
        pnlEl.innerHTML = '<div class="flex items-center justify-between text-sm">' +
            '<span class="text-gray-400">P&L: <span class="' + (pnl >= 0 ? 'text-emerald-400' : 'text-red-400') + ' font-semibold">' + (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '</span></span>' +
            '<span class="text-gray-500">' + (data.session.total_wins || 0) + 'W / ' + (data.session.total_losses || 0) + 'L</span>' +
        '</div>';
    } else {
        pnlEl.innerHTML = '<p class="text-gray-500 text-xs">No active session.</p>';
    }

    const feedEl = win.querySelector('[data-monitor-feed]');
    if (data.orders && data.orders.length) {
        feedEl.innerHTML = data.orders.map(renderTradeRow).join('');
    } else {
        feedEl.innerHTML = '<p class="text-gray-500 text-xs">No trades yet.</p>';
    }
}

// Drag by the header (data-monitor-drag). Deliberately not touching the
// element's built-in resize:both/overflow:auto -- that's the browser's
// native resize handle and already works via the CSS in buildWindowHtml().
// Each window gets its own closure-scoped `dragging` flag, so multiple
// open monitors can never fight over which one is being moved.
function makeWindowDraggable(el) {
    const header = el.querySelector('[data-monitor-drag]');
    if (!header) return;

    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return; // don't start a drag from Minimize/Stop
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        el.style.left = (startLeft + e.clientX - startX) + 'px';
        el.style.top = (startTop + e.clientY - startY) + 'px';
    });

    document.addEventListener('mouseup', () => { dragging = false; });
}

async function pollOnce(botId) {
    const res = await api.botLive(botId);
    if (res.success) {
        renderWindowContent(botId, res);
    }
}

const botNames = new Map();

export function openBotMonitor(botId) {
    if (openWindows.has(botId)) {
        const entry = openWindows.get(botId);
        if (entry.minimized) restoreBotMonitor(botId);
        return;
    }

    const container = document.createElement('div');
    container.innerHTML = buildWindowHtml(botId);
    document.body.appendChild(container.firstElementChild);
    cascadeCount++;

    const el = document.getElementById('monitorWin-' + botId);

    el.querySelector('[data-monitor-minimize="' + botId + '"]').addEventListener('click', () => minimizeBotMonitor(botId));
    el.querySelector('[data-monitor-close="' + botId + '"]').addEventListener('click', () => closeBotMonitor(botId));
    makeWindowDraggable(el);

    const pollTimer = setInterval(() => pollOnce(botId), POLL_INTERVAL_MS);
    openWindows.set(botId, { el, pollTimer, minimized: false });

    pollOnce(botId);
}

function minimizedTabStrip() {
    let strip = document.getElementById('monitorTabStrip');
    if (!strip) {
        strip = document.createElement('div');
        strip.id = 'monitorTabStrip';
        strip.className = 'fixed bottom-0 left-0 right-0 flex gap-2 px-4 py-2 z-50 pointer-events-none';
        document.body.appendChild(strip);
    }
    return strip;
}

function minimizeBotMonitor(botId) {
    const entry = openWindows.get(botId);
    if (!entry) return;

    entry.el.classList.add('hidden');
    entry.minimized = true;

    const tab = document.createElement('button');
    tab.id = 'monitorTab-' + botId;
    tab.className = 'pointer-events-auto px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs rounded-t-lg';
    tab.textContent = botNames.get(botId) || ('Bot #' + botId);
    tab.addEventListener('click', () => restoreBotMonitor(botId));
    minimizedTabStrip().appendChild(tab);
}

function restoreBotMonitor(botId) {
    const entry = openWindows.get(botId);
    if (!entry) return;

    entry.el.classList.remove('hidden');
    entry.minimized = false;

    const tab = document.getElementById('monitorTab-' + botId);
    if (tab) tab.remove();
}

async function closeBotMonitor(botId) {
    const confirmed = confirm('Stop this bot? This will actually stop trading, not just close the window.');
    if (!confirmed) return;

    try {
        const res = await api.stopBot(botId);
        if (res && res.success === false) {
            alert(res.message || 'Failed to stop the bot. The monitor window will stay open.');
            return;
        }
    } catch (err) {
        console.error('closeBotMonitor: stopBot request failed', err);
        alert('Could not reach the server to stop the bot. The monitor window will stay open.');
        return;
    }

    const entry = openWindows.get(botId);
    if (entry) {
        clearInterval(entry.pollTimer);
        entry.el.remove();
        const tab = document.getElementById('monitorTab-' + botId);
        if (tab) tab.remove();
        openWindows.delete(botId);
    }
}
