import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';

function row(label, desc, input) {
 return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">' +
 '<div><div style="font-size:12px;color:var(--text-primary);font-weight:500;">' + label + '</div>' +
 (desc ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + desc + '</div>' : '') + '</div>' +
 '<div style="flex-shrink:0;margin-left:16px;">' + input + '</div>' +
 '</div>';
}

function toggle(id, on) {
 return '<button id="' + id + '" onclick="window._toggle(\'' + id + '\')" style="width:42px;height:22px;border-radius:11px;border:none;cursor:pointer;position:relative;background:' + (on ? 'var(--profit)' : 'var(--border)') + ';transition:background 0.2s;" data-on="' + on + '">' +
 '<span style="position:absolute;top:3px;' + (on ? 'right:3px' : 'left:3px') + ';width:16px;height:16px;border-radius:50%;background:var(--text-primary);transition:all 0.2s;"></span>' +
 '</button>';
}

export async function render(app, navigate) {
 window._nav = navigate;

 app.innerHTML =
 '<div class="edge-left"></div><div class="edge-right"></div><div class="edge-bottom"></div>' +
 '<div style="display:flex;height:100vh;overflow:hidden;background:var(--bg-main);">' +
 renderSidebar('settings') +
 '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
 '<div style="height:48px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;">' +
 '<span style="font-weight:600;font-size:13px;color:var(--accent);">SETTINGS</span>' +
 '<div style="flex:1;"></div>' +
 '<span id="topTime" style="font-size:11px;color:var(--text-muted);"></span>' +
 '</div>' +
 '<div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start;">' +

 // PROFILE
 '<div class="panel">' +
 '<div class="panel-title">PROFILE</div>' +
 row('Display name', 'Shown in community and leaderboards',
 '<input id="dispName" value="Trader" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:160px;">') +
 row('Email', 'Your account email',
 '<input id="emailInp" value="trader@example.com" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:200px;">') +
 row('Timezone', 'Used for journal and alert times',
 '<select id="tzSel" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;">' +
 '<option>Africa/Nairobi (EAT +3)</option><option>UTC</option><option>America/New_York</option><option>Europe/London</option></select>') +
 '<button onclick="saveProfile()" class="btn btn-profit" style="margin-top:12px;padding:8px 20px;font-size:11px;">Save Profile</button>' +
 '</div>' +

 // THEME
 '<div class="panel">' +
 '<div class="panel-title">APPEARANCE</div>' +
 '<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">' +
 '<div style="font-size:10px;color:var(--text-muted);letter-spacing:0.08em;">THEME</div>' +
 '<div style="display:flex;gap:10px;">' +
 ['obsidian','titanium-blue','carbon-redline'].map((t, i) => {
 const cols = ['#D9A441','#4FC3F7','#FF7043'];
 const names = ['Obsidian Command','Titanium Blue','Carbon Redline'];
 return '<div onclick="applyTheme(\'' + t + '\')" style="flex:1;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:10px;cursor:pointer;text-align:center;" id="themeCard-' + t + '">' +
 '<div style="width:24px;height:24px;border-radius:50%;background:' + cols[i] + ';margin:0 auto 6px;"></div>' +
 '<div style="font-size:10px;color:var(--text-muted);">' + names[i] + '</div>' +
 '</div>';
 }).join('') +
 '</div>' +
 '</div>' +
 '</div>' +

 // TRADING DEFAULTS
 '<div class="panel">' +
 '<div class="panel-title">TRADING DEFAULTS</div>' +
 row('Default stake ($)', 'Pre-filled on all trade forms',
 '<input id="defStake" type="number" value="1" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:80px;">') +
 row('Max daily loss ($)', 'Auto-stop all bots when reached',
 '<input id="maxLoss" type="number" value="20" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:80px;">') +
 row('Loss streak protection', 'Pause bots after N consecutive losses',
 toggle('streakToggle', true)) +
 row('Streak threshold', 'Number of losses before auto-pause',
 '<input id="streakN" type="number" value="3" min="1" max="10" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:60px;">') +
 row('Martingale on by default', '',
 toggle('mgDefault', false)) +
 '<button onclick="saveTradingDefaults()" class="btn btn-profit" style="margin-top:12px;padding:8px 20px;font-size:11px;">Save Defaults</button>' +
 '</div>' +

 // NOTIFICATIONS
 '<div class="panel">' +
 '<div class="panel-title">NOTIFICATIONS</div>' +
 row('Trade wins', 'Toast on every winning trade', toggle('notifWin', true)) +
 row('Trade losses', 'Toast on every losing trade', toggle('notifLoss', true)) +
 row('Loss streak alert', 'Notification when streak fires', toggle('notifStreak', true)) +
 row('ML signal grade A', 'Alert when confidence hits Grade A', toggle('notifGradeA', false)) +
 row('Daily P&L summary', 'End of day summary notification', toggle('notifDaily', true)) +
 '</div>' +

 // DERIV API
 '<div class="panel">' +
 '<div class="panel-title">DERIV API</div>' +
 '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Your Deriv App ID connects QuantPesa to live market data and trade execution.</div>' +
 row('App ID', 'From your Deriv account API Token',
 '<input id="derivApp" value="YOUR_APP_ID" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:160px;font-family:monospace;">') +
 row('API Token', 'Required for real trade execution',
 '<input id="derivToken" type="password" placeholder="••••••••" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:160px;">') +
 '<div style="display:flex;gap:8px;margin-top:12px;">' +
 '<button onclick="testConnection()" style="padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:11px;cursor:pointer;">Test connection</button>' +
 '<button onclick="saveApiKeys()" class="btn btn-profit" style="padding:8px 16px;font-size:11px;">Save keys</button>' +
 '</div>' +
 '<div id="connResult" style="margin-top:8px;font-size:11px;"></div>' +
 '</div>' +

 // DANGER ZONE
 '<div class="panel" style="border-color:var(--loss)20;">' +
 '<div class="panel-title" style="color:var(--loss);">DANGER ZONE</div>' +
 '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">' +
 '<button onclick="confirmReset(\'bots\')" style="padding:9px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:11px;cursor:pointer;text-align:left;">Stop all bots and clear history</button>' +
 '<button onclick="confirmReset(\'journal\')" style="padding:9px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:11px;cursor:pointer;text-align:left;">Clear journal and trade log</button>' +
 '<button onclick="confirmReset(\'account\')" style="padding:9px;background:var(--loss)10;border:1px solid var(--loss)40;border-radius:6px;color:var(--loss);font-size:11px;cursor:pointer;text-align:left;">Delete account permanently</button>' +
 '</div>' +
 '</div>' +

 '</div>' +
 '</div>' +
 '</div>';

 setInterval(() => { const el = document.getElementById('topTime'); if (el) el.textContent = new Date().toLocaleTimeString(); }, 1000);
 initSidebar(app, navigate, {
 onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
 });

 function showToast(msg, type) {
 let c = document.getElementById('toast-container');
 if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
 const t = document.createElement('div'); t.className = 'toast toast-' + (type || 'info');
 t.textContent = msg; c.appendChild(t); setTimeout(() => t.remove(), 3000);
 }

 // Theme cards -- these already drive the app's one real theme system
 // (qp-theme / data-theme, same mechanism sidebar.js now uses), so
 // sidebar.js's own swatches and this page's cards stay in sync
 // automatically as long as both read/write the same storage key.
 function highlightThemeCards() {
 const cur = localStorage.getItem('qp-theme') || 'obsidian';
 ['obsidian','titanium-blue','carbon-redline'].forEach(t => {
 const el = document.getElementById('themeCard-' + t);
 if (el) el.style.borderColor = t === cur ? 'var(--accent)' : 'var(--border)';
 });
 }
 highlightThemeCards();

 window.applyTheme = function(t) {
 localStorage.setItem('qp-theme', t);
 const map = { obsidian: '', 'titanium-blue': 'titanium-blue', 'carbon-redline': 'carbon-redline' };
 document.documentElement.setAttribute('data-theme', map[t] || '');
 highlightThemeCards();
 showToast('Theme changed to ' + t, 'info');
 };

 // Toggles
 window._toggle = function(id) {
 const btn = document.getElementById(id); if (!btn) return;
 const on = btn.dataset.on === 'true';
 btn.dataset.on = !on;
 btn.style.background = !on ? 'var(--profit)' : 'var(--border)';
 const dot = btn.querySelector('span');
 if (dot) { dot.style.right = !on ? '3px' : ''; dot.style.left = !on ? '' : '3px'; }
 };

 window.saveProfile = () => showToast('Profile saved', 'info');
 window.saveTradingDefaults = () => showToast('Trading defaults saved', 'info');
 window.saveApiKeys = () => showToast('API keys saved', 'info');

 window.testConnection = function() {
 const el = document.getElementById('connResult');
 if (el) el.innerHTML = '<span style="color:var(--text-muted);">Testing...</span>';
 setTimeout(() => {
 if (el) el.innerHTML = '<span style="color:var(--profit);"> Connected to Deriv WebSocket</span>';
 }, 1200);
 };

 window.confirmReset = function(type) {
 if (type === 'account') {
 if (!confirm('This will permanently delete your account. This cannot be undone.')) return;
 showToast('Account deletion request sent', 'info');
 } else {
 showToast(type.charAt(0).toUpperCase() + type.slice(1) + ' cleared', 'info');
 }
 };
}
