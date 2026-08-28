import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';

export async function render(app, navigate) {
 app.innerHTML = `
 <div class="flex h-screen bg-[var(--bg-main)] overflow-hidden">

 ${renderSidebar('community', { isAdmin: auth.isAdmin() })}

 <!-- Main Content -->
 <main class="flex-1 overflow-y-auto p-8">
 <div class="mb-8">
 <h2 class="text-2xl font-bold text-[var(--text-primary)]">Community</h2>
 <p class="text-[var(--text-muted)] mt-1">Top signal providers on the platform.</p>
 </div>

 <!-- Register as Provider -->
 <div class="panel p-6 mb-6">
 <h3 class="font-semibold mb-3 text-[var(--text-primary)]">Become a Signal Provider</h3>
 <div class="flex gap-3">
 <input id="displayName" type="text" placeholder="Your display name"
 class="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] text-sm">
 <button id="registerBtn" class="btn btn-profit px-4 py-2 text-sm">
 Register
 </button>
 </div>
 <p id="registerMsg" class="text-sm mt-2 hidden"></p>
 </div>

 <!-- Leaderboard -->
 <div class="panel p-6">
 <h3 class="font-semibold mb-4 text-[var(--text-primary)]">Leaderboard</h3>
 <div id="leaderboard">
 <p class="text-[var(--text-muted)] text-sm">Loading...</p>
 </div>
 </div>
 </main>
 </div>
 `;

 // Sidebar nav / theme swatches / logout — shared module
 initSidebar(app, navigate, {
 onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
 });

 // Register as provider
 document.getElementById('registerBtn').addEventListener('click', async () => {
 const name = document.getElementById('displayName').value;
 const msg = document.getElementById('registerMsg');

 if (!name) return;

 const res = await api.registerProvider({ display_name: name });
 msg.classList.remove('hidden');

 if (res.success) {
 msg.className = 'text-sm mt-2 text-[var(--profit)]';
 msg.textContent = res.message;
 } else {
 msg.className = 'text-sm mt-2 text-[var(--loss)]';
 msg.textContent = res.message;
 }
 });

 // Load leaderboard
 const res = await api.leaderboard();
 const leaderboard = document.getElementById('leaderboard');

 if (!res.success || res.providers?.length === 0) {
 leaderboard.innerHTML = '<p class="text-[var(--text-muted)] text-sm">No providers yet.</p>';
 return;
 }

 leaderboard.innerHTML = `
 <table class="w-full text-sm">
 <thead>
 <tr class="text-[var(--text-muted)] border-b border-[var(--border)]">
 <th class="text-left pb-3">Rank</th>
 <th class="text-left pb-3">Provider</th>
 <th class="text-left pb-3">Score</th>
 <th class="text-left pb-3">Followers</th>
 <th class="text-left pb-3"></th>
 </tr>
 </thead>
 <tbody>
 ${res.providers.map((p, i) => `
 <tr class="border-b border-[var(--border)]/50">
 <td class="py-3 text-[var(--text-muted)]">#${i + 1}</td>
 <td class="py-3 text-[var(--text-primary)]">
 ${p.display_name}
 ${p.verified ? '<span class="ml-2 text-xs px-2 py-0.5 rounded" style="background:color-mix(in srgb, var(--profit) 18%, transparent);color:var(--profit);"> Verified</span>' : ''}
 </td>
 <td class="py-3 text-[var(--profit)]">${p.performance_score}</td>
 <td class="py-3 text-[var(--text-muted)]">${p.total_followers}</td>
 <td class="py-3">
 <button onclick="followProvider(${p.user_id})"
 class="px-3 py-1 bg-[var(--bg-panel)] hover:bg-[var(--accent)] hover:text-[var(--bg-main)] text-[var(--text-secondary)] text-xs rounded-lg transition">
 Follow
 </button>
 </td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 `;

 window.followProvider = async (id) => {
 const res = await api.follow(id);
 alert(res.message);
 };
}
