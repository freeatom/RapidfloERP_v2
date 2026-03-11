import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateToken, verifyToken, hashPassword, comparePassword, validatePasswordStrength, authMiddleware } from '../middleware/auth.js';
import { getCompanyDb, createCompanyDb } from '../db/companyDbPool.js';
const router = Router();

// ============================================
// POST /api/auth/login
// Checks: 1) super_admins table  2) user_directory → company DB
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const mainDb = req.app.get('db');

        // 1. Check SuperAdmin
        const superAdmin = mainDb.prepare('SELECT * FROM super_admins WHERE email = ?').get(email.toLowerCase());
        if (superAdmin) {
            if (!superAdmin.is_active) return res.status(403).json({ error: 'Account deactivated' });
            if (superAdmin.is_locked) return res.status(403).json({ error: 'Account locked. Contact support.' });

            const validPw = await comparePassword(password, superAdmin.password_hash);
            if (!validPw) {
                mainDb.prepare('UPDATE super_admins SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?').run(superAdmin.id);
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            mainDb.prepare(`UPDATE super_admins SET failed_login_attempts = 0, last_login_at = datetime('now') WHERE id = ?`).run(superAdmin.id);

            // Get all companies for the gate
            const companies = mainDb.prepare('SELECT id, name, code, industry, is_active FROM companies WHERE is_active = 1 ORDER BY name').all();

            const token = generateToken({ userId: superAdmin.id, isSuperAdmin: true });

            return res.json({
                token,
                user: {
                    id: superAdmin.id,
                    email: superAdmin.email,
                    firstName: superAdmin.first_name,
                    lastName: superAdmin.last_name,
                    role: 'super_admin',
                    roleLevel: 0,
                    isSuperAdmin: true,
                    companyId: null,
                    companyName: null,
                    availableCompanies: companies,
                    preferences: JSON.parse(superAdmin.preferences || '{}')
                }
            });
        }

        // 2. Check company users via user_directory
        const dirEntries = mainDb.prepare('SELECT * FROM user_directory WHERE email = ?').all(email.toLowerCase());
        if (dirEntries.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Try each company DB for the password match
        for (const entry of dirEntries) {
            const companyDb = getCompanyDb(entry.company_id);
            if (!companyDb) continue;

            const user = companyDb.prepare('SELECT * FROM users WHERE id = ? AND email = ?').get(entry.user_id, email.toLowerCase());
            if (!user) continue;
            if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });
            if (user.is_locked) return res.status(403).json({ error: 'Account locked. Contact your company admin.' });

            const validPw = await comparePassword(password, user.password_hash);
            if (!validPw) {
                companyDb.prepare('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?').run(user.id);
                const attempts = user.failed_login_attempts + 1;
                if (attempts >= 5) companyDb.prepare('UPDATE users SET is_locked = 1 WHERE id = ?').run(user.id);
                continue; // Try next company entry
            }

            // Password match! Reset failures and log in
            companyDb.prepare(`UPDATE users SET failed_login_attempts = 0, last_login_at = datetime('now') WHERE id = ?`).run(user.id);

            const role = companyDb.prepare('SELECT * FROM roles WHERE id = ?').get(user.role_id);
            const company = mainDb.prepare('SELECT name, code FROM companies WHERE id = ?').get(entry.company_id);

            const token = generateToken({ userId: user.id, companyId: entry.company_id, isSuperAdmin: false });

            return res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    role: role?.name || 'user',
                    roleLevel: role?.level || 5,
                    isSuperAdmin: false,
                    companyId: entry.company_id,
                    companyName: company?.name || 'Unknown',
                    companyCode: company?.code || '',
                    availableCompanies: [{ id: entry.company_id, name: company?.name, code: company?.code }],
                    preferences: JSON.parse(user.preferences || '{}')
                }
            });
        }

        return res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed: ' + err.message });
    }
});

// ============================================
// GET /api/auth/me
// ============================================
router.get('/me', authMiddleware, (req, res) => {
    try {
        const mainDb = req.app.get('db');

        if (req.user.isSuperAdmin) {
            const admin = mainDb.prepare('SELECT * FROM super_admins WHERE id = ?').get(req.user.id);
            if (!admin) return res.status(404).json({ error: 'User not found' });

            const companies = mainDb.prepare('SELECT id, name, code, industry FROM companies WHERE is_active = 1 ORDER BY name').all();

            let activeCompanyId = req.headers['x-company-id'] || null;
            let activeCompanyName = null;
            if (activeCompanyId) {
                const ac = companies.find(c => c.id === activeCompanyId);
                if (ac) {
                    activeCompanyName = ac.name;
                } else {
                    activeCompanyId = null;
                }
            }

            return res.json({
                id: admin.id,
                email: admin.email,
                firstName: admin.first_name,
                lastName: admin.last_name,
                role: 'super_admin',
                roleLevel: 0,
                isSuperAdmin: true,
                companyId: activeCompanyId,
                companyName: activeCompanyName,
                availableCompanies: companies,
                timezone: admin.timezone,
                locale: admin.locale,
                mfaEnabled: admin.mfa_enabled,
                lastLogin: admin.last_login_at,
                preferences: JSON.parse(admin.preferences || '{}')
            });
        }

        // Company user
        const companyDb = getCompanyDb(req.user.companyId);
        if (!companyDb) return res.status(500).json({ error: 'Company database unavailable' });

        const user = companyDb.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const role = companyDb.prepare('SELECT name, level FROM roles WHERE id = ?').get(user.role_id);
        const company = mainDb.prepare('SELECT name, code FROM companies WHERE id = ?').get(req.user.companyId);

        res.json({
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            phone: user.phone,
            avatar: user.avatar_url,
            role: role?.name || 'user',
            roleLevel: role?.level || 5,
            isSuperAdmin: false,
            companyId: req.user.companyId,
            companyName: company?.name || 'Unknown',
            companyCode: company?.code || '',
            availableCompanies: [{ id: req.user.companyId, name: company?.name, code: company?.code }],
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

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', authMiddleware, (req, res) => {
    res.json({ success: true });
});

export default router;
