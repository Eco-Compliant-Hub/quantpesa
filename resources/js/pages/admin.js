import { api } from '../api.js';
import { auth } from '../auth.js';
import { buildAccountOptionsHtml } from '../utils/accountOptions.js';

export async function render(app, navigate) {
 if (!auth.isAdmin()) {
 navigate('dashboard');
 return;
 }

 // Local state for pages that don't have API endpoints yet
 const state = {
 page: 'overview',
 killSwitches: { halt: false, registrations: false, maintenance: false },
 featureFlags: [
 { id: 'ai_signals', name: 'AI Signal Engine', enabled: true },
 { id: 'cluster_analysis', name: 'Cluster Analysis', enabled: true },
 { id: 'backtest_lab', name: 'Strategy Lab', enabled: false },
 { id: 'trade_journal', name: 'Trade Journal', enabled: false },
 { id: 'alert_builder', name: 'Custom Alerts', enabled: false },
 { id: 'community_signals', name: 'Community Signals', enabled: true },
 { id: 'mobile_pwa', name: 'Mobile PWA', enabled: true },
 { id: 'wallet_system', name: 'Wallet System', enabled: false },
 ],
 auditLog: [],
 bots: [],
 services: [
 { name: 'Flask API', port: 5000, status: 'healthy', latency: '12ms' },
 { name: 'Deriv WS', port: 443, status: 'healthy', latency: '3ms' },
 { name: 'MySQL', port: 3306, status: 'healthy', latency: '4ms' },
 { name: 'Redis', port: 6379, status: 'healthy', latency: '<1ms' },
 { name: 'quant_brain', port: 8001, status: 'healthy', latency: '45ms' },
 { name: 'Nginx', port: 80, status: 'healthy', latency: '<1ms' },
 ],
 tpm: 147,
 users: [],
 stats: null,
 botTemplates: [],
 selectedTemplateIds: new Set(),
 myAccountsForTest: [],
 };

 function toast(message, type = 'success') {
 const existing = document.querySelector('.a-toast');
 if (existing) existing.remove();
 const t = document.createElement('div');
 t.className = `a-toast a-toast-${type}`;
 const icons = { success: 'fa-check-circle', danger: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle' };
 t.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i> ${message}`;
 document.body.appendChild(t);
 setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
 }

 function addAudit(severity, action, detail) {
 state.auditLog.unshift({
 time: new Date().toTimeString().slice(0, 8),
 severity, action, detail
 });
 if (state.auditLog.length > 50) state.auditLog.pop();
 }

 function content() {
 const p = {
 overview() {
 const running = state.bots.filter(b => b.status === 'running').length;
 return `
 <div class="a-topbar">
 <h1>System Overview</h1>
 <div class="a-topbar-stats">
 <div class="a-topbar-chip"><div class="a-pulse"></div><span>All Systems</span></div>
 <div class="a-topbar-chip"><i class="fas fa-robot"></i><span>Bots:</span><span class="a-em" id="oBots">${running}</span></div>
 <div class="a-topbar-chip"><i class="fas fa-bolt"></i><span>TPM:</span><span class="a-gd" id="oTpm">${state.tpm}</span></div>
 </div>
 </div>
 <div class="a-stats">
 <div class="a-stat"><div class="a-stat-label">Active Bots</div><div class="a-stat-val a-em">${running}</div></div>
 <div class="a-stat"><div class="a-stat-label">Trades / Min</div><div class="a-stat-val a-gd">${state.tpm}</div></div>
 <div class="a-stat"><div class="a-stat-label">Total Users</div><div class="a-stat-val a-if">${state.stats ? state.stats.total_users : '—'}</div></div>
 <div class="a-stat"><div class="a-stat-label">Running Bots</div><div class="a-stat-val a-em">${state.stats ? state.stats.running_bots : '—'}</div></div>
 </div>
 <div class="a-grid">
 <div class="a-card">
 <div class="a-card-head"><h3>Recent Audit</h3><a data-nav="audit">View All </a></div>
 ${state.auditLog.length === 0 ? '<p class="a-muted-sm">No events yet.</p>' :
 state.auditLog.slice(0, 5).map(e => `
 <div class="a-audit-row">
 <span class="a-audit-time">${e.time}</span>
 <span class="a-sev a-sev-${e.severity}">${e.severity}</span>
 <span class="a-audit-action">${e.action}</span>
 <span class="a-audit-detail">${e.detail}</span>
 </div>
 `).join('')}
 </div>
 <div class="a-card">
 <div class="a-card-head"><h3>Service Health</h3><a data-nav="health">Details </a></div>
 ${state.services.map(s => `
 <div class="a-health-row">
 <div class="a-health-left"><div class="a-hdot a-hdot-${s.status}"></div><span>${s.name}</span></div>
 <span class="a-health-lat">${s.latency}</span>
 </div>
 `).join('')}
 </div>
 </div>`;
 },

 killswitches() {
 return `
 <div class="a-topbar"><h1>Kill Switches</h1></div>
 <div class="a-card a-warn-card">
 <div class="a-warn-head"><i class="fas fa-exclamation-triangle"></i><h3>Emergency Controls</h3></div>
 <p>These switches override all settings. Every action is logged.</p>
 </div>
 <div class="a-card">
 <div class="a-kill-row">
 <div class="a-kill-info"><h4>Halt All Trading</h4><p id="kHaltSt">All bots trading normally</p></div>
 <div class="a-kill-toggle ${state.killSwitches.halt ? 'active' : ''}" id="kHalt"></div>
 </div>
 <div class="a-kill-row">
 <div class="a-kill-info"><h4>Pause Registrations</h4><p id="kRegSt">New signups enabled</p></div>
 <div class="a-kill-toggle ${state.killSwitches.registrations ? 'active' : ''}" id="kReg"></div>
 </div>
 <div class="a-kill-row">
 <div class="a-kill-info"><h4>Maintenance Mode</h4><p id="kMaintSt">Platform live</p></div>
 <div class="a-kill-toggle ${state.killSwitches.maintenance ? 'active' : ''}" id="kMaint"></div>
 </div>
 </div>`;
 },

 features() {
 return `
 <div class="a-topbar"><h1>Feature Flags</h1></div>
 <div class="a-card">
 <p class="a-muted-sm" style="margin-bottom:16px;">Toggle features without redeployment. Changes take effect within 5 seconds.</p>
 ${state.featureFlags.map(f => `
 <div class="a-kill-row">
 <div class="a-kill-info"><h4>${f.name}</h4><p>${f.enabled ? 'Enabled' : 'Disabled'}</p></div>
 <div class="a-flag-toggle ${f.enabled ? 'active' : ''}" data-flag="${f.id}"></div>
 </div>
 `).join('')}
 </div>`;
 },

 users() {
 return `
 <div class="a-topbar">
 <h1>User Management</h1>
 <span class="a-muted-sm" style="font-family:'JetBrains Mono',monospace;">${state.users.length} total</span>
 </div>
 <div class="a-card a-card-table">
 <table class="a-table">
 <thead><tr><th>User</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
 <tbody>
 ${state.users.length === 0 ? '<tr><td colspan="4" class="a-muted-sm">Loading...</td></tr>' :
 state.users.map(u => `
 <tr>
 <td style="color:var(--ab);font-weight:500;">${u.email}</td>
 <td><span class="a-sev a-sev-${u.status === 'active' ? 'success' : u.status === 'banned' ? 'critical' : u.status === 'admin' ? 'info' : 'warning'}">${u.status}</span></td>
 <td class="a-muted-sm">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
 <td>
 ${u.status !== 'admin' ? `
 <div class="a-btn-group">
 <button class="a-btn a-btn-ban" data-ban="${u.id}">Ban</button>
 <button class="a-btn a-btn-stop" data-suspend="${u.id}">Suspend</button>
 </div>
 ` : '<span class="a-muted-sm">—</span>'}
 </td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 </div>`;
 },

 mlmodel() {
 return `
 <div class="a-topbar">
 <h1>ML Model Status</h1>
 <div class="a-topbar-chip"><div class="a-pulse"></div><span style="color:var(--ae);font-weight:500;">Online</span></div>
 </div>
 <div class="a-card" style="margin-bottom:20px;">
 <div class="a-ml-head">
 <div class="a-ml-icon"><i class="fas fa-brain"></i></div>
 <div><h2>quant_brain</h2><span>Digit prediction model · v3.2.1</span></div>
 </div>
 <div class="a-ml-metrics">
 <div class="a-ml-met"><div class="a-ml-met-label">Accuracy</div><div class="a-ml-met-val a-em">73.4%</div></div>
 <div class="a-ml-met"><div class="a-ml-met-label">Predictions (24h)</div><div class="a-ml-met-val">12,847</div></div>
 <div class="a-ml-met"><div class="a-ml-met-label">Last Retrain</div><div class="a-ml-met-val" style="font-size:16px;">2h 14m</div></div>
 </div>
 <button class="a-btn a-btn-start a-retrain-btn" id="retrainBtn"><i class="fas fa-sync-alt" style="margin-right:8px;"></i>Retrain Model</button>
 </div>
 <div class="a-card">
 <div class="a-card-head"><h3>Accuracy by Market</h3></div>
 ${[{n:'R_10',a:75.2},{n:'R_25',a:73.8},{n:'R_50',a:72.1},{n:'R_75',a:70.4},{n:'R_100',a:68.9}].map(m => `
 <div class="a-bar-row">
 <div class="a-bar-label"><span>${m.n}</span><span class="a-em">${m.a}%</span></div>
 <div class="a-bar-track"><div class="a-bar-fill" style="width:${m.a}%"></div></div>
 </div>
 `).join('')}
 </div>`;
 },

 bots() {
 const running = state.bots.filter(b => b.status === 'running').length;
 const paused = state.bots.filter(b => b.status === 'paused').length;
 const errors = state.bots.filter(b => b.status === 'error').length;
 return `
 <div class="a-topbar"><h1>Bot Control Room</h1></div>
 <div id="startPreviewModalOverlay" class="a-modal-overlay hidden">
 <div class="a-card" style="max-width:440px;width:100%;">
 <div class="a-card-head"><h3>Confirm Start</h3></div>
 <div id="startPreviewBody" style="font-size:13px;line-height:1.9;"></div>
 <div class="a-btn-group" style="margin-top:16px;">
 <button class="a-btn a-btn-start" id="startPreviewConfirmBtn">Start Bot</button>
 <button class="a-btn a-btn-ban" id="startPreviewCancelBtn">Cancel</button>
 </div>
 </div>
 </div>
 <div class="a-stats">
 <div class="a-stat"><div class="a-stat-label">Total</div><div class="a-stat-val" style="color:var(--ab);">${state.bots.length}</div></div>
 <div class="a-stat"><div class="a-stat-label">Running</div><div class="a-stat-val a-em">${running}</div></div>
 <div class="a-stat"><div class="a-stat-label">Paused</div><div class="a-stat-val a-gd">${paused}</div></div>
 <div class="a-stat"><div class="a-stat-label">Errors</div><div class="a-stat-val" style="color:var(--ad);">${errors}</div></div>
 </div>
 <div class="a-card a-card-table">
 <table class="a-table">
 <thead><tr><th>Bot ID</th><th>Owner</th><th>Market</th><th>Strategy</th><th>Trades</th><th>Win Rate</th><th>Status</th><th>Actions</th></tr></thead>
 <tbody>
 ${state.bots.length === 0 ? '<tr><td colspan="8" class="a-muted-sm">No bots found.</td></tr>' :
 state.bots.map(b => `
 <tr>
 <td class="a-em" style="font-family:'JetBrains Mono',monospace;font-size:11px;">${b.id || '—'}</td>
 <td>${b.user_email || '—'}</td>
 <td class="a-muted-sm">${b.symbol || '—'}</td>
 <td>${b.strategy || '—'}</td>
 <td style="font-family:'JetBrains Mono',monospace;">${b.total_trades || 0}</td>
 <td style="font-family:'JetBrains Mono',monospace;color:${(b.win_rate||0) >= 70 ? 'var(--ae)' : (b.win_rate||0) >= 60 ? 'var(--ag)' : 'var(--ad)'};">${b.win_rate || 0}%</td>
 <td><span class="a-sev a-sev-${b.status === 'running' ? 'success' : b.status === 'paused' ? 'warning' : 'critical'}">${b.status || 'unknown'}</span></td>
 <td>
 ${b.status === 'running'
 ? `<button class="a-btn a-btn-stop" data-bot-stop="${b.id}">Stop</button>`
 : `<button class="a-btn a-btn-start" data-bot-start="${b.id}">Start</button>`}
 </td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 </div>`;
 },
 botcatalog() {
 const statusColor = {
 draft: 'info',
 tested: 'warning',
 deployed: 'success',
 retracted: 'critical',
 };
 return `
 <div class="a-topbar">
 <h1>Bot Catalog</h1>
 <button class="a-btn a-btn-start" id="openUploadFormBtn">+ Upload New Template</button>
 </div>

 <div id="bulkDeleteBar" class="a-card hidden" style="margin-bottom:16px;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;">
 <span class="a-muted-sm"><span id="bulkSelectedCount">0</span> template(s) selected</span>
 <button class="a-btn a-btn-ban" id="bulkDeleteBtn">Delete Selected</button>
 </div>

 <div id="uploadFormWrap" class="a-card hidden" style="margin-bottom:20px;">
 <div class="a-card-head"><h3>Upload Bot Template</h3></div>
 <form id="uploadTemplateForm" class="a-upload-form">
 <div class="a-form-row">
 <label>Name <span class="a-muted-sm">(auto-filled from filename — edit if you want something different)</span></label>
 <input type="text" id="tplName" maxlength="100" placeholder="Pick an XML file below to auto-fill">
 </div>
 <div class="a-form-row">
 <label>Description</label>
 <textarea id="tplDescription" maxlength="1000" placeholder="Optional description"></textarea>
 </div>
 <div class="a-form-row">
 <label>Strategy type</label>
 <input type="text" id="tplStrategyType" maxlength="100" placeholder="e.g. digit_pattern">
 </div>
 <div class="a-form-row">
 <label>Risk level</label>
 <select id="tplRiskLevel">
 <option value="">—</option>
 <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 </select>
 </div>
 <div class="a-form-row">
 <label>Tier</label>
 <select id="tplTier">
 <option value="free">Free</option>
 <option value="premium">Premium</option>
 </select>
 </div>
 <div class="a-form-row">
 <label>XML file</label>
 <input type="file" id="tplXmlFile" accept=".xml" required>
 </div>
 <div id="uploadProgressWrap" class="a-progress-wrap hidden">
 <div class="a-progress-track">
 <div class="a-progress-fill" id="uploadProgressFill" style="width:0%;"></div>
 </div>
 <span class="a-muted-sm" id="uploadProgressLabel">0%</span>
 </div>
 <div id="uploadError" class="a-form-error hidden"></div>
 <div class="a-btn-group" style="margin-top:12px;">
 <button type="submit" class="a-btn a-btn-start" id="uploadSubmitBtn">Upload as Draft</button>
 <button type="button" class="a-btn a-btn-ban" id="cancelUploadBtn">Cancel</button>
 </div>
 </form>
 </div>

 <div class="a-card a-card-table">
 <table class="a-table">
 <thead>
 <tr>
 <th style="width:36px;"><input type="checkbox" id="selectAllTemplates"></th>
 <th>Name</th><th>Strategy</th><th>Risk</th><th>Tier</th><th>Status</th><th>Uploaded</th><th>Actions</th>
 </tr>
 </thead>
 <tbody>
 ${state.botTemplates.length === 0 ? '<tr><td colspan="8" class="a-muted-sm">No templates uploaded yet.</td></tr>' :
 state.botTemplates.map(t => `
 <tr>
 <td><input type="checkbox" class="tpl-select" data-tpl-id="${t.id}" ${state.selectedTemplateIds.has(String(t.id)) ? 'checked' : ''}></td>
 <td style="color:var(--ab);font-weight:500;">${t.name}</td>
 <td class="a-muted-sm">${t.strategy_type || '—'}</td>
 <td class="a-muted-sm">${t.risk_level || '—'}</td>
 <td>
 <select data-tier-select="${t.id}" class="a-tier-select" style="background:var(--as);border:1px solid var(--abr);border-radius:5px;color:var(--ab);font-size:11px;padding:3px 6px;">
 <option value="free" ${t.tier === 'free' ? 'selected' : ''}>Free</option>
 <option value="premium" ${t.tier === 'premium' ? 'selected' : ''}>Premium</option>
 </select>
 </td>
 <td><span class="a-sev a-sev-${statusColor[t.status] || 'info'}">${t.status}</span></td>
 <td class="a-muted-sm">${t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
 <td>
 <div class="a-btn-group">
 <button class="a-btn a-btn-start" data-test-run="${t.id}" data-template-name="${t.name}">Test Run</button>
 ${t.status !== 'deployed' ? `<button class="a-btn a-btn-start" data-deploy="${t.id}">Deploy</button>` : ''}
 ${t.status === 'deployed' ? `<button class="a-btn a-btn-stop" data-retract="${t.id}">Retract</button>` : ''}
 <button class="a-btn a-btn-ban" data-delete-template="${t.id}">Delete</button>
 </div>
 </td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 </div>

 <div id="testRunModalOverlay" class="a-modal-overlay hidden">
 <div class="a-card" style="max-width:420px;width:100%;">
 <div class="a-card-head"><h3 id="testRunModalTitle">Test Run</h3></div>
 <div class="a-form-row">
 <label>Account (yours)</label>
 <select id="testRunAccount">
 <option value="">Loading accounts...</option>
 </select>
 </div>
 <div class="a-form-row">
 <label>Bot name (optional)</label>
 <input type="text" id="testRunBotName" maxlength="100" placeholder="[TEST] will be prefixed if blank">
 </div>
 <div id="testRunHistoryWrap" class="a-form-row hidden">
 <label>Previous Test Runs</label>
 <div id="testRunHistory" style="max-height:140px;overflow-y:auto;font-size:11px;"></div>
 </div>
 <div id="testRunError" class="a-form-error hidden"></div>
 <div class="a-btn-group" style="margin-top:12px;">
 <button class="a-btn a-btn-start" id="testRunConfirmBtn" disabled>Create Test Instance</button>
 <button class="a-btn a-btn-ban" id="testRunCancelBtn">Cancel</button>
 </div>
 </div>
 </div>
 `;
 }, 
 health() {
 return `
 <div class="a-topbar">
 <h1>System Health</h1>
 <div class="a-topbar-chip"><div class="a-pulse"></div><span style="color:var(--ae);">All Healthy</span></div>
 </div>
 <div class="a-grid">
 ${state.services.map(s => `
 <div class="a-card">
 <div class="a-health-card-head">
 <div class="a-health-left"><div class="a-hdot a-hdot-${s.status}"></div><div><div style="color:var(--ab);font-weight:600;">${s.name}</div><div class="a-muted-sm" style="font-family:'JetBrains Mono',monospace;">:${s.port}</div></div></div>
 <span class="a-sev a-sev-success">${s.status}</span>
 </div>
 <div class="a-health-card-foot"><span class="a-muted-sm">Latency</span><span style="font-family:'JetBrains Mono',monospace;">${s.latency}</span></div>
 </div>
 `).join('')}
 </div>`;
 },

 revenue() {
 const weeks = [
 {w:'Wk 1',v:3210},{w:'Wk 2',v:3380},{w:'Wk 3',v:3450},{w:'Wk 4',v:3590},
 {w:'Wk 5',v:3720},{w:'Wk 6',v:3890},{w:'Wk 7',v:4010},{w:'Wk 8',v:4218}
 ];
 const mx = Math.max(...weeks.map(w => w.v));
 return `
 <div class="a-topbar"><h1>Revenue Analytics</h1></div>
 <div class="a-stats">
 <div class="a-stat"><div class="a-stat-label">Monthly Recurring</div><div class="a-stat-val a-gd">$4,218</div></div>
 <div class="a-stat"><div class="a-stat-label">Active Subscriptions</div><div class="a-stat-val" style="color:var(--ab);">67</div></div>
 <div class="a-stat"><div class="a-stat-label">Avg Revenue / User</div><div class="a-stat-val">$62.96</div></div>
 <div class="a-stat"><div class="a-stat-label">Churn Rate</div><div class="a-stat-val a-em">2.1%</div></div>
 </div>
 <div class="a-card" style="margin-bottom:20px;">
 <div class="a-card-head"><h3>MRR Trend (8 Weeks)</h3></div>
 ${weeks.map(w => `
 <div class="a-rev-bar" style="width:${(w.v/mx*100)}%;">
 <span class="a-rev-bar-l">${w.w}</span>
 <span class="a-rev-bar-r">$${w.v.toLocaleString()}</span>
 </div>
 `).join('')}
 </div>
 <div class="a-grid" style="grid-template-columns:repeat(3,1fr);">
 <div class="a-card" style="text-align:center;"><div class="a-stat-label">Starter ($9/mo)</div><div style="color:var(--ab);font-size:24px;font-weight:700;margin:12px 0;">28</div><div class="a-muted-sm">42% of total</div></div>
 <div class="a-card" style="text-align:center;"><div class="a-stat-label">Pro ($29/mo)</div><div style="color:var(--ab);font-size:24px;font-weight:700;margin:12px 0;">29</div><div class="a-muted-sm">43% of total</div></div>
 <div class="a-card" style="text-align:center;"><div class="a-stat-label">Enterprise ($99/mo)</div><div style="color:var(--ag);font-size:24px;font-weight:700;margin:12px 0;">10</div><div class="a-muted-sm">15% of total</div></div>
 </div>`;
 },

 audit() {
 return `
 <div class="a-topbar">
 <h1>Audit Log</h1>
 <span class="a-muted-sm" style="font-family:'JetBrains Mono',monospace;">${state.auditLog.length} events</span>
 </div>
 <div class="a-card">
 ${state.auditLog.length === 0 ? '<p class="a-muted-sm">No events recorded yet.</p>' :
 state.auditLog.map(e => `
 <div class="a-audit-row">
 <span class="a-audit-time">${e.time}</span>
 <span class="a-sev a-sev-${e.severity}">${e.severity}</span>
 <span class="a-audit-action">${e.action}</span>
 <span class="a-audit-detail">${e.detail}</span>
 </div>
 `).join('')}
 </div>`;
 },
 };
 return (p[state.page] || p.overview)();
 }

 app.innerHTML = `
 <style>
 .a-root{--abg:#060d09;--as:#0c1810;--ac:#12261c;--abr:#1d3829;--am:#a8cbb8;--at:#e2f1ea;--ab:#f4faf7;--ae:#34d399;--aed:#10b981;--ag:#fbbf24;--agd:#f59e0b;--ad:#f87171;--ai:#22d3ee;
 .a-side{width:240px;background:var(--as);border-right:1px solid var(--abr);padding:20px 0;flex-shrink:0;position:fixed;top:0;left:0;bottom:0;z-index:40;overflow-y:auto;}
 .a-side-logo{padding:0 20px 20px;border-bottom:1px solid var(--abr);margin-bottom:16px;}
 .a-side-logo h2{color:var(--ae);font-size:16px;font-weight:700;letter-spacing:1px;}
 .a-side-logo span{color:var(--am);font-size:10px;letter-spacing:2px;text-transform:uppercase;}
 .a-nav-sec{padding:8px 20px 4px;font-size:10px;font-weight:600;color:var(--am);letter-spacing:1.5px;text-transform:uppercase;}
 .a-nav-i{display:flex;align-items:center;gap:12px;padding:10px 20px;color:var(--am);font-size:13px;cursor:pointer;border-left:3px solid transparent;transition:all .2s;}
 .a-nav-i:hover{color:var(--at);background:rgba(16,185,129,.05);}
 .a-nav-i.active{color:var(--ae);background:rgba(16,185,129,.08);border-left-color:var(--ae);}
 .a-nav-i i{width:18px;text-align:center;font-size:14px;}
 .a-main{margin-left:240px;flex:1;padding:24px;position:relative;height:100vh;overflow-y:auto;box-sizing:border-box;}
 .a-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--abr);}
 .a-topbar h1{color:var(--ab);font-size:20px;font-weight:700;}
 .a-topbar-stats{display:flex;align-items:center;gap:16px;}
 .a-topbar-chip{display:flex;align-items:center;gap:8px;background:var(--as);border:1px solid var(--abr);padding:6px 12px;border-radius:6px;font-size:11px;color:var(--am);}
 .a-topbar-chip i{font-size:11px;}
 .a-em{color:var(--ae);font-family:'JetBrains Mono',monospace;font-weight:700;}
 .a-gd{color:var(--ag);font-family:'JetBrains Mono',monospace;font-weight:700;}
 .a-if{color:var(--ai);font-family:'JetBrains Mono',monospace;font-weight:700;}
 .a-stats{display:flex;gap:16px;margin-bottom:24px;}
 .a-stat{flex:1;background:var(--ac);border:1px solid var(--abr);border-radius:10px;padding:20px;}
 .a-stat-label{font-size:11px;color:var(--am);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;}
 .a-stat-val{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;}
 .a-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
 .a-card{background:var(--ac);border:1px solid var(--abr);border-radius:10px;padding:20px;}
 .a-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
 .a-card-head h3{color:var(--ab);font-size:14px;font-weight:600;}
 .a-card-head a{color:var(--am);font-size:12px;cursor:pointer;text-decoration:none;}
 .a-card-head a:hover{color:var(--ae);}
 .a-card-table{padding:0;overflow-x:auto;}
 .a-muted-sm{color:var(--am);font-size:12px;}
 .a-kill-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--abr);}
 .a-kill-row:last-child{border-bottom:none;}
 .a-kill-info h4{color:var(--ab);font-size:13px;font-weight:600;margin-bottom:4px;}
 .a-kill-info p{color:var(--am);font-size:11px;}
 .a-kill-toggle{width:48px;height:26px;border-radius:13px;background:var(--abr);cursor:pointer;position:relative;transition:background .3s;flex-shrink:0;}
 .a-kill-toggle.active{background:var(--ad);box-shadow:0 0 16px rgba(239,68,68,.3);}
 .a-kill-toggle::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--ab);transition:transform .3s cubic-bezier(.19,1,.22,1);}
 .a-kill-toggle.active::after{transform:translateX(22px);}
 .a-flag-toggle{width:40px;height:22px;border-radius:11px;background:var(--abr);cursor:pointer;position:relative;transition:background .3s;flex-shrink:0;}
 .a-flag-toggle.active{background:var(--aed);}
 .a-flag-toggle::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--ab);transition:transform .3s cubic-bezier(.19,1,.22,1);}
 .a-flag-toggle.active::after{transform:translateX(18px);}
 .a-sev{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
 .a-sev-critical{background:rgba(239,68,68,.15);color:#f87171;}
 .a-sev-warning{background:rgba(245,158,11,.15);color:#fbbf24;}
 .a-sev-info{background:rgba(6,182,212,.15);color:#22d3ee;}
 .a-sev-success{background:rgba(16,185,129,.15);color:#34d399;}
 .a-audit-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(26,51,40,.5);font-size:12px;}
 .a-audit-row:last-child{border-bottom:none;}
 .a-audit-time{color:var(--am);font-family:'JetBrains Mono',monospace;font-size:11px;width:60px;flex-shrink:0;}
 .a-audit-action{color:var(--ab);width:110px;flex-shrink:0;font-weight:500;}
 .a-audit-detail{color:var(--am);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
 .a-health-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(26,51,40,.5);}
 .a-health-row:last-child{border-bottom:none;}
 .a-health-left{display:flex;align-items:center;gap:12px;font-size:13px;}
 .a-health-lat{color:var(--am);font-family:'JetBrains Mono',monospace;font-size:11px;}
 .a-hdot{width:8px;height:8px;border-radius:50%;}
 .a-hdot-healthy{background:var(--ae);box-shadow:0 0 8px rgba(16,185,129,.4);}
 .a-hdot-degraded{background:var(--ag);box-shadow:0 0 8px rgba(245,158,11,.4);}
 .a-hdot-down{background:var(--ad);box-shadow:0 0 8px rgba(239,68,68,.4);}
 .a-health-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
 .a-health-card-foot{display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid var(--abr);font-size:11px;}
 .a-table{width:100%;border-collapse:collapse;}
 .a-table th{text-align:left;padding:10px 16px;font-size:10px;font-weight:600;color:var(--am);text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--abr);}
 .a-table td{padding:12px 16px;font-size:12px;border-bottom:1px solid rgba(26,51,40,.3);color:var(--at);}
 .a-table tr:hover td{background:rgba(16,185,129,.03);}
 .a-btn{padding:5px 12px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid;background:transparent;transition:all .2s;font-family:inherit;}
 .a-btn-group{display:flex;gap:6px;}
 .a-btn-ban{color:var(--ad);border-color:rgba(239,68,68,.3);}
 .a-btn-ban:hover{background:rgba(239,68,68,.1);}
 .a-btn-stop{color:var(--ag);border-color:rgba(245,158,11,.3);}
 .a-btn-stop:hover{background:rgba(245,158,11,.1);}
 .a-btn-start{color:var(--ae);border-color:rgba(16,185,129,.3);}
 .a-btn-start:hover{background:rgba(16,185,129,.1);}
 .a-retrain-btn{padding:10px 24px;font-size:13px;}
 .a-ml-head{display:flex;align-items:center;gap:16px;margin-bottom:20px;}
 .a-ml-icon{width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(245,158,11,.1));border:1px solid rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center;color:var(--ae);font-size:20px;}
 .a-ml-head h2{color:var(--ab);font-size:18px;font-weight:700;margin:0;}
 .a-ml-head span{color:var(--am);font-size:12px;}
 .a-ml-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;}
 .a-ml-met{text-align:center;padding:16px;background:var(--as);border-radius:8px;}
 .a-ml-met-label{font-size:10px;color:var(--am);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
 .a-ml-met-val{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:var(--ab);}
 .a-bar-row{margin-bottom:14px;}
 .a-bar-label{display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px;}
 .a-bar-track{height:4px;background:var(--abr);border-radius:2px;}
 .a-bar-fill{height:100%;background:var(--ae);border-radius:2px;}
 .a-rev-bar{height:24px;background:var(--ae);border-radius:4px;position:relative;margin-bottom:8px;}
 .a-rev-bar-l{position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:#fff;}
 .a-rev-bar-r{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:11px;font-family:'JetBrains Mono',monospace;color:#fff;}
 .a-warn-card{margin-bottom:20px;border-color:rgba(239,68,68,.2);}
 .a-warn-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
 .a-warn-head i{color:var(--ad);}
 .a-warn-head h3{color:var(--ab);font-size:14px;font-weight:600;margin:0;}
 .a-warn-card p{color:var(--am);font-size:12px;margin:0;}
 .a-pulse{width:6px;height:6px;border-radius:50%;background:var(--ae);animation:aPulse 2s infinite;}
 @keyframes aPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(16,185,129,.4);}50%{opacity:.8;box-shadow:0 0 0 6px rgba(16,185,129,0);}}
 .a-toast{position:fixed;top:20px;right:20px;z-index:9999;padding:14px 20px;border-radius:8px;font-size:13px;display:flex;align-items:center;gap:10px;animation:aToastIn .3s ease;border:1px solid;transition:opacity .3s;font-family:'Space Grotesk',sans-serif;}
 .a-toast-success{background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.3);color:#6ee7b7;}
 .a-toast-danger{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.3);color:#fca5a5;}
 .a-toast-warning{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.3);color:#fde68a;}
 @keyframes aToastIn{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}
 .a-back{color:var(--am);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;margin-bottom:16px;background:none;border:none;font-family:inherit;}
 .a-back:hover{color:var(--ae);}
 .hidden{display:none !important;}
 .a-form-row{margin-bottom:14px;}
 .a-form-row label{display:block;font-size:12px;color:var(--am);margin-bottom:6px;}
 .a-form-row input[type="text"],.a-form-row input[type="file"],.a-form-row select,.a-form-row textarea{
 width:100%;background:var(--as);border:1px solid var(--abr);border-radius:6px;
 padding:8px 12px;color:var(--ab);font-size:13px;font-family:inherit;
 }
 .a-form-row textarea{min-height:60px;resize:vertical;}
 .a-form-error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);
 color:#f87171;padding:10px;border-radius:6px;font-size:12px;}
 .a-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);
 display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;}
 .a-progress-wrap{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
 .a-progress-track{flex:1;height:8px;background:var(--abr);border-radius:4px;overflow:hidden;}
 .a-progress-fill{height:100%;background:var(--ae);border-radius:4px;transition:width .15s linear;}
 </style>

 <div class="a-root">
 <aside class="a-side">
 <div class="a-side-logo">
 <h2>ADMIN</h2>
 <span>Command Center</span>
 </div>
 <div class="a-nav-sec">Operations</div>
 <div class="a-nav-i active" data-page="overview"><i class="fas fa-th-large"></i> Overview</div>
 <div class="a-nav-i" data-page="killswitches"><i class="fas fa-power-off"></i> Kill Switches</div>
 <div class="a-nav-i" data-page="features"><i class="fas fa-flag"></i> Feature Flags</div>
 <div class="a-nav-i" data-page="users"><i class="fas fa-users"></i> Users</div>
 <div class="a-nav-sec">Intelligence</div>
 <div class="a-nav-i" data-page="mlmodel"><i class="fas fa-brain"></i> ML Model</div>
 <div class="a-nav-i" data-page="bots"><i class="fas fa-robot"></i> Bot Control</div>
 <div class="a-nav-i" data-page="botcatalog"><i class="fas fa-layer-group"></i> Bot Catalog</div>
 <div class="a-nav-sec">Systems</div>
 <div class="a-nav-i" data-page="health"><i class="fas fa-heartbeat"></i> Health</div>
 <div class="a-nav-i" data-page="revenue"><i class="fas fa-chart-line"></i> Revenue</div>
 <div class="a-nav-i" data-page="audit"><i class="fas fa-clipboard-list"></i> Audit Log</div>
 <div style="padding:16px 20px;margin-top:auto;border-top:1px solid var(--abr);position:absolute;bottom:0;left:0;right:0;">
 <button class="a-back" id="backToDashboard"><i class="fas fa-arrow-left"></i> Back to Trading</button>
 </div>
 </aside>
 <main class="a-main" id="aContent"></main>
 </div>
 `;

 // Render page content
 function renderPage() {
 document.getElementById('aContent').innerHTML = content();
 attachEvents();
 }

 function attachEvents() {
 // Navigation
 document.querySelectorAll('.a-nav-i').forEach(el => {
 el.addEventListener('click', () => {
 document.querySelectorAll('.a-nav-i').forEach(n => n.classList.remove('active'));
 el.classList.add('active');
 state.page = el.dataset.page;
 renderPage();
 });
 });

 // Audit page links
 document.querySelectorAll('[data-nav]').forEach(el => {
 el.addEventListener('click', () => {
 const page = el.dataset.nav;
 document.querySelectorAll('.a-nav-i').forEach(n => {
 n.classList.toggle('active', n.dataset.page === page);
 });
 state.page = page;
 renderPage();
 });
 });

 // Back to dashboard
 document.getElementById('backToDashboard')?.addEventListener('click', () => navigate('dashboard'));

 // Kill switches
 document.getElementById('kHalt')?.addEventListener('click', () => {
 state.killSwitches.halt = !state.killSwitches.halt;
 document.getElementById('kHalt').classList.toggle('active');
 const st = document.getElementById('kHaltSt');
 st.textContent = state.killSwitches.halt ? 'ALL TRADING HALTED' : 'All bots trading normally';
 st.style.color = state.killSwitches.halt ? 'var(--ad)' : 'var(--am)';
 toast(state.killSwitches.halt ? 'Trading halted' : 'Trading resumed', state.killSwitches.halt ? 'danger' : 'success');
 addAudit(state.killSwitches.halt ? 'critical' : 'success', 'Kill switch', `Halt trading ${state.killSwitches.halt ? 'activated' : 'deactivated'}`);
 });

 document.getElementById('kReg')?.addEventListener('click', () => {
 state.killSwitches.registrations = !state.killSwitches.registrations;
 document.getElementById('kReg').classList.toggle('active');
 const st = document.getElementById('kRegSt');
 st.textContent = state.killSwitches.registrations ? 'Registrations blocked' : 'New signups enabled';
 st.style.color = state.killSwitches.registrations ? 'var(--ag)' : 'var(--am)';
 toast(state.killSwitches.registrations ? 'Registrations paused' : 'Registrations enabled', 'warning');
 addAudit('warning', 'Kill switch', `Registrations ${state.killSwitches.registrations ? 'blocked' : 'enabled'}`);
 });

 document.getElementById('kMaint')?.addEventListener('click', () => {
 state.killSwitches.maintenance = !state.killSwitches.maintenance;
 document.getElementById('kMaint').classList.toggle('active');
 const st = document.getElementById('kMaintSt');
 st.textContent = state.killSwitches.maintenance ? 'MAINTENANCE ACTIVE' : 'Platform live';
 st.style.color = state.killSwitches.maintenance ? 'var(--ai)' : 'var(--am)';
 toast(state.killSwitches.maintenance ? 'Maintenance mode ON' : 'Maintenance mode OFF', 'warning');
 addAudit('critical', 'Kill switch', `Maintenance ${state.killSwitches.maintenance ? 'activated' : 'deactivated'}`);
 });

 // Feature flags
 document.querySelectorAll('.a-flag-toggle').forEach(el => {
 el.addEventListener('click', () => {
 const flag = state.featureFlags.find(f => f.id === el.dataset.flag);
 if (flag) {
 flag.enabled = !flag.enabled;
 el.classList.toggle('active');
 el.previousElementSibling.querySelector('p').textContent = flag.enabled ? 'Enabled' : 'Disabled';
 toast(`${flag.name} ${flag.enabled ? 'enabled' : 'disabled'}`, flag.enabled ? 'success' : 'warning');
 addAudit('info', 'Feature flag', `${flag.name} ${flag.enabled ? 'enabled' : 'disabled'}`);
 }
 });
 });

 // User ban
 document.querySelectorAll('[data-ban]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const id = btn.dataset.ban;
 if (!confirm('Ban this user?')) return;
 const res = await api.banUser(id);
 toast(res.message || 'User banned', 'danger');
 addAudit('critical', 'User banned', `User #${id} banned by admin`);
 await loadUsers();
 renderPage();
 });
 });

 // User suspend
 document.querySelectorAll('[data-suspend]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const id = btn.dataset.suspend;
 if (!confirm('Suspend this user?')) return;
 const res = await api.suspendUser(id);
 toast(res.message || 'User suspended', 'warning');
 addAudit('warning', 'User suspended', `User #${id} suspended by admin`);
 await loadUsers();
 renderPage();
 });
 });

 // Bot stop/start
 document.querySelectorAll('[data-bot-stop]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const id = btn.dataset.botStop;
 if (!confirm('Stop this bot?')) return;
 const res = await api.killBot(id);
 if (res.success !== false) {
 toast(res.message || `Bot #${id} stopped`, 'warning');
 addAudit('warning', 'Bot stopped', `Bot #${id} stopped by admin`);
 } else {
 toast(res.message || 'Failed to stop bot', 'danger');
 }
 await loadBots();
 renderPage();
 });
 });

 document.querySelectorAll('[data-bot-start]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const id = btn.dataset.botStart;
 const res = await api.adminBotStartPreview(id);

 if (!res.success) {
 toast(res.message || 'Cannot start this bot.', 'danger');
 return;
 }

 const d = res.data;
 const balanceStr = d.balance != null ? `${d.currency} ${Number(d.balance).toFixed(2)}` : 'balance not synced';
 const accountBadge = d.is_virtual
 ? '<span style="color:var(--am);">DEMO</span>'
 : '<span style="color:var(--ad);font-weight:700;">REAL MONEY</span>';
 const disconnectedWarning = d.connection_status !== 'connected'
 ? `<div style="margin-top:10px;padding:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:6px;color:var(--ad);font-size:12px;">
 This account is disconnected. Starting may fail or use a stale token.
 </div>`
 : '';

 document.getElementById('startPreviewBody').innerHTML = `
 <div><span style="color:var(--am);">Bot:</span> <strong>${d.bot_name}</strong></div>
 <div><span style="color:var(--am);">Owner:</span> ${d.owner_email}</div>
 <div><span style="color:var(--am);">Account:</span> ${d.provider || '—'} · ${d.account_type || '—'} ${accountBadge}</div>
 <div><span style="color:var(--am);">Balance:</span> ${balanceStr}</div>
 <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--abr);">
 <div><span style="color:var(--am);">Symbol:</span> ${d.symbol || '—'}</div>
 <div><span style="color:var(--am);">Stake per trade:</span> ${d.currency || ''} ${d.stake_per_trade}</div>
 <div><span style="color:var(--am);">Stop loss:</span> ${d.currency || ''} ${d.stop_loss_amount}</div>
 <div><span style="color:var(--am);">Take profit:</span> ${d.take_profit_amount ? (d.currency || '') + ' ' + d.take_profit_amount : '—'}</div>
 </div>
 ${disconnectedWarning}
 `;

 const overlay = document.getElementById('startPreviewModalOverlay');
 overlay.classList.remove('hidden');
 overlay.dataset.botId = id;
 document.getElementById('startPreviewConfirmBtn').disabled = false;
 document.getElementById('startPreviewConfirmBtn').textContent = 'Start Bot';
 });
 });

 document.getElementById('startPreviewCancelBtn')?.addEventListener('click', () => {
 document.getElementById('startPreviewModalOverlay').classList.add('hidden');
 });

 document.getElementById('startPreviewConfirmBtn')?.addEventListener('click', async () => {
 const overlay = document.getElementById('startPreviewModalOverlay');
 const id = overlay.dataset.botId;
 const confirmBtn = document.getElementById('startPreviewConfirmBtn');

 confirmBtn.disabled = true;
 confirmBtn.textContent = 'Starting...';

 const res = await api.adminStartBot(id);

 overlay.classList.add('hidden');

 if (res.success) {
 toast(res.message || `Bot #${id} starting`, 'success');
 addAudit('success', 'Bot started', `Bot #${id} started by admin`);
 } else {
 toast(res.message || 'Failed to start bot', 'danger');
 }
 await loadBots();
 renderPage();
 });

 // ── Bot Catalog: open/close upload form ──
 document.getElementById('openUploadFormBtn')?.addEventListener('click', () => {
 document.getElementById('uploadFormWrap').classList.remove('hidden');
 });
 document.getElementById('cancelUploadBtn')?.addEventListener('click', () => {
 document.getElementById('uploadFormWrap').classList.add('hidden');
 });

 // ── Bot Catalog: auto-fill name from the chosen XML filename ──
 document.getElementById('tplXmlFile')?.addEventListener('change', (e) => {
 const nameInput = document.getElementById('tplName');
 const file = e.target.files[0];
 if (!file || !nameInput || nameInput.value.trim()) return; // don't clobber a name the admin already typed
 const base = file.name.replace(/\.xml$/i, '');
 const spaced = base.replace(/[_-]/g, ' ').trim();
 nameInput.value = spaced.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
 });

 // ── Bot Catalog: upload submit ──
 document.getElementById('uploadTemplateForm')?.addEventListener('submit', async (e) => {
 e.preventDefault();
 const errorDiv = document.getElementById('uploadError');
 const submitBtn = document.getElementById('uploadSubmitBtn');
 const fileInput = document.getElementById('tplXmlFile');

 if (!fileInput.files.length) {
 errorDiv.textContent = 'Please choose an XML file.';
 errorDiv.classList.remove('hidden');
 return;
 }

 const formData = new FormData();
 formData.append('name', document.getElementById('tplName').value);
 formData.append('description', document.getElementById('tplDescription').value);
 formData.append('strategy_type', document.getElementById('tplStrategyType').value);
 formData.append('risk_level', document.getElementById('tplRiskLevel').value);
 formData.append('tier', document.getElementById('tplTier').value);
 formData.append('xml_file', fileInput.files[0]);

 submitBtn.textContent = 'Uploading...';
 submitBtn.disabled = true;

 const progressWrap = document.getElementById('uploadProgressWrap');
 const progressFill = document.getElementById('uploadProgressFill');
 const progressLabel = document.getElementById('uploadProgressLabel');
 progressWrap.classList.remove('hidden');

 let res;
 try {
 res = await api.uploadBotTemplateWithProgress(formData, (pct) => {
 progressFill.style.width = pct + '%';
 progressLabel.textContent = pct + '%';
 });
 } catch (err) {
 errorDiv.textContent = err.message || 'Upload failed.';
 errorDiv.classList.remove('hidden');
 submitBtn.textContent = 'Upload as Draft';
 submitBtn.disabled = false;
 progressWrap.classList.add('hidden');
 return;
 }

 if (res.success) {
 toast('Template uploaded as draft.', 'success');
 addAudit('info', 'Template uploaded', `${res.data.name} uploaded as draft`);
 await loadBotTemplates();
 renderPage();
 } else {
 errorDiv.textContent = res.message || (res.errors ? Object.values(res.errors).flat().join(' ') : 'Upload failed.');
 errorDiv.classList.remove('hidden');
 submitBtn.textContent = 'Upload as Draft';
 submitBtn.disabled = false;
 progressWrap.classList.add('hidden');
 }
 });

 // ── Bot Catalog: tier change ──
 document.querySelectorAll('[data-tier-select]').forEach(sel => {
 sel.addEventListener('change', async () => {
 const id = sel.dataset.tierSelect;
 const res = await api.updateBotTemplateTier(id, sel.value);
 if (res.success) {
 toast(res.message || 'Tier updated', 'success');
 addAudit('info', 'Template tier changed', `Template #${id} set to ${sel.value}`);
 } else {
 toast(res.message || 'Failed to update tier', 'danger');
 }
 await loadBotTemplates();
 renderPage();
 });
 });

 // ── Bot Catalog: deploy ──
 document.querySelectorAll('[data-deploy]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const id = btn.dataset.deploy;
 if (!confirm('Deploy this template to the public catalog? Regular users will be able to create bots from it.')) return;
 const res = await api.deployBotTemplate(id);
 toast(res.message || 'Deployed', 'success');
 addAudit('success', 'Template deployed', `Template #${id} deployed`);
 await loadBotTemplates();
 renderPage();
 });
 });

 // ── Bot Catalog: retract ──
 document.querySelectorAll('[data-retract]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const id = btn.dataset.retract;
 if (!confirm('Retract this template from the public catalog? You can redeploy it later.')) return;
 const res = await api.retractBotTemplate(id);
 toast(res.message || 'Retracted', 'warning');
 addAudit('warning', 'Template retracted', `Template #${id} retracted`);
 await loadBotTemplates();
 renderPage();
 });
 });

 // ── Bot Catalog: delete (with force-delete fallback) ──
 document.querySelectorAll('[data-delete-template]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const id = btn.dataset.deleteTemplate;
 if (!confirm('Delete this template permanently?')) return;

 let res = await api.deleteBotTemplate(id, false);

 if (!res.success && res.real_usage_count) {
 const forceMsg = `${res.message}\n\nType YES to force-delete anyway (real users' bots will be unlinked from this template, not deleted).`;
 const confirmForce = prompt(forceMsg);
 if (confirmForce !== 'YES') return;
 res = await api.deleteBotTemplate(id, true);
 }

 if (res.success) {
 toast(res.message || 'Deleted', 'danger');
 addAudit('critical', 'Template deleted', `Template #${id} deleted`);
 await loadBotTemplates();
 renderPage();
 } else {
 toast(res.message || 'Delete failed', 'danger');
 }
 });
 });


 // ── Bot Catalog: bulk selection ──
 function updateBulkBar() {
 const bar = document.getElementById('bulkDeleteBar');
 const countEl = document.getElementById('bulkSelectedCount');
 if (!bar || !countEl) return;
 const n = state.selectedTemplateIds.size;
 countEl.textContent = n;
 bar.classList.toggle('hidden', n === 0);
 }

 document.getElementById('selectAllTemplates')?.addEventListener('change', (e) => {
 document.querySelectorAll('.tpl-select').forEach(cb => {
 cb.checked = e.target.checked;
 if (e.target.checked) state.selectedTemplateIds.add(cb.dataset.tplId);
 else state.selectedTemplateIds.delete(cb.dataset.tplId);
 });
 updateBulkBar();
 });

 document.querySelectorAll('.tpl-select').forEach(cb => {
 cb.addEventListener('change', () => {
 if (cb.checked) state.selectedTemplateIds.add(cb.dataset.tplId);
 else state.selectedTemplateIds.delete(cb.dataset.tplId);
 const all = document.querySelectorAll('.tpl-select');
 const selectAll = document.getElementById('selectAllTemplates');
 if (selectAll) selectAll.checked = all.length > 0 && [...all].every(c => c.checked);
 updateBulkBar();
 });
 });

 updateBulkBar();

 // ── Bot Catalog: bulk delete ──
 document.getElementById('bulkDeleteBtn')?.addEventListener('click', async () => {
 const ids = [...state.selectedTemplateIds];
 if (ids.length === 0) return;
 if (!confirm(`Delete ${ids.length} selected template(s) permanently?`)) return;

 const deleted = [];
 const blocked = [];
 const failed = [];

 for (const id of ids) {
 const res = await api.deleteBotTemplate(id, false);
 if (res.success) deleted.push(id);
 else if (res.real_usage_count) blocked.push(id);
 else failed.push(id);
 }

 if (blocked.length > 0) {
 const forceMsg = `${blocked.length} template(s) are used by real user bots and were skipped.\n\nType YES to force-delete them anyway (their bots will be unlinked from the template, not deleted).`;
 if (prompt(forceMsg) === 'YES') {
 for (const id of blocked) {
 const res = await api.deleteBotTemplate(id, true);
 if (res.success) deleted.push(id);
 else failed.push(id);
 }
 }
 }

 deleted.forEach(id => addAudit('critical', 'Template deleted', `Template #${id} deleted`));

 const parts = [];
 if (deleted.length) parts.push(`${deleted.length} deleted`);
 if (failed.length) parts.push(`${failed.length} failed`);
 const stillBlocked = blocked.filter(id => !deleted.includes(id));
 if (stillBlocked.length) parts.push(`${stillBlocked.length} skipped`);
 toast(parts.join(', ') || 'No changes', deleted.length ? 'danger' : 'warning');

 state.selectedTemplateIds.clear();
 await loadBotTemplates();
 renderPage();
 });

 // ── Bot Catalog: test run modal open ──
 document.querySelectorAll('[data-test-run]').forEach(btn => {
 btn.addEventListener('click', async () => {
 const templateId = btn.dataset.testRun;
 const templateName = btn.dataset.templateName || '';
 const overlay = document.getElementById('testRunModalOverlay');
 overlay.classList.remove('hidden');
 overlay.dataset.templateId = templateId;

 document.getElementById('testRunModalTitle').textContent = templateName ? `Test Run — ${templateName}` : 'Test Run';

 // Show the real name this instance will get, not just a placeholder
 // hint -- still editable before confirming.
 const botNameInput = document.getElementById('testRunBotName');
 if (botNameInput) botNameInput.value = templateName ? `[TEST] ${templateName}` : '';

 // Nothing can be confirmed until a real account is chosen.
 const confirmBtn = document.getElementById('testRunConfirmBtn');
 if (confirmBtn) confirmBtn.disabled = true;

 const accountSelect = document.getElementById('testRunAccount');
 accountSelect.innerHTML = '<option value="">Loading accounts...</option>';

 const res = await api.myAccounts();
 const accounts = res.data || res.accounts || [];
 accountSelect.innerHTML = res.success !== false
 ? buildAccountOptionsHtml(accounts)
 : '<option value="">No connected accounts — connect one first</option>';

 // TODO: wire testRunHistory to AdminController::listTemplateTestRuns()
 // once I have the api.js call pattern for existing admin bot-template
 // endpoints -- see note below.
 });
 });

 document.getElementById('testRunCancelBtn')?.addEventListener('click', () => {
 document.getElementById('testRunModalOverlay').classList.add('hidden');
 });

 // ── Test Run: only activate once a real account is picked ──
 document.getElementById('testRunAccount')?.addEventListener('change', (e) => {
 const confirmBtn = document.getElementById('testRunConfirmBtn');
 if (confirmBtn) confirmBtn.disabled = !e.target.value;
 });

 document.getElementById('testRunConfirmBtn')?.addEventListener('click', async () => {
 const overlay = document.getElementById('testRunModalOverlay');
 const templateId = overlay.dataset.templateId;
 const accountId = document.getElementById('testRunAccount').value;
 const botName = document.getElementById('testRunBotName').value;
 const errorDiv = document.getElementById('testRunError');

 if (!accountId) {
 errorDiv.textContent = 'Please select an account.';
 errorDiv.classList.remove('hidden');
 return;
 }

 const res = await api.testRunBotTemplate(templateId, { account_id: accountId, bot_name: botName || null });

 if (res.success) {
 overlay.classList.add('hidden');
 toast('Test instance created. Configure it from your test runs list.', 'success');
 addAudit('info', 'Test run created', `Template #${templateId} test instance created`);
 await loadBotTemplates();
 renderPage();
 } else {
 errorDiv.textContent = res.message || 'Failed to create test instance.';
 errorDiv.classList.remove('hidden');
 }
 });

 // Retrain
 document.getElementById('retrainBtn')?.addEventListener('click', () => {
 const btn = document.getElementById('retrainBtn');
 btn.disabled = true;
 btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Retraining...';
 toast('Model retraining started...', 'warning');
 addAudit('info', 'Model retrain', 'quant_brain retraining initiated');
 setTimeout(() => {
 btn.disabled = false;
 btn.innerHTML = '<i class="fas fa-sync-alt" style="margin-right:8px;"></i>Retrain Model';
 toast('Model retrained — accuracy: 73.8%', 'success');
 addAudit('success', 'Model retrain', 'quant_brain retrained — 73.4% 73.8%');
 }, 3000);
 });
 }

 // Data loaders — real API calls
 async function loadStats() {
 try {
 const res = await api.adminStats();
 if (res.success) state.stats = res.stats;
 } catch (e) { /* silent — page still renders with — */ }
 }

 async function loadUsers() {
 try {
 const res = await api.adminUsers();
 if (res.success) state.users = res.users;
 } catch (e) { /* silent */ }
 }

 async function loadBots() {
 try {
 const res = await api.adminBots?.();
 if (res?.success) state.bots = res.bots;
 } catch (e) { /* silent — bots page shows empty */ }
 }

 async function loadBotTemplates() {
 try {
 const res = await api.listBotTemplates();
 if (res.success) state.botTemplates = res.templates;
 } catch (e) { /* silent — page shows empty */ }
 }

 // Load data, then render
 await Promise.all([loadStats(), loadUsers(), loadBots(), loadBotTemplates()]);
 renderPage();

 // Live TPM update
 const liveInterval = setInterval(() => {
 state.tpm = Math.max(80, state.tpm + Math.floor(Math.random() * 20) - 10);
 const botEl = document.getElementById('oBots');
 const tpmEl = document.getElementById('oTpm');
 if (botEl) botEl.textContent = state.bots.filter(b => b.status === 'running').length;
 if (tpmEl) tpmEl.textContent = state.tpm;
 }, 2000);

 // Cleanup
 return () => clearInterval(liveInterval);
}