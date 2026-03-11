import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireRole, checkPermission } from '../middleware/rbac.js';
import { auditLog } from '../middleware/audit.js';
import { hashPassword, validatePasswordStrength } from '../middleware/auth.js';
const router = Router();

// === USERS MANAGEMENT ===
router.get('/users', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 25, search, role_id, is_active } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)"); const s = `%${search}%`; params.push(s, s, s); }
    if (role_id) { where.push("u.role_id=?"); params.push(role_id); }
    if (is_active !== undefined) { where.push("u.is_active=?"); params.push(+is_active); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM users u WHERE ${where.join(' AND ')}`).get(...params);
    const users = db.prepare(`SELECT u.id,u.email,u.first_name,u.last_name,u.phone,u.avatar_url,u.role_id,u.is_active,u.is_locked,u.last_login_at,u.mfa_enabled,u.created_at,r.name as role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ users, total: total.count, page: +page });
});

router.post('/users', requireRole('admin'), auditLog('admin', 'CREATE_USER'), async (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.email || !b.first_name || !b.last_name || !b.password) return res.status(400).json({ error: 'Email, name, and password required' });
    const strength = validatePasswordStrength(b.password);
    if (!strength.valid) return res.status(400).json({ error: strength.errors.join(', ') });
    if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email)) return res.status(409).json({ error: 'Email exists' });
    const hash = await hashPassword(b.password);
    db.prepare(`INSERT INTO users (id,email,password_hash,first_name,last_name,phone,role_id,is_active,timezone,locale,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.email, hash, b.first_name, b.last_name, b.phone, b.role_id, b.is_active ?? 1, b.timezone || 'Asia/Kolkata', b.locale || 'en-IN', req.user.id);
    res.status(201).json({ id, email: b.email, first_name: b.first_name, last_name: b.last_name });
});

router.put('/users/:id', requireRole('admin'), auditLog('admin', 'UPDATE_USER'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['first_name', 'last_name', 'phone', 'role_id', 'is_active', 'is_locked', 'timezone', 'locale'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.is_locked === 0) { updates.push('failed_login_attempts=0'); }
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...values);
    const user = db.prepare('SELECT id,email,first_name,last_name,role_id,is_active,is_locked FROM users WHERE id=?').get(req.params.id);
    res.json(user);
});

router.delete('/users/:id', requireRole('super_admin'), auditLog('admin', 'DELETE_USER'), (req, res) => {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    req.app.get('db').prepare("UPDATE users SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ success: true });
});

// Reset user password
router.post('/users/:id/reset-password', requireRole('admin'), auditLog('admin', 'RESET_PASSWORD'), async (req, res) => {
    const newPassword = req.body.password || `Temp${Date.now().toString(36)}!`;
    const hash = await hashPassword(newPassword);
    req.app.get('db').prepare("UPDATE users SET password_hash=?,password_changed_at=datetime('now'),is_locked=0,failed_login_attempts=0,updated_at=datetime('now') WHERE id=?").run(hash, req.params.id);
    res.json({ success: true, tempPassword: req.body.password ? undefined : newPassword });
});

// === ROLES ===
router.get('/roles', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const roles = db.prepare('SELECT r.*,(SELECT COUNT(*) FROM users WHERE role_id=r.id) as user_count FROM roles r ORDER BY r.level').all();
    res.json({ roles });
});

router.post('/roles', requireRole('super_admin'), auditLog('admin', 'CREATE_ROLE'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.name || !b.level) return res.status(400).json({ error: 'Name and level required' });
    db.prepare(`INSERT INTO roles (id,name,description,level,is_system,created_at,updated_at) VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.description, b.level, 0);
    res.status(201).json(db.prepare('SELECT * FROM roles WHERE id=?').get(id));
});

router.put('/roles/:id', requireRole('super_admin'), auditLog('admin', 'UPDATE_ROLE'), (req, res) => {
    const db = req.app.get('db');
    const role = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
    if (role?.is_system) return res.status(403).json({ error: 'Cannot modify system role' });
    const fields = ['name', 'description', 'level', 'is_active'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE roles SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id));
});

// === PERMISSIONS ===
router.get('/permissions', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const permissions = db.prepare('SELECT * FROM permissions ORDER BY module,action').all();
    const grouped = {};
    permissions.forEach(p => { if (!grouped[p.module]) grouped[p.module] = []; grouped[p.module].push(p); });
    res.json({ permissions, grouped });
});

router.get('/roles/:roleId/permissions', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const perms = db.prepare('SELECT rp.*,p.module,p.action FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?').all(req.params.roleId);
    res.json({ permissions: perms });
});

router.put('/roles/:roleId/permissions', requireRole('admin'), auditLog('admin', 'UPDATE_PERMISSIONS'), (req, res) => {
    const db = req.app.get('db');
    if (!Array.isArray(req.body.permissions)) return res.status(400).json({ error: 'Permissions array required' });
    db.prepare('DELETE FROM role_permissions WHERE role_id=?').run(req.params.roleId);
    req.body.permissions.forEach(pid => {
        db.prepare('INSERT INTO role_permissions (id,role_id,permission_id) VALUES (?,?,?)').run(uuidv4(), req.params.roleId, pid);
    });
    res.json({ success: true });
});

// === MODULE CONFIG ===
router.get('/modules', requireRole('admin'), (req, res) => {
    res.json({ modules: req.app.get('db').prepare('SELECT * FROM module_config ORDER BY sort_order').all() });
});

router.put('/modules/:id', requireRole('super_admin'), auditLog('admin', 'UPDATE_MODULE'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['is_enabled', 'display_name', 'icon', 'sort_order', 'config'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]); } });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE module_config SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM module_config WHERE id=?').get(req.params.id));
});

// === SYSTEM SETTINGS ===
router.get('/settings', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const { category } = req.query;
    let where = '1=1', params = [];
    if (category) { where = 'category=?'; params.push(category); }
    const settings = db.prepare(`SELECT id,category,key,CASE WHEN is_sensitive=1 THEN '***' ELSE value END as value,value_type,description,is_sensitive FROM system_settings WHERE ${where} ORDER BY category,key`).all(...params);
    const grouped = {};
    settings.forEach(s => { if (!grouped[s.category]) grouped[s.category] = []; grouped[s.category].push(s); });
    res.json({ settings, grouped });
});

router.put('/settings', requireRole('super_admin'), auditLog('admin', 'UPDATE_SETTINGS'), (req, res) => {
    const db = req.app.get('db');
    if (!Array.isArray(req.body.settings)) return res.status(400).json({ error: 'Settings array required' });
    req.body.settings.forEach(s => {
        db.prepare(`INSERT INTO system_settings (id,category,key,value,value_type,description,is_sensitive,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(category,key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=datetime('now')`).run(s.id || uuidv4(), s.category, s.key, s.value, s.value_type || 'string', s.description, s.is_sensitive || 0, req.user.id);
    });
    res.json({ success: true });
});

// === APPROVAL WORKFLOWS ===
router.get('/approval-workflows', requireRole('admin'), (req, res) => {
    res.json({ workflows: req.app.get('db').prepare('SELECT * FROM approval_workflows ORDER BY name').all() });
});

router.post('/approval-workflows', requireRole('super_admin'), auditLog('admin', 'CREATE_APPROVAL_WF'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    db.prepare(`INSERT INTO approval_workflows (id,name,module,steps,is_active,created_at,updated_at) VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.module, JSON.stringify(b.steps || []), b.is_active ?? 1);
    res.status(201).json(db.prepare('SELECT * FROM approval_workflows WHERE id=?').get(id));
});

// === SYSTEM HEALTH ===
router.get('/system-health', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const dbSize = db.prepare("SELECT page_count*page_size as size FROM pragma_page_count(),pragma_page_size()").get();
    const tableStats = db.prepare("SELECT name,(SELECT COUNT(*) FROM sqlite_master sm2 WHERE sm2.type='index' AND sm2.tbl_name=sm.name) as index_count FROM sqlite_master sm WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const recordCounts = {};
    ['users', 'accounts', 'leads', 'opportunities', 'invoices', 'products', 'employees', 'tickets', 'projects', 'audit_logs'].forEach(table => {
        try { recordCounts[table] = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c; } catch (e) { recordCounts[table] = 0; }
    });
    res.json({
        database: { size: dbSize?.size || 0, tables: tableStats.length, journalMode: db.pragma('journal_mode')[0]?.journal_mode },
        server: { uptime: process.uptime(), memoryUsage: process.memoryUsage(), nodeVersion: process.version, platform: process.platform },
        records: recordCounts
    });
});

// === LOGIN HISTORY ===
router.get('/login-history', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const { user_id, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    let where = "al.action IN ('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT') OR al.module='auth'";
    const params = [];
    if (user_id) { where += " AND al.user_id=?"; params.push(user_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM audit_logs al WHERE ${where}`).get(...params);
    const logs = db.prepare(`
        SELECT al.id, al.user_id, al.user_email, al.action, al.ip_address, al.user_agent, al.status, al.created_at,
               u.first_name, u.last_name
        FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
        WHERE ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, +limit, offset);
    res.json({ logs, total: total.count, page: +page });
});

// === BULK USER OPERATIONS ===
router.post('/users/bulk', requireRole('super_admin'), auditLog('admin', 'BULK_USER_UPDATE'), (req, res) => {
    const db = req.app.get('db');
    const { user_ids, action, value } = req.body;
    if (!Array.isArray(user_ids) || !action) return res.status(400).json({ error: 'user_ids array and action required' });
    let updated = 0;
    const stmt = (() => {
        switch (action) {
            case 'activate': return db.prepare("UPDATE users SET is_active=1, updated_at=datetime('now') WHERE id=?");
            case 'deactivate': return db.prepare("UPDATE users SET is_active=0, updated_at=datetime('now') WHERE id=?");
            case 'lock': return db.prepare("UPDATE users SET is_locked=1, updated_at=datetime('now') WHERE id=?");
            case 'unlock': return db.prepare("UPDATE users SET is_locked=0, failed_login_attempts=0, updated_at=datetime('now') WHERE id=?");
            case 'change_role': return value ? db.prepare("UPDATE users SET role_id=?, updated_at=datetime('now') WHERE id=?") : null;
            default: return null;
        }
    })();
    if (!stmt) return res.status(400).json({ error: 'Invalid action' });
    user_ids.forEach(uid => {
        try {
            if (action === 'change_role') stmt.run(value, uid);
            else stmt.run(uid);
            updated++;
        } catch { }
    });
    res.json({ success: true, updated });
});

// === DATABASE BACKUP ===
router.get('/backup', requireRole('super_admin'), async (req, res) => {
    const db = req.app.get('db');
    try {
        const dbPath = db.name;
        const fs = await import('fs');
        const pathMod = await import('path');
        const backupName = `rapiderp_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
        const backupPath = pathMod.join(pathMod.dirname(dbPath), backupName);
        await db.backup(backupPath);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${backupName}"`);
        const stream = fs.createReadStream(backupPath);
        stream.pipe(res);
        stream.on('end', () => { try { fs.unlinkSync(backupPath); } catch { } });
    } catch (err) { res.status(500).json({ error: 'Backup failed: ' + err.message }); }
});

// === EXPORT ===
router.get('/export/:module', requireRole('admin'), (req, res) => {
    const db = req.app.get('db');
    const tableMap = { users: 'users', accounts: 'accounts', leads: 'leads', products: 'products', invoices: 'invoices', employees: 'employees', tickets: 'tickets', expenses: 'expenses' };
    const table = tableMap[req.params.module];
    if (!table) return res.status(404).json({ error: 'Invalid module' });
    const data = db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 10000`).all();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.module}_export_${Date.now()}.json`);
    res.json({ module: req.params.module, exported_at: new Date().toISOString(), count: data.length, data });
});

export default router;
