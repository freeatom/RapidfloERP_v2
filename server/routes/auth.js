import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateToken, verifyToken, hashPassword, comparePassword, validatePasswordStrength } from '../middleware/auth.js';
import { logAuditEvent } from '../middleware/audit.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const db = req.app.get('db');
        const user = db.prepare(`
      SELECT u.*, r.name as role_name, r.level as role_level 
      FROM users u JOIN roles r ON r.id = u.role_id 
      WHERE u.email = ?
    `).get(email);

        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });
        if (user.is_locked) return res.status(403).json({ error: 'Account locked. Contact administrator.' });

        // Check failed attempts
        if (user.failed_login_attempts >= 5) {
            db.prepare('UPDATE users SET is_locked = 1 WHERE id = ?').run(user.id);
            return res.status(403).json({ error: 'Account locked due to too many failed attempts' });
        }

        const valid = await comparePassword(password, user.password_hash);
        if (!valid) {
            db.prepare('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?').run(user.id);
            logAuditEvent(db, { userId: user.id, userEmail: email, action: 'LOGIN_FAILED', module: 'auth', ipAddress: req.ip, userAgent: req.headers['user-agent'] });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Reset failed attempts on success
        db.prepare("UPDATE users SET failed_login_attempts = 0, last_login_at = datetime('now') WHERE id = ?").run(user.id);

        const token = generateToken({ userId: user.id, email: user.email, role: user.role_name, roleLevel: user.role_level });

        // Create session
        const sessionId = uuidv4();
        db.prepare(`
      INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+24 hours'), datetime('now'), datetime('now'))
    `).run(sessionId, user.id, token.substring(0, 50), req.ip, req.headers['user-agent']);

        logAuditEvent(db, { userId: user.id, userEmail: email, action: 'LOGIN_SUCCESS', module: 'auth', ipAddress: req.ip, userAgent: req.headers['user-agent'] });

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role_name,
                roleLevel: user.role_level,
                avatar: user.avatar_url,
                preferences: JSON.parse(user.preferences || '{}')
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Login failed: ' + err.message });
    }
});

// POST /api/auth/register (admin only in production)
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, phone, roleId } = req.body;
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Email, password, first name, and last name are required' });
        }

        const strength = validatePasswordStrength(password);
        if (!strength.valid) return res.status(400).json({ error: strength.errors.join(', ') });

        const db = req.app.get('db');
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) return res.status(409).json({ error: 'Email already registered' });

        // Default to employee role
        let finalRoleId = roleId;
        if (!finalRoleId) {
            const empRole = db.prepare("SELECT id FROM roles WHERE name = 'employee'").get();
            finalRoleId = empRole?.id;
        }

        const hashedPw = await hashPassword(password);
        const userId = uuidv4();

        db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role_id, password_changed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(userId, email, hashedPw, firstName, lastName, phone || null, finalRoleId);

        logAuditEvent(db, { userId, userEmail: email, action: 'USER_REGISTERED', module: 'auth', resourceType: 'user', resourceId: userId, ipAddress: req.ip });

        res.status(201).json({ id: userId, email, firstName, lastName });
    } catch (err) {
        res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        // verifyToken already imported at top
        const decoded = verifyToken(token);

        const db = req.app.get('db');
        const user = db.prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.preferences,
             u.timezone, u.locale, u.mfa_enabled, u.last_login_at,
             r.name as role_name, r.level as role_level
      FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.is_active = 1
    `).get(decoded.userId);

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            phone: user.phone,
            avatar: user.avatar_url,
            role: user.role_name,
            roleLevel: user.role_level,
            timezone: user.timezone,
            locale: user.locale,
            mfaEnabled: user.mfa_enabled,
            lastLogin: user.last_login_at,
            preferences: JSON.parse(user.preferences || '{}')
        });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        // verifyToken already imported at top
        const decoded = verifyToken(token);

        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });

        const strength = validatePasswordStrength(newPassword);
        if (!strength.valid) return res.status(400).json({ error: strength.errors.join(', ') });

        const db = req.app.get('db');
        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(decoded.userId);
        const valid = await comparePassword(currentPassword, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const hashedPw = await hashPassword(newPassword);
        db.prepare("UPDATE users SET password_hash = ?, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(hashedPw, decoded.userId);

        logAuditEvent(db, { userId: decoded.userId, userEmail: decoded.email, action: 'PASSWORD_CHANGED', module: 'auth', ipAddress: req.ip });

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Password change failed: ' + err.message });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            const db = req.app.get('db');
            db.prepare("UPDATE user_sessions SET is_active = 0 WHERE token_hash = ?").run(token.substring(0, 50));
        }
        res.json({ success: true });
    } catch (err) {
        res.json({ success: true }); // Always succeed on logout
    }
});

export default router;
