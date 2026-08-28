const STORAGE_KEY = 'qp_analysis_context';

// The id is a local placeholder ("local-...") until this context is
// successfully persisted via api.createAnalysisContext() and swapped
// for the real analysis_contexts.id (see analysis.js's Configure Bot
// handler). Prefixing it makes the two cases impossible to confuse
// downstream: only an id that passes isPersistedContext() should ever
// be sent to the backend as if it were a real database row -- a
// "local-..." string is not a valid FK value and must never reach
// startBot()/placeOrder() as analysis_context_id.
export function createAnalysisContext(data = {}) {
    return {
        id: `local-${Date.now()}`,
        persisted: false,
        created_at: new Date().toISOString(),
        source: 'analysis',
        symbol: data.symbol || null,
        lookback: Number(data.lookback) || null,
        state: data.state || 'No dominant condition is established',
        evidence_quality: data.evidence_quality || 'LOW AGREEMENT',
        evidence: Array.isArray(data.evidence) ? data.evidence : [],
        snapshot: data.snapshot || {},
    };
}

// Called after a successful POST /analysis-contexts to upgrade a local
// context into a persisted one, without losing anything already
// computed client-side.
export function markAnalysisContextPersisted(context, serverRecord) {
    return {
        ...context,
        id: serverRecord.id,
        persisted: true,
    };
}

// The only safe way to read an id that's actually usable as a FK.
// Returns null for anything still local-only, so callers never have
// to remember the "local-" prefix convention themselves.
export function getPersistedContextId(context) {
    return context && context.persisted && Number.isInteger(context.id) ? context.id : null;
}

export function saveAnalysisContext(context) {
    if (!context) return null;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    return context;
}

export function getAnalysisContext() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearAnalysisContext() {
    sessionStorage.removeItem(STORAGE_KEY);
}

export function formatAnalysisContext(context) {
    if (!context) return null;
    return {
        id: context.id,
        symbol: context.symbol || '—',
        lookback: context.lookback || '—',
        state: context.state || '—',
        quality: context.evidence_quality || '—',
        capturedAt: context.created_at ? new Date(context.created_at).toLocaleTimeString() : '—',
    };
}

// A captured analysis context is only useful to a page acting on it
// "now" — an hour-old context describing conditions that have since
// moved on is exactly the kind of silent staleness the rest of this
// app refuses to allow (see analysis.js's stale-status handling).
// Any page that displays a context for action (Bots, Trading) should
// check this before treating it as current.
export function isAnalysisContextStale(context, maxAgeMs = 5 * 60 * 1000) {
    if (!context || !context.created_at) return true;
    return (Date.now() - new Date(context.created_at).getTime()) > maxAgeMs;
}

// Matches a captured analysis context's symbol (e.g. "R_25", the raw
// code analysis.js works with) against whatever shape the real symbols
// endpoint returns (s.symbol / s.name / s.display_name — the exact key
// hasn't been confirmed against MarketController, so all three are
// checked, same defensive approach bots.js already uses elsewhere).
// Returns the matching option's id, or null if there's no context or
// no match. This is deliberately the ONLY thing prefilled from
// Analysis — contract type, barrier, and stake are never inferred,
// so an observation can never silently become an execution choice.
export function matchSymbolId(context, symbolList) {
    if (!context || !context.symbol || !Array.isArray(symbolList)) return null;
    const target = String(context.symbol).trim().toUpperCase();
    const match = symbolList.find(s =>
        String(s.symbol || '').toUpperCase() === target ||
        String(s.name || '').toUpperCase() === target ||
        String(s.display_name || '').toUpperCase() === target
    );
    return match ? match.id : null;
}
