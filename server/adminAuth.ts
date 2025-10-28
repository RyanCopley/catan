import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

// Extend Express session types
declare module 'express-session' {
  interface SessionData {
    isAdmin: boolean;
  }
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// Hash the password once at startup
const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);

export function validateAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && bcrypt.compareSync(password, hashedPassword);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
