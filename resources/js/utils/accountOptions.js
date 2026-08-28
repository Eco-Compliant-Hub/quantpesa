// Shared helper for rendering a user's connected accounts as a clean,
// grouped <select> option list - used anywhere someone picks an account
// (Bot Catalog "Add to My Bots", Admin "Test Run").
//
// Grouping logic:
//   - Demo accounts are grouped together under one heading - currency
//     isn't the distinguishing factor for demo funds.
//   - Real accounts are grouped by currency, since real money can
//     genuinely be split across currencies (USD, GBP, etc.) and that
//     distinction matters when choosing which one to trade.
//   - Disconnected accounts are shown but disabled, with a clear label,
//     so they're visible without being selectable by accident.

function isDemo(account) {
    return /demo/i.test(account.account_type || '');
}

function formatBalance(account) {
    if (account.balance_cache === null || account.balance_cache === undefined) {
        return 'balance not synced';
    }
    return `${account.currency} ${Number(account.balance_cache).toFixed(2)}`;
}

function accountLabel(account) {
    const parts = [account.provider, formatBalance(account)];
    if (account.connection_status !== 'connected') {
        parts.push('Disconnected - reconnect first');
    }
    return parts.join(' - ');
}

function optionHtml(account) {
    const disabled = account.connection_status !== 'connected' ? 'disabled' : '';
    return `<option value="${account.id}" ${disabled}>${accountLabel(account)}</option>`;
}

export function buildAccountOptionsHtml(accounts) {
    if (!accounts || accounts.length === 0) {
        return '<option value="">No connected accounts - connect one first</option>';
    }

    const demo = accounts.filter(isDemo);
    const real = accounts.filter(a => !isDemo(a));

    const realByCurrency = {};
    real.forEach(a => {
        const currency = a.currency || 'Other';
        if (!realByCurrency[currency]) realByCurrency[currency] = [];
        realByCurrency[currency].push(a);
    });

    let html = '<option value="">Select an account</option>';

    if (demo.length) {
        html += '<optgroup label="Demo">' + demo.map(optionHtml).join('') + '</optgroup>';
    }

    Object.keys(realByCurrency).sort().forEach(currency => {
        html += `<optgroup label="Real - ${currency}">` +
            realByCurrency[currency].map(optionHtml).join('') +
            '</optgroup>';
    });

    return html;
}