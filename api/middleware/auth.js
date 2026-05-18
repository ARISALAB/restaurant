/**
 * Middleware: Επαληθεύει ότι το request έρχεται από την Google
 * Η Google στέλνει Google-signed JWT token (ΟΧΙ API key)
 */
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client();

async function googleAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 401, message: 'Missing Authorization header', status: 'UNAUTHENTICATED' }
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Επαλήθευση Google-signed JWT
    const ticket = await client.verifyIdToken({
      idToken:  token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    req.googleClaims = ticket.getPayload();
    next();

  } catch (err) {
    console.error('[auth] JWT verification failed:', err.message);
    return res.status(403).json({
      error: { code: 403, message: 'Invalid or expired Google token', status: 'PERMISSION_DENIED' }
    });
  }
}

module.exports = googleAuthMiddleware;
