const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('token');
}

function headers() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
    };
}

async function request(method, endpoint, body = null) {
    const options = {
        method,
        headers: headers(),
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    return res.json();
}

// Separate from request() because file uploads need FormData, not JSON.
// The browser must set its own multipart Content-Type (with boundary),
// so we deliberately do NOT set Content-Type here — only Authorization.
async function requestMultipart(method, endpoint, formData) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${getToken()}`,
        },
        body: formData,
    };

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    return res.json();
}

// Uses XMLHttpRequest instead of fetch specifically because fetch has no
// upload-progress event. onProgress receives an integer 0-100.
function requestMultipartWithProgress(endpoint, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}${endpoint}`);
        xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        });

        xhr.onload = () => {
            try {
                resolve(JSON.parse(xhr.responseText));
            } catch (err) {
                reject(new Error('Server returned an invalid response.'));
            }
        };
        xhr.onerror = () => reject(new Error('Upload failed — network error.'));

        xhr.send(formData);
    });
}


export const api = {
    // Auth
    login:    (data) => request('POST', '/login', data),
    logout:   ()     => request('POST', '/logout'),
    register: (data) => request('POST', '/register', data),

    // Market
    symbols:  () => request('GET', '/market/symbols'),

    // Trading
    contractTypes: () => request('GET', '/trading/contract-types'),
    placeOrder:    (data, confirmRisk = false) => request('POST', '/trading/orders', { ...data, confirm_risk: confirmRisk }),
    // These routes already existed server-side (TradingController::myOrders/
    // orderDetail) but were never wired into this client — journal.js needs
    // them for real trade history instead of anything fabricated.
    myOrders:      ()   => request('GET', '/trading/orders'),
    orderDetail:   (id) => request('GET', `/trading/orders/${id}`),

    // Analytics
    summary:  (symbol) => request('GET', `/analytics/${symbol}/summary`),
    digits:   (symbol) => request('GET', `/analytics/${symbol}/digits`),
    signals:  (symbol) => request('GET', `/analytics/${symbol}/signals`),
    observe:  (symbol, ticks)  => request('GET', `/analytics/${symbol}/observe?ticks=${ticks}`),
    absence:  (symbol, windows = [10, 20, 30]) => request('GET', `/analytics/${symbol}/absence?windows=${windows.join(',')}`),
    runs:     (symbol) => request('GET', `/analytics/${symbol}/runs`),

    // AI
    predictions: ()       => request('GET', '/ai/predictions'),
    prediction:  (symbol) => request('GET', `/ai/predictions/${symbol}`),

    // Analysis Context
    // Persists the client-computed synthesis from analysis.js's
    // buildDecisionSnapshot() so it gets a real analysis_contexts.id
    // that bot_sessions/orders can bind to. See analysisContext.js's
    // createAnalysisContext()/markAnalysisContextPersisted() for how
    // the id transitions from a local placeholder to this real one.
    createAnalysisContext: (data) => request('POST', '/analysis-contexts', data),
    analysisContext:       (id)   => request('GET', `/analysis-contexts/${id}`),

    // Bots
    myBots:            ()     => request('GET', '/bots'),
    createBot:         (data) => request('POST', '/bots', data),
    browseBotTemplates: ()     => request('GET', '/bots/templates'),
    // options: { confirmRisk?: boolean, analysisContextId?: number|null }
    // Was previously a positional boolean second arg with no way to carry
    // analysis_context_id at all — that silently dropped it on every call.
    startBot: (id, options = {}) => request('POST', `/bots/${id}/start`, {
        confirm_risk: options.confirmRisk || false,
        analysis_context_id: options.analysisContextId ?? null,
    }),
    stopBot:   (id)   => request('POST', `/bots/${id}/stop`),
    pauseBot:  (id)   => request('POST', `/bots/${id}/pause`),
    resumeBot: (id)   => request('POST', `/bots/${id}/resume`),

    // Bots (detail + configure)
    botDetail:    (id)       => request('GET', `/bots/${id}`),
    configureBot: (id, data) => request('POST', `/bots/${id}/configure`, data),
    botLive:      (id)       => request('GET', `/bots/${id}/live`),

// Risk
    accountExposure: (accountId)                 => request('GET', `/risk/accounts/${accountId}/exposure`),
    evaluateRisk:    (accountId, proposedStake)   => request('POST', `/risk/accounts/${accountId}/evaluate`, { proposed_stake: proposedStake }),

    // Broker / Accounts
    providers:         ()             => request('GET', '/providers'),
    accountTypes:      (providerId)   => request('GET', `/providers/${providerId}/account-types`),
    connectAccount:    (data)         => request('POST', '/accounts/connect', data),
    myAccounts:        ()             => request('GET', '/accounts'),
    disconnectAccount: (accountId)    => request('PUT', `/accounts/${accountId}/disconnect`),

    // Community
    leaderboard:      ()     => request('GET', '/community/leaderboard'),
    follow:           (id)   => request('POST', `/community/follow/${id}`),
    unfollow:         (id)   => request('DELETE', `/community/unfollow/${id}`),
    myFollowing:      ()     => request('GET', '/community/my-following'),
    registerProvider: (data) => request('POST', '/community/register-provider', data),

    // Billing
    plans:          ()     => request('GET', '/billing/plans'),
    mySubscription: ()     => request('GET', '/billing/subscription'),
    subscribe:      (data) => request('POST', '/billing/subscribe', data),
    cancel:         ()     => request('DELETE', '/billing/cancel'),
    myInvoices:     ()     => request('GET', '/billing/invoices'),

    // Admin
    adminStats:    ()         => request('GET', '/admin/stats'),
    adminUsers:    ()         => request('GET', '/admin/users'),
    banUser:       (id)       => request('PATCH', `/admin/users/${id}/ban`),
    suspendUser:   (id)       => request('PATCH', `/admin/users/${id}/suspend`),
    getSettings:   ()         => request('GET', '/admin/settings'),
    updateSetting: (key, val) => request('PATCH', `/admin/settings/${key}`, { value: val }),
    adminBots:     ()         => request('GET', '/admin/bots'),
    killBot:       (id)       => request('PATCH', `/admin/bots/${id}/kill`),
    adminStartBot: (id)       => request('POST', `/admin/bots/${id}/start`),

    // Admin — Bot catalog
    listBotTemplates:    ()               => request('GET', '/admin/bot-templates'),
    testRunBotTemplate:  (id, data)       => request('POST', `/admin/bot-templates/${id}/test-run`, data),
    listTemplateTestRuns:(id)             => request('GET', `/admin/bot-templates/${id}/test-runs`),
    updateBotTemplateTier: (id, tier)     => request('PATCH', `/admin/bot-templates/${id}/tier`, { tier }),
    deployBotTemplate:   (id)             => request('PATCH', `/admin/bot-templates/${id}/deploy`),
    retractBotTemplate:  (id)             => request('PATCH', `/admin/bot-templates/${id}/retract`),
    deleteBotTemplate:   (id, force=false)=> request('DELETE', `/admin/bot-templates/${id}`, { force }),
    uploadBotTemplate: (formData) => requestMultipart('POST', '/admin/bot-templates', formData),
    uploadBotTemplateWithProgress: (formData, onProgress) =>
    requestMultipartWithProgress('/admin/bot-templates', formData, onProgress),
};
