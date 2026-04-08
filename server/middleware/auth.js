const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

/**
 * authenticate — verifies JWT from Authorization header or httpOnly cookie.
 * Sets req.user = { id: 1 } (single-user app).
 */
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
    req.user = { id: decoded.id };
    next();
  });
};

module.exports = { authenticate };
