import { api } from '../api.js';
import { auth } from '../auth.js';
import { subscribeSymbol } from '../ws.js';
import { renderSidebar, initSidebar } from './sidebar.js';

function toast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// Apply the stored theme immediately, before the sidebar module's own
// init runs, so there's no flash of the wrong theme on first paint.
// This mirrors sidebar.js's applyTheme() exactly -- if that mapping
// ever changes, update it here too.
(function applyStoredThemeEarly() {
    try {
        const t = localStorage.getItem('qp-theme') || 'obsidian';
        const map = { obsidian: '', 'titanium-blue': 'titanium-blue', 'carbon-redline': 'carbon-redline' };
        document.documentElement.setAttribute('data-theme', map[t] || '');
    } catch (e) {}
})();

const ACCOUNT_STORAGE_KEY = 'qp_selected_account';

// Digit Distribution / Cluster Analysis are backed by the same
// authority analysis.js uses -- AnalysisEngine::observe() over
// tick_stream -- instead of a client-side count that starts at zero on
// every page load. distributionLookback (declared below) defaults to
// 1000 and is user-adjustable via the input next to the panel title;
// 5000 is AnalysisEngine::MAX_TICKS, the API's hard ceiling, so input
// values are clamped to that in loadDistribution(). This also
// guarantees Dashboard and Analysis can never show contradictory digit
// stats for the same symbol -- they're reading the same number.
const DISTRIBUTION_POLL_MS = 5000;
const HEARTBEAT_MAX_POINTS = 60;

let selectedSymbol   = 'R_25';
let unsubscribeTicks = null;

// Populated by loadMarkets()/loadContractTypes() so Quick Trade can turn
// "R_25" + "DIGITOVER" into the symbol_id / contract_type_id the API
// actually needs. Empty until those calls resolve.
let symbolsByCode      = {};   // symbol string -> full symbol record (needs .id)
let contractTypesByName = {};  // e.g. 'DIGITOVER' -> full contract_type record (needs .id, .requires_barrier)

let selectedAccountId = null;  // drives both Quick Trade and Risk Monitor
let accountsList       = [];

// Purely the live pulse -- last few dozen arriving digits, for the
// heartbeat visual only. Never used to compute a displayed percentage;
// that's serverFrequency's job.
let heartbeatPoints = [];

// The one source of truth for Digit Distribution + Cluster Analysis.
let serverFrequency   = null;
let distributionLookback = 1000; // user-adjustable via the input next to the panel title; drives both Digit Distribution and Cluster Analysis, since both read from the same server call
let distributionPollId = null;

export async function render(app, navigate) {
    // Markets list renders inside the shared sidebar via extraTopHTML --
    // it's page-specific content (live symbol picker), everything else
    // in the sidebar (nav, theme, logout) comes from sidebar.js.
    const marketsSectionHTML =
        '<div style="font-size:10px;color:var(--text-muted);padding:4px 10px;letter-spacing:0.1em;">MARKETS</div>' +
        '<div id="marketList" style="margin-top:6px;margin-bottom:4px;"></div>';

    app.innerHTML =
        '<div class="edge-left"></div>' +
        '<div class="edge-right"></div>' +
        '<div class="edge-bottom"></div>' +
        '<div style="display:flex;height:100vh;overflow:hidden;background:var(--bg-main);">' +

        renderSidebar('dashboard', { extraTopHTML: marketsSectionHTML }) +

        // MAIN
        '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +

            // TOP BAR
            '<div style="height:48px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:16px;flex-shrink:0;flex-wrap:wrap;">' +
                '<span class="live-dot"></span>' +
                '<span id="topSymbol" style="font-weight:600;font-size:13px;color:var(--accent);">R_25</span>' +
                '<span id="topPrice" style="font-size:13px;color:var(--text-primary);">--</span>' +
                '<span id="topDigit" style="font-size:11px;color:var(--text-muted);">Last digit: --</span>' +
                '<div style="flex:1;"></div>' +
                '<span style="font-size:11px;color:var(--text-muted);">Account</span>' +
                '<select id="accountPicker" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text-primary);font-size:11px;cursor:pointer;max-width:200px;">' +
                    '<option value="">Loading…</option>' +
                '</select>' +
                '<span id="topTime" style="font-size:11px;color:var(--text-muted);"></span>' +
            '</div>' +

            // GRID
            '<div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr 320px;grid-template-rows:auto auto;gap:12px;">' +

                // PANEL 1 - LIVE TICK
                '<div class="panel">' +
                    '<div class="panel-title"><span class="live-dot"></span>LIVE TICK</div>' +
                    '<div id="tickSymbol" style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">R_25 - Volatility 25 Index</div>' +
                    '<div id="tickPrice" style="font-size:48px;font-weight:700;color:var(--text-primary);letter-spacing:-1px;line-height:1;">--</div>' +
                    '<div style="display:flex;align-items:center;gap:12px;margin-top:8px;">' +
                        '<span style="font-size:11px;color:var(--text-muted);">Last digit:</span>' +
                        '<span id="lastDigit" style="font-size:24px;font-weight:700;color:var(--accent);">--</span>' +
                    '</div>' +
                    '<div id="sparkline" style="margin-top:12px;height:40px;display:flex;align-items:flex-end;gap:2px;"></div>' +
                '</div>' +

                // PANEL 2 - DIGIT DISTRIBUTION
                '<div class="panel">' +
                    '<div class="panel-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
                        '<span>DIGIT DISTRIBUTION</span>' +
                        '<span style="display:flex;align-items:center;gap:5px;font-size:9px;font-weight:400;color:var(--text-muted);">' +
                            'last <input id="distLookbackInput" type="number" min="10" max="5000" step="10" value="1000" style="width:56px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:2px 4px;color:var(--text-primary);font-size:10px;text-align:center;">' +
                            ' ticks · server' +
                        '</span>' +
                    '</div>' +
                    '<div id="digitChart" style="display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:8px;margin-top:8px;"></div>' +
                    '<div style="display:flex;gap:6px;" id="digitLabels"></div>' +
                '</div>' +

                // PANEL 3 - AI SIGNAL (spans 2 rows)
                '<div class="panel" style="grid-row:span 2;">' +
                    '<div class="panel-title">AI SIGNAL ENGINE</div>' +
                    '<div id="aiSignal" style="text-align:center;margin:16px 0;">' +
                        '<div style="font-size:11px;color:var(--text-muted);">Loading...</div>' +
                    '</div>' +
                    '<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px;">' +
                        '<div class="panel-title">QUICK TRADE</div>' +
                        '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
                            '<button class="btn btn-profit" style="flex:1;" onclick="quickTrade(\'DIGITOVER\')">OVER</button>' +
                            '<button class="btn btn-loss" style="flex:1;" onclick="quickTrade(\'DIGITUNDER\')">UNDER</button>' +
                        '</div>' +
                        '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
                            '<button class="btn btn-profit" style="flex:1;font-size:11px;" onclick="quickTrade(\'DIGITEVEN\')">EVEN</button>' +
                            '<button class="btn btn-loss" style="flex:1;font-size:11px;" onclick="quickTrade(\'DIGITODD\')">ODD</button>' +
                        '</div>' +
                        '<div style="display:flex;align-items:center;gap:8px;margin-top:12px;">' +
                            '<span style="font-size:11px;color:var(--text-muted);">Stake $</span>' +
                            '<input id="stakeInput" type="number" value="1" min="0.35" step="0.5" style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:13px;font-weight:600;">' +
                        '</div>' +
                        '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">' +
                            '<span style="font-size:11px;color:var(--text-muted);">Ticks</span>' +
                            '<input id="durationInput" type="number" value="5" min="1" step="1" style="width:60px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:13px;font-weight:600;">' +
                            '<span style="font-size:11px;color:var(--text-muted);margin-left:8px;">Barrier</span>' +
                            '<input id="barrierInput" type="number" value="5" min="0" max="9" step="1" style="width:60px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:13px;font-weight:600;" title="Used for OVER/UNDER only">' +
                        '</div>' +
                    '</div>' +
                    '<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px;">' +
                        '<div class="panel-title">ACTIVE BOTS</div>' +
                        '<div id="botStatus"><div style="font-size:11px;color:var(--text-muted);">No active bots</div></div>' +
                    '</div>' +
                    '<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px;">' +
                        '<div class="panel-title">RISK MONITOR</div>' +
                        '<div id="riskMonitorBody"><div style="font-size:11px;color:var(--text-muted);">Loading...</div></div>' +
                    '</div>' +
                '</div>' +

                // PANEL 4 - CLUSTER ANALYSIS
                '<div class="panel" style="grid-column:span 2;">' +
                    '<div class="panel-title" style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span>CLUSTER ANALYSIS</span>' +
                        '<span style="font-size:9px;font-weight:400;color:var(--text-muted);">live flow · figures from last <span id="clusterLookbackLabel">—</span> ticks, server-verified</span>' +
                    '</div>' +
                    // Heartbeat: purely a live "tick flow" visual, driven by
                    // the WebSocket stream. It never supplies a displayed
                    // percentage -- those come from serverFrequency below.
                    // Line color reflects the recent (last 10 ticks)
                    // lower/upper lean, a fast read distinct from the
                    // long-run server percentages under it.
                    '<svg id="heartbeatSvg" viewBox="0 0 300 56" preserveAspectRatio="none" style="width:100%;height:56px;margin:10px 0 4px;display:block;">' +
                        '<line x1="0" y1="28" x2="300" y2="28" stroke="var(--border)" stroke-width="1"/>' +
                        '<polyline id="heartbeatLine" points="" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<circle id="heartbeatPulse" cx="0" cy="28" r="3" fill="var(--accent)"/>' +
                    '</svg>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px;">' +
                        '<div style="font-size:11px;color:var(--text-muted);">Lower (0-4)</div>' +
                        '<div style="font-size:20px;font-weight:700;color:var(--profit);" id="clusterLower">--</div>' +
                        '<div style="font-size:11px;color:var(--text-muted);">Upper (5-9)</div>' +
                        '<div style="font-size:20px;font-weight:700;color:var(--accent);" id="clusterUpper">--</div>' +
                        '<div style="font-size:11px;color:var(--text-muted);">Even digits</div>' +
                        '<div style="font-size:20px;font-weight:700;color:var(--profit);" id="clusterEven">--</div>' +
                        '<div style="font-size:11px;color:var(--text-muted);">Odd digits</div>' +
                        '<div style="font-size:20px;font-weight:700;color:var(--accent);" id="clusterOdd">--</div>' +
                    '</div>' +
                    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);" id="clusterInsights">Loading...</div>' +
                '</div>' +

            '</div>' +
        '</div>' +
        '</div>';

    // Build digit labels
    const labels = document.getElementById('digitLabels');
    if (labels) {
        labels.innerHTML = [0,1,2,3,4,5,6,7,8,9].map(d =>
            '<div style="flex:1;text-align:center;font-size:10px;color:var(--text-muted);">' + d + '</div>'
        ).join('');
    }

    // Clock
    setInterval(() => {
        const el = document.getElementById('topTime');
        if (el) el.textContent = new Date().toLocaleTimeString();
    }, 1000);

    // Sidebar nav / theme swatches / logout — all handled by the shared module now
    initSidebar(app, navigate, {
        onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
    });

    window.quickTrade = submitQuickTrade;

    injectHeartbeatStyles();

    // Load data
    loadMarkets();
    loadContractTypes();
    loadAccounts();     // also kicks off the first Risk Monitor load
    loadAI();
    loadBots();
    startTicks();

    heartbeatPoints = [];
    renderHeartbeat();
    loadDistribution(); // immediate fetch, same "user-visible page load -> immediate request" rule analysis.js follows
    document.getElementById('distLookbackInput')?.addEventListener('change', function() {
        loadDistribution(); // immediate — user changed the sample size, old numbers are for a different window
    });
    if (distributionPollId) clearInterval(distributionPollId);
    distributionPollId = setInterval(loadDistribution, DISTRIBUTION_POLL_MS);
}

async function loadMarkets() {
    const res = await api.symbols();
    if (!res || !res.success) return;

    // Confirmed against MarketController::symbols() -- it always returns
    // {success, symbols}, never `.data`. Kept the `.data` fallback anyway
    // in case that controller shape ever changes; the point is this can
    // no longer silently render empty on either shape.
    const rawList = res.symbols || res.data || [];

    // Codes confirmed against the real `symbols` table -- no underscore
    // on BOOM/CRASH (BOOM1000, not BOOM_1000).
    const priority = ['R_25','R_50','R_75','R_100','1HZ25V','1HZ50V','BOOM1000','CRASH1000'];
    const symbols = [...rawList].sort(function(a, b) {
        const ai = priority.indexOf(a.symbol);
        const bi = priority.indexOf(b.symbol);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Keep a lookup so Quick Trade can resolve selectedSymbol -> symbol_id.
    symbolsByCode = {};
    symbols.forEach(s => { symbolsByCode[s.symbol] = s; });

    const list = document.getElementById('marketList');
    if (!list) return;

    if (!symbols.length) {
        list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:4px 10px;">No markets available.</div>';
        return;
    }

    // Shows every market the account actually has -- no cap. The sidebar
    // section scrolls with the rest of the page if the list runs long.
    list.innerHTML = symbols.map(function(s) {
        return '<div onclick="selectSymbol(\'' + s.symbol + '\')" id="mkt-' + s.symbol + '" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;border-left:2px solid transparent;">' +
            '<span style="width:6px;height:6px;border-radius:50%;background:var(--profit);flex-shrink:0;"></span>' +
            '<span style="font-size:11px;color:var(--text-secondary);">' + (s.display_name || s.symbol) + '</span>' +
        '</div>';
    }).join('');

    window.selectSymbol = function(symbol) {
        selectedSymbol = symbol;
        sparkPrices = [];
        heartbeatPoints = [];
        renderHeartbeat();
        const ts = document.getElementById('topSymbol');
        const tk = document.getElementById('tickSymbol');
        if (ts) ts.textContent = symbol;
        if (tk) tk.textContent = symbol + ' - Live';
        toast('Switched to ' + symbol, 'info');
        highlightMarket(symbol);
        startTicks(); // resubscribe to the new symbol's channel
        loadDistribution(); // immediate — the symbol changed, the old numbers are for a different market
        loadAI(); // immediate — AI Signal is per-symbol now, old symbol's prediction no longer applies
    };

    highlightMarket(selectedSymbol);
}

function highlightMarket(symbol) {
    document.querySelectorAll('[id^="mkt-"]').forEach(function(el) {
        const active = el.id === 'mkt-' + symbol;
        el.style.borderLeftColor = active ? 'var(--accent)' : 'transparent';
        el.style.background = active ? 'var(--bg-panel)' : 'transparent';
    });
}

// Loaded once so Quick Trade can resolve 'DIGITOVER' -> {id, requires_barrier}
// without a network round-trip on every click.
async function loadContractTypes() {
    try {
        const res = await api.contractTypes();
        const list = (res && res.data) || [];
        contractTypesByName = {};
        list.forEach(ct => { contractTypesByName[ct.name] = ct; });
    } catch (e) {
        contractTypesByName = {};
    }
}

// ── Account selector: drives Quick Trade's account_id and Risk Monitor ──
async function loadAccounts() {
    const picker = document.getElementById('accountPicker');
    let res;
    try {
        res = await api.myAccounts();
    } catch (e) {
        res = null;
    }

    // TODO-VERIFY: assumes myAccounts() returns { success, data: [...] }
    // with fields id / broker_account_id / account_type_name / is_virtual /
    // currency, matching the shape BotController::botDetail() already
    // joins. Adjust the label line below if your accounts payload differs.
    accountsList = (res && res.success && res.data) || [];

    if (!picker) return;

    if (!accountsList.length) {
        // Legitimately empty state -- no accounts connected yet for this
        // user. Not a bug; Quick Trade / Risk Monitor correctly disable
        // themselves until one is connected.
        picker.innerHTML = '<option value="">No accounts connected</option>';
        selectedAccountId = null;
        renderRisk(null, 'no_account');
        return;
    }

    const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    const storedValid = accountsList.some(a => String(a.id) === stored);
    selectedAccountId = storedValid ? Number(stored) : accountsList[0].id;

    picker.innerHTML = accountsList.map(a => {
        const label = (a.account_type_name ? a.account_type_name + ' · ' : '') +
            (a.broker_account_id || ('#' + a.id)) +
            (a.is_virtual ? ' (Demo)' : '');
        return '<option value="' + a.id + '"' + (a.id === selectedAccountId ? ' selected' : '') + '>' + label + '</option>';
    }).join('');

    picker.addEventListener('change', function() {
        selectedAccountId = Number(this.value) || null;
        if (selectedAccountId) localStorage.setItem(ACCOUNT_STORAGE_KEY, String(selectedAccountId));
        loadRisk();
    });

    loadRisk();
}

async function loadRisk() {
    if (!selectedAccountId) { renderRisk(null, 'no_account'); return; }

    const el = document.getElementById('riskMonitorBody');
    if (el) el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">Loading...</div>';

    try {
        const res = await api.accountExposure(selectedAccountId);
        // Confirmed against RiskController::exposure() -- the payload
        // key is `exposure`, not `data`.
        if (!res || !res.success || !res.exposure) { renderRisk(null, 'error'); return; }
        renderRisk(res.exposure, null);
    } catch (e) {
        renderRisk(null, 'error');
    }
}

function renderRisk(data, errorKind) {
    const el = document.getElementById('riskMonitorBody');
    if (!el) return;

    if (errorKind === 'no_account') {
        el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">Connect an account to see exposure.</div>';
        return;
    }
    if (errorKind === 'error' || !data) {
        el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">Exposure data unavailable.</div>';
        return;
    }

    // TODO-VERIFY (narrower now): RiskController::exposure() confirmed
    // the wrapper key is `exposure`, fixed in loadRisk() above. The
    // field names *inside* that object still come from unseen
    // RiskGuardService::calculate() -- these two lookups remain a best
    // guess at its zone vocabulary (green/orange/red), matching what
    // evaluateProposedTrade() uses elsewhere.
    const pct = Math.max(0, Math.min(100, Math.round(Number(data.exposure_percentage ?? data.used_percentage ?? 0))));
    const zone = String(data.zone || data.projected_zone || 'green').toLowerCase();
    const zoneColor = zone === 'red' ? 'var(--loss)' : zone === 'orange' ? 'var(--warning, #d99a2b)' : 'var(--profit)';
    const zoneLabel = zone === 'red' ? 'High risk' : zone === 'orange' ? 'Elevated risk' : 'Low risk';

    el.innerHTML =
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
            '<span style="font-size:11px;color:var(--text-muted);">Daily exposure</span>' +
            '<span style="font-size:11px;color:' + zoneColor + ';">' + zoneLabel + '</span>' +
        '</div>' +
        '<div style="background:var(--border);border-radius:4px;height:6px;">' +
            '<div style="background:' + zoneColor + ';height:6px;border-radius:4px;width:' + pct + '%;"></div>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">' + pct + '% used</div>';
}

// ── Quick Trade: now actually places an order instead of only toasting ──
async function submitQuickTrade(contractName) {
    const stake = parseFloat(document.getElementById('stakeInput').value) || 1;
    const durationTicks = parseInt(document.getElementById('durationInput').value, 10) || 5;
    const barrier = document.getElementById('barrierInput').value;

    if (!selectedAccountId) {
        toast('Select an account first.', 'error');
        return;
    }

    const symbolRecord = symbolsByCode[selectedSymbol];
    if (!symbolRecord) {
        toast('Symbol data still loading — try again in a moment.', 'error');
        return;
    }

    const contractType = contractTypesByName[contractName];
    if (!contractType) {
        toast('Contract type data still loading — try again in a moment.', 'error');
        return;
    }

    const payload = {
        account_id: selectedAccountId,
        symbol_id: symbolRecord.id,
        contract_type_id: contractType.id,
        stake,
        duration_ticks: durationTicks,
        barrier: contractType.requires_barrier ? barrier : null,
    };

    await placeOrderWithRiskConfirm(payload, contractName);
}

async function placeOrderWithRiskConfirm(payload, contractName, confirmRisk = false) {
    try {
        const res = await api.placeOrder(payload, confirmRisk);

        if (!res.success && res.needs_confirmation) {
            const proceed = window.confirm(
                (res.message || 'This trade increases account exposure.') + ' Place it anyway?'
            );
            if (proceed) {
                await placeOrderWithRiskConfirm(payload, contractName, true);
            } else {
                toast('Trade cancelled.', 'info');
            }
            return;
        }

        if (!res.success) {
            toast(res.message || 'Order failed.', 'error');
            return;
        }

        toast(contractName + ' placed — $' + payload.stake, 'success');
        loadRisk(); // exposure just changed
    } catch (e) {
        toast('Order failed — network error.', 'error');
    }
}

function startTicks() {
    if (unsubscribeTicks) {
        unsubscribeTicks();
        unsubscribeTicks = null;
    }

    unsubscribeTicks = subscribeSymbol(selectedSymbol, function(tick) {
        const priceStr = tick.price.toFixed(tick.pip_size ?? 2);
        const lastDigit = tick.last_digit;

        updateTick(priceStr, lastDigit);
        pushHeartbeat(lastDigit);
        updateSparkline(tick.price);
    });
}

function updateTick(price, digit) {
    const color = digit % 2 === 0 ? 'var(--profit)' : 'var(--accent)';
    const p = document.getElementById('tickPrice');
    const d = document.getElementById('lastDigit');
    const tp = document.getElementById('topPrice');
    const td = document.getElementById('topDigit');
    if (p)  { p.textContent = price; p.style.color = color; }
    if (d)  { d.textContent = digit; d.style.color = color; }
    if (tp) tp.textContent = price;
    if (td) td.textContent = 'Last digit: ' + digit;
}

// ── Digit Distribution + Cluster Analysis: the one source of truth ──
// Both panels are computed from AnalysisEngine::observe() -- the exact
// same call analysis.js makes -- instead of a client-side tally that
// starts from zero on every page load. That's what makes a single digit
// reading "16.3%" possible on a fresh page: too small a sample. Pulling
// from distributionLookback real ticks server-side, on a poll, fixes
// that and keeps this page consistent with Analysis.
async function loadDistribution() {
    if (!selectedSymbol) return;

    // Read whatever the user currently has in the input -- clamp to a
    // sane range so a stray value (blank, 0, 50000) can't send a bad
    // request. If it's out of range we correct the input back to the
    // clamped value, so what's displayed always matches what was sent.
    const input = document.getElementById('distLookbackInput');
    if (input) {
        const val = parseInt(input.value, 10);
        if (val && val >= 10) {
            distributionLookback = Math.min(val, 5000);
        }
        input.value = distributionLookback;
    }

    try {
        const res = await api.observe(selectedSymbol, distributionLookback);
        if (!res.success || !Array.isArray(res.frequency) || !res.frequency.length) {
            renderDistributionUnavailable();
            return;
        }
        serverFrequency = res.frequency;

        // Cluster Analysis reads the same call, so its label just mirrors
        // whatever the server actually returned (which may be slightly
        // less than requested if the symbol doesn't have that much history
        // yet) -- Digit Distribution's own count is the input itself.
        const clusterLabel = document.getElementById('clusterLookbackLabel');
        if (clusterLabel) clusterLabel.textContent = res.sample_size || distributionLookback;

        renderDigitChart(serverFrequency);
        renderClusterStats(serverFrequency);
    } catch (e) {
        renderDistributionUnavailable();
    }
}

function renderDistributionUnavailable() {
    const chart = document.getElementById('digitChart');
    if (chart) chart.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px 0;">Distribution data unavailable.</div>';

    const insights = document.getElementById('clusterInsights');
    if (insights) insights.textContent = 'Distribution data unavailable.';

    ['clusterLower', 'clusterUpper', 'clusterEven', 'clusterOdd'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '--';
    });
}

function renderDigitChart(freq) {
    const chart = document.getElementById('digitChart');
    if (!chart) return;
    const maxVal = Math.max(...freq.map(f => f.count)) || 1;
    chart.innerHTML = freq.map(function(f) {
        const h = Math.max(4, (f.count / maxVal) * 72);
        const col = f.digit % 2 === 0 ? 'var(--profit)' : 'var(--accent)';
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
            '<div style="font-size:9px;color:var(--text-muted);">' + f.percentage + '%</div>' +
            '<div style="width:100%;height:' + h + 'px;background:' + col + ';border-radius:3px;opacity:0.8;transition:height 0.3s;"></div>' +
        '</div>';
    }).join('');
}

function renderClusterStats(freq) {
    const total = freq.reduce((s, f) => s + f.count, 0) || 1;
    const lower = freq.filter(f => f.digit <= 4).reduce((s, f) => s + f.count, 0);
    const upper = total - lower;
    const even = freq.filter(f => f.digit % 2 === 0).reduce((s, f) => s + f.count, 0);
    const odd = total - even;

    const set = function(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('clusterLower', ((lower / total) * 100).toFixed(1) + '%');
    set('clusterUpper', ((upper / total) * 100).toFixed(1) + '%');
    set('clusterEven',  ((even / total) * 100).toFixed(1) + '%');
    set('clusterOdd',   ((odd / total) * 100).toFixed(1) + '%');

    const insights = document.getElementById('clusterInsights');
    if (insights) {
        const bias = lower > upper ? 'Lower cluster dominant' : upper > lower ? 'Upper cluster dominant' : 'Lower/upper balanced';
        const parity = even > odd ? 'Even bias detected' : odd > even ? 'Odd bias detected' : 'Even/odd balanced';
        insights.innerHTML = '<span style="color:var(--profit);">-> ' + bias + '</span>&nbsp;&nbsp;<span style="color:var(--accent);">-> ' + parity + '</span>';
    }
}

// ── Heartbeat: live tick-flow visual only, never a data source ──────
// A scrolling EKG-style line built from the raw arriving digits. Its
// color reflects the recent (last 10 ticks) lower/upper lean -- a fast,
// intentionally noisy read on flow -- kept visually and logically
// separate from the long-run, server-verified percentages in the grid
// below it, so the two never contradict each other's job.
function pushHeartbeat(digit) {
    heartbeatPoints.push(digit);
    if (heartbeatPoints.length > HEARTBEAT_MAX_POINTS) heartbeatPoints.shift();
    renderHeartbeat();
}

function renderHeartbeat() {
    const poly = document.getElementById('heartbeatLine');
    const pulse = document.getElementById('heartbeatPulse');
    if (!poly) return;

    const w = 300, h = 56, pad = 6;
    const n = heartbeatPoints.length;

    if (n === 0) {
        poly.setAttribute('points', '');
        return;
    }

    const stepX = n > 1 ? w / (n - 1) : 0;
    const toY = (d) => h - pad - (d / 9) * (h - pad * 2);

    const points = heartbeatPoints.map(function(d, i) {
        const x = n > 1 ? i * stepX : w;
        return x.toFixed(1) + ',' + toY(d).toFixed(1);
    }).join(' ');
    poly.setAttribute('points', points);

    const recent = heartbeatPoints.slice(-10);
    const lowerCount = recent.filter(d => d <= 4).length;
    const color = lowerCount >= recent.length / 2 ? 'var(--profit)' : 'var(--accent)';
    poly.setAttribute('stroke', color);

    if (pulse) {
        const lastDigit = heartbeatPoints[n - 1];
        const x = n > 1 ? (n - 1) * stepX : w;
        pulse.setAttribute('cx', x.toFixed(1));
        pulse.setAttribute('cy', toY(lastDigit).toFixed(1));
        pulse.setAttribute('fill', color);
        // Restart the pulse animation on every beat.
        pulse.classList.remove('qp-heartbeat-pulse');
        void pulse.getBBox(); // force reflow so the animation can restart
        pulse.classList.add('qp-heartbeat-pulse');
    }
}

function injectHeartbeatStyles() {
    if (document.getElementById('qpHeartbeatStyles')) return;
    const style = document.createElement('style');
    style.id = 'qpHeartbeatStyles';
    style.textContent =
        '@keyframes qpHeartbeatPulse { 0% { r: 3; opacity: 1; } 100% { r: 9; opacity: 0; } }' +
        '.qp-heartbeat-pulse { animation: qpHeartbeatPulse 0.6s ease-out; }';
    document.head.appendChild(style);
}

let sparkPrices = [];
function updateSparkline(price) {
    sparkPrices.push(price);
    if (sparkPrices.length > 40) sparkPrices.shift();
    const chart = document.getElementById('sparkline');
    if (!chart) return;
    const min = Math.min.apply(null, sparkPrices);
    const max = Math.max.apply(null, sparkPrices);
    const range = max - min || 1;
    chart.innerHTML = sparkPrices.map(function(p) {
        const h = Math.max(2, ((p - min) / range) * 36);
        return '<div style="flex:1;height:' + h + 'px;background:var(--accent);opacity:0.6;border-radius:1px;"></div>';
    }).join('');
}

// ── AI Signal: renders the real ensemble_predictions row for the
// currently selected symbol. Confirmed against AiController -- there
// is no per-signal barrier or insights array; the real fields are
// final_signal, final_probability, confidence_score, confidence_grade,
// and a single explanation string. Uses api.prediction(symbol) (GET
// /ai/predictions/{symbol}), not api.predictions() (GET /ai/predictions,
// the last 50 across ALL symbols) -- the earlier version was showing
// whichever symbol happened to have the most recent prediction, not
// necessarily the one on screen.
async function loadAI() {
    const el = document.getElementById('aiSignal');
    if (!el) return;

    el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">Loading...</div>';

    let res;
    try {
        res = await api.prediction(selectedSymbol);
    } catch (e) {
        res = null;
    }

    const top = (res && res.success && res.data) || null;

    if (!top) {
        el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">No signal available yet for ' + selectedSymbol + '.</div>';
        return;
    }

    const probabilityPct = Math.round((Number(top.final_probability) || 0) * 100);
    const grade = top.confidence_grade || null;

    el.innerHTML =
        '<div style="font-size:28px;font-weight:800;color:var(--accent);letter-spacing:2px;">' + (top.final_signal || '—') + '</div>' +
        '<div style="margin-top:8px;">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                '<span style="font-size:11px;color:var(--text-muted);">Probability' + (grade ? ' · grade ' + grade : '') + '</span>' +
                '<span style="font-size:11px;color:var(--accent);">' + probabilityPct + '%</span>' +
            '</div>' +
            '<div style="background:var(--border);border-radius:4px;height:6px;">' +
                '<div style="background:var(--accent);height:6px;border-radius:4px;width:' + probabilityPct + '%;"></div>' +
            '</div>' +
        '</div>' +
        (top.explanation
            ? '<div style="margin-top:12px;text-align:left;font-size:11px;color:var(--profit);">-> ' + top.explanation + '</div>'
            : '');
}

async function loadBots() {
    const res = await api.myBots();
    const el = document.getElementById('botStatus');
    if (!el) return;

    if (!res.success || !res.data || !res.data.length) {
        el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">No active bots</div>';
        return;
    }

    el.innerHTML = res.data.slice(0, 3).map(function(bot) {
        const color = bot.status === 'running' ? 'var(--profit)' : 'var(--text-muted)';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">' +
            '<div>' +
                '<div style="font-size:12px;color:var(--text-primary);">' + bot.bot_name + '</div>' +
                '<div style="font-size:10px;color:var(--text-muted);">' + bot.status + '</div>' +
            '</div>' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';"></span>' +
        '</div>';
    }).join('');
}