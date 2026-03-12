import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { auditLog } from '../middleware/audit.js';
const router = Router();

// Setup upload directory for avatars
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `avatar_${Date.now()}_${uuidv4()}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images are allowed'));
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Hash password utility - same as auth
async function hashPassword(password) {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(password).digest('hex');
}

// GET /profile — current user info
router.get('/', (req, res) => {
    let user;
    if (req.user.isSuperAdmin) {
        const db = req.app.get('db');
        user = db.prepare(`
            SELECT id, email, first_name, last_name, phone, avatar_url,
                   timezone, locale, is_active, created_at, updated_at,
                   'Super Admin' as role_name, 0 as role_level
            FROM super_admins
            WHERE id = ?
        `).get(req.user.id);
    } else {
        const db = req.companyDb;
        user = db.prepare(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url,
                   u.timezone, u.locale, u.is_active, u.created_at, u.updated_at,
                   r.name as role_name, r.level as role_level
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            WHERE u.id = ?
        `).get(req.user.id);
    }
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get recent login sessions (these are always in company_db for normal users, but for super admins tracking might differ. Assuming main logs for now or ignoring if absent)
    let sessions = [];
    let activityCount = 0;
    try {
        const logDb = req.user.isSuperAdmin ? req.app.get('db') : req.companyDb;
        sessions = logDb.prepare(`
            SELECT action, ip_address, user_agent, created_at
            FROM audit_logs
            WHERE user_id = ? AND action IN ('LOGIN', 'LOGOUT')
            ORDER BY created_at DESC LIMIT 10
        `).all(req.user.id);
        activityCount = logDb.prepare('SELECT COUNT(*) as c FROM audit_logs WHERE user_id=?').get(req.user.id).c;
    } catch(e) {} // fail silently if audit logs table doesn't exist in mainDb

    res.json({ ...user, sessions, activityCount });
});

// PUT /profile — update own profile
router.put('/', auditLog('profile', 'UPDATE_PROFILE'), (req, res) => {
    const db = req.user.isSuperAdmin ? req.app.get('db') : req.companyDb;
    const table = req.user.isSuperAdmin ? 'super_admins' : 'users';
    
    const fields = ['first_name', 'last_name', 'phone', 'timezone', 'locale', 'avatar_url'];
    const updates = [], values = [];
    fields.forEach(f => {
        if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); }
    });
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push("updated_at=datetime('now')");
    values.push(req.user.id);
    
    db.prepare(`UPDATE ${table} SET ${updates.join(',')} WHERE id=?`).run(...values);

    let updated;
    if (req.user.isSuperAdmin) {
        updated = db.prepare(`
            SELECT id, email, first_name, last_name, phone, avatar_url,
                   timezone, locale, 'Super Admin' as role_name
            FROM super_admins WHERE id=?
        `).get(req.user.id);
    } else {
        updated = db.prepare(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url,
                   u.timezone, u.locale, r.name as role_name
            FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id=?
        `).get(req.user.id);
    }
    
    res.json(updated);
});

// POST /profile/avatar — Upload and change profile picture
router.post('/avatar', auditLog('profile', 'UPDATE_AVATAR'), upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    
    const db = req.user.isSuperAdmin ? req.app.get('db') : req.companyDb;
    const table = req.user.isSuperAdmin ? 'super_admins' : 'users';
    const avatarPath = `/uploads/${req.file.filename}`;
    
    db.prepare(`UPDATE ${table} SET avatar_url=?, updated_at=datetime('now') WHERE id=?`).run(avatarPath, req.user.id);
    
    let updated;
    if (req.user.isSuperAdmin) {
        updated = db.prepare(`
            SELECT id, email, first_name, last_name, phone, avatar_url,
                   timezone, locale, 'Super Admin' as role_name
            FROM super_admins WHERE id=?
        `).get(req.user.id);
    } else {
        updated = db.prepare(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url,
                   u.timezone, u.locale, r.name as role_name
            FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id=?
        `).get(req.user.id);
    }
    res.json(updated);
});

// PUT /profile/password — change own password
router.put('/password', auditLog('profile', 'CHANGE_PASSWORD'), async (req, res) => {
    const db = req.user.isSuperAdmin ? req.app.get('db') : req.companyDb;
    const table = req.user.isSuperAdmin ? 'super_admins' : 'users';
    
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current and new password required' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const curr = db.prepare(`SELECT password_hash FROM ${table} WHERE id=?`).get(req.user.id);
    const currentHash = await hashPassword(current_password);
    if (curr.password_hash !== currentHash) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(new_password);
    db.prepare(`UPDATE ${table} SET password_hash=?, updated_at=datetime('now') WHERE id=?`).run(newHash, req.user.id);
    res.json({ success: true, message: 'Password changed successfully' });
});

// GET /profile/preferences — user preferences
router.get('/preferences', (req, res) => {
    const db = req.companyDb;
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
    const db = req.companyDb;
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
