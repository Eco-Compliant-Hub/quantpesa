import Echo from 'laravel-echo';

import Pusher from 'pusher-js';
window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
    // Custom authorizer instead of a static auth.headers object -- the
    // token is read fresh from localStorage at the moment each private
    // channel is actually subscribed to, not once when echo.js first
    // loads (which can happen before login, baking in a stale/empty
    // token for the lifetime of the page).
    authorizer: (channel, options) => {
        return {
            authorize: (socketId, callback) => {
                fetch('/api/broadcasting/auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                    body: JSON.stringify({
                        socket_id: socketId,
                        channel_name: channel.name,
                    }),
                })
                    .then((res) => res.json())
                    .then((data) => callback(false, data))
                    .catch((err) => callback(true, err));
            },
        };
    },
});
