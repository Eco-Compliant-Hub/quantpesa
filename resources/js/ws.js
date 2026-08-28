const activeChannels = new Map();

export function subscribeSymbol(symbol, callback) {
    if (!window.Echo) {
        console.error("ws.js: window.Echo is not initialized -- check echo.js is imported in app.js");
        return () => {};
    }

    let entry = activeChannels.get(symbol);
    if (!entry) {
        const channel = window.Echo.channel(`ticks.${symbol}`);
        entry = { channel, listeners: new Set() };
        activeChannels.set(symbol, entry);
    }

    entry.listeners.add(callback);
    entry.channel.listen(".tick", callback);

    return () => {
        entry.listeners.delete(callback);

        // This is the fix: unregistering from our own bookkeeping Set was
        // never enough on its own -- Echo/Pusher keeps calling `callback`
        // on every tick until we explicitly tell the channel to stop.
        // Without this line, every unsubscribed callback becomes a zombie
        // listener that keeps firing forever, silently mutating whatever
        // module-level state it closed over (e.g. a page's digitFreq
        // array) using ticks from a symbol the user has since navigated
        // away from.
        entry.channel.stopListening(".tick", callback);

        if (entry.listeners.size === 0) {
            window.Echo.leaveChannel(`ticks.${symbol}`);
            activeChannels.delete(symbol);
        }
    };
}