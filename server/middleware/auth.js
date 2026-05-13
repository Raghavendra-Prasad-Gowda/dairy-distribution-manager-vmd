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
      id: decoded.id,
      role: decoded.role ?? 'admin',
      salespersonId: decoded.salespersonId ?? null,
    };
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return next(new AppError('Admin access required.', 403));
  }
  next();
};

module.exports = { authenticate, requireAdmin };
