// Role-Based Access Control Middleware
// 5-level hierarchy: Super Admin (1) → Admin (2) → Manager (3) → Employee (4) → Viewer (5)

const ROLE_HIERARCHY = {
    'super_admin': 1,
    'admin': 2,
    'manager': 3,
    'employee': 4,
    'viewer': 5
};

// Module permissions mapping
const MODULE_PERMISSIONS = {
    dashboard: { view: 5, create: 3, edit: 3, delete: 2 },
    crm: { view: 5, create: 4, edit: 4, delete: 3 },
    sales: { view: 5, create: 4, edit: 4, delete: 3 },
    finance: { view: 4, create: 3, edit: 3, delete: 2 },
    inventory: { view: 5, create: 4, edit: 4, delete: 3 },
    procurement: { view: 4, create: 3, edit: 3, delete: 2 },
    hrms: { view: 4, create: 3, edit: 3, delete: 2 },
    projects: { view: 5, create: 4, edit: 4, delete: 3 },
    support: { view: 5, create: 4, edit: 4, delete: 3 },
    reports: { view: 4, create: 3, edit: 3, delete: 2 },
    admin: { view: 2, create: 1, edit: 1, delete: 1 },
    workflows: { view: 3, create: 2, edit: 2, delete: 1 }
};

export function checkPermission(module, action) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userLevel = req.user.roleLevel || 5;
        const requiredLevel = MODULE_PERMISSIONS[module]?.[action];

        if (requiredLevel === undefined) {
            return res.status(403).json({ error: `Unknown permission: ${module}.${action}` });
        }

        // Super admin always has full access
        if (req.user.isSuperAdmin || userLevel <= 1) {
            return next();
        }

        // Check if this role has ANY custom permissions configured in company DB
        const db = req.companyDb;
        if (!db) return next(); // No company context, fall back to hierarchy

        const hasCustomPerms = db.prepare(`
            SELECT COUNT(*) as count FROM role_permissions WHERE role_id = ?
        `).get(req.user.roleId);

        if (hasCustomPerms && hasCustomPerms.count > 0) {
            // Role has custom permissions — use ONLY those (dynamic mode)
            const customPerm = db.prepare(`
                SELECT rp.* FROM role_permissions rp
                JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = ? AND p.module = ? AND p.action = ?
            `).get(req.user.roleId, module, action);

            if (customPerm) {
                req.fieldRestrictions = customPerm.field_restrictions ? JSON.parse(customPerm.field_restrictions) : [];
                req.recordFilter = customPerm.record_filter || null;
                return next();
            }

            // Permission not found in custom permissions → denied
            return res.status(403).json({
                error: 'Insufficient permissions',
                code: 'FORBIDDEN',
                required: `${module}.${action}`,
                userRole: req.user.roleName
            });
        }

        // No custom permissions configured — fall back to role hierarchy
        if (userLevel <= requiredLevel) {
            return next();
        }

        return res.status(403).json({
            error: 'Insufficient permissions',
            code: 'FORBIDDEN',
            required: `${module}.${action}`,
            userRole: req.user.roleName
        });
    };
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const roleLevels = roles.map(r => ROLE_HIERARCHY[r] || 5);
        const maxLevel = Math.max(...roleLevels);

        if (req.user.roleLevel <= maxLevel) {
            return next();
        }

        return res.status(403).json({
            error: 'Insufficient role level',
            code: 'ROLE_REQUIRED',
            required: roles.join(' or ')
        });
    };
}

export function requireMinLevel(level) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (req.user.roleLevel <= level) {
            return next();
        }
        return res.status(403).json({ error: 'Insufficient access level', code: 'LEVEL_REQUIRED' });
    };
}

// Filter response fields based on role
export function filterFields(data, restrictions) {
    if (!restrictions || restrictions.length === 0) return data;
    if (Array.isArray(data)) {
        return data.map(item => filterSingleRecord(item, restrictions));
    }
    return filterSingleRecord(data, restrictions);
}

function filterSingleRecord(record, restrictions) {
    const filtered = { ...record };
    restrictions.forEach(field => {
        delete filtered[field];
    });
    return filtered;
}

export { ROLE_HIERARCHY, MODULE_PERMISSIONS };
