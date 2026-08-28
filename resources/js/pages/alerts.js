// ═══════════════════════════════════════════════════════════
// alerts.js — Attention & condition-change system
// ═══════════════════════════════════════════════════════════
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';
import { getAnalysisContext } from './analysisContext.js';

// One category -> one color, everywhere in this page. Keeps the badge
// meaningful at a glance instead of every category sharing the same
// accent tone (which is also the "selected/live" color elsewhere in
// the app — reusing it here for "category" would blur that meaning).
const CATEGORY_COLOR = {
    Analysis: 'var(--accent)',
    Bot: 'var(--profit)',
    Risk: 'var(--loss)',
    Execution: 'var(--warning, #d99a2b)',
};

// Actions that directly control bot execution rather than just notify.
// These get a visible warning in the builder — per the design decision
// that Auto-pause/Auto-stop belong under the same risk/authority model
// as the Bots page's own start/pause/stop controls, not treated as a
// passive "ping me" alert.
const EXECUTION_ACTIONS = new Set(['Auto-pause bots', 'Auto-stop bots']);

export async function render(app, navigate) {
    window._nav = navigate;

    const alerts = [
        { id:1, name:'Even streak ≥ 4', condition:'DIGITEVEN run ≥ 4 consecutive', symbol:'R_50', action:'Push notification', active:true, category:'Analysis' },
        { id:2, name:'Loss streak alert', condition:'3 consecutive losses on any bot', symbol:'ALL', action:'Auto-pause bots', active:true, category:'Risk' },
        { id:3, name:'Digit 7 activity gap', condition:'Digit 7 absent ≥ 15 ticks', symbol:'R_25', action:'Dashboard attention', active:false, category:'Analysis' },
        { id:4, name:'Analysis condition weakening', condition:'Original analysis condition weakens', symbol:'ALL', action:'Dashboard attention', active:true, category:'Bot' },
    ];

    app.innerHTML =
        '<div class="edge-left"></div><div class="edge-right"></div><div class="edge-bottom"></div>' +
        '<div style="display:flex;height:100vh;overflow:hidden;background:var(--bg-main);">' + renderSidebar('alerts') +
        '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
        '<div style="height:48px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;">' +
        '<span style="font-weight:700;font-size:13px;color:var(--accent);">ATTENTION & ALERTS</span><div style="flex:1"></div><span id="topTime" style="font-size:11px;color:var(--text-muted);"></span>' +
        '</div>' +
        '<div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start;">' +

        '<div class="panel" style="grid-column:span 2;border-left:3px solid var(--accent);">' +
        '<div class="panel-title">NEEDS ATTENTION</div>' +
        '<div id="attentionQueue" style="margin-top:10px;"></div>' +
        '</div>' +

        '<div class="panel">' +
        '<div class="panel-title">CREATE ALERT</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">' +
        '<div><label style="font-size:10px;color:var(--text-muted);">ALERT NAME</label><input id="aName" placeholder="Analysis condition changed" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px;"></div>' +
        '<div><label style="font-size:10px;color:var(--text-muted);">CATEGORY</label><select id="aCategory" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px;"><option>Analysis</option><option>Bot</option><option>Risk</option><option>Execution</option></select></div>' +
        '<div><label style="font-size:10px;color:var(--text-muted);">TRIGGER CONDITION</label><select id="aCond" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px;">' +
        '<option>Market state changes</option><option>Evidence agreement changes</option><option>Original analysis condition weakens</option><option>Original analysis condition strengthens</option><option>Even run ≥ N consecutive</option><option>Digit X absent ≥ N ticks</option><option>Loss streak ≥ N</option><option>Risk threshold approached</option>' +
        '</select></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label style="font-size:10px;color:var(--text-muted);">SYMBOL</label><select id="aSym" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px;"><option>ALL</option><option>R_10</option><option>R_25</option><option>R_50</option><option>R_75</option><option>R_100</option></select></div>' +
        '<div><label style="font-size:10px;color:var(--text-muted);">VALUE (N)</label><input id="aVal" type="number" value="4" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px;"></div>' +
        '</div>' +
        '<div><label style="font-size:10px;color:var(--text-muted);">ACTION</label><select id="aAction" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px;"><option>Dashboard attention</option><option>Push notification</option><option>Sound alarm</option><option>Auto-pause bots</option><option>Auto-stop bots</option></select></div>' +
        '<p id="autoActionWarning" class="hidden" style="font-size:10px;color:var(--warning, #d99a2b);line-height:1.4;margin:0;">This directly controls bot execution — treat it the same as a manual Stop, not a passive notification.</p>' +
        '<button id="createAlertBtn" class="btn btn-profit" style="padding:10px;">Create Alert</button>' +
        '</div></div>' +

        '<div class="panel">' +
        '<div class="panel-title">ACTIVE ALERTS</div>' +
        '<div id="alertList" style="margin-top:10px;"></div>' +
        '</div>' +

        '</div></div></div>';

    setInterval(() => { const el=document.getElementById('topTime'); if(el) el.textContent=new Date().toLocaleTimeString(); },1000);
    initSidebar(app, navigate, { onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); } });

    renderAttentionQueue();
    renderAlerts();
    document.getElementById('createAlertBtn').addEventListener('click', createAlert);

    const actionSelect = document.getElementById('aAction');
    const syncAutoActionWarning = () => {
        document.getElementById('autoActionWarning')?.classList.toggle('hidden', !EXECUTION_ACTIONS.has(actionSelect.value));
    };
    actionSelect.addEventListener('change', syncAutoActionWarning);
    syncAutoActionWarning();

    function renderAttentionQueue() {
        const el = document.getElementById('attentionQueue');
        if (!el) return;
        const context = getAnalysisContext();
        const items = [];
        if (context) {
            items.push({
                title: 'Analysis context available',
                body: `${context.symbol} · ${context.lookback} ticks · ${context.evidence_quality}`,
                action: 'VIEW ANALYSIS',
                fn: () => navigate('analysis'),
            });
        }
        const activeRisk = alerts.find(a => a.active && a.category === 'Risk');
        if (activeRisk) items.push({ title: 'Risk monitoring active', body: activeRisk.condition, action: 'VIEW ALERTS', fn: () => {} });
        if (!items.length) {
            el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:12px 0;">No current attention items.</div>';
            return;
        }
        el.innerHTML = items.map((x,i) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:${i === items.length-1 ? '0' : '1px solid var(--border)'};">`+
            `<div><div style="font-size:12px;font-weight:700;color:var(--text-primary);">${x.title}</div><div style="font-size:10px;color:var(--text-muted);margin-top:3px;">${x.body}</div></div>`+
            `<button data-attention="${i}" style="background:transparent;border:1px solid var(--border);border-radius:5px;padding:4px 8px;color:var(--accent);font-size:10px;cursor:pointer;">${x.action}</button></div>`).join('');
        el.querySelectorAll('[data-attention]').forEach(btn => btn.addEventListener('click', () => items[Number(btn.dataset.attention)].fn()));
    }

    function renderAlerts() {
        const el = document.getElementById('alertList'); if(!el) return;
        el.innerHTML = alerts.map(a => {
            const catColor = CATEGORY_COLOR[a.category] || 'var(--text-muted)';
            const isExecutionAction = EXECUTION_ACTIONS.has(a.action);
            return '<div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<span style="font-size:12px;font-weight:700;color:var(--text-primary);">' + a.name + '</span>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:10px;color:' + (a.active?'var(--profit)':'var(--text-muted)') + ';background:' + (a.active?'var(--profit)':'var(--text-muted)') + '20;padding:2px 8px;border-radius:4px;">' + (a.active?'ACTIVE':'PAUSED') + '</span>' +
            '<button data-toggle-alert="' + a.id + '" style="background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:var(--text-muted);font-size:10px;cursor:pointer;">' + (a.active?'Pause':'Resume') + '</button>' +
            '</div></div>' +
            '<div style="font-size:10px;color:' + catColor + ';font-weight:700;margin-bottom:3px;">' + a.category.toUpperCase() + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">' + a.condition + ' · ' + a.symbol + '</div>' +
            '<div style="font-size:10px;color:' + (isExecutionAction ? 'var(--warning, #d99a2b)' : 'var(--text-secondary)') + ';font-weight:' + (isExecutionAction ? '700' : '400') + ';">' + a.action + '</div>' +
            '</div>';
        }).join('');
        el.querySelectorAll('[data-toggle-alert]').forEach(btn => btn.addEventListener('click', () => {
            const a = alerts.find(x => x.id === Number(btn.dataset.toggleAlert));
            if (a) a.active = !a.active;
            renderAlerts();
        }));
    }

    function createAlert() {
        const name = document.getElementById('aName').value.trim() || 'Alert ' + (alerts.length + 1);
        alerts.push({
            id: Date.now(),
            name,
            condition: document.getElementById('aCond').value,
            symbol: document.getElementById('aSym').value,
            action: document.getElementById('aAction').value,
            category: document.getElementById('aCategory').value,
            value: document.getElementById('aVal').value,
            active: true,
        });
        renderAlerts();
        renderAttentionQueue();
        const t=document.createElement('div'); t.className='toast toast-info'; t.textContent='Alert created';
        let c=document.getElementById('toast-container'); if(!c){c=document.createElement('div');c.id='toast-container';document.body.appendChild(c);} c.appendChild(t); setTimeout(()=>t.remove(),3000);
    }
}
