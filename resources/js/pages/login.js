import { api } from '../api.js';
import { auth } from '../auth.js';

export function render(app, navigate) {
    app.innerHTML = `
        <div class="min-h-screen bg-gray-950 flex items-center justify-center px-4">
            <div class="w-full max-w-md">
                
                <!-- Logo -->
                <div class="text-center mb-8">
                    <h1 class="text-4xl font-bold text-emerald-400">QuantPesa</h1>
                    <p class="text-gray-400 mt-2">AI-Powered Trading Platform</p>
                </div>

                <!-- Card -->
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                    <h2 class="text-xl font-semibold mb-6">Sign In</h2>

                    <div id="error" class="hidden bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm"></div>

                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm text-gray-400 mb-1">Email</label>
                            <input id="email" type="email" placeholder="you@example.com"
                                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-400 mb-1">Password</label>
                            <input id="password" type="password" placeholder="••••••••"
                                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition">
                        </div>
                        <button id="loginBtn"
                            class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold py-3 rounded-lg transition mt-2">
                            Sign In
                        </button>
                    </div>
                </div>

            </div>
        </div>
    `;

    // Login logic
    document.getElementById('loginBtn').addEventListener('click', async () => {
        const email    = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('error');
        const btn      = document.getElementById('loginBtn');

        if (!email || !password) {
            errorDiv.textContent = 'Please enter email and password.';
            errorDiv.classList.remove('hidden');
            return;
        }

        btn.textContent = 'Signing in...';
        btn.disabled = true;

        const res = await api.login({ email, password });

        if (res.success) {
            auth.setToken(res.token);
            auth.setUser({ id: res.user_id, status: res.status });
            navigate('dashboard');
        } else {
            errorDiv.textContent = res.message || 'Login failed.';
            errorDiv.classList.remove('hidden');
            btn.textContent = 'Sign In';
            btn.disabled = false;
        }
    });

    // Allow Enter key
    document.getElementById('password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
}