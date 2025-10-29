// Load env first
import './config';

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

// Extend Express session types
declare module 'express-session' {
  interface SessionData {
    isAdmin: boolean;
    loginAttempts?: number;
    lastAttemptTime?: number;
  }
}

// Validate that admin credentials are properly set
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('FATAL: ADMIN_USERNAME and ADMIN_PASSWORD environment variables must be set');
  console.error('Please set these in your .env file or environment');
  process.exit(1);
}

// Check password strength (at least 8 characters)
if (ADMIN_PASSWORD.length < 8) {
  console.error('FATAL: ADMIN_PASSWORD must be at least 8 characters long');
  process.exit(1);
}

// Hash the password once at startup
const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Rate limiting constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function validateAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && bcrypt.compareSync(password, hashedPassword);
}

export function checkRateLimit(req: Request): { allowed: boolean; error?: string } {
  const session = req.session;

  // Initialize tracking if not present
  if (!session.loginAttempts) {
    session.loginAttempts = 0;
  }

  const now = Date.now();

  // Check if user is locked out
  if (session.lastAttemptTime && session.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    const timeSinceLastAttempt = now - session.lastAttemptTime;

    if (timeSinceLastAttempt < LOCKOUT_DURATION_MS) {
      const remainingMinutes = Math.ceil((LOCKOUT_DURATION_MS - timeSinceLastAttempt) / 60000);
      return {
        allowed: false,
        error: `Too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`
      };
    } else {
      // Lockout period expired, reset
      session.loginAttempts = 0;
    }
  }

  return { allowed: true };
}

export function recordLoginAttempt(req: Request, success: boolean): void {
  const session = req.session;

  if (success) {
    // Reset on successful login
    session.loginAttempts = 0;
    session.lastAttemptTime = undefined;
  } else {
    // Increment failed attempts
    session.loginAttempts = (session.loginAttempts || 0) + 1;
    session.lastAttemptTime = Date.now();

    console.warn(`Failed admin login attempt (${session.loginAttempts}/${MAX_LOGIN_ATTEMPTS}) from IP: ${req.ip}`);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
