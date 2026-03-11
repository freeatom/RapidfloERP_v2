import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { auditLog } from '../middleware/audit.js';
const router = Router();

// Hash password utility - same as auth
async function hashPassword(password) {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(password).digest('hex');
}

// GET /profile — current user info
router.get('/', (req, res) => {
    const db = req.app.get('db');
    const user = db.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar,
               u.timezone, u.locale, u.is_active, u.created_at, u.updated_at,
               r.name as role_name, r.level as role_level
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?
    `).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get recent login sessions
    const sessions = db.prepare(`
        SELECT action, ip_address, user_agent, created_at
        FROM audit_logs
        WHERE user_id = ? AND action IN ('LOGIN', 'LOGOUT')
        ORDER BY created_at DESC LIMIT 10
    `).all(req.user.id);

    // Get activity count
    const activityCount = db.prepare('SELECT COUNT(*) as c FROM audit_logs WHERE user_id=?').get(req.user.id).c;

    res.json({ ...user, sessions, activityCount });
});

// PUT /profile — update own profile
router.put('/', auditLog('profile', 'UPDATE_PROFILE'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['first_name', 'last_name', 'phone', 'timezone', 'locale', 'avatar'];
    const updates = [], values = [];
    fields.forEach(f => {
        if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); }
    });
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push("updated_at=datetime('now')");
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...values);

    // Update localStorage data on next login
    const updated = db.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar,
               u.timezone, u.locale, r.name as role_name
        FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id=?
    `).get(req.user.id);
    res.json(updated);
});

// PUT /profile/password — change own password
router.put('/password', auditLog('profile', 'CHANGE_PASSWORD'), async (req, res) => {
    const db = req.app.get('db');
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current and new password required' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
    const currentHash = await hashPassword(current_password);
    if (user.password_hash !== currentHash) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(new_password);
    db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(newHash, req.user.id);
    res.json({ success: true, message: 'Password changed successfully' });
});

// GET /profile/preferences — user preferences
router.get('/preferences', (req, res) => {
    const db = req.app.get('db');
    try {
        const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id=?').all(req.user.id);
        const map = {};
        prefs.forEach(p => { map[p.key] = p.value; });
        res.json({ preferences: map });
    } catch {
        res.json({ preferences: {} });
    }
});

// PUT /profile/preferences — save user preferences
router.put('/preferences', (req, res) => {
    const db = req.app.get('db');
    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({ error: 'Preferences object required' });
    }
    try {
        // Ensure table exists
        db.prepare(`CREATE TABLE IF NOT EXISTS user_preferences (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
            created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, key)
        )`).run();

        Object.entries(preferences).forEach(([key, value]) => {
            db.prepare(`INSERT INTO user_preferences (id, user_id, key, value, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
            `).run(uuidv4(), req.user.id, key, String(value));
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
