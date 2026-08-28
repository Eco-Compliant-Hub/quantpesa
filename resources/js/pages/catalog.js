import { api } from '../api.js';
import { auth } from '../auth.js';
import { buildAccountOptionsHtml } from '../utils/accountOptions.js';
import { renderSidebar, initSidebar } from './sidebar.js';

export async function render(app, navigate) {
 app.innerHTML = `
 <div class="flex h-screen bg-[var(--bg-main)] overflow-hidden">
 ${renderSidebar('catalog', { isAdmin: auth.isAdmin() })}

 <main class="flex-1 overflow-y-auto p-8">
 <div class="mb-8">
 <h2 class="text-2xl font-bold text-[var(--text-primary)]">Bot Catalog</h2>
 <p class="text-[var(--text-muted)] mt-1">Browse available bot templates and add one to your bots.</p>
 </div>
 <div id="catalogList">
 <p class="text-[var(--text-muted)] text-sm">Loading catalog...</p>
 </div>
 </main>

 <div id="useModalOverlay" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
 <div class="panel p-6 w-full max-w-md">
 <div class="flex items-center justify-between mb-4">
 <h3 id="useModalTitle" class="font-semibold text-lg text-[var(--text-primary)]">Add Bot</h3>
 <button id="useModalCloseBtn" class="text-[var(--text-muted)] hover:text-[var(--text-primary)]"></button>
 </div>
 <div id="useModalError" class="hidden bg-[var(--loss)]/10 border border-[var(--loss)]/30 text-[var(--loss)] rounded-lg p-3 mb-4 text-sm"></div>
 <div class="space-y-3">
 <div>
 <label class="block text-sm text-[var(--text-muted)] mb-1">Account</label>
 <select id="useAccount" class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]">
 <option value="">Loading accounts...</option>
 </select>
 </div>
 <div>
 <label class="block text-sm text-[var(--text-muted)] mb-1">Bot name</label>
 <input id="useBotName" type="text" maxlength="100" placeholder="e.g. My Digit Bot"
 class="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]">
 </div>
 <div class="flex gap-3 pt-2">
 <button id="useConfirmBtn" class="btn btn-profit px-4 py-2 text-sm">
 Add to My Bots
 </button>
 <button id="useCancelBtn" class="px-4 py-2 bg-[var(--bg-panel)] hover:bg-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg transition">
 Cancel
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>
 `;

 // Sidebar nav / theme swatches / logout — shared module
 initSidebar(app, navigate, {
 onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
 });

 document.getElementById('useModalOverlay').addEventListener('click', (e) => {
 if (e.target.id === 'useModalOverlay') closeUseModal();
 });
 document.getElementById('useModalCloseBtn').addEventListener('click', closeUseModal);
 document.getElementById('useCancelBtn').addEventListener('click', closeUseModal);

 function closeUseModal() {
 document.getElementById('useModalOverlay').classList.add('hidden');
 }

 let selectedTemplateId = null;

 async function loadCatalog() {
 const res = await api.browseBotTemplates();
 const listEl = document.getElementById('catalogList');

 if (!res.success || !res.data || res.data.length === 0) {
 listEl.innerHTML = `
 <div class="panel p-12 text-center">
 <p class="text-4xl mb-4"></p>
 <p class="text-[var(--text-muted)]">No bot templates available right now.</p>
 <p class="text-[var(--text-muted)] text-sm mt-2">Check back once an admin deploys one.</p>
 </div>
 `;
 return;
 }

 listEl.innerHTML = `
 <div class="grid gap-4">
 ${res.data.map(t => `
 <div class="panel p-6 flex items-center justify-between ${t.locked ? 'opacity-75' : ''}">
 <div>
 <div class="flex items-center gap-2">
 <h3 class="font-semibold text-[var(--text-primary)]">${t.name}</h3>
 ${t.tier === 'premium' ? '<span class="px-2 py-0.5 rounded-full text-xs" style="background:color-mix(in srgb, var(--warning, #d99a2b) 18%, transparent);color:var(--warning, #d99a2b);">Premium</span>' : ''}
 </div>
 ${t.description ? `<p class="text-[var(--text-muted)] text-sm mt-1">${t.description}</p>` : ''}
 <div class="flex gap-2 mt-2">
 ${t.strategy_type ? `<span class="px-2 py-0.5 rounded-full text-xs bg-[var(--bg-panel)] text-[var(--text-muted)]">${t.strategy_type}</span>` : ''}
 ${t.risk_level ? `<span class="px-2 py-0.5 rounded-full text-xs bg-[var(--bg-panel)] text-[var(--text-muted)]">${t.risk_level} risk</span>` : ''}
 </div>
 </div>
 ${t.locked ? `
 <button data-nav-billing class="px-4 py-2 text-sm font-medium rounded-lg transition" style="background:var(--warning, #d99a2b);color:var(--bg-main);">
 Upgrade to Unlock
 </button>
 ` : `
 <button data-use-template="${t.id}" data-template-name="${t.name}" class="btn btn-profit px-4 py-2 text-sm">
 Add to My Bots
 </button>
 `}
 </div>
 `).join('')}
 </div>
 `;

 listEl.querySelectorAll('[data-nav-billing]').forEach(btn => {
 btn.addEventListener('click', () => navigate('billing'));
 });

 listEl.querySelectorAll('[data-use-template]').forEach(btn => {
 btn.addEventListener('click', async () => {
 selectedTemplateId = btn.dataset.useTemplate;
 document.getElementById('useModalTitle').textContent = `Add "${btn.dataset.templateName}"`;
 document.getElementById('useModalError').classList.add('hidden');
 document.getElementById('useBotName').value = '';
 document.getElementById('useModalOverlay').classList.remove('hidden');

 const accountSelect = document.getElementById('useAccount');
 accountSelect.innerHTML = '<option value="">Loading accounts...</option>';

 const accRes = await api.myAccounts();
 const accounts = accRes.data || accRes.accounts || [];
 accountSelect.innerHTML = accRes.success !== false
 ? buildAccountOptionsHtml(accounts)
 : '<option value="">No connected accounts — connect one first</option>';
 });
 });
 }

 document.getElementById('useConfirmBtn').addEventListener('click', async () => {
 const errorDiv = document.getElementById('useModalError');
 const accountId = document.getElementById('useAccount').value;
 const botName = document.getElementById('useBotName').value.trim();

 if (!accountId) {
 errorDiv.textContent = 'Please select an account.';
 errorDiv.classList.remove('hidden');
 return;
 }
 if (!botName) {
 errorDiv.textContent = 'Please give this bot a name.';
 errorDiv.classList.remove('hidden');
 return;
 }

 const res = await api.createBot({
 template_id: selectedTemplateId,
 account_id: accountId,
 bot_name: botName,
 });

 if (res.success) {
 navigate('bots');
 } else {
 errorDiv.textContent = res.message || (res.errors ? Object.values(res.errors).flat().join(' ') : 'Failed to add bot.');
 errorDiv.classList.remove('hidden');
 }
 });

 await loadCatalog();
}
