const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const env = require('../config/env');

const authenticate = (req, res, next) => {
  // Deliberately NOT reading req.cookies?.token here. The frontend never
  // relies on the cookie for auth — it sends the JWT itself via the
  // Authorization header (see client/src/api/axios.js) — but the login
  // response still sets an httpOnly cookie (see setCookie() in
  // auth.controller.js) and the app is CORS-configured with
  // credentials, so browsers attach that cookie automatically on every
  // cross-site request. Honoring it here would let it silently
  // authenticate requests, and since it's sent SameSite=None in
  // production, that's a CSRF hole: any site can trigger an
  // authenticated POST against a no-body/query-param endpoint via a
  // plain HTML form, riding the ambient cookie. Requiring the header
  // means only code that deliberately reads the token (this app's own
  // frontend) can authenticate — a form submission from another origin
  // can't attach an Authorization header.
  const token =
    req.headers['authorization']?.split(' ')[1] ||
    req.headers['x-access-token'];

  if (!token) {
    return next(new AppError('No token provided. Please log in.', 403));
  }

  jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new AppError('Unauthorized. Token is invalid or expired.', 401));
    }
    // Fail-closed: a JWT without an explicit role claim is rejected rather
    // than defaulting to a privileged role. All login paths set the role
    // explicitly, so this only triggers on malformed or legacy tokens.
    if (!decoded.role) {
      return next(new AppError('Invalid token: missing role claim.', 401));
    }
    req.user = {
      id:            decoded.id,
      role:          decoded.role,
      salespersonId: decoded.salespersonId ?? null,
      adminUserId:   decoded.adminUserId   ?? null,
    };
    next();
  });
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return next(new AppError('Access denied.', 403));
  }
  next();
};

const requireAdmin             = requireRole('admin', 'superadmin');
const requireSuperAdmin        = requireRole('superadmin');
// Read-only admin-tier access for the two reports a dispatcher may view —
// deliberately narrower than requireAdmin so it's only ever applied to the
// specific GET routes a dispatcher needs, never to a whole router.
const requireAdminOrDispatcher = requireRole('admin', 'superadmin', 'dispatcher');

module.exports = { authenticate, requireAdmin, requireSuperAdmin, requireAdminOrDispatcher };
