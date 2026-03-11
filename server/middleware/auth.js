import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getCompanyDb } from '../db/companyDbPool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'rapiderp-v2-enterprise-secret-key-2024-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const SALT_ROUNDS = 12;

export function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY, algorithm: 'HS256' });
}

export function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

export async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

export function validatePasswordStrength(password) {
    const errors = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain a number');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Password must contain a special character');
    return { valid: errors.length === 0, errors };
}

/**
 * Auth middleware — checks token and resolves user from:
 * 1. main DB (super_admins table) if token says isSuperAdmin
 * 2. company DB (users table) if token has companyId
 */
export function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        const mainDb = req.app.get('db');

        // SuperAdmin check
        if (decoded.isSuperAdmin) {
            const admin = mainDb.prepare('SELECT * FROM super_admins WHERE id = ?').get(decoded.userId);
            if (!admin) return res.status(401).json({ error: 'SuperAdmin not found', code: 'USER_NOT_FOUND' });
            if (!admin.is_active) return res.status(403).json({ error: 'Account deactivated', code: 'ACCOUNT_DISABLED' });
            if (admin.is_locked) return res.status(403).json({ error: 'Account locked', code: 'ACCOUNT_LOCKED' });

            req.user = {
                id: admin.id,
                email: admin.email,
                firstName: admin.first_name,
                lastName: admin.last_name,
                isSuperAdmin: true,
                roleLevel: 0,
                roleName: 'super_admin',
                companyId: null // SuperAdmin is not bound to any company
            };

            mainDb.prepare(`UPDATE super_admins SET last_login_at = datetime('now') WHERE id = ?`).run(admin.id);
            return next();
        }

        // Company user check
        if (!decoded.companyId) {
            return res.status(401).json({ error: 'Invalid token: no company context', code: 'NO_COMPANY' });
        }

        const companyDb = getCompanyDb(decoded.companyId);
        if (!companyDb) return res.status(401).json({ error: 'Company database not available', code: 'COMPANY_DB_ERROR' });

        const user = companyDb.prepare('SELECT id, email, first_name, last_name, role_id, is_active, is_locked FROM users WHERE id = ?').get(decoded.userId);
        if (!user) return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        if (!user.is_active) return res.status(403).json({ error: 'Account deactivated', code: 'ACCOUNT_DISABLED' });
        if (user.is_locked) return res.status(403).json({ error: 'Account locked', code: 'ACCOUNT_LOCKED' });

        const role = companyDb.prepare('SELECT * FROM roles WHERE id = ?').get(user.role_id);

        req.user = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            isSuperAdmin: false,
            roleId: user.role_id,
            roleName: role?.name || 'viewer',
            roleLevel: role?.level || 5,
            companyId: decoded.companyId
        };

        companyDb.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
        }
        return res.status(500).json({ error: 'Authentication error', code: 'AUTH_ERROR' });
    }
}

export function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authMiddleware(req, res, next);
    }
    next();
}
