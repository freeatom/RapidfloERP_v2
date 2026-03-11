// Multi-tenant middleware — per-company database isolation
// SuperAdmin: can enter any company, gets that company's DB
// Company users: locked to their own company's DB
import { getCompanyDb } from '../db/companyDbPool.js';

export function tenantMiddleware(req, res, next) {
    if (!req.user) return next();

    const requestedCompanyId = req.headers['x-company-id'];

    // SuperAdmin: MUST select a company to access business data
    if (req.user.isSuperAdmin) {
        if (requestedCompanyId) {
            const mainDb = req.app.get('db');
            const company = mainDb.prepare('SELECT id, name, code FROM companies WHERE id = ? AND is_active = 1').get(requestedCompanyId);
            if (!company) return res.status(404).json({ error: 'Company not found or inactive' });
            req.companyId = company.id;
            req.companyName = company.name;
            req.companyDb = getCompanyDb(company.id);
            if (!req.companyDb) return res.status(404).json({ error: 'Company database not found' });
        } else {
            // No company selected — no data access
            req.companyId = null;
            req.companyDb = null;
        }
        return next();
    }

    // Company user: always locked to their own company
    if (req.user.companyId) {
        req.companyId = req.user.companyId;
        req.companyDb = getCompanyDb(req.user.companyId);
        if (!req.companyDb) return res.status(500).json({ error: 'Company database unavailable' });
        
        // Get company name from main DB
        const mainDb = req.app.get('db');
        const company = mainDb.prepare('SELECT name FROM companies WHERE id = ?').get(req.user.companyId);
        req.companyName = company?.name || 'Unknown';
    } else {
        req.companyId = null;
        req.companyDb = null;
    }

    return next();
}
