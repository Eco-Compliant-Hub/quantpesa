import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';

const POLL_INTERVAL_MS = 4000;
let pollTimer = null;

export async function render(app, navigate) {
 app.innerHTML = `
 <div class="flex h-screen bg-[var(--bg-main)] overflow-hidden">

 ${renderSidebar('accounts', { isAdmin: auth.isAdmin() })}

 <!-- Main Content -->
 <main class="flex-1 overflow-y-auto p-8">
 <div class="flex items-center justify-between mb-8">
 <div>
 <h2 class="text-2xl font-bold text-[var(--text-primary)]">Broker Accounts</h2>
 <p class="text-[var(--text-muted)] mt-1">Connect and monitor your Deriv accounts.</p>
 </div>
 <button id="newConnectionBtn" class="btn btn-profit px-4 py-2 text-sm">
 + Connect Account
 </button>
 </div>

 <!-- Connect Form (hidden by default) -->
 <div id="connectForm" class="hidden panel p-6 mb-6">
 <h3 class="font-semibold mb-4 text-[var(--text-primary)]">Connect a Deriv Account</h3>
 <div id="connectError" class="hidden bg-[var(--loss)]/10 border border-[var(--loss)]/30 text-[var(--loss)] rounded-lg p-3 mb-4 text-sm"></div>
 <div class="grid grid-cols-2 gap-4">
 <div>
 <label class="block text-sm text-[var(--text-muted)] mb-1">Provider</label>
 <select id="providerSelect" class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition">
 <option value="">Loading providers...</option>
 </select>
 </div>
 <div>
 <label class="block text-sm text-[var(--text-muted)] mb-1">Account Type</label>
 <select id="accountTypeSelect" class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition">
 <option value="">Select a provider first</option>
 </select>
 </div>
 <div>
 <label class="block text-sm text-[var(--text-muted)] mb-1">API Token</label>
 <input id="apiTokenInput" type="password" placeholder="Deriv API token"
 class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition">
 </div>
 <div>
 <label class="block text-sm text-[var(--text-muted)] mb-1">Deriv Login ID</label>
 <input id="brokerAccountIdInput" type="text" placeholder="e.g. DOT93145924"
 class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition">
 </div>
 <div>
 <label class="block text-sm text-[var(--text-muted)] mb-1">Currency</label>
 <input id="currencyInput" type="text" placeholder="USD" maxlength="10"
 class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition">
 </div>
 </div>
 <div class="flex gap-3 mt-4">
 <button id="submitConnectBtn" class="btn btn-profit px-4 py-2 text-sm">
 Connect
 </button>
 <button id="cancelConnectBtn" class="px-4 py-2 bg-[var(--bg-panel)] hover:bg-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg transition">
 Cancel
 </button>
 </div>
 <p class="text-[var(--text-muted)] text-xs mt-3">
 Your token is encrypted at rest. Connection status only becomes verified once a bot has run on this account — see status below.
 </p>
 </div>

 <!-- Accounts List -->
 <div id="accountsList">
 <p class="text-[var(--text-muted)] text-sm">Loading accounts...</p>
 </div>
 </main>
 </div>
 `;

 // Sidebar nav / theme swatches / logout — shared module
 initSidebar(app, navigate, {
 onLogout: async () => { stopPolling(); await api.logout(); auth.logout(); navigate('login'); },
 });

 // Show/hide connect form
 document.getElementById('newConnectionBtn').addEventListener('click', async () => {
 document.getElementById('connectForm').classList.remove('hidden');
 await loadProviders();
 });
 document.getElementById('cancelConnectBtn').addEventListener('click', () => {
 document.getElementById('connectForm').classList.add('hidden');
 });

 // Provider -> account type cascade
 document.getElementById('providerSelect').addEventListener('change', async (e) => {
 const providerId = e.target.value;
 const typeSelect = document.getElementById('accountTypeSelect');
 if (!providerId) {
 typeSelect.innerHTML = '<option value="">Select a provider first</option>';
 return;
 }
 typeSelect.innerHTML = '<option value="">Loading...</option>';
 const res = await api.accountTypes(providerId);
 if (res.success && res.account_types?.length) {
 typeSelect.innerHTML = res.account_types
 .map(t => `<option value="${t.id}" data-currency="${t.currency}">${t.name}</option>`)
 .join('');
 } else {
 typeSelect.innerHTML = '<option value="">No account types found</option>';
 }
 });

// Auto-fill currency when an account type is chosen
 document.getElementById('accountTypeSelect').addEventListener('change', (e) => {
 const selectedOption = e.target.selectedOptions[0];
 const currency = selectedOption?.dataset?.currency;
 const currencyInput = document.getElementById('currencyInput');
 if (currency && currencyInput) {
 currencyInput.value = currency;
 }
 });


 // Submit connection
 document.getElementById('submitConnectBtn').addEventListener('click', async () => {
 const providerId = document.getElementById('providerSelect').value;
 const accountTypeId = document.getElementById('accountTypeSelect').value;
 const apiToken = document.getElementById('apiTokenInput').value;
 const brokerAccountId = document.getElementById('brokerAccountIdInput').value;
 const currency = document.getElementById('currencyInput').value;
 const errorDiv = document.getElementById('connectError');
 const btn = document.getElementById('submitConnectBtn');

 if (!providerId || !accountTypeId || !apiToken || !brokerAccountId || !currency) {
 errorDiv.textContent = 'Please fill in all fields.';
 errorDiv.classList.remove('hidden');
 return;
 }

 btn.textContent = 'Connecting...';
 btn.disabled = true;

 const res = await api.connectAccount({
 provider_id: providerId,
 account_type_id: accountTypeId,
 api_token: apiToken,
 broker_account_id: brokerAccountId,
 currency: currency,
 });

 if (res.success) {
 document.getElementById('connectForm').classList.add('hidden');
 document.getElementById('apiTokenInput').value = '';
 document.getElementById('brokerAccountIdInput').value = '';
 await refreshAccounts();
 } else {
 errorDiv.textContent = res.message || (res.errors ? Object.values(res.errors).flat().join(' ') : 'Connection failed.');
 errorDiv.classList.remove('hidden');
 }

 btn.textContent = 'Connect';
 btn.disabled = false;
 });

 // Disconnect action (delegated, since accounts render dynamically)
 document.getElementById('accountsList').addEventListener('click', async (e) => {
 const btn = e.target.closest('[data-disconnect-id]');
 if (!btn) return;
 const accountId = btn.dataset.disconnectId;
 btn.textContent = 'Disconnecting...';
 btn.disabled = true;
 await api.disconnectAccount(accountId);
 await refreshAccounts();
 });

 await refreshAccounts();
 startPolling();
}

async function loadProviders() {
 const select = document.getElementById('providerSelect');
 const res = await api.providers();
 if (res.success && res.providers?.length) {
 select.innerHTML = '<option value="">Select a provider</option>' +
 res.providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
 } else {
 select.innerHTML = '<option value="">No providers available</option>';
 }
}

// Fetches accounts + bot sessions together, cross-references them so a
// connection_status of "connected" with no currently-running bot for that
// account is flagged as stale rather than trusted at face value -- see
// the heartbeat-only-fires-on-connect/disconnect discussion: there's no
// periodic ping, so "connected" can go stale if a crash skips the
// disconnect report entirely.
async function refreshAccounts() {
 const listEl = document.getElementById('accountsList');
 if (!listEl) return; // page navigated away mid-poll

 const [accountsRes, botsRes] = await Promise.all([
 api.myAccounts(),
 api.myBots(),
 ]);

 if (!accountsRes.success) {
 listEl.innerHTML = `<p class="text-[var(--loss)] text-sm">Failed to load accounts. Your session may have expired.</p>`;
 return;
 }

 const accounts = accountsRes.accounts || [];
 const bots = botsRes.success ? (botsRes.data || []) : [];
 const runningAccountIds = new Set(
 bots.filter(b => b.status === 'running').map(b => b.account_id)
 );

 if (accounts.length === 0) {
 listEl.innerHTML = `
 <div class="panel p-12 text-center">
 <p class="text-4xl mb-4"></p>
 <p class="text-[var(--text-muted)]">No accounts connected yet.</p>
 <p class="text-[var(--text-muted)] text-sm mt-2">Connect a Deriv account to start trading.</p>
 </div>
 `;
 return;
 }

 listEl.innerHTML = `
 <div class="grid gap-4">
 ${accounts.map(acc => renderAccountCard(acc, runningAccountIds)).join('')}
 </div>
 `;
}

function renderAccountCard(acc, runningAccountIds) {
 const isStale = acc.connection_status === 'connected' && !runningAccountIds.has(acc.id);

 let statusLabel, statusColorVar;
 if (acc.connection_status === 'connected' && !isStale) {
 statusLabel = 'Connected';
 statusColorVar = 'var(--profit)';
 } else if (isStale) {
 statusLabel = 'Unconfirmed';
 statusColorVar = 'var(--warning, #d99a2b)';
 } else {
 statusLabel = 'Not connected';
 statusColorVar = 'var(--text-muted)';
 }

 const balanceDisplay = acc.balance_cache != null
 ? `<span class="text-[var(--profit)] font-semibold">${acc.currency} ${Number(acc.balance_cache).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
 : `<span class="text-[var(--text-muted)]">Balance unavailable</span>`;

 return `
 <div class="panel p-6 flex items-center justify-between">
 <div>
 <h3 class="font-semibold text-[var(--text-primary)]">${acc.provider} — ${acc.account_type}</h3>
 <p class="text-[var(--text-muted)] text-sm mt-1">
 ${acc.broker_account_id ? `${acc.broker_account_id} · ` : ''}${balanceDisplay}
 </p>
 ${isStale ? `<p class="text-xs mt-1" style="color:var(--warning, #d99a2b);">Status shown as connected but no bot is currently running — will confirm on next bot launch.</p>` : ''}
 </div>
 <div class="flex items-center gap-4">
 <span class="px-3 py-1 rounded-full text-xs font-medium" style="background:color-mix(in srgb, ${statusColorVar} 18%, transparent);color:${statusColorVar};">
 ${statusLabel}
 </span>
 <button data-disconnect-id="${acc.id}" class="btn btn-loss px-3 py-1 text-xs">
 Disconnect
 </button>
 </div>
 </div>
 `;
}

function startPolling() {
 stopPolling();
 pollTimer = setInterval(refreshAccounts, POLL_INTERVAL_MS);
}

function stopPolling() {
 if (pollTimer) {
 clearInterval(pollTimer);
 pollTimer = null;
 }
}
