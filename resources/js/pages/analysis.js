import { api } from '../api.js';
import { auth } from '../auth.js';
import { subscribeSymbol } from '../ws.js';
import { renderSidebar, initSidebar } from './sidebar.js';
import { createAnalysisContext, saveAnalysisContext, markAnalysisContextPersisted } from './analysisContext.js';
// Sidebar markup and behavior live in the shared module (sidebar.js)
// instead of a local copy — same convention as every other page.

// ── Symbol catalog — loaded from the server, never hardcoded ─────────
// Pulled from api.symbols(), same source dashboard.js already uses, so
// the two pages can never list different markets again. Grouping is
// done client-side by code prefix purely for the dropdown's <optgroup>
// labels -- the symbols table itself has no group column. A code that
// doesn't match a known prefix still shows up, under "Other", so a new
// market type never disappears just because this classifier doesn't
// know it yet.
let symbolsByCode = {}; // code -> { symbol, display_name, ... } from the server

function classifySymbolGroup(code) {
    if (code.startsWith('R_') || code.startsWith('1HZ')) return 'Volatility Indices';
    if (code.startsWith('BOOM')) return 'Boom Indices';
    if (code.startsWith('CRASH')) return 'Crash Indices';
    if (code.startsWith('JD')) return 'Jump Indices';
    if (code === 'RDBEAR' || code === 'RDBULL') return 'Daily Reset Indices';
    return 'Other';
}

const GROUP_ORDER = ['Daily Reset Indices', 'Jump Indices', 'Volatility Indices', 'Boom Indices', 'Crash Indices', 'Other'];

function symbolLabel(code) {
    return (symbolsByCode[code] && symbolsByCode[code].display_name) || code;
}

function buildSymbolOptionsHTML(selected, list) {
    const groups = {};
    list.forEach(s => {
        const g = classifySymbolGroup(s.symbol);
        if (!groups[g]) groups[g] = [];
        groups[g].push(s);
    });
    return GROUP_ORDER.filter(g => groups[g] && groups[g].length).map(g =>
        '<optgroup label="' + g + '">' +
            groups[g].map(s => '<option value="' + s.symbol + '"' + (s.symbol === selected ? ' selected' : '') + '>' + (s.display_name || s.symbol) + '</option>').join('') +
        '</optgroup>'
    ).join('');
}

// Fetches the real list and repopulates the dropdown. If selectedSym
// (the 'R_25' default) turns out not to exist for this account, falls
// back to whatever the server actually returned first, instead of
// silently polling a market that isn't real.
async function loadSymbols() {
    try {
        const res = await api.symbols();
        const list = (res && (res.symbols || res.data)) || [];
        if (!res || !res.success || !list.length) return;

        symbolsByCode = {};
        list.forEach(s => { symbolsByCode[s.symbol] = s; });

        let symbolChanged = false;
        if (!symbolsByCode[selectedSym]) {
            selectedSym = list[0].symbol;
            symbolChanged = true;
        }

        const select = document.getElementById('symPicker');
        if (select) select.innerHTML = buildSymbolOptionsHTML(selectedSym, list);

        const streamLabel = document.getElementById('streamSym');
        if (streamLabel) streamLabel.textContent = symbolLabel(selectedSym);

        if (symbolChanged) {
            startTicks();
            refreshAnalysis();
        }
    } catch (e) {
        // Leave the placeholder option in place -- page still works,
        // just without a populated dropdown until the next reload.
    }
}

const LOOKBACK_PRESETS = [10, 25, 50, 100, 200, 500, 1000];
const ABSENCE_WINDOWS = [10, 20, 30];
const POLL_INTERVAL_MS = 3000;
const LONG_PRESS_MS = 450;

// ── Design system: semantic colors ───────────────────────────────────
// Theme/accent = selection & identity only. These four carry meaning
// everywhere in the app and must never be swapped for the active theme
// color, so a yellow theme can't accidentally recolor a warning yellow.
const SEM = {
    positive: 'var(--profit)',              // healthy / confirmed / balanced
    caution:  'var(--warning, #d99a2b)',     // attention / borderline / insufficient
    danger:   'var(--loss)',                 // error / risk
    neutral:  'var(--text-muted)',           // inactive / historical
    accent:   'var(--accent)',               // selected / active / live
};

// ── Standardized status vocabulary (design rule #12) ─────────────────
// One word per condition, used everywhere — never restated or
// rephrased locally in a panel.
const STATUS_TEXT = {
    live:         'LIVE',
    updating:     'UPDATING',
    unavailable:  'ANALYSIS UNAVAILABLE',   // never successfully fetched
    dataError:    'DATA UNAVAILABLE',       // had data, latest fetch failed
    noData:       'NO DATA',
    insufficient: 'INSUFFICIENT SAMPLE',
    leading:      'LEADING',
    normal:       'NORMAL',
    concentrated: 'CONCENTRATED',
    balanced:     'BALANCED',
    shifting:     'SHIFTING',
};

// ── Minimal inline icon set (single consistent family, stroke-based) ─
const ICONS = {
    radio:     '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    barChart:  '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
    hash:      '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
    repeat:    '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    layers:    '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    gitBranch: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    circleDash:'<path d="M12 2a10 10 0 0 1 7 3M22 12a10 10 0 0 1-3 7M12 22a10 10 0 0 1-7-3M2 12a10 10 0 0 1 3-7"/>',
    clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info:      '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/>',
    expand:    '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    collapse:  '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M10 14l-7 7"/>',
};

function icon(name, size, color) {
    size = size || 14;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">' + (ICONS[name] || '') + '</svg>';
}

// ── Tooltip copy (design rule #5 / #19 — teach, don't just define) ───
const TOOLTIPS = {
    digitStream: {
        title: 'LIVE MARKET',
        body: 'A raw stream of the most recent last-digit ticks as they arrive. Display only — no analysis is computed here.',
    },
    frequency: {
        title: 'DIGIT FREQUENCY',
        body: 'Shows how often each digit appeared in the selected number of ticks. It describes recent market activity; it does not predict the next digit.',
    },
    digitActivity: {
        title: 'DIGIT ACTIVITY',
        body: 'Shows how often each digit appeared, and how long since it last appeared, over the selected window. Double-click or press and hold a tab to pop it into its own floating panel. Use it to compare recency and frequency together — not as a forecast.',
    },
    runLength: {
        title: 'RUN LENGTH',
        body: 'Shows consecutive appearances of the same digit. Longer runs indicate recent clustering, but do not imply the run will continue.',
    },
    range: {
        title: 'RANGE DISTRIBUTION',
        body: 'Shows how recent digits are divided across your chosen ranges. Edit the boundaries below, or add more ranges. Turn on SHIFT to compare against the window immediately before this one.',
    },
    markov: {
        title: 'MARKOV TRANSITIONS',
        body: 'Shows observed transitions from one digit to another in the selected sample. It describes what happened; it is not a guarantee of the next transition.',
    },
    entropy: {
        title: 'ENTROPY',
        body: 'Measures how evenly the observed digits are distributed. Higher = more evenly distributed. Lower = more concentrated. Use it to compare how concentrated recent activity is across different windows.',
    },
};

let selectedSym    = 'R_25';
let lookback        = 1000;
let unsubscribeTicks = null;
let pollIv           = null;
let liveDigits        = []; // most recent raw digits, for the chip stream only — display, not analysis
let lastObserve         = null;
let lastAbsence         = null;
let lastRuns            = null;
let lastShiftPrev       = null; // derived previous-window frequency, for Range Shift only
let analysisFailed      = false;
let lastSuccessfulFetch = null; // Date, used for "last update Ns ago" on failure
let staleIntervalId      = null;
let clientAbsence       = {}; // digit -> live-interpolated absence state; corrected by the server every poll, never the sole source of truth

// ── Range Distribution: user-defined buckets, computed client-side
// from the server's per-digit frequency counts. No new statistics are
// invented here — this is just re-bucketing numbers the server already
// gave us into whatever ranges the person wants to look at.
let userRanges  = [{ id: 1, start: 0, end: 4 }, { id: 2, start: 5, end: 9 }];
let rangeIdSeq  = 3;
let shiftEnabled = false;

let activeDigitActivityTab = 20;
let detachedWindows = new Set();
const FLOAT_STORAGE_PREFIX = 'qp_panel_pos_';

export async function render(app, navigate) {
    window._nav = navigate;

    app.innerHTML =
        '<div class="edge-left"></div><div class="edge-right"></div><div class="edge-bottom"></div>' +
        '<div style="display:flex;height:100vh;overflow:hidden;background:var(--bg-main);">' +
            renderSidebar('analysis') +
            '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
                '<div style="height:48px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;flex-wrap:wrap;">' +
                    '<span class="live-dot"></span>' +
                    '<span style="font-weight:700;font-size:13px;color:var(--accent);">ANALYSIS</span>' +
                    '<div style="flex:1;"></div>' +
                    '<span style="font-size:11px;color:var(--text-muted);">Lookback</span>' +
                    '<div id="lookbackPresets" style="display:flex;gap:4px;"></div>' +
                    '<input id="lookbackInput" type="number" min="1" max="5000" value="' + lookback + '" style="width:70px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text-primary);font-size:12px;">' +
                    '<select id="symPicker" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:5px 10px;color:var(--text-primary);font-size:12px;cursor:pointer;max-width:220px;">' +
                        '<option value="' + selectedSym + '">Loading markets…</option>' +
                    '</select>' +
                    '<span id="topTime" style="font-size:11px;color:var(--text-muted);"></span>' +
                '</div>' +
                '<div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:auto auto auto;gap:12px;">' +

                    '<div class="panel" style="grid-column:span 3;">' +
                        panelHeader('radio', 'LIVE MARKET — <span id="streamSym">' + symbolLabel(selectedSym) + '</span>', 'digitStream',
                            '<span id="analysisStatus" style="font-size:11px;font-weight:700;letter-spacing:0.04em;"></span>' +
                            '<span style="font-size:11px;color:var(--text-muted);">Last <span id="lastDig" style="color:var(--accent);font-weight:700;">—</span></span>') +
                        '<div id="chipStream" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:10px;"></div>' +
                    '</div>' +

                    '<div class="panel" style="grid-column:span 3;border-left:3px solid var(--accent);">' +
                        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
                            '<div>' +
                                '<div class="panel-title">MARKET STATE</div>' +
                                '<div id="marketStateText" style="font-size:14px;font-weight:700;color:var(--text-primary);margin-top:5px;">Waiting for analysis…</div>' +
                                '<div id="marketStateMeta" style="font-size:10px;color:var(--text-muted);margin-top:4px;"></div>' +
                            '</div>' +
                            '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">' +
                                '<button id="inspectAnalysisBtn" class="px-3 py-2 text-xs rounded-lg" style="background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-secondary);">Investigate</button>' +
                                '<button id="configureFromAnalysisBtn" class="btn btn-profit px-3 py-2 text-xs">Configure Bot</button>' +
                            '</div>' +
                        '</div>' +
                        '<div id="evidenceRow" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;"></div>' +
                    '</div>' +

                    '<div class="panel" style="grid-column:span 2;">' +
                        '<div class="panel-title">WHAT CHANGED</div>' +
                        '<div id="whatChanged" style="margin-top:8px;"></div>' +
                    '</div>' +
                    '<div class="panel">' +
                        '<div class="panel-title">EVIDENCE QUALITY</div>' +
                        '<div id="evidenceQuality" style="margin-top:8px;"></div>' +
                    '</div>' +

                    '<div class="panel">' +
                        panelHeader('barChart', 'DIGIT FREQUENCY', 'frequency', '<span style="font-size:10px;color:var(--text-muted);">last <span id="freqLookbackLabel">' + lookback + '</span> ticks</span>') +
                        '<div id="freqBars" style="display:flex;align-items:flex-end;gap:6px;height:80px;margin:10px 0 4px;"></div>' +
                        '<div style="display:flex;gap:6px;" id="freqLabels"></div>' +
                    '</div>' +

                    '<div class="panel">' +
                        panelHeader('hash', 'DIGIT ACTIVITY', 'digitActivity', '<div id="digitActivityTabs" style="display:flex;gap:4px;"></div>') +
                        '<div id="digitActivityMotherBody" style="margin-top:8px;"></div>' +
                    '</div>' +

                    '<div class="panel">' +
                        panelHeader('repeat', 'RUN LENGTH', 'runLength', '<span style="font-size:10px;color:var(--text-muted);">most recent completed</span>') +
                        '<div id="runLengthPanel" style="margin-top:4px;"></div>' +
                    '</div>' +

                    '<div class="panel">' +
                        panelHeader('layers', 'RANGE DISTRIBUTION', 'range',
                            '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);cursor:pointer;user-select:none;letter-spacing:0.04em;">' +
                                '<input type="checkbox" id="shiftToggle" style="cursor:pointer;">SHIFT' +
                            '</label>') +
                        '<div id="rangeControls" style="margin-top:10px;"></div>' +
                        '<div id="rangePanel" style="margin-top:10px;"></div>' +
                    '</div>' +

                    '<div class="panel" style="grid-column:span 2;">' +
                        panelHeader('gitBranch', 'MARKOV TRANSITIONS', 'markov', '<span style="font-size:10px;color:var(--text-muted);">last <span id="markovLookbackLabel">' + lookback + '</span> ticks</span>') +
                        '<div id="markovAdequacy" style="margin:6px 0 8px;"></div>' +
                        '<div id="markovTable" style="overflow-x:auto;"></div>' +
                    '</div>' +

                    '<div class="panel">' +
                        panelHeader('circleDash', 'ENTROPY', 'entropy', '') +
                        '<div id="entropyPanel" style="margin-top:8px;"></div>' +
                    '</div>' +

                '</div>' +
            '</div>' +
        '</div>';

    setInterval(() => { const el = document.getElementById('topTime'); if (el) el.textContent = new Date().toLocaleTimeString(); }, 1000);
    initSidebar(app, navigate, {
        onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
    });

    buildFreqLabels();
    buildLookbackPresets();
    buildDigitActivityTabs();
    buildRangeControls();
    initTooltips(app);

    document.getElementById('shiftToggle').addEventListener('change', function() {
        shiftEnabled = this.checked;
        refreshAnalysis();
    });

    document.getElementById('inspectAnalysisBtn').addEventListener('click', () => {
        const target = document.getElementById('freqBars');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    document.getElementById('configureFromAnalysisBtn').addEventListener('click', async () => {
        if (!lastObserve || analysisFailed) return;
        const btn = document.getElementById('configureFromAnalysisBtn');
        btn.disabled = true;
        btn.textContent = 'Preparing...';

        let context = createAnalysisContext(buildDecisionSnapshot());

        // Persist so this context gets a real analysis_contexts.id that
        // Bots/Trading can actually bind to a session or order. If the
        // POST fails (migration not run yet, network issue, etc.) we
        // still let the trader proceed -- context.persisted stays false,
        // so downstream pages know not to send this id to the backend
        // as if it were a real record. The trader isn't blocked either way.
        try {
            const res = await api.createAnalysisContext(buildDecisionSnapshot());
            if (res.success && res.data) {
                context = markAnalysisContextPersisted(context, res.data);
            }
        } catch {
            // context stays local-only; handled above
        }

        saveAnalysisContext(context);
        btn.disabled = false;
        btn.textContent = 'Configure Bot';
        navigate('bots');
    });

    document.getElementById('symPicker').addEventListener('change', function() {
    selectedSym = this.value;
    liveDigits = [];
    updateChipStream(); // wipe the chip row now -- don't wait for the first new tick to redraw it
    const ld = document.getElementById('lastDig');
    if (ld) ld.textContent = '—'; // old symbol's last digit no longer applies
    const streamLabel = document.getElementById('streamSym');
    if (streamLabel) streamLabel.textContent = symbolLabel(selectedSym);
    startTicks();
    refreshAnalysis(); // immediate — per the "user changes -> immediate request" rule
});

    document.getElementById('lookbackInput').addEventListener('change', function() {
        const val = parseInt(this.value, 10);
        if (!val || val < 1) { this.value = lookback; return; }
        lookback = Math.min(val, 5000);
        this.value = lookback;
        updateLookbackLabels();
        highlightActivePreset();
        refreshAnalysis(); // immediate
    });


    startTicks();
    setStatus('updating');
    refreshAnalysis(); // immediate fetch on page load, per the locked design
    pollIv = setInterval(refreshAnalysis, POLL_INTERVAL_MS);
    loadSymbols(); // fills the dropdown with real markets; corrects selectedSym if 'R_25' isn't actually available
}

// ── Header + tooltip helpers (design rules #1 and #5) ─────────────────
function panelHeader(iconName, title, tooltipKey, extraRightHTML) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div class="panel-title" style="display:flex;align-items:center;gap:6px;font-weight:700;">' +
            icon(iconName, 14, 'var(--text-secondary)') + '<span>' + title + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
            (extraRightHTML || '') +
            infoIcon(tooltipKey) +
        '</div>' +
    '</div>';
}

function infoIcon(tooltipKey) {
    return '<span class="info-icon" data-tooltip="' + tooltipKey + '" style="cursor:help;color:var(--text-muted);display:inline-flex;">' + icon('info', 13) + '</span>';
}

// Lightweight hover tooltip: a single floating box reused for every
// info icon, positioned near whichever icon is hovered. No permanent
// explanatory text anywhere in the panels themselves (design rule #5).
function initTooltips(root) {
    let box = document.getElementById('qpTooltipBox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'qpTooltipBox';
        box.style.cssText = 'position:fixed;z-index:1000;max-width:260px;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:11px;line-height:1.5;color:var(--text-secondary);box-shadow:0 8px 24px rgba(0,0,0,0.4);display:none;pointer-events:none;';
        document.body.appendChild(box);
    }
    root.querySelectorAll('.info-icon').forEach(function(el) {
        el.addEventListener('mouseenter', function(e) {
            const t = TOOLTIPS[el.dataset.tooltip];
            if (!t) return;
            box.innerHTML = '<div style="font-weight:700;color:var(--text-primary);margin-bottom:4px;">' + t.title + '</div>' + t.body;
            box.style.display = 'block';
            positionTooltip(box, el);
        });
        el.addEventListener('mouseleave', function() { box.style.display = 'none'; });
    });
}

function positionTooltip(box, anchor) {
    const r = anchor.getBoundingClientRect();
    box.style.left = Math.max(8, r.left - 220) + 'px';
    box.style.top = (r.bottom + 8) + 'px';
}

function buildFreqLabels() {
    const el = document.getElementById('freqLabels');
    if (el) el.innerHTML = [0,1,2,3,4,5,6,7,8,9].map(d =>
        '<div style="flex:1;text-align:center;font-size:10px;color:var(--text-muted);">' + d + '</div>').join('');
}

function buildLookbackPresets() {
    const el = document.getElementById('lookbackPresets');
    if (!el) return;
    el.innerHTML = LOOKBACK_PRESETS.map(p =>
        '<button data-preset="' + p + '" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text-secondary);font-size:11px;cursor:pointer;">' + p + '</button>'
    ).join('');
    el.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            lookback = parseInt(btn.dataset.preset, 10);
            document.getElementById('lookbackInput').value = lookback;
            updateLookbackLabels();
            highlightActivePreset();
            refreshAnalysis(); // immediate
        });
    });
    highlightActivePreset();
}

function highlightActivePreset() {
    document.querySelectorAll('#lookbackPresets button').forEach(btn => {
        const active = parseInt(btn.dataset.preset, 10) === lookback;
        btn.style.background = active ? 'var(--accent)' : 'var(--bg-secondary)';
        btn.style.color = active ? 'var(--bg-main)' : 'var(--text-secondary)';
    });
}

function updateLookbackLabels() {
    ['freqLookbackLabel', 'markovLookbackLabel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = lookback;
    });
}

// ── Live tick display only — no analysis math happens here ──────────
function startTicks() {
    if (unsubscribeTicks) { unsubscribeTicks(); unsubscribeTicks = null; }

    unsubscribeTicks = subscribeSymbol(selectedSym, function(tick) {
        liveDigits.push(tick.last_digit);
        if (liveDigits.length > 40) liveDigits.shift();

        const ld = document.getElementById('lastDig');
        if (ld) ld.textContent = tick.last_digit;

        updateChipStream();
        advanceClientAbsence(tick.last_digit);
        renderAbsence();
    });
}

// Only "new arrival" carries meaning here (selected/live), so it's the
// only chip that uses the accent color — everything else stays neutral,
// per the "one visual accent should mean one thing" rule.
function updateChipStream() {
    const el = document.getElementById('chipStream'); if (!el) return;
    el.innerHTML = liveDigits.map((d, i) => {
        const isNew = i === liveDigits.length - 1;
        const col = isNew ? SEM.accent : 'var(--text-secondary)';
        const bg  = isNew ? 'var(--bg-panel)' : 'var(--bg-secondary)';
        const border = isNew ? '1px solid ' + SEM.accent : '1px solid var(--border)';
        return '<div style="width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:' + bg + ';border:' + border + ';color:' + col + ';transition:all 0.2s;">' + d + '</div>';
    }).join('');
}

// ── Analysis — always server-calculated, never done in the browser ──
async function refreshAnalysis() {
    setStatus('updating');

    // Range Shift needs a second window's worth of counts (2x lookback)
    // to derive "the period immediately before this one" by subtraction.
    // We only fetch it when the toggle is on, and only when it fits
    // within what the API will hand back.
    const wantShift = shiftEnabled && (lookback * 2) <= 5000;

    try {
        const calls = [
            api.observe(selectedSym, lookback),
            api.absence(selectedSym, ABSENCE_WINDOWS),
            api.runs(selectedSym),
        ];
        if (wantShift) calls.push(api.observe(selectedSym, lookback * 2));

        const results = await Promise.all(calls);
        const [observeRes, absenceRes, runsRes] = results;
        const doubleRes = wantShift ? results[3] : null;

        if (!observeRes.success || !absenceRes.success || !runsRes.success || (doubleRes && !doubleRes.success)) {
            throw new Error(observeRes.message || absenceRes.message || runsRes.message || (doubleRes && doubleRes.message) || 'Analysis request failed.');
        }

        lastObserve   = observeRes;
        lastAbsence   = absenceRes;
        lastRuns      = runsRes;
        lastShiftPrev = doubleRes ? computePrevFreq(observeRes.frequency, doubleRes.frequency) : null;
        analysisFailed = false;
        lastSuccessfulFetch = new Date();

        syncClientAbsence(absenceRes); // authoritative correction — overwrites any live drift

        renderFrequency(observeRes);
        renderRange(observeRes);
        renderEntropy(observeRes);
        renderMarkov(observeRes);
        renderAbsence();
        renderRunLength(runsRes);
        renderDecisionLayer(observeRes, absenceRes, runsRes);
        setStatus('live', lastSuccessfulFetch);

        // Stop any stale-countdown ticker from a prior failure — we're
        // fresh again.
        if (staleIntervalId) { clearInterval(staleIntervalId); staleIntervalId = null; }

    } catch (err) {
        analysisFailed = true;
        // Deliberately no fallback numbers here — panels keep their last
        // known-good render, but the status line must make clear those
        // numbers are stale, not current, so they can't be mistaken for
        // live data.
        updateStaleStatus();
        if (!staleIntervalId) {
            staleIntervalId = setInterval(updateStaleStatus, 1000);
        }
    }
}

function buildDecisionSnapshot() {
    const observe = lastObserve || {};
    const frequency = Array.isArray(observe.frequency) ? observe.frequency : [];
    const leading = [...frequency].sort((a,b) => (b.count || 0) - (a.count || 0))[0];
    const entropy = Number(observe.entropy);
    const runs = lastRuns?.runs || lastRuns?.data || [];
    const longestRun = [...runs].sort((a,b) => (b.run_length || 0) - (a.run_length || 0))[0];
    const markovAdequacy = observe.markov?.adequacy || 'unknown';

    const signals = [];
    if (Number.isFinite(entropy)) {
        signals.push({ source: 'entropy', state: entropy < 0.7 ? 'supporting' : 'neutral', text: entropy < 0.7 ? 'Distribution is concentrated' : 'Distribution is not strongly concentrated' });
    }
    if (leading && Number(leading.percentage) >= 15) {
        signals.push({ source: 'frequency', state: 'supporting', text: `Digit ${leading.digit} is leading at ${leading.percentage}%` });
    } else if (leading) {
        signals.push({ source: 'frequency', state: 'neutral', text: `Digit ${leading.digit} leads at ${leading.percentage}%` });
    }
    if (longestRun && Number(longestRun.run_length) >= 3) {
        signals.push({ source: 'run', state: 'supporting', text: `Digit ${longestRun.digit} completed a ${longestRun.run_length}-run` });
    }
    signals.push({
        source: 'markov',
        state: markovAdequacy === 'insufficient_sample' ? 'insufficient' : 'neutral',
        text: markovAdequacy === 'insufficient_sample' ? 'Transition evidence is insufficient' : `Transition evidence: ${markovAdequacy}`
    });

    const supporting = signals.filter(s => s.state === 'supporting').length;
    const insufficient = signals.filter(s => s.state === 'insufficient').length;
    const state = supporting >= 2 ? 'Evidence is converging on a market condition' : 'No dominant condition is established';
    const quality = supporting >= 3 ? 'MODERATE AGREEMENT' : supporting >= 2 ? 'PARTIAL AGREEMENT' : 'LOW AGREEMENT';

    return {
        symbol: selectedSym,
        lookback,
        state,
        evidence_quality: quality,
        evidence: signals,
        snapshot: {
            entropy: Number.isFinite(entropy) ? entropy : null,
            leading_digit: leading?.digit ?? null,
            leading_percentage: leading?.percentage ?? null,
            longest_run: longestRun?.run_length ?? null,
            markov_adequacy: markovAdequacy,
        },
    };
}

function renderDecisionLayer(observe, absence, runs) {
    const context = buildDecisionSnapshot();
    const stateEl = document.getElementById('marketStateText');
    const metaEl = document.getElementById('marketStateMeta');
    const evidenceEl = document.getElementById('evidenceRow');
    const changedEl = document.getElementById('whatChanged');
    const qualityEl = document.getElementById('evidenceQuality');

    if (stateEl) stateEl.textContent = context.state;
    if (metaEl) metaEl.textContent = `${symbolLabel(selectedSym)} · ${lookback} ticks · ${context.evidence_quality}`;
    if (evidenceEl) evidenceEl.innerHTML = context.evidence.map(s => {
        const color = s.state === 'supporting' ? SEM.positive : s.state === 'insufficient' ? SEM.caution : SEM.neutral;
        return `<span style="font-size:10px;padding:4px 7px;border-radius:5px;border:1px solid var(--border);color:${color};">${s.source.toUpperCase()} · ${s.state.toUpperCase()}</span>`;
    }).join('');

    const changes = [];
    if (context.snapshot.leading_digit !== null) changes.push(`Digit ${context.snapshot.leading_digit} leads at ${context.snapshot.leading_percentage}%`);
    if (context.snapshot.entropy !== null) changes.push(`Entropy ${context.snapshot.entropy.toFixed(3)}`);
    if (context.snapshot.longest_run !== null) changes.push(`Longest completed run ${context.snapshot.longest_run}`);
    if (changedEl) changedEl.innerHTML = changes.length
        ? changes.map(x => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary);">${x}</div>`).join('')
        : noDataBlock('No synthesis available.');

    if (qualityEl) qualityEl.innerHTML = `<div style="font-size:18px;font-weight:700;color:${context.evidence_quality === 'LOW AGREEMENT' ? SEM.caution : SEM.accent};">${context.evidence_quality}</div><div style="font-size:10px;color:var(--text-muted);margin-top:5px;">${context.evidence.filter(x => x.state === 'supporting').length} supporting · ${context.evidence.filter(x => x.state === 'insufficient').length} insufficient</div>`;
}

// previous-window count = count(2×lookback) − count(lookback), per digit.
// Pure subtraction of server-reported counts — no inference added.
function computePrevFreq(currentFreq, doubleFreq) {
    return doubleFreq.map(df => {
        const cur = currentFreq.find(c => c.digit === df.digit);
        const count = Math.max(0, df.count - (cur ? cur.count : 0));
        return { digit: df.digit, count };
    });
}

function updateStaleStatus() {
    setStatus('error', lastSuccessfulFetch);
}

// Standardized status indicator (design rule #12 / #15): a colored dot
// plus one of the fixed status words, with a timestamp where relevant.
// This is the only place status language is generated, so the wording
// can never drift between panels.
function setStatus(kind, since) {
    const el = document.getElementById('analysisStatus');
    if (!el) return;

    if (kind === 'live') {
        el.style.color = SEM.positive;
        el.innerHTML = '● ' + STATUS_TEXT.live + (since ? ' <span style="font-weight:400;color:var(--text-muted);">· ' + since.toLocaleTimeString() + '</span>' : '');
    } else if (kind === 'updating') {
        el.style.color = SEM.neutral;
        el.innerHTML = '◌ ' + STATUS_TEXT.updating;
    } else {
        el.style.color = SEM.danger;
        if (!since) {
            el.innerHTML = STATUS_TEXT.unavailable;
        } else {
            const seconds = Math.floor((new Date() - since) / 1000);
            el.innerHTML = STATUS_TEXT.dataError + ' <span style="font-weight:400;color:var(--text-muted);">· last update ' + seconds + 's ago</span>';
        }
    }
}

function renderFrequency(data) {
    const el = document.getElementById('freqBars'); if (!el) return;
    const freq = data.frequency;
    const maxV = Math.max(...freq.map(f => f.count)) || 1;
    el.innerHTML = freq.map(f => {
        const h = Math.max(4, (f.count / maxV) * 72);
        const isTop = f.count === maxV;
        const col = isTop ? SEM.accent : 'var(--text-secondary)';
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
            '<div style="font-size:9px;font-weight:' + (isTop ? '700' : '400') + ';color:' + (isTop ? SEM.accent : 'var(--text-muted)') + ';">' + f.percentage + '%</div>' +
            '<div style="width:100%;height:' + h + 'px;background:' + col + ';border-radius:3px;opacity:' + (isTop ? '1' : '0.55') + ';transition:height 0.3s;"></div>' +
        '</div>';
    }).join('');
}

// ── Range Distribution: customizable buckets + optional shift ───────

function buildRangeControls() {
    const el = document.getElementById('rangeControls');
    if (!el) return;

    el.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">' +
        '<span style="font-size:9px;color:var(--text-muted);letter-spacing:0.08em;margin-right:2px;">RANGES</span>' +
        userRanges.map(rangeChipHTML).join('') +
        '<button id="addRangeBtn" style="background:transparent;border:1px dashed var(--border);border-radius:6px;padding:4px 9px;color:var(--text-muted);font-size:10px;cursor:pointer;">+ Add Range</button>' +
    '</div>';

    el.querySelectorAll('.range-start,.range-end').forEach(inp => {
        inp.addEventListener('change', function() {
            const id = parseInt(this.dataset.id, 10);
            const r = userRanges.find(x => x.id === id);
            if (!r) return;
            let v = parseInt(this.value, 10);
            if (isNaN(v)) v = this.classList.contains('range-start') ? r.start : r.end;
            v = Math.max(0, Math.min(9, v));
            if (this.classList.contains('range-start')) r.start = Math.min(v, r.end);
            else r.end = Math.max(v, r.start);
            this.value = this.classList.contains('range-start') ? r.start : r.end;
            recomputeRangePanel();
        });
    });

    el.querySelectorAll('.range-remove').forEach(btn => {
        btn.addEventListener('click', function() {
            if (userRanges.length <= 1) return; // always keep at least one
            userRanges = userRanges.filter(x => x.id !== parseInt(this.dataset.id, 10));
            buildRangeControls();
            recomputeRangePanel();
        });
    });

    const addBtn = document.getElementById('addRangeBtn');
    if (addBtn) addBtn.addEventListener('click', function() {
        userRanges.push({ id: rangeIdSeq++, start: 0, end: 0 });
        buildRangeControls();
        recomputeRangePanel();
    });
}

function rangeChipHTML(r) {
    return '<div style="display:flex;align-items:center;gap:2px;background:var(--bg-panel);border:1px solid var(--border);border-radius:6px;padding:2px 4px;">' +
        '<input class="range-start" data-id="' + r.id + '" type="number" min="0" max="9" value="' + r.start + '" style="width:24px;background:transparent;border:none;color:var(--text-primary);font-size:11px;text-align:center;">' +
        '<span style="color:var(--text-muted);font-size:10px;">–</span>' +
        '<input class="range-end" data-id="' + r.id + '" type="number" min="0" max="9" value="' + r.end + '" style="width:24px;background:transparent;border:none;color:var(--text-primary);font-size:11px;text-align:center;">' +
        (userRanges.length > 1 ? '<span class="range-remove" data-id="' + r.id + '" title="Remove range" style="cursor:pointer;color:' + SEM.danger + ';font-size:12px;margin-left:3px;padding:0 2px;">×</span>' : '') +
    '</div>';
}

function recomputeRangePanel() {
    if (lastObserve) renderRange(lastObserve);
}

function computeRangeStats(freq, ranges) {
    const total = freq.reduce((s, f) => s + f.count, 0) || 1;
    return ranges.map(r => {
        const count = freq.filter(f => f.digit >= r.start && f.digit <= r.end).reduce((s, f) => s + f.count, 0);
        return { id: r.id, start: r.start, end: r.end, count, pct: Math.round((count / total) * 100) };
    });
}

function renderRange(data) {
    const el = document.getElementById('rangePanel'); if (!el) return;
    if (!data || !data.frequency) { el.innerHTML = noDataBlock('Waiting for frequency data.'); return; }

    const stats = computeRangeStats(data.frequency, userRanges);
    const leading = stats.reduce((best, s) => (s.pct > best.pct ? s : best), stats[0]);

    let body = stats.map(s => {
        const isLeading = s.id === leading.id;
        return '<div style="margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                '<span style="font-size:11px;color:var(--text-secondary);">' + s.start + '–' + s.end + '</span>' +
                '<span style="font-size:14px;font-weight:700;color:' + (isLeading ? SEM.accent : 'var(--text-primary)') + ';">' + s.pct + '%</span>' +
            '</div>' +
            '<div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden;">' +
                '<div style="background:' + (isLeading ? SEM.accent : 'var(--text-secondary)') + ';height:8px;width:' + s.pct + '%;opacity:' + (isLeading ? '1' : '0.55') + ';transition:width 0.3s;"></div>' +
            '</div>' +
        '</div>';
    }).join('');

    body += '<div style="font-size:11px;font-weight:700;color:' + SEM.accent + ';border-top:1px solid var(--border);padding-top:8px;letter-spacing:0.02em;">' +
        leading.start + '–' + leading.end + ' ' + STATUS_TEXT.leading + ' · ' + leading.pct + '%' +
    '</div>';

    if (shiftEnabled) {
        if (lastShiftPrev) {
            const prevStats = computeRangeStats(lastShiftPrev, userRanges);
            body += '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">' +
                '<div style="font-size:9px;color:var(--text-muted);letter-spacing:0.06em;margin-bottom:6px;">' + STATUS_TEXT.shifting + ' · vs. previous window</div>' +
                stats.map(s => {
                    const prev = prevStats.find(p => p.id === s.id);
                    const delta = prev ? s.pct - prev.pct : 0;
                    const arrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '→');
                    const col = delta > 0 ? SEM.positive : (delta < 0 ? SEM.danger : SEM.neutral);
                    return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:3px 0;">' +
                        '<span style="color:var(--text-secondary);width:50px;">' + s.start + '–' + s.end + '</span>' +
                        '<span style="color:var(--text-muted);flex:1;text-align:right;">' + (prev ? prev.pct : '—') + '% → ' + s.pct + '%</span>' +
                        '<span style="color:' + col + ';font-weight:700;width:64px;text-align:right;">' + arrow + ' ' + (delta >= 0 ? '+' : '') + delta + 'pp</span>' +
                    '</div>';
                }).join('') +
            '</div>';
        } else {
            body += '<div style="margin-top:10px;font-size:10px;color:var(--text-muted);">Lower the lookback to 2500 or below to enable shift comparison.</div>';
        }
    }

    el.innerHTML = body;
}

function renderEntropy(data) {
    const el = document.getElementById('entropyPanel'); if (!el) return;
    const e = data.entropy;
    let label, col;
    if (e >= 0.9)      { label = STATUS_TEXT.balanced;     col = SEM.positive; }
    else if (e >= 0.7) { label = STATUS_TEXT.normal;       col = SEM.accent; }
    else                { label = STATUS_TEXT.concentrated; col = SEM.caution; }

    el.innerHTML =
        '<div style="text-align:center;padding:12px;">' +
            '<div style="font-size:40px;font-weight:700;color:' + col + ';">' + e.toFixed(3) + '</div>' +
            '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:' + col + ';margin-top:4px;">' + label + '</div>' +
        '</div>' +
        '<div style="background:var(--border);border-radius:4px;height:6px;margin-top:8px;">' +
            '<div style="background:' + col + ';height:6px;border-radius:4px;width:' + (e * 100).toFixed(0) + '%;transition:width 0.4s;"></div>' +
        '</div>';
}

const ADEQUACY_META = {
    insufficient_sample: { label: STATUS_TEXT.insufficient, color: SEM.caution },
    very_weak:           { label: 'VERY WEAK EVIDENCE',    color: SEM.caution },
    preliminary:         { label: 'PRELIMINARY',           color: SEM.caution },
    moderate:            { label: 'MODERATE SAMPLE',       color: SEM.positive },
    strong:               { label: 'STRONG SAMPLE',         color: SEM.positive },
    deep:                 { label: 'DEEP SAMPLE',            color: SEM.positive },
};

function renderMarkov(data) {
    const adequacyEl = document.getElementById('markovAdequacy');
    const tableEl = document.getElementById('markovTable');
    if (!adequacyEl || !tableEl) return;

    const adequacy = data.markov.adequacy;
    const meta = ADEQUACY_META[adequacy] || { label: adequacy, color: SEM.neutral };

    adequacyEl.innerHTML = '<span style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:' + meta.color + ';">' + meta.label + '</span>';

    if (adequacy === 'insufficient_sample' || !data.markov.matrix.length) {
        tableEl.innerHTML = noDataBlock('Not enough ticks in this lookback to build a transition matrix. Try a larger lookback.');
        return;
    }

    let html = '<table style="width:100%;border-collapse:collapse;font-size:10px;min-width:480px;">';
    html += '<thead><tr><th style="padding:4px 6px;color:var(--text-muted);"></th>' +
        [0,1,2,3,4,5,6,7,8,9].map(d => '<th style="padding:4px 6px;color:var(--text-muted);">' + d + '</th>').join('') +
        '</tr></thead><tbody>';

    data.markov.matrix.forEach(row => {
        const lowSample = row.sample_size < 5;
        html += '<tr style="border-top:1px solid var(--border);">';
        html += '<td style="padding:4px 6px;color:var(--text-primary);font-weight:700;">' + row.from_digit + (lowSample ? ' *' : '') + '</td>';
        row.transitions.forEach(t => {
            const pct = (t.probability * 100).toFixed(0);
            const intensity = t.probability > 0.2 ? SEM.accent : 'var(--text-muted)';
            html += '<td style="padding:4px 6px;text-align:center;color:' + (lowSample ? 'var(--text-muted)' : intensity) + ';">' + pct + '%</td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<div style="font-size:9px;color:var(--text-muted);margin-top:6px;">* fewer than 5 observed transitions from this digit — low confidence row</div>';

    tableEl.innerHTML = html;
}

// ── Run Length: header + rows, columns aligned ───────────────────────
function runLengthHeaderHTML() {
    return '<div style="display:flex;align-items:center;gap:8px;padding:0 2px 6px;border-bottom:1px solid var(--border);margin-bottom:2px;">' +
        '<span style="width:24px;font-size:9px;color:var(--text-muted);letter-spacing:0.06em;">DIGIT</span>' +
        '<span style="flex:1;font-size:9px;color:var(--text-muted);letter-spacing:0.06em;">STREAK</span>' +
        '<span style="width:90px;text-align:right;font-size:9px;color:var(--text-muted);letter-spacing:0.06em;">COMPLETED</span>' +
    '</div>';
}

function renderRunLength(data) {
    const el = document.getElementById('runLengthPanel'); if (!el) return;
    const runs = data.runs;

    if (!runs || runs.length === 0) {
        el.innerHTML = runLengthHeaderHTML() + noDataBlock('Waiting for completed runs.');
        return;
    }

    const longest = Math.max(...runs.map(r => r.run_length));

    el.innerHTML = runLengthHeaderHTML() + runs.slice(0, 8).map(r => {
        const col = r.run_length >= 4 ? SEM.caution : r.run_length >= 3 ? SEM.accent : 'var(--text-primary)';
        const isLongest = r.run_length === longest;
        return '<div style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid var(--border);">' +
            '<span style="width:24px;font-size:14px;font-weight:700;color:' + col + ';">' + r.digit + '</span>' +
            '<span style="flex:1;font-size:10px;color:var(--text-muted);">×' + r.run_length + (isLongest ? ' · longest' : '') + '</span>' +
            '<span style="width:90px;text-align:right;font-size:9px;color:var(--text-muted);">' + new Date(r.ended_at).toLocaleTimeString() + '</span>' +
        '</div>';
    }).join('');
}

// Shared "no data yet" block (design rule #15) — never manufacture
// numbers to fill an empty panel.
function noDataBlock(subtext) {
    return '<div style="text-align:center;padding:16px 8px;">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:var(--text-muted);">' + STATUS_TEXT.noData + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">' + subtext + '</div>' +
    '</div>';
}

// Overwrites client state with the authoritative server result — called
// after every successful poll. Corrects any live drift on ticksSinceLastSeen
// and refreshes the per-window counts, which are never interpolated client-side.
function syncClientAbsence(absenceRes) {
    clientAbsence = {};
    absenceRes.digits.forEach(d => {
        clientAbsence[d.digit] = {
            ticksSinceLastSeen: d.ticks_since_last_seen,
            beyondBuffer:        d.beyond_buffer,
            bufferSize:          d.buffer_size,
            windowStats:         d.window_stats, // {10:{count,of,in_window}, 20:{...}, 30:{...}} — poll-authoritative only
        };
    });
}

// Visual-only: bump last-seen for every digit except the one that just
// arrived, zero the one that did. Never touches windowStats counts.
function advanceClientAbsence(arrivedDigit) {
    Object.keys(clientAbsence).forEach(digitKey => {
        const digit = parseInt(digitKey, 10);
        const state = clientAbsence[digit];
        if (!state) return;
        if (digit === arrivedDigit) {
            state.ticksSinceLastSeen = 0;
            state.beyondBuffer = false;
        } else if (!state.beyondBuffer) {
            state.ticksSinceLastSeen++;
        }
    });
}

// Renders every window that currently has a visible container in the DOM —
// that's either the active mother-panel tab, or any detached floating widget.
// Windows with no container present (docked but not the active tab) are
// simply skipped — nothing to update.
function renderAbsence() {
    ABSENCE_WINDOWS.forEach(renderDigitActivityPanel);
}

// Recency label per design rule #8: never "overdue", never implies a
// digit is "due". Just the observed gap, with NOW called out plainly.
function recencyLabel(state) {
    if (state.ticksSinceLastSeen === 0) return '● NOW';
    if (state.beyondBuffer) return '◷ ' + state.bufferSize + '+';
    return '◷ ' + state.ticksSinceLastSeen;
}

// Column header shared by the mother panel and every floating window,
// so the row layout below always lines up under it.
function digitActivityHeaderHTML() {
    return '<div style="display:flex;align-items:center;gap:8px;padding:0 6px 6px;">' +
        '<span style="width:14px;"></span>' +
        '<span style="flex:1;font-size:9px;color:var(--text-muted);letter-spacing:0.08em;">ACTIVITY</span>' +
        '<span style="width:32px;text-align:right;font-size:9px;color:var(--text-muted);letter-spacing:0.06em;">%</span>' +
        '<span style="width:34px;text-align:right;font-size:9px;color:var(--text-muted);letter-spacing:0.06em;">COUNT</span>' +
        '<span style="width:38px;text-align:right;font-size:9px;color:var(--text-muted);letter-spacing:0.06em;">RECENCY</span>' +
    '</div>';
}

// Digit activity row per design rule #6: digit, comparison bar, primary
// percentage, supporting count, recency — one compact row, tooltip
// carries the full explanation instead of a paragraph.
function renderDigitActivityPanel(windowSize) {
    const el = document.getElementById('digitActivity' + windowSize);
    if (!el) return;

    const digits = Object.keys(clientAbsence)
        .map(k => ({ digit: parseInt(k, 10), ...clientAbsence[k] }))
        .filter(d => d.windowStats && d.windowStats[windowSize]);

    if (digits.length === 0) { el.innerHTML = noDataBlock('No observations in this window yet.'); return; }

    digits.sort((a, b) => {
        const wa = a.windowStats[windowSize].count, wb = b.windowStats[windowSize].count;
        if (wb !== wa) return wb - wa;
        return a.ticksSinceLastSeen - b.ticksSinceLastSeen;
    });
    const maxCount = Math.max(...digits.map(d => d.windowStats[windowSize].count), 1);

    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px;">' +
        digits.map(d => {
            const w = d.windowStats[windowSize];
            const pct = w.of ? Math.round((w.count / w.of) * 100) : 0;
            const barPct = Math.round((w.count / maxCount) * 100);
            const isTop = w.count === maxCount && w.count > 0;
            const barColor = isTop ? SEM.accent : 'var(--text-secondary)';
            const isNow = d.ticksSinceLastSeen === 0;
            const recencyColor = isNow ? SEM.positive : 'var(--text-muted)';

            return '<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:var(--bg-panel);border-radius:6px;border:1px solid var(--border);" title="' + w.count + ' of the last ' + w.of + ' ticks">' +
                '<span style="font-size:13px;font-weight:700;width:14px;color:var(--text-primary);">' + d.digit + '</span>' +
                '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">' +
                    '<div style="height:6px;width:' + barPct + '%;background:' + barColor + ';opacity:' + (isTop ? '1' : '0.55') + ';transition:width 0.3s;"></div>' +
                '</div>' +
                '<span style="font-size:11px;font-weight:700;width:32px;text-align:right;color:var(--text-primary);">' + pct + '%</span>' +
                '<span style="font-size:9px;width:34px;text-align:right;color:var(--text-muted);">' + w.count + '/' + w.of + '</span>' +
                '<span style="font-size:10px;width:38px;text-align:right;color:' + recencyColor + ';font-weight:' + (isNow ? '700' : '400') + ';">' + recencyLabel(d) + '</span>' +
            '</div>';
        }).join('') +
    '</div>';
}

// ── Mother panel: tabs for whichever windows are NOT currently floating ──
function buildDigitActivityTabs() {
    const tabsEl = document.getElementById('digitActivityTabs');
    if (!tabsEl) return;

    const docked = ABSENCE_WINDOWS.filter(w => !detachedWindows.has(w));
    if (!docked.includes(activeDigitActivityTab) && docked.length) {
        activeDigitActivityTab = docked[0];
    }

    tabsEl.innerHTML = docked.map(w => {
        const active = w === activeDigitActivityTab;
        return '<span class="qp-tab" data-tab="' + w + '" title="Double-click, or press and hold, to pop out" style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:' + (active ? '700' : '400') + ';padding:4px 9px;border-radius:6px;background:' +
            (active ? 'var(--accent)' : 'var(--bg-secondary)') + ';color:' + (active ? 'var(--bg-main)' : 'var(--text-secondary)') + ';">' +
            w + ' Ticks' +
            '<span class="qp-detach" data-detach="' + w + '" title="Pop out" style="display:inline-flex;opacity:0.9;">' + icon('expand', 11, active ? 'var(--bg-main)' : SEM.accent) + '</span>' +
        '</span>';
    }).join('');

    attachTabInteractions(tabsEl);
    renderMotherBody();
}

// Interaction model: a normal click switches the active tab. A
// double-click, a press-and-hold, or the small pop-out icon all detach
// the window into a floating panel — and when triggered by hold or
// double-click, the panel spawns already "grabbed" by the cursor so it
// can be dragged into place in one motion, instead of detach-then-drag
// as two separate steps.
function attachTabInteractions(tabsEl) {
    tabsEl.querySelectorAll('.qp-tab').forEach(tab => {
        const w = parseInt(tab.dataset.tab, 10);
        let pressTimer = null;
        let firedByHold = false;

        const detachIcon = tab.querySelector('[data-detach]');
        if (detachIcon) detachIcon.addEventListener('click', function(e) {
            e.stopPropagation();
            detachDigitActivityWindow(w, e.clientX, e.clientY, false);
        });

        tab.addEventListener('mousedown', function(e) {
            if (e.target.closest('[data-detach]')) return;
            firedByHold = false;
            pressTimer = setTimeout(function() {
                firedByHold = true;
                detachDigitActivityWindow(w, e.clientX, e.clientY, true);
            }, LONG_PRESS_MS);
        });
        ['mouseup', 'mouseleave'].forEach(function(evt) {
            tab.addEventListener(evt, function() { clearTimeout(pressTimer); });
        });

        tab.addEventListener('dblclick', function(e) {
            if (e.target.closest('[data-detach]')) return;
            detachDigitActivityWindow(w, e.clientX, e.clientY, true);
        });

        tab.addEventListener('click', function(e) {
            if (firedByHold || e.target.closest('[data-detach]')) { firedByHold = false; return; }
            activeDigitActivityTab = w;
            buildDigitActivityTabs();
        });
    });
}

function renderMotherBody() {
    const bodyEl = document.getElementById('digitActivityMotherBody');
    if (!bodyEl) return;

    if (detachedWindows.size === ABSENCE_WINDOWS.length) {
        bodyEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px 0;display:flex;align-items:center;gap:6px;">All windows are floating — use ' + icon('collapse', 12, SEM.accent) + ' on a floating panel to dock it back here.</div>';
        return;
    }

    bodyEl.innerHTML = digitActivityHeaderHTML() + '<div id="digitActivity' + activeDigitActivityTab + '"></div>';
    renderDigitActivityPanel(activeDigitActivityTab);
}

// ── Detach a window into its own floating widget / dock it back ─────
function detachDigitActivityWindow(w, clientX, clientY, startDrag) {
    if (detachedWindows.has(w)) return;
    detachedWindows.add(w);
    buildDigitActivityTabs();
    createFloatingDigitActivity(w, clientX, clientY, startDrag);
}

function dockDigitActivityWindow(w) {
    detachedWindows.delete(w);
    const floatEl = document.getElementById('float_digitActivity' + w);
    if (floatEl) floatEl.remove();
    activeDigitActivityTab = w;
    buildDigitActivityTabs();
}

function createFloatingDigitActivity(w, spawnX, spawnY, startDrag) {
    let pos = { left: 220 + w, top: 140 + w, width: 260, height: 240 };
    const stored = localStorage.getItem(FLOAT_STORAGE_PREFIX + 'digitActivity' + w);
    if (stored) {
        try { pos = { ...pos, ...JSON.parse(stored) }; } catch (e) {}
    }
    if (typeof spawnX === 'number' && typeof spawnY === 'number') {
        pos.left = Math.max(8, spawnX - pos.width / 2);
        pos.top = Math.max(8, spawnY - 18);
    }

    const el = document.createElement('div');
    el.className = 'panel';
    el.id = 'float_digitActivity' + w;
    el.style.cssText = 'position:fixed;left:' + pos.left + 'px;top:' + pos.top + 'px;width:' + pos.width + 'px;height:' + pos.height + 'px;z-index:500;box-shadow:0 10px 30px rgba(0,0,0,0.55);overflow:auto;border-top:2px solid ' + SEM.accent + ';';
    el.innerHTML =
        '<div class="panel-title" style="cursor:move;display:flex;justify-content:space-between;align-items:center;font-weight:700;">' +
            '<span style="display:flex;align-items:center;gap:6px;">' + icon('hash', 13, 'var(--text-secondary)') + 'DIGIT ACTIVITY — ' + w + ' Ticks</span>' +
            '<span data-dock="' + w + '" title="Dock back into main panel" style="cursor:pointer;display:inline-flex;">' + icon('collapse', 13, SEM.accent) + '</span>' +
        '</div>' +
        digitActivityHeaderHTML() +
        '<div id="digitActivity' + w + '" style="margin-top:2px;"></div>' +
        '<div class="float-resize-handle" title="Resize" style="position:absolute;right:3px;bottom:3px;width:16px;height:16px;cursor:nwse-resize;opacity:0.6;">' + icon('expand', 11, SEM.neutral) + '</div>';

    document.body.appendChild(el);
    el.querySelector('[data-dock]').addEventListener('click', () => dockDigitActivityWindow(w));

    const drag = makeElementDraggable(el, 'digitActivity' + w);
    renderDigitActivityPanel(w);

    // Spawned by a long-press or double-click: hand control straight to
    // the drag handler so the user can place it in one continuous motion.
    if (startDrag && typeof spawnX === 'number') {
        drag.startFromPoint(spawnX, spawnY);
    }
}

// Shared drag+resize for a truly floating (position:fixed) element.
// Exposes startFromPoint so a caller can begin a drag programmatically
// (e.g. right after the panel is created by a long-press).
function makeElementDraggable(el, storageId) {
    const header = el.querySelector('.panel-title');
    const resizeHandle = el.querySelector('.float-resize-handle');
    let dragging = false, resizing = false;
    let startX, startY, startLeft, startTop, startW, startH;

    function saveState() {
        const rect = el.getBoundingClientRect();
        localStorage.setItem(FLOAT_STORAGE_PREFIX + storageId, JSON.stringify({
            left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        }));
    }

    function beginDrag(clientX, clientY) {
        dragging = true;
        startX = clientX; startY = clientY;
        const rect = el.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
    }

    header.addEventListener('mousedown', function(e) {
        if (e.target.closest('[data-dock]')) return;
        beginDrag(e.clientX, e.clientY);
        e.preventDefault();
    });

    resizeHandle.addEventListener('mousedown', function(e) {
        resizing = true;
        startX = e.clientX; startY = e.clientY;
        const rect = el.getBoundingClientRect();
        startW = rect.width; startH = rect.height;
        e.preventDefault(); e.stopPropagation();
    });

    document.addEventListener('mousemove', function(e) {
        if (dragging) {
            el.style.left = (startLeft + e.clientX - startX) + 'px';
            el.style.top = (startTop + e.clientY - startY) + 'px';
        } else if (resizing) {
            el.style.width = Math.max(220, startW + e.clientX - startX) + 'px';
            el.style.height = Math.max(160, startH + e.clientY - startY) + 'px';
        }
    });

    document.addEventListener('mouseup', function() {
        if (dragging || resizing) saveState();
        dragging = false; resizing = false;
    });

    return {
        startFromPoint: function(clientX, clientY) { beginDrag(clientX, clientY); },
    };
}