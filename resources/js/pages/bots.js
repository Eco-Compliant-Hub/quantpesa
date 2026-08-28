import { api } from '../api.js';
import { auth } from '../auth.js';
import { showRiskConfirmModal } from '../riskConfirm.js';
import { subscribeBotUpdates } from '../botUpdates.js';
import { openBotMonitor } from '../botMonitor.js';
import { renderSidebar, initSidebar } from './sidebar.js';
import { getAnalysisContext, formatAnalysisContext, clearAnalysisContext, matchSymbolId, isAnalysisContextStale, getPersistedContextId } from './analysisContext.js';

export async function render(app, navigate) {
    app.innerHTML = `
        <div class="flex h-screen bg-[var(--bg-main)] overflow-hidden">

            ${renderSidebar('bots', { isAdmin: auth.isAdmin() })}

            <!-- Main Content -->
            <main class="flex-1 overflow-y-auto p-8">
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h2 class="text-2xl font-bold text-[var(--text-primary)]">My Bots</h2>
                        <p class="text-[var(--text-muted)] mt-1">Configure and run bots from an informed market decision.</p>
                    </div>
                </div>

                <div id="analysisContextCard" class="hidden panel p-5 mb-6" style="border-left:3px solid var(--accent);"></div>

                <!-- Bots List -->
                <div id="botsList">
                    <p class="text-[var(--text-muted)] text-sm">Loading bots...</p>
                </div>
            </main>

            <!-- Bot Detail / Configure Modal -->
            <div id="botModalOverlay" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
                <div id="botModal" class="panel p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
                    <!-- filled dynamically -->
                </div>
            </div>
        </div>
    `;

    // Sidebar nav / theme swatches / logout — shared module
    initSidebar(app, navigate, {
        onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
    });

    renderAnalysisContextCard();

    // Modal close on overlay click (not on modal itself)
    document.getElementById('botModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'botModalOverlay') closeModal();
    });

    await loadBots();

    function renderAnalysisContextCard() {
        const el = document.getElementById('analysisContextCard');
        if (!el) return;
        const context = getAnalysisContext();
        if (!context) { el.classList.add('hidden'); return; }
        const c = formatAnalysisContext(context);
        const stale = isAnalysisContextStale(context);
        el.classList.remove('hidden');
        el.innerHTML = `
            <div class="flex items-start justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold tracking-wide text-[var(--accent)]">ANALYSIS CONTEXT</span>
                        ${stale ? `<span class="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded" style="color:var(--warning, #d99a2b);background:color-mix(in srgb, var(--warning, #d99a2b) 18%, transparent);">CONTEXT IS OLD</span>` : ''}
                        ${!context.persisted ? `<span class="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded" style="color:var(--text-muted);background:var(--bg-secondary);">NOT SAVED</span>` : ''}
                    </div>
                    <div class="text-sm font-semibold text-[var(--text-primary)] mt-1">${c.symbol} · ${c.lookback} ticks · captured ${c.capturedAt}</div>
                    <div class="text-sm text-[var(--text-secondary)] mt-2">${c.state}</div>
                    <div class="text-xs text-[var(--text-muted)] mt-1">${c.quality} · Observed conditions only; not a prediction.</div>
                </div>
                <button id="clearAnalysisContextBtn" class="px-3 py-1.5 text-xs rounded-lg" style="background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-muted);">Clear</button>
            </div>`;
        document.getElementById('clearAnalysisContextBtn')?.addEventListener('click', () => {
            clearAnalysisContext();
            renderAnalysisContextCard();
        });
    }

    function renderBotCard(bot) {
        const statusStyle = {
            running: 'background:color-mix(in srgb, var(--profit) 18%, transparent);color:var(--profit);',
            paused: 'background:color-mix(in srgb, var(--warning, #d99a2b) 18%, transparent);color:var(--warning, #d99a2b);',
            parsed: 'background:color-mix(in srgb, var(--accent) 18%, transparent);color:var(--accent);',
        }[bot.status] || 'background:var(--bg-panel);color:var(--text-muted);';

        return `
            <div data-bot-card="${bot.id}" class="panel p-6 flex items-center justify-between cursor-pointer hover:border-[var(--accent)]/50 transition">
                <div>
                    <h3 class="font-semibold text-[var(--text-primary)]">${bot.bot_name}</h3>
                    <p class="text-[var(--text-muted)] text-sm mt-1">Created ${new Date(bot.created_at).toLocaleDateString()}</p>
                </div>
                <div class="flex items-center gap-4">
                    <span class="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide" style="${statusStyle}">
                        ${bot.status}
                    </span>
                    <div class="flex gap-2" data-action-zone>
                        ${bot.status === 'idle' || bot.status === 'stopped' ? `
                            <button data-bot-action="${bot.id}:start" class="btn btn-profit px-3 py-1 text-xs">
                                Start
                            </button>
                        ` : ''}
                        ${bot.status === 'running' ? `
                            <button data-bot-monitor="${bot.id}" class="px-3 py-1 text-[var(--bg-main)] text-xs font-medium rounded-lg transition" style="background:var(--accent);">
                                Monitor
                            </button>
                            <button data-bot-action="${bot.id}:pause" class="px-3 py-1 text-xs font-medium rounded-lg transition" style="background:var(--warning, #d99a2b);color:var(--bg-main);">
                                Pause
                            </button>
                            <button data-bot-action="${bot.id}:stop" class="btn btn-loss px-3 py-1 text-xs">
                                Stop
                            </button>
                        ` : ''}
                        ${bot.status === 'paused' ? `
                            <button data-bot-monitor="${bot.id}" class="px-3 py-1 text-[var(--bg-main)] text-xs font-medium rounded-lg transition" style="background:var(--accent);">
                                Monitor
                            </button>
                            <button data-bot-action="${bot.id}:resume" class="btn btn-profit px-3 py-1 text-xs">
                                Resume
                            </button>
                            <button data-bot-action="${bot.id}:stop" class="btn btn-loss px-3 py-1 text-xs">
                                Stop
                            </button>
                        ` : ''}
                        ${bot.status === 'parsed' ? `
                            <button data-bot-configure="${bot.id}" class="px-3 py-1 text-[var(--bg-main)] text-xs font-medium rounded-lg transition" style="background:var(--accent);">
                                Configure
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function renderSection(title, bots, accentColorVar) {
        if (bots.length === 0) return '';
        return `
            <div class="mb-8">
                <div class="flex items-center gap-2 mb-3">
                    <span class="w-2 h-2 rounded-full" style="background:${accentColorVar};"></span>
                    <h3 class="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide">${title}</h3>
                    <span class="text-xs text-[var(--text-muted)]">${bots.length}</span>
                </div>
                <div class="grid gap-4">
                    ${bots.map(renderBotCard).join('')}
                </div>
            </div>
        `;
    }

    async function loadBots() {
        const res = await api.myBots();
        const botsList = document.getElementById('botsList');

        if (!res.success || res.data?.length === 0) {
            botsList.innerHTML = `
                <div class="panel p-12 text-center">
                    <p class="text-[var(--text-muted)]">No bots yet.</p>
                    <p class="text-[var(--text-muted)] text-sm mt-2">Bots will appear here once created.</p>
                </div>
            `;
            return;
        }

        const running = res.data.filter(b => b.status === 'running');
        const paused = res.data.filter(b => b.status === 'paused');
        const needsConfig = res.data.filter(b => b.status === 'parsed');
        const readyToStart = res.data.filter(b => b.status === 'idle' || b.status === 'stopped');
        const other = res.data.filter(b =>
            !['running', 'paused', 'parsed', 'idle', 'stopped'].includes(b.status)
        );

        botsList.innerHTML =
            renderSection('Running', running, 'var(--profit)') +
            renderSection('Paused', paused, 'var(--warning, #d99a2b)') +
            renderSection('Needs Configuration', needsConfig, 'var(--accent)') +
            renderSection('Ready to Start', readyToStart, 'var(--text-muted)') +
            renderSection('Other', other, 'var(--text-muted)');

        // Row click -> open detail modal (but not when clicking action buttons)
        botsList.querySelectorAll('[data-bot-card]').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-action-zone]')) return;
                openBotModal(card.dataset.botCard);
            });
        });

        // Action buttons (start/pause/stop/resume)
        botsList.querySelectorAll('[data-bot-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const [id, action] = btn.dataset.botAction.split(':');
                const actions = {
                    stop: api.stopBot,
                    pause: api.pauseBot,
                    resume: api.resumeBot,
                };
                btn.disabled = true;

                // Only 'start' opens new exposure, so only 'start' carries
                // the captured analysis context forward. Only a context
                // that was actually persisted (POST /analysis-contexts
                // succeeded, real DB id) is ever sent — a local-only
                // "local-..." placeholder id is never sent as if it were
                // a real analysis_contexts.id. BotController::start()
                // still needs to accept + store analysis_context_id into
                // the bot_sessions row it snapshots at launch; until that
                // lands server-side this is a harmless extra field the
                // backend ignores.
                const analysisContextId = action === 'start' ? getPersistedContextId(getAnalysisContext()) : null;

                let res = action === 'start'
                    ? await api.startBot(id, { confirmRisk: false, analysisContextId })
                    : await actions[action](id);

                // Risk Guard checkpoint -- only 'start' can trigger this,
                // since that's the only action from this list that opens
                // new exposure. The analysis context rides along so the
                // confirmation can show MARKET / ANALYSIS / BOT / RISK
                // together, not just the bare risk numbers.
                if (res && res.needs_confirmation) {
                    const confirmed = await showRiskConfirmModal(res.evaluation, getAnalysisContext());
                    if (!confirmed) {
                        btn.disabled = false;
                        return;
                    }
                    res = await api.startBot(id, { confirmRisk: true, analysisContextId });
                }

                if (res && res.success === false) {
                    alert(res.message || `Failed to ${action} bot.`);
                    btn.disabled = false;
                    return;
                }
                await loadBots();
            });
        });

        // Configure button (parsed bots with no config yet) -> opens the same modal as clicking the card
        botsList.querySelectorAll('[data-bot-configure]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openBotModal(btn.dataset.botConfigure);
            });
        });

        // Monitor button -- opens the floating live-trade window for this bot
        botsList.querySelectorAll('[data-bot-monitor]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openBotMonitor(btn.dataset.botMonitor);
            });
        });
    }

    async function openBotModal(id) {
        const overlay = document.getElementById('botModalOverlay');
        const modal = document.getElementById('botModal');
        overlay.classList.remove('hidden');
        modal.innerHTML = `<p class="text-[var(--text-muted)] text-sm">Loading...</p>`;

        const res = await api.botDetail(id);

        if (!res.success) {
            modal.innerHTML = `
                <p class="text-[var(--loss)]">Failed to load bot details.</p>
                <button id="modalCloseBtn" class="mt-4 px-4 py-2 bg-[var(--bg-panel)] hover:bg-[var(--border)] text-[var(--text-secondary)] text-sm rounded-lg">Close</button>
            `;
            document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
            return;
        }

        const { bot, configuration, latest_session } = res;
        const analysisContext = getAnalysisContext();

        if (bot.source === 'xml_upload') {
            renderXmlBotModal(bot, configuration, latest_session, analysisContext);
        } else {
            renderNativeBotModal(bot, configuration, latest_session, analysisContext);
        }
    }

    // Maps raw Deriv contract type codes to readable labels.
    // Falls back to a generic title-case split for anything not listed.
    const CONTRACT_NAME_MAP = {
        DIGITEVEN: 'Digit Even',
        DIGITODD: 'Digit Odd',
        DIGITOVER: 'Digit Over',
        DIGITUNDER: 'Digit Under',
        DIGITMATCH: 'Digit Match',
        DIGITDIFF: 'Digit Diff',
        CALL: 'Call (Rise)',
        PUT: 'Put (Fall)',
        CALLE: 'Call Equals',
        PUTE: 'Put Equals',
        ONETOUCH: 'One Touch',
        NOTOUCH: 'No Touch',
        EXPIRYRANGE: 'Expiry Range',
        EXPIRYMISS: 'Expiry Miss',
        RANGE: 'Range',
        UPORDOWN: 'Up or Down',
        ACCU: 'Accumulator',
    };

    function formatContractName(code) {
        if (CONTRACT_NAME_MAP[code]) return CONTRACT_NAME_MAP[code];
        // Fallback for anything not in the map: Title Case the raw code
        return code.charAt(0) + code.slice(1).toLowerCase();
    }

    // Shared by both the native and XML config forms so the "prefill
    // symbol from Analysis Context" rule can't drift between them.
    // Priority is: an existing saved configuration always wins (never
    // override a trader's own saved choice); otherwise, if there's no
    // saved configuration yet, the analysis context's symbol is
    // preselected. Nothing else (contract type, barrier, stake) is ever
    // touched here — see matchSymbolId's doc comment for why.
    function populateSymbolSelect(selectEl, symbolsRes, configuration, analysisContext) {
        const symbolList = symbolsRes.symbols || symbolsRes.data || [];
        if (symbolsRes.success === false || !symbolList.length) {
            selectEl.innerHTML = '<option value="">No symbols found</option>';
            return { symbolList, prefilledFromContext: false };
        }

        const contextSymbolId = !configuration ? matchSymbolId(analysisContext, symbolList) : null;
        const preselectedId = configuration?.symbol_id ?? contextSymbolId;

        selectEl.innerHTML = '<option value="">Select a symbol</option>' +
            symbolList.map(s => `<option value="${s.id}" ${preselectedId != null && String(preselectedId) === String(s.id) ? 'selected' : ''}>${s.name || s.display_name || s.symbol}</option>`).join('');

        return { symbolList, prefilledFromContext: !!contextSymbolId };
    }

    function analysisContextBannerHTML(analysisContext) {
        if (!analysisContext) return '';
        return `<div class="mb-4 p-4 rounded-lg" style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--accent);">
            <div class="text-[10px] font-bold tracking-wide text-[var(--accent)]">ANALYSIS CONTEXT</div>
            <div class="text-sm font-semibold text-[var(--text-primary)] mt-1">${analysisContext.symbol} · ${analysisContext.lookback} ticks</div>
            <div class="text-xs text-[var(--text-secondary)] mt-1">${analysisContext.state}</div>
            <div class="text-[10px] text-[var(--text-muted)] mt-1">${analysisContext.evidence_quality} · observational context only — it does not choose your contract, barrier, or stake</div>
        </div>`;
    }

    async function renderNativeBotModal(bot, configuration, latestSession, analysisContext) {
        const modal = document.getElementById('botModal');

        modal.innerHTML = `
            ${analysisContextBannerHTML(analysisContext)}
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-lg text-[var(--text-primary)]">${bot.bot_name}</h3>
                <button id="modalCloseBtn" class="text-[var(--text-muted)] hover:text-[var(--text-primary)]">Close</button>
            </div>
            <p class="text-[var(--text-muted)] text-xs mb-4">Status: ${bot.status} - Source: Native</p>

            ${configuration ? `
                <div class="bg-[var(--bg-secondary)] rounded-lg p-4 mb-4 space-y-1 text-sm">
                    <p><span class="text-[var(--text-muted)]">Symbol ID:</span> ${configuration.symbol_id}</p>
                    <p><span class="text-[var(--text-muted)]">Contract type ID:</span> ${configuration.contract_type_id}</p>
                    <p><span class="text-[var(--text-muted)]">Barrier digit:</span> ${configuration.barrier_digit ?? '-'}</p>
                    <p><span class="text-[var(--text-muted)]">Entry condition:</span> ${configuration.entry_condition ?? 'always'}</p>
                    <p><span class="text-[var(--text-muted)]">Tick duration:</span> ${configuration.tick_duration}</p>
                    <p><span class="text-[var(--text-muted)]">Stake per trade:</span> ${configuration.stake_per_trade}</p>
                    <p><span class="text-[var(--text-muted)]">Stop loss:</span> ${configuration.stop_loss_amount}</p>
                    <p><span class="text-[var(--text-muted)]">Take profit:</span> ${configuration.take_profit_amount ?? '-'}</p>
                    <p><span class="text-[var(--text-muted)]">Number of runs:</span> ${configuration.number_of_runs ?? 'Unlimited'}</p>
                </div>
                <p class="text-[var(--text-muted)] text-xs mb-3">Submitting below saves a new configuration; the bot will use it on its next start.</p>
            ` : `
                <p class="text-sm mb-4" style="color:var(--warning, #d99a2b);">This bot has no configuration yet -- set one below before starting.</p>
            `}

            <div id="configError" class="hidden bg-[var(--loss)]/10 border border-[var(--loss)]/30 text-[var(--loss)] rounded-lg p-3 mb-4 text-sm"></div>

            <form id="nativeConfigForm" class="space-y-3">
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Symbol</label>
                    <select id="cfgSymbol" class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]">
                        <option value="">Loading symbols...</option>
                    </select>
                    <p id="cfgSymbolHint" class="hidden text-[10px] mt-1" style="color:var(--accent);">Prefilled from Analysis · ${analysisContext ? analysisContext.symbol : ''}</p>
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Contract type</label>
                    <select id="cfgContractType" class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]">
                        <option value="">Loading contract types...</option>
                    </select>
                </div>
                <div id="barrierDigitWrap" class="hidden">
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Barrier digit (0-9)</label>
                    <input id="cfgBarrierDigit" type="number" min="0" max="9" placeholder="e.g. 5"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Entry condition (optional)</label>
                    <input id="cfgEntryCondition" type="text" maxlength="100" placeholder="always"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Tick duration</label>
                    <input id="cfgTickDuration" type="number" min="1" placeholder="e.g. 5"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Stake per trade</label>
                    <input id="cfgStake" type="number" step="0.01" min="0.01" placeholder="1.00"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Stop loss amount</label>
                    <input id="cfgStopLoss" type="number" step="0.01" min="0.01" placeholder="10.00"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Take profit amount (optional)</label>
                    <input id="cfgTakeProfit" type="number" step="0.01" min="0.01" placeholder="20.00"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Number of runs (optional, blank = unlimited)</label>
                    <input id="cfgRuns" type="number" min="1" placeholder="e.g. 50"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="submit" id="cfgSubmitBtn" class="btn btn-profit px-4 py-2 text-sm">
                        ${configuration ? 'Update Configuration' : 'Save Configuration'}
                    </button>
                    <button type="button" id="modalCancelBtn" class="px-4 py-2 bg-[var(--bg-panel)] hover:bg-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg transition">
                        Cancel
                    </button>
                </div>
            </form>
        `;

        document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
        document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

        // Load symbols (shape confirmed earlier: res.symbols) and prefill
        // from the analysis context when there's no saved configuration.
        const symbolsRes = await api.symbols();
        const symbolSelect = document.getElementById('cfgSymbol');
        const { symbolList, prefilledFromContext } = populateSymbolSelect(symbolSelect, symbolsRes, configuration, analysisContext);
        document.getElementById('cfgSymbolHint')?.classList.toggle('hidden', !prefilledFromContext);

        // Load contract types -- response shape NOT yet confirmed against the
        // real controller (only the route was confirmed to exist), so this
        // defensively checks a couple of likely keys, same as symbols() was
        // before we saw MarketController. If this dropdown comes back empty,
        // paste TradingController@contractTypes and I'll fix the key.
        const contractRes = await api.contractTypes();
        const contractSelect = document.getElementById('cfgContractType');
        const contractList = contractRes.contract_types || contractRes.data || [];
        let contractTypesById = {};
        if (contractRes.success !== false && contractList.length) {
            contractList.forEach(ct => { contractTypesById[ct.id] = ct; });
            contractSelect.innerHTML = '<option value="">Select a contract type</option>' +
                contractList.map(ct => `<option value="${ct.id}" ${configuration?.contract_type_id === ct.id ? 'selected' : ''}>${formatContractName(ct.name)}</option>`).join('');
        } else {
            contractSelect.innerHTML = '<option value="">No contract types found -- check api.contractTypes() response shape</option>';
        }

        // Show/hide barrier digit field based on the selected contract type's requires_barrier flag
        function syncBarrierVisibility() {
            const selectedId = contractSelect.value;
            const ct = contractTypesById[selectedId];
            const wrap = document.getElementById('barrierDigitWrap');
            if (ct && ct.requires_barrier) {
                wrap.classList.remove('hidden');
            } else {
                wrap.classList.add('hidden');
            }
        }
        contractSelect.addEventListener('change', syncBarrierVisibility);
        syncBarrierVisibility(); // in case a config is pre-selected

        // Pre-fill from existing config if present
        if (configuration) {
            document.getElementById('cfgBarrierDigit').value = configuration.barrier_digit ?? '';
            document.getElementById('cfgEntryCondition').value = configuration.entry_condition ?? '';
            document.getElementById('cfgTickDuration').value = configuration.tick_duration ?? '';
            document.getElementById('cfgStake').value = configuration.stake_per_trade ?? '';
            document.getElementById('cfgStopLoss').value = configuration.stop_loss_amount ?? '';
            document.getElementById('cfgTakeProfit').value = configuration.take_profit_amount ?? '';
            document.getElementById('cfgRuns').value = configuration.number_of_runs ?? '';
        }

        document.getElementById('nativeConfigForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('configError');
            const submitBtn = document.getElementById('cfgSubmitBtn');

            const payload = {
                symbol_id: document.getElementById('cfgSymbol').value,
                contract_type_id: document.getElementById('cfgContractType').value,
                barrier_digit: document.getElementById('cfgBarrierDigit').value || null,
                entry_condition: document.getElementById('cfgEntryCondition').value || null,
                tick_duration: document.getElementById('cfgTickDuration').value,
                stake_per_trade: document.getElementById('cfgStake').value,
                stop_loss_amount: document.getElementById('cfgStopLoss').value,
                take_profit_amount: document.getElementById('cfgTakeProfit').value || null,
                number_of_runs: document.getElementById('cfgRuns').value || null,
            };

            if (!payload.symbol_id || !payload.contract_type_id || !payload.tick_duration || !payload.stake_per_trade || !payload.stop_loss_amount) {
                errorDiv.textContent = 'Symbol, contract type, tick duration, stake, and stop loss are required.';
                errorDiv.classList.remove('hidden');
                return;
            }

            const selectedCt = contractTypesById[payload.contract_type_id];
            if (selectedCt && selectedCt.requires_barrier && !payload.barrier_digit) {
                errorDiv.textContent = 'This contract type requires a barrier digit.';
                errorDiv.classList.remove('hidden');
                return;
            }

            submitBtn.textContent = 'Saving...';
            submitBtn.disabled = true;

            const res = await api.configureBot(bot.id, payload);

            if (res.success) {
                closeModal();
                await loadBots();
            } else {
                errorDiv.textContent = res.message || (res.errors ? Object.values(res.errors).flat().join(' ') : 'Failed to save configuration.');
                errorDiv.classList.remove('hidden');
                submitBtn.textContent = configuration ? 'Update Configuration' : 'Save Configuration';
                submitBtn.disabled = false;
            }
        });
    }

    async function renderXmlBotModal(bot, configuration, latestSession, analysisContext) {
        const modal = document.getElementById('botModal');

        modal.innerHTML = `
            ${analysisContextBannerHTML(analysisContext)}
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-lg text-[var(--text-primary)]">${bot.bot_name}</h3>
                <button id="modalCloseBtn" class="text-[var(--text-muted)] hover:text-[var(--text-primary)]">Close</button>
            </div>
            <p class="text-[var(--text-muted)] text-xs mb-4">Status: ${bot.status} - Source: XML upload</p>

            ${configuration ? `
                <div class="bg-[var(--bg-secondary)] rounded-lg p-4 mb-4 space-y-1 text-sm">
                    <p><span class="text-[var(--text-muted)]">Symbol ID:</span> ${configuration.symbol_id}</p>
                    <p><span class="text-[var(--text-muted)]">Stake per trade:</span> ${configuration.stake_per_trade}</p>
                    <p><span class="text-[var(--text-muted)]">Stop loss:</span> ${configuration.stop_loss_amount}</p>
                    <p><span class="text-[var(--text-muted)]">Take profit:</span> ${configuration.take_profit_amount ?? '-'}</p>
                    <p><span class="text-[var(--text-muted)]">Number of runs:</span> ${configuration.number_of_runs ?? 'Unlimited'}</p>
                </div>
                <p class="text-[var(--text-muted)] text-xs mb-3">Submitting below saves a new configuration; the bot will use it on its next start.</p>
            ` : `
                <p class="text-sm mb-4" style="color:var(--warning, #d99a2b);">This bot has no configuration yet -- set one below before starting.</p>
            `}

            <div id="configError" class="hidden bg-[var(--loss)]/10 border border-[var(--loss)]/30 text-[var(--loss)] rounded-lg p-3 mb-4 text-sm"></div>

            <form id="xmlConfigForm" class="space-y-3">
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Symbol</label>
                    <select id="cfgSymbol" class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]">
                        <option value="">Loading symbols...</option>
                    </select>
                    <p id="cfgSymbolHint" class="hidden text-[10px] mt-1" style="color:var(--accent);">Prefilled from Analysis · ${analysisContext ? analysisContext.symbol : ''}</p>
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Stake per trade</label>
                    <input id="cfgStake" type="number" step="0.01" min="0.01" placeholder="1.00"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Stop loss amount</label>
                    <input id="cfgStopLoss" type="number" step="0.01" min="0.01" placeholder="10.00"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Take profit amount (optional)</label>
                    <input id="cfgTakeProfit" type="number" step="0.01" min="0.01" placeholder="20.00"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div>
                    <label class="block text-sm text-[var(--text-muted)] mb-1">Number of runs (optional, blank = unlimited)</label>
                    <input id="cfgRuns" type="number" min="1" placeholder="e.g. 50"
                        class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="submit" id="cfgSubmitBtn" class="btn btn-profit px-4 py-2 text-sm">
                        ${configuration ? 'Update Configuration' : 'Save Configuration'}
                    </button>
                    <button type="button" id="modalCancelBtn" class="px-4 py-2 bg-[var(--bg-panel)] hover:bg-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg transition">
                        Cancel
                    </button>
                </div>
            </form>
        `;

        document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
        document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

        // Load symbols -- response shape not yet confirmed against the real
        // controller, so we defensively check a few likely keys. Prefills
        // from the analysis context when there's no saved configuration,
        // via the same shared helper the native form uses, so this can
        // never drift out of sync with it.
        const symbolsRes = await api.symbols();
        const symbolSelect = document.getElementById('cfgSymbol');
        const { symbolList, prefilledFromContext } = populateSymbolSelect(symbolSelect, symbolsRes, configuration, analysisContext);
        document.getElementById('cfgSymbolHint')?.classList.toggle('hidden', !prefilledFromContext);
        if (!symbolList.length) {
            symbolSelect.innerHTML = '<option value="">No symbols found -- check api.symbols() response shape</option>';
        }

        // Pre-fill from existing config if present
        if (configuration) {
            document.getElementById('cfgStake').value = configuration.stake_per_trade ?? '';
            document.getElementById('cfgStopLoss').value = configuration.stop_loss_amount ?? '';
            document.getElementById('cfgTakeProfit').value = configuration.take_profit_amount ?? '';
            document.getElementById('cfgRuns').value = configuration.number_of_runs ?? '';
        }

        document.getElementById('xmlConfigForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('configError');
            const submitBtn = document.getElementById('cfgSubmitBtn');

            const payload = {
                symbol_id: document.getElementById('cfgSymbol').value,
                stake_per_trade: document.getElementById('cfgStake').value,
                stop_loss_amount: document.getElementById('cfgStopLoss').value,
                take_profit_amount: document.getElementById('cfgTakeProfit').value || null,
                number_of_runs: document.getElementById('cfgRuns').value || null,
            };

            if (!payload.symbol_id || !payload.stake_per_trade || !payload.stop_loss_amount) {
                errorDiv.textContent = 'Symbol, stake, and stop loss are required.';
                errorDiv.classList.remove('hidden');
                return;
            }

            submitBtn.textContent = 'Saving...';
            submitBtn.disabled = true;

            const res = await api.configureBot(bot.id, payload);

            if (res.success) {
                closeModal();
                await loadBots();
            } else {
                errorDiv.textContent = res.message || (res.errors ? Object.values(res.errors).flat().join(' ') : 'Failed to save configuration.');
                errorDiv.classList.remove('hidden');
                submitBtn.textContent = configuration ? 'Update Configuration' : 'Save Configuration';
                submitBtn.disabled = false;
            }
        });
    }

    function closeModal() {
        document.getElementById('botModalOverlay').classList.add('hidden');
    }
}
