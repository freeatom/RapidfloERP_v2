import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

export function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        // Check if user is still active
        const db = req.app.get('db');
        const user = db.prepare('SELECT id, email, first_name, last_name, role_id, is_active, is_locked FROM users WHERE id = ?').get(decoded.userId);

        if (!user) return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        if (!user.is_active) return res.status(403).json({ error: 'Account deactivated', code: 'ACCOUNT_DISABLED' });
        if (user.is_locked) return res.status(403).json({ error: 'Account locked', code: 'ACCOUNT_LOCKED' });

        // Get role info
        const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(user.role_id);

        req.user = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            roleId: user.role_id,
            roleName: role?.name || 'viewer',
            roleLevel: role?.level || 5
        };

        // Update last activity
        db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);

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
