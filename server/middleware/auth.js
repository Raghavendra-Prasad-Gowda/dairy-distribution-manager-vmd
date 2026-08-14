const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

const authenticate = (req, res, next) => {
  const token =
    req.cookies?.token ||
    req.headers['authorization']?.split(' ')[1] ||
    req.headers['x-access-token'];

  if (!token) {
    return next(new AppError('No token provided. Please log in.', 403));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new AppError('Unauthorized. Token is invalid or expired.', 401));
    }
    req.user = {
      id:            decoded.id,
      role:          decoded.role ?? 'admin',
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
