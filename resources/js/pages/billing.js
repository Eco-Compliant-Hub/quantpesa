import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';

export async function render(app, navigate) {
 app.innerHTML = `
 <div class="flex h-screen bg-[var(--bg-main)] overflow-hidden">

 ${renderSidebar('billing', { isAdmin: auth.isAdmin() })}

 <!-- Main Content -->
 <main class="flex-1 overflow-y-auto p-8">
 <div class="mb-8">
 <h2 class="text-2xl font-bold text-[var(--text-primary)]">Billing</h2>
 <p class="text-[var(--text-muted)] mt-1">Manage your subscription and payments.</p>
 </div>

 <!-- Current Subscription -->
 <div class="panel p-6 mb-6">
 <h3 class="font-semibold mb-4 text-[var(--text-primary)]">Current Subscription</h3>
 <div id="currentSub">
 <p class="text-[var(--text-muted)] text-sm">Loading...</p>
 </div>
 </div>

 <!-- Plans -->
 <div class="mb-6">
 <h3 class="font-semibold mb-4 text-[var(--text-primary)]">Available Plans</h3>
 <div id="plansList" class="grid grid-cols-3 gap-6">
 <p class="text-[var(--text-muted)] text-sm">Loading plans...</p>
 </div>
 </div>

 <!-- Invoices -->
 <div class="panel p-6">
 <h3 class="font-semibold mb-4 text-[var(--text-primary)]">Invoice History</h3>
 <div id="invoicesList">
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

 // Load subscription
 const subRes = await api.mySubscription();
 const currentSub = document.getElementById('currentSub');

 if (subRes.success && subRes.subscription) {
 const sub = subRes.subscription;
 currentSub.innerHTML = `
 <div class="flex items-center justify-between">
 <div>
 <p class="text-[var(--text-primary)] font-medium">${sub.plan_name} Plan</p>
 <p class="text-[var(--text-muted)] text-sm mt-1">Expires: ${new Date(sub.expires_at).toLocaleDateString()}</p>
 </div>
 <div class="flex items-center gap-4">
 <span class="px-3 py-1 rounded-full text-xs" style="background:color-mix(in srgb, var(--profit) 18%, transparent);color:var(--profit);">${sub.status}</span>
 <button id="cancelBtn" class="btn btn-loss px-4 py-2 text-sm">
 Cancel
 </button>
 </div>
 </div>
 `;

 document.getElementById('cancelBtn').addEventListener('click', async () => {
 if (!confirm('Cancel your subscription?')) return;
 const res = await api.cancel();
 alert(res.message);
 render(app, navigate);
 });
 } else {
 currentSub.innerHTML = '<p class="text-[var(--text-muted)] text-sm">No active subscription.</p>';
 }

 // Load plans
 const plansRes = await api.plans();
 const plansList = document.getElementById('plansList');

 if (plansRes.success) {
 plansList.innerHTML = plansRes.plans.map(plan => `
 <div class="panel p-6 flex flex-col">
 <h4 class="font-semibold text-[var(--text-primary)] text-lg">${plan.name}</h4>
 <p class="text-3xl font-bold text-[var(--profit)] mt-2">
 $${plan.monthly_price}<span class="text-sm text-[var(--text-muted)] font-normal">/mo</span>
 </p>
 <ul class="mt-4 space-y-2 flex-1">
 ${Object.entries(plan.features).map(([key, val]) => `
 <li class="text-sm text-[var(--text-muted)] flex items-center gap-2">
 <span class="${val === true || val > 0 ? 'text-[var(--profit)]' : 'text-[var(--text-muted)]'}">
 ${val === true || val > 0 ? '' : ''}
 </span>
 ${key.replace(/_/g, ' ')}
 ${typeof val === 'number' ? `(${val})` : ''}
 </li>
 `).join('')}
 </ul>
 <button onclick="subscribePlan(${plan.id})" class="btn btn-profit mt-6 w-full py-2 text-sm">
 Subscribe
 </button>
 </div>
 `).join('');
 }

 window.subscribePlan = async (planId) => {
 const res = await api.subscribe({ plan_id: planId });
 alert(res.message);
 render(app, navigate);
 };

 // Load invoices
 const invRes = await api.myInvoices();
 const invoicesList = document.getElementById('invoicesList');

 if (!invRes.success || invRes.invoices?.length === 0) {
 invoicesList.innerHTML = '<p class="text-[var(--text-muted)] text-sm">No invoices yet.</p>';
 return;
 }

 invoicesList.innerHTML = `
 <table class="w-full text-sm">
 <thead>
 <tr class="text-[var(--text-muted)] border-b border-[var(--border)]">
 <th class="text-left pb-3">Amount</th>
 <th class="text-left pb-3">Status</th>
 <th class="text-left pb-3">Issued</th>
 <th class="text-left pb-3">Paid</th>
 </tr>
 </thead>
 <tbody>
 ${invRes.invoices.map(inv => `
 <tr class="border-b border-[var(--border)]/50">
 <td class="py-3 text-[var(--text-primary)]">$${inv.amount} ${inv.currency}</td>
 <td class="py-3">
 <span class="px-2 py-1 rounded text-xs" style="${inv.status === 'paid'
 ? 'background:color-mix(in srgb, var(--profit) 18%, transparent);color:var(--profit);'
 : 'background:color-mix(in srgb, var(--warning, #d99a2b) 18%, transparent);color:var(--warning, #d99a2b);'}">
 ${inv.status}
 </span>
 </td>
 <td class="py-3 text-[var(--text-muted)]">${new Date(inv.issued_at).toLocaleDateString()}</td>
 <td class="py-3 text-[var(--text-muted)]">${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—'}</td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 `;
}
