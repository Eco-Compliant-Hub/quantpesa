// Private per-user channel for live bot trade updates -- mirrors
// ws.js's pattern (reference-counted listeners, single shared
// channel subscription) but uses a private channel since this is
// account-specific trade data, not public market ticks.

let entry = null;

export function subscribeBotUpdates(userId, callback) {
    if (!window.Echo) {
        console.error("botUpdates.js: window.Echo is not initialized -- check echo.js is imported in app.js");
        return () => {};
    }

    if (!entry) {
        const channel = window.Echo.private(`App.Models.User.${userId}`);
        entry = { channel, listeners: new Set() };
    }

    entry.listeners.add(callback);
    entry.channel.listen(".bot.trade.update", callback);

    return () => {
        entry.listeners.delete(callback);
        if (entry.listeners.size === 0) {
            window.Echo.leave(`App.Models.User.${userId}`);
            entry = null;
        }
    };
}
