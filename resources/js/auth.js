export const auth = {
    setToken(token) {
        localStorage.setItem('token', token);
    },

    getToken() {
        return localStorage.getItem('token');
    },

    setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    },

    getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    isLoggedIn() {
        return !!localStorage.getItem('token');
    },

    isAdmin() {
        const user = this.getUser();
        return user && user.status === 'admin';
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },
};