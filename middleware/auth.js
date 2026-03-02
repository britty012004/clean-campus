/**
 * auth.js - Auth middleware
 */

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login');
    }
    res.locals.user = req.session.user;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'admin') return res.redirect('/');
    res.locals.user = req.session.user;
    next();
}

module.exports = { requireAuth, requireAdmin };
