import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';
import { getAnalysisContext } from './analysisContext.js';

// ── Real trade history ────────────────────────────────────────────────
// GET /trading/orders -> TradingController::myOrders(). Confirmed shape:
// id, symbol, contract_type, stake, duration_ticks, barrier, status,
// payout, analysis_context_id, created_at. There is no separate
// win/loss column and the status enum itself hasn't been confirmed
// against the orders migration -- so this treats any status containing
// "win" as a win and "loss"/"lost" as a loss, and leaves anything else
// (pending, expired, cancelled, or an unrecognized value) OUT of P&L
// aggregation rather than guessing at it. Those orders still show up in
// the trade table with their raw status, they just don't contribute a
// dollar figure until they're actually resolved.
async function loadTradeHistory() {
    try {
        const res = await api.myOrders();
        const list = res.data || [];
        if (res.success === false || !Array.isArray(list)) return null;

        return list.map(o => {
            const status = String(o.status || '').toLowerCase();
            const isWin = status.includes('win');
            const isLoss = status.includes('loss') || status === 'lost';
            const resolved = isWin || isLoss;
            const stake = Number(o.stake ?? 0);
            const payout = o.payout != null ? Number(o.payout) : null;
            const result = isWin ? (payout != null ? payout - stake : 0) : (isLoss ? -stake : null);
            const createdAt = o.created_at ? new Date(o.created_at) : null;

            return {
                id: o.id,
                date: createdAt ? createdAt.toISOString().split('T')[0] : '—',
                time: createdAt ? createdAt.toLocaleTimeString() : '—',
                contract: o.contract_type || '—',
                symbol: o.symbol || '—',
                stake,
                status: o.status || 'unknown',
                resolved,
                result,   // null until resolved -- never fabricated
                win: isWin,
                analysisContextId: o.analysis_context_id ?? null,
            };
        });
    } catch (err) {
        return null;
    }
}

export async function render(app, navigate) {
    window._nav = navigate;
    let selectedDate = null;

    app.innerHTML =
        '<div class="edge-left"></div><div class="edge-right"></div><div class="edge-bottom"></div>' +
        '<div style="display:flex;height:100vh;overflow:hidden;background:var(--bg-main);">' +
            renderSidebar('journal') +
            '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
                '<div style="height:48px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;">' +
                    '<span style="font-weight:700;font-size:13px;color:var(--accent);">TRADE JOURNAL</span>' +
                    '<span id="journalStatus" style="font-size:9px;color:var(--text-muted);border:1px solid var(--border);padding:2px 6px;border-radius:4px;">LOADING…</span>' +
                    '<div style="flex:1;"></div>' +
                    '<span id="topTime" style="font-size:11px;color:var(--text-muted);"></span>' +
                '</div>' +
                '<div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 340px;gap:12px;align-content:start;">' +
                    '<div id="journalContext" class="panel" style="grid-column:span 2;border-left:3px solid var(--accent);display:none;"></div>' +

                    '<div>' +
                        // SUMMARY ROW
                        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;" id="summaryRow"></div>' +

                        // CALENDAR HEATMAP
                        '<div class="panel" style="margin-bottom:12px;">' +
                            '<div class="panel-title">P&L CALENDAR — click any day to see trades</div>' +
                            '<div id="calHeatmap" style="margin-top:12px;"></div>' +
                        '</div>' +

                        // TRADE TABLE
                        '<div class="panel">' +
                            '<div class="panel-title" id="tableTitle">ALL TRADES</div>' +
                            '<div id="tradeTable" style="margin-top:8px;max-height:300px;overflow-y:auto;"></div>' +
                        '</div>' +
                    '</div>' +

                    // NOTE PANEL
                    '<div>' +
                        '<div class="panel" style="margin-bottom:12px;">' +
                            '<div class="panel-title">DAY DETAIL</div>' +
                            '<div id="dayDetail" style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">Click a day on the calendar</div>' +
                        '</div>' +
                        '<div class="panel">' +
                            '<div class="panel-title">ADD NOTE</div>' +
                            '<div style="margin-top:8px;">' +
                                '<input id="noteDate" type="date" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;margin-bottom:8px;">' +
                                '<textarea id="noteText" rows="4" placeholder="Observations, mistakes, strategy notes..." style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);font-size:12px;resize:vertical;"></textarea>' +
                                '<button id="saveNoteBtn" class="btn btn-profit" style="width:100%;margin-top:8px;padding:8px;">Save Note</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                '</div>' +
            '</div>' +
        '</div>';

    setInterval(() => { const el = document.getElementById('topTime'); if (el) el.textContent = new Date().toLocaleTimeString(); }, 1000);
    initSidebar(app, navigate, {
        onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
    });

    // The card shows the most recently captured Analysis Context (from
    // sessionStorage) — a reminder of what informed your last decision,
    // not (yet) a guarantee that it's tied to the trades below. That
    // link only becomes real once trades carry their own
    // analysis_context_id from the backend (see loadTradeHistory).
    const analysisContext = getAnalysisContext();
    const contextEl = document.getElementById('journalContext');
    if (contextEl && analysisContext) {
        contextEl.style.display = 'block';
        contextEl.innerHTML = `<div style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:var(--accent);">MOST RECENT ANALYSIS CONTEXT</div>` +
            `<div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-top:5px;">${analysisContext.symbol} · ${analysisContext.lookback} ticks</div>` +
            `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${analysisContext.state}</div>` +
            `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;">${analysisContext.evidence_quality} · captured ${new Date(analysisContext.created_at).toLocaleTimeString()} · not necessarily tied to the trades below</div>`;
    }

    document.getElementById('saveNoteBtn').addEventListener('click', saveNote);

    const statusEl = document.getElementById('journalStatus');
    const trades = await loadTradeHistory();

    if (trades === null) {
        // Server-authoritative, same as the rest of the app: no data
        // means NO DATA, never a fabricated number to fill the gap.
        if (statusEl) {
            statusEl.textContent = 'NO DATA';
            statusEl.style.color = 'var(--warning, #d99a2b)';
        }
        renderEmptyState();
        return;
    }

    if (statusEl) {
        statusEl.textContent = trades.length ? 'LIVE' : 'NO TRADES YET';
        statusEl.style.color = trades.length ? 'var(--profit)' : 'var(--text-muted)';
    }

    // Group by date
    const byDate = {};
    trades.forEach(t => {
        if (!byDate[t.date]) byDate[t.date] = [];
        byDate[t.date].push(t);
    });

    // Build heatmap data
    const dateMap = {};
    Object.entries(byDate).forEach(([date, arr]) => {
        // Only resolved trades contribute to the day's P&L -- a pending
        // order has no outcome yet and adding 0 for it would be silently
        // implying "break-even," which isn't true, it's just unknown.
        const pnl = arr.reduce((s, t) => s + (t.resolved ? t.result : 0), 0);
        dateMap[date] = { pnl: +pnl.toFixed(2), count: arr.length, resolvedCount: arr.filter(t => t.resolved).length };
    });

    renderSummary(trades, dateMap);
    buildCalendar(dateMap, byDate);
    renderTradeTable(trades, 'ALL TRADES');

    function renderEmptyState() {
        const summaryEl = document.getElementById('summaryRow');
        if (summaryEl) summaryEl.innerHTML = [
            { label: 'Total P&L', val: '—' },
            { label: 'Total Trades', val: '—' },
            { label: 'Win Rate', val: '—' },
            { label: 'Best Day', val: '—' },
        ].map(m => '<div class="panel" style="text-align:center;padding:12px;"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">' + m.label + '</div><div style="font-size:20px;font-weight:700;color:var(--text-muted);">' + m.val + '</div></div>').join('');

        const calEl = document.getElementById('calHeatmap');
        if (calEl) calEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:20px 0;text-align:center;">Trade history is unavailable right now — nothing has been fabricated to fill this view.</div>';

        renderTradeTable([], 'ALL TRADES');
    }

    function renderSummary(trades, dateMap) {
        const summaryEl = document.getElementById('summaryRow');
        if (!summaryEl) return;
        if (!trades.length) {
            summaryEl.innerHTML = [
                { label: 'Total P&L', val: '$0.00' },
                { label: 'Total Trades', val: 0 },
                { label: 'Win Rate', val: '—' },
                { label: 'Best Day', val: '—' },
            ].map(m => '<div class="panel" style="text-align:center;padding:12px;"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">' + m.label + '</div><div style="font-size:20px;font-weight:700;color:var(--text-muted);">' + m.val + '</div></div>').join('');
            return;
        }
        const resolvedTrades = trades.filter(t => t.resolved);
        const totalPnl = resolvedTrades.reduce((s,t) => s+t.result, 0);
        const wins = resolvedTrades.filter(t => t.win).length;
        // Win rate is against resolved trades, not all trades -- a
        // pending order hasn't won or lost anything yet, so counting it
        // as a loss (or ignoring it silently) in the denominator would
        // misrepresent the rate either way.
        const wr = resolvedTrades.length ? (wins / resolvedTrades.length * 100).toFixed(1) : null;
        const bestDay = Object.values(dateMap).length ? Math.max(...Object.values(dateMap).map(d => d.pnl)) : 0;
        summaryEl.innerHTML = [
            { label: 'Total P&L', val: (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2), col: totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)' },
            { label: 'Total Trades', val: trades.length, col: 'var(--text-primary)' },
            { label: 'Win Rate', val: wr !== null ? wr + '%' : '—', col: wr !== null ? 'var(--accent)' : 'var(--text-muted)' },
            { label: 'Best Day', val: (bestDay >= 0 ? '+' : '') + '$' + bestDay.toFixed(2), col: bestDay >= 0 ? 'var(--profit)' : 'var(--loss)' },
        ].map(m => '<div class="panel" style="text-align:center;padding:12px;"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">' + m.label + '</div><div style="font-size:20px;font-weight:700;color:' + m.col + ';">' + m.val + '</div></div>').join('');
    }

    function saveNote() {
        const d = document.getElementById('noteDate').value;
        const n = document.getElementById('noteText').value;
        if (!d || !n) return;
        let c = document.getElementById('toast-container');
        if (!c) { c = document.createElement('div'); c.id='toast-container'; document.body.appendChild(c); }
        const t = document.createElement('div'); t.className='toast toast-info'; t.textContent='Note saved for ' + d;
        c.appendChild(t); setTimeout(()=>t.remove(),3000);
        document.getElementById('noteText').value = '';
    }

    // PnL intensity maps to the app's own semantic colors (var(--profit)
    // / var(--loss)) via color-mix, instead of hardcoded hex — so the
    // heatmap follows whichever of the three real themes (obsidian,
    // titanium-blue, carbon-redline) is active, the same way every
    // other panel in the app does.
    function heatCellColor(pnl) {
        if (pnl === undefined) return { bg: 'var(--bg-panel)', border: 'var(--border)' };
        if (pnl > 0) {
            const strength = pnl > 5 ? 45 : 22;
            return { bg: `color-mix(in srgb, var(--profit) ${strength}%, var(--bg-panel))`, border: 'var(--profit)' };
        }
        if (pnl < 0) {
            const strength = pnl < -5 ? 45 : 22;
            return { bg: `color-mix(in srgb, var(--loss) ${strength}%, var(--bg-panel))`, border: 'var(--loss)' };
        }
        return { bg: 'var(--bg-panel)', border: 'var(--border)' };
    }

    function buildCalendar(dateMap, byDate) {
        const el = document.getElementById('calHeatmap'); if (!el) return;
        const now = new Date();
        let html = '<div style="display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;">';
        // week columns for last 10 weeks
        for (let week = 9; week >= 0; week--) {
            html += '<div style="display:flex;flex-direction:column;gap:3px;">';
            for (let day = 6; day >= 0; day--) {
                const d = new Date(now);
                d.setDate(d.getDate() - (week * 7 + day));
                const ds = d.toISOString().split('T')[0];
                const dm = dateMap[ds];
                const { bg, border } = heatCellColor(dm ? dm.pnl : undefined);
                const title = dm ? ds + ': $' + dm.pnl + ' (' + dm.count + ' trades)' : ds;
                html += '<div data-cal-day="' + ds + '" title="' + title + '" style="width:14px;height:14px;border-radius:3px;background:' + bg + ';border:0.5px solid ' + border + ';cursor:pointer;transition:transform 0.1s;"></div>';
            }
            html += '</div>';
        }
        html += '</div>';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:10px;color:var(--text-muted);">' +
            '<span>Less</span>' +
            [undefined, 2, 10, -10].map(v => {
                const c = heatCellColor(v);
                return '<div style="width:12px;height:12px;border-radius:2px;background:' + c.bg + ';"></div>';
            }).join('') +
            '<span>More</span>' +
        '</div>';
        el.innerHTML = html;

        el.querySelectorAll('[data-cal-day]').forEach(cell => {
            cell.addEventListener('mouseover', () => { cell.style.transform = 'scale(1.3)'; });
            cell.addEventListener('mouseout', () => { cell.style.transform = 'scale(1)'; });
            cell.addEventListener('click', () => selectDay(cell.dataset.calDay, byDate));
        });
    }

    function selectDay(ds, byDate) {
        selectedDate = ds;
        const arr = byDate[ds] || [];
        const dd = document.getElementById('dayDetail');
        if (!arr.length) { if(dd) dd.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px;">No trades on ' + ds + '</div>'; return; }
        const resolvedArr = arr.filter(t => t.resolved);
        const dayPnl = resolvedArr.reduce((s,t) => s+t.result, 0);
        const col = dayPnl >= 0 ? 'var(--profit)' : 'var(--loss)';
        const pendingCount = arr.length - resolvedArr.length;
        if (dd) dd.innerHTML = '<div style="padding:8px;">' +
            '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">' + ds + '</div>' +
            '<div style="font-size:24px;font-weight:700;color:' + col + ';margin-bottom:4px;">' + (dayPnl>=0?'+':'') + '$' + dayPnl.toFixed(2) + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">' + arr.length + ' trades · ' + resolvedArr.filter(t=>t.win).length + ' wins' + (pendingCount ? ' · ' + pendingCount + ' pending' : '') + '</div>' +
        '</div>';
        renderTradeTable(arr, 'TRADES ON ' + ds);
        document.getElementById('noteDate').value = ds;
    }

    function renderTradeTable(arr, title) {
        const tt = document.getElementById('tableTitle');
        if (tt) tt.textContent = title;
        const el = document.getElementById('tradeTable'); if (!el) return;
        if (!arr.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:16px;">No trades.</div>'; return; }
        el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
            '<thead><tr style="border-bottom:1px solid var(--border);">' +
                ['Time','Symbol','Contract','Stake','Result'].map(h => '<th style="text-align:left;padding:6px 8px;color:var(--text-muted);font-size:10px;letter-spacing:0.05em;">' + h + '</th>').join('') +
            '</tr></thead><tbody>' +
            arr.map(t => {
                // Not every order has resolved to a win/loss yet -- an
                // unresolved trade shows its raw status instead of a
                // dollar figure that doesn't exist.
                const resultCell = t.resolved
                    ? '<span style="font-weight:600;color:' + (t.win?'var(--profit)':'var(--loss)') + ';">' + (t.result>=0?'+':'') + '$' + t.result.toFixed(2) + '</span>'
                    : '<span style="color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.04em;">' + t.status + '</span>';
                return '<tr style="border-bottom:1px solid var(--border);">' +
                    '<td style="padding:6px 8px;color:var(--text-muted);">' + t.time + '</td>' +
                    '<td style="padding:6px 8px;color:var(--text-secondary);">' + t.symbol + '</td>' +
                    '<td style="padding:6px 8px;color:var(--text-secondary);">' + t.contract + '</td>' +
                    '<td style="padding:6px 8px;color:var(--text-primary);">$' + t.stake.toFixed(2) + '</td>' +
                    '<td style="padding:6px 8px;">' + resultCell + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table>';
    }
}
