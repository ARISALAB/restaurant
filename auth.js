/**
 * Middleware: επαληθεύει ότι το request έρχεται από την Google
 * Η Google στέλνει πάντα: Authorization: Bearer <api_key>
 */
function googleAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 401, message: 'Missing Authorization header', status: 'UNAUTHENTICATED' }
    });
  }

  const token = authHeader.split(' ')[1];

  if (token !== process.env.GOOGLE_BOOKING_API_KEY) {
    return res.status(403).json({
      error: { code: 403, message: 'Invalid API key', status: 'PERMISSION_DENIED' }
    });
  }

  next();
}

module.exports = googleAuthMiddleware;
