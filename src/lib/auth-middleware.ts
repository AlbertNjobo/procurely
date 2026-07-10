import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs';

// Check if we have a service account configured
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const hasServiceAccount = saPath && fs.existsSync(saPath);

if (hasServiceAccount) {
  try {
    if (getApps().length === 0) {
      const serviceAccount = JSON.parse(fs.readFileSync(saPath!, 'utf-8'));
      initializeApp({ credential: cert(serviceAccount) });
      console.log("[Auth] Firebase Admin initialized with service account");
    }
  } catch (e) {
    console.warn("[Auth] Failed to initialize Firebase Admin:", (e as Error).message);
  }
} else {
  console.log("[Auth] No service account configured — token verification disabled (client-side auth only)");
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  // If no service account, accept any Bearer token (client-side Firebase Auth handles real auth)
  if (!hasServiceAccount) {
    (req as any).uid = "local-dev-user";
    return next();
  }

  // Verify the token with Firebase Admin SDK
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAuth().verifyIdToken(token);
    (req as any).uid = decoded.uid;
    (req as any).email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
