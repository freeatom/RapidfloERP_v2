import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, validatePasswordStrength } from '../middleware/auth.js';
import { getCompanyDb, createCompanyDb, deleteCompanyDb } from '../db/companyDbPool.js';
const router = Router();

// Helper: require SuperAdmin
function requireSuperAdmin(req, res, next) {
    if (!req.user?.isSuperAdmin) return res.status(403).json({ error: 'SuperAdmin access required' });
    next();
}

// Helper: require at least admin role (SuperAdmin always passes)
function requireAdmin(req, res, next) {
    if (req.user?.isSuperAdmin || req.user?.roleLevel <= 2) return next();
    return res.status(403).json({ error: 'Admin access required' });
}

// ============================
// === COMPANY MANAGEMENT (SuperAdmin only) ===
// ============================

// List all companies
router.get('/companies', requireSuperAdmin, (req, res) => {
    const mainDb = req.app.get('db');
    const { search } = req.query;
    let where = ['1=1'], params = [];
    if (search) { where.push("(c.name LIKE ? OR c.code LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    const companies = mainDb.prepare(`SELECT c.* FROM companies c WHERE ${where.join(' AND ')} ORDER BY c.name`).all(...params);

    // For each company, count users from their company DB
    const result = companies.map(c => {
        try {
            const cdb = getCompanyDb(c.id);
            const userCount = cdb ? cdb.prepare('SELECT COUNT(*) as c FROM users').get().c : 0;
            return { ...c, user_count: userCount };
        } catch { return { ...c, user_count: 0 }; }
    });

    res.json({ companies: result });
});

// Create company + its database
router.post('/companies', requireSuperAdmin, (req, res) => {
    const mainDb = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.name || !b.code) return res.status(400).json({ error: 'Company name and code required' });
    const code = b.code.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (mainDb.prepare('SELECT id FROM companies WHERE code = ?').get(code)) return res.status(409).json({ error: 'Company code already exists' });

    mainDb.prepare(`INSERT INTO companies (id,name,code,logo_url,address,city,state,country,phone,email,website,industry,gst_number,pan_number,is_active,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(
        id, b.name, code, b.logo_url, b.address, b.city, b.state, b.country || 'India', b.phone, b.email, b.website, b.industry, b.gst_number, b.pan_number, 1, req.user.id
    );

    // Create the company's isolated database
    createCompanyDb(id);

    res.status(201).json(mainDb.prepare('SELECT * FROM companies WHERE id = ?').get(id));
});

// Update company
router.put('/companies/:id', requireSuperAdmin, (req, res) => {
    const mainDb = req.app.get('db');
    const fields = ['name', 'logo_url', 'address', 'city', 'state', 'country', 'phone', 'email', 'website', 'industry', 'gst_number', 'pan_number', 'is_active'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    mainDb.prepare(`UPDATE companies SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(mainDb.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id));
});

// Delete company (deactivate + optionally delete DB)
router.delete('/companies/:id', requireSuperAdmin, (req, res) => {
    const mainDb = req.app.get('db');
    const { permanent } = req.query;
    
    if (permanent === 'true') {
        // Completely delete company record and its DB
        mainDb.prepare("DELETE FROM companies WHERE id=?").run(req.params.id);
        deleteCompanyDb(req.params.id);
    } else {
        // Just deactivate
        mainDb.prepare("UPDATE companies SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
    }
    
    // Remove all user_directory entries for this company
    mainDb.prepare('DELETE FROM user_directory WHERE company_id=?').run(req.params.id);
    
    res.json({ success: true });
});

// Get company details
router.get('/companies/:id', requireSuperAdmin, (req, res) => {
    const mainDb = req.app.get('db');
    const company = mainDb.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const companyDb = getCompanyDb(req.params.id);
    let users = [], roles = [], stats = {};
    if (companyDb) {
        users = companyDb.prepare(`SELECT u.id,u.email,u.first_name,u.last_name,u.phone,u.is_active,u.is_locked,u.last_login_at,u.created_at,r.name as role_name,r.level as role_level FROM users u LEFT JOIN roles r ON r.id=u.role_id ORDER BY u.created_at DESC`).all();
        roles = companyDb.prepare('SELECT * FROM roles ORDER BY level').all();
        stats = {
            leads: companyDb.prepare('SELECT COUNT(*) as v FROM leads').get()?.v || 0,
            contacts: companyDb.prepare('SELECT COUNT(*) as v FROM contacts').get()?.v || 0,
            accounts: companyDb.prepare('SELECT COUNT(*) as v FROM accounts').get()?.v || 0,
            opportunities: companyDb.prepare('SELECT COUNT(*) as v FROM opportunities').get()?.v || 0,
            invoices: companyDb.prepare('SELECT COUNT(*) as v FROM invoices').get()?.v || 0,
            employees: companyDb.prepare('SELECT COUNT(*) as v FROM employees').get()?.v || 0,
        };
    }
    res.json({ ...company, users, roles, stats });
});

// ============================
// === USER MANAGEMENT (inside company DB) ===
// ============================

// List users in company (need companyDb from tenant middleware or explicit company ID)
router.get('/users', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context. Select a company first.' });

    const { page = 1, limit = 25, search, role_id, is_active } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)"); const s = `%${search}%`; params.push(s, s, s); }
    if (role_id) { where.push("u.role_id=?"); params.push(role_id); }
    if (is_active !== undefined) { where.push("u.is_active=?"); params.push(+is_active); }
    const total = companyDb.prepare(`SELECT COUNT(*) as count FROM users u WHERE ${where.join(' AND ')}`).get(...params);
    const users = companyDb.prepare(`SELECT u.id,u.email,u.first_name,u.last_name,u.phone,u.avatar_url,u.role_id,u.is_active,u.is_locked,u.last_login_at,u.mfa_enabled,u.created_at,r.name as role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ users, total: total.count, page: +page });
});

// Create user in company
router.post('/users', requireAdmin, async (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });

    const b = req.body;
    if (!b.email || !b.first_name || !b.last_name || !b.password) return res.status(400).json({ error: 'Email, name, and password required' });
    const strength = validatePasswordStrength(b.password);
    if (!strength.valid) return res.status(400).json({ error: strength.errors.join(', ') });
    if (companyDb.prepare('SELECT id FROM users WHERE email=?').get(b.email.toLowerCase())) return res.status(409).json({ error: 'Email already exists in this company' });

    // Check if email exists in another company
    const mainDb = req.app.get('db');
    const existsSuperAdmin = mainDb.prepare('SELECT id FROM super_admins WHERE email=?').get(b.email.toLowerCase());
    if (existsSuperAdmin) return res.status(409).json({ error: 'This email is registered as a SuperAdmin' });

    const id = uuidv4();
    const hash = await hashPassword(b.password);
    const roleId = b.role_id || 'role-user';

    companyDb.prepare(`INSERT INTO users (id,email,password_hash,first_name,last_name,phone,role_id,is_active,timezone,locale,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(
        id, b.email.toLowerCase(), hash, b.first_name, b.last_name, b.phone, roleId, b.is_active ?? 1, b.timezone || 'Asia/Kolkata', b.locale || 'en-IN', req.user.id
    );

    // Add to user_directory in main DB for login routing
    mainDb.prepare('INSERT OR REPLACE INTO user_directory (email, company_id, user_id) VALUES (?,?,?)').run(b.email.toLowerCase(), req.companyId, id);

    res.status(201).json({ id, email: b.email.toLowerCase(), first_name: b.first_name, last_name: b.last_name });
});

// Update user in company
router.put('/users/:id', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });

    const fields = ['first_name', 'last_name', 'phone', 'role_id', 'is_active', 'is_locked', 'timezone', 'locale'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.is_locked === 0) updates.push('failed_login_attempts=0');
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    companyDb.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...values);

    if (req.body.is_active === 0) {
        const user = companyDb.prepare('SELECT email FROM users WHERE id=?').get(req.params.id);
        if (user) {
            const mainDb = req.app.get('db');
            mainDb.prepare('DELETE FROM user_directory WHERE email=? AND company_id=?').run(user.email, req.companyId);
        }
    }

    const user = companyDb.prepare('SELECT id,email,first_name,last_name,role_id,is_active,is_locked FROM users WHERE id=?').get(req.params.id);
    res.json(user);
});

// Delete (deactivate) user
router.delete('/users/:id', requireAdmin, (req, res) => {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });

    const user = companyDb.prepare('SELECT email FROM users WHERE id=?').get(req.params.id);
    companyDb.prepare("UPDATE users SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
    if (user) {
        const mainDb = req.app.get('db');
        mainDb.prepare('DELETE FROM user_directory WHERE email=? AND company_id=?').run(user.email, req.companyId);
    }
    res.json({ success: true });
});

// Reset user password
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });

    const newPassword = req.body.password || `Temp${Date.now().toString(36)}!`;
    const hash = await hashPassword(newPassword);
    companyDb.prepare("UPDATE users SET password_hash=?,password_changed_at=datetime('now'),is_locked=0,failed_login_attempts=0,updated_at=datetime('now') WHERE id=?").run(hash, req.params.id);
    res.json({ success: true, tempPassword: req.body.password ? undefined : newPassword });
});

// Bulk user operations
router.post('/users/bulk', requireSuperAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });

    const { user_ids, action, value } = req.body;
    if (!Array.isArray(user_ids) || !action) return res.status(400).json({ error: 'user_ids array and action required' });
    let updated = 0;
    const stmt = (() => {
        switch (action) {
            case 'activate': return companyDb.prepare("UPDATE users SET is_active=1, updated_at=datetime('now') WHERE id=?");
            case 'deactivate': return companyDb.prepare("UPDATE users SET is_active=0, updated_at=datetime('now') WHERE id=?");
            case 'lock': return companyDb.prepare("UPDATE users SET is_locked=1, updated_at=datetime('now') WHERE id=?");
            case 'unlock': return companyDb.prepare("UPDATE users SET is_locked=0, failed_login_attempts=0, updated_at=datetime('now') WHERE id=?");
            case 'change_role': return value ? companyDb.prepare("UPDATE users SET role_id=?, updated_at=datetime('now') WHERE id=?") : null;
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

// ============================
// === ROLES (company-level from companyDb) ===
// ============================
router.get('/roles', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    const roles = companyDb.prepare('SELECT r.*,(SELECT COUNT(*) FROM users WHERE role_id=r.id) as user_count FROM roles r ORDER BY r.level').all();
    res.json({ roles });
});

router.post('/roles', requireSuperAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    const id = uuidv4(); const b = req.body;
    if (!b.name || !b.level) return res.status(400).json({ error: 'Name and level required' });
    companyDb.prepare(`INSERT INTO roles (id,name,description,level,is_system,created_at,updated_at) VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.description, b.level, 0);
    res.status(201).json(companyDb.prepare('SELECT * FROM roles WHERE id=?').get(id));
});

router.put('/roles/:id', requireSuperAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    const role = companyDb.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
    if (role?.is_system) return res.status(403).json({ error: 'Cannot modify system role' });
    const fields = ['name', 'description', 'level', 'is_active'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    companyDb.prepare(`UPDATE roles SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(companyDb.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id));
});

// === PERMISSIONS (company-level) ===
router.get('/permissions', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    const permissions = companyDb.prepare('SELECT * FROM permissions ORDER BY module,action').all();
    const grouped = {};
    permissions.forEach(p => { if (!grouped[p.module]) grouped[p.module] = []; grouped[p.module].push(p); });
    res.json({ permissions, grouped });
});

router.get('/roles/:roleId/permissions', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    const perms = companyDb.prepare('SELECT rp.*,p.module,p.action FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?').all(req.params.roleId);
    res.json({ permissions: perms });
});

router.put('/roles/:roleId/permissions', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    if (!Array.isArray(req.body.permissions)) return res.status(400).json({ error: 'Permissions array required' });
    companyDb.prepare('DELETE FROM role_permissions WHERE role_id=?').run(req.params.roleId);
    req.body.permissions.forEach(pid => {
        companyDb.prepare('INSERT INTO role_permissions (id,role_id,permission_id) VALUES (?,?,?)').run(uuidv4(), req.params.roleId, pid);
    });
    res.json({ success: true });
});

// === MODULE CONFIG (company-level) ===
router.get('/modules', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    res.json({ modules: companyDb.prepare('SELECT * FROM module_config ORDER BY sort_order').all() });
});

router.put('/modules/:id', requireSuperAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    const fields = ['is_enabled', 'display_name', 'icon', 'sort_order', 'config'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]); } });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    companyDb.prepare(`UPDATE module_config SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(companyDb.prepare('SELECT * FROM module_config WHERE id=?').get(req.params.id));
});

// === SYSTEM SETTINGS (platform-wide, main DB) ===
router.get('/settings', requireSuperAdmin, (req, res) => {
    const db = req.app.get('db');
    const { category } = req.query;
    let where = '1=1', params = [];
    if (category) { where = 'category=?'; params.push(category); }
    const settings = db.prepare(`SELECT id,category,key,CASE WHEN is_sensitive=1 THEN '***' ELSE value END as value,value_type,description,is_sensitive FROM system_settings WHERE ${where} ORDER BY category,key`).all(...params);
    const grouped = {};
    settings.forEach(s => { if (!grouped[s.category]) grouped[s.category] = []; grouped[s.category].push(s); });
    res.json({ settings, grouped });
});

router.put('/settings', requireSuperAdmin, (req, res) => {
    const db = req.app.get('db');
    if (!Array.isArray(req.body.settings)) return res.status(400).json({ error: 'Settings array required' });
    req.body.settings.forEach(s => {
        db.prepare(`INSERT INTO system_settings (id,category,key,value,value_type,description,is_sensitive,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(category,key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=datetime('now')`).run(s.id || uuidv4(), s.category, s.key, s.value, s.value_type || 'string', s.description, s.is_sensitive || 0, req.user.id);
    });
    res.json({ success: true });
});

// === SYSTEM HEALTH ===
router.get('/system-health', requireAdmin, (req, res) => {
    const mainDb = req.app.get('db');
    const dbSize = mainDb.prepare("SELECT page_count*page_size as size FROM pragma_page_count(),pragma_page_size()").get();
    const companies = mainDb.prepare('SELECT COUNT(*) as c FROM companies WHERE is_active=1').get();
    const superAdmins = mainDb.prepare('SELECT COUNT(*) as c FROM super_admins WHERE is_active=1').get();

    let companyRecords = {};
    if (req.companyDb) {
        ['users', 'accounts', 'leads', 'opportunities', 'invoices', 'products', 'employees', 'tickets', 'projects'].forEach(table => {
            try { companyRecords[table] = req.companyDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c; } catch { companyRecords[table] = 0; }
        });
    }

    res.json({
        database: { size: dbSize?.size || 0, journalMode: mainDb.pragma('journal_mode')[0]?.journal_mode },
        platform: { companies: companies.c, superAdmins: superAdmins.c },
        server: { uptime: process.uptime(), memoryUsage: process.memoryUsage(), nodeVersion: process.version, platform: process.platform },
        companyRecords
    });
});

// === EXPORT (from company DB) ===
router.get('/export/:module', requireAdmin, (req, res) => {
    const companyDb = req.companyDb;
    if (!companyDb) return res.status(400).json({ error: 'No company context' });
    const tableMap = { users: 'users', accounts: 'accounts', leads: 'leads', products: 'products', invoices: 'invoices', employees: 'employees', tickets: 'tickets', expenses: 'expenses' };
    const table = tableMap[req.params.module];
    if (!table) return res.status(404).json({ error: 'Invalid module' });
    const data = companyDb.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 10000`).all();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.module}_export_${Date.now()}.json`);
    res.json({ module: req.params.module, exported_at: new Date().toISOString(), count: data.length, data });
});

export default router;
