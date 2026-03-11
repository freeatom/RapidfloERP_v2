import { Router } from 'express';

const router = Router();

// GET /api/search?q=term - Cross-module global search
router.get('/', (req, res) => {
    try {
        const db = req.app.get('db');
        const q = req.query.q || '';
        if (!q || q.length < 2) return res.json({ results: [], total: 0 });

        const like = `%${q}%`;
        const results = [];

        // Search Leads
        const leads = db.prepare(`
            SELECT id, first_name || ' ' || last_name as name, company, email, status
            FROM leads WHERE first_name || ' ' || last_name LIKE ? OR company LIKE ? OR email LIKE ?
            LIMIT 5
        `).all(like, like, like);
        if (leads.length) results.push({ module: 'CRM', type: 'Leads', icon: 'users', path: '/crm', items: leads.map(l => ({ id: l.id, title: l.name, subtitle: l.company || l.email, badge: l.status })) });

        // Search Accounts
        const accounts = db.prepare(`
            SELECT id, name, industry, city FROM accounts
            WHERE name LIKE ? OR industry LIKE ? OR city LIKE ? LIMIT 5
        `).all(like, like, like);
        if (accounts.length) results.push({ module: 'CRM', type: 'Accounts', icon: 'building', path: '/crm', items: accounts.map(a => ({ id: a.id, title: a.name, subtitle: [a.industry, a.city].filter(Boolean).join(' · ') })) });

        // Search Contacts
        const contacts = db.prepare(`
            SELECT id, first_name || ' ' || last_name as name, email, phone FROM contacts
            WHERE first_name || ' ' || last_name LIKE ? OR email LIKE ? LIMIT 5
        `).all(like, like);
        if (contacts.length) results.push({ module: 'CRM', type: 'Contacts', icon: 'user', path: '/crm', items: contacts.map(c => ({ id: c.id, title: c.name, subtitle: c.email || c.phone })) });

        // Search Products
        const products = db.prepare(`
            SELECT id, name, sku, category, base_price FROM products
            WHERE name LIKE ? OR sku LIKE ? OR category LIKE ? LIMIT 5
        `).all(like, like, like);
        if (products.length) results.push({ module: 'Inventory', type: 'Products', icon: 'package', path: '/inventory', items: products.map(p => ({ id: p.id, title: p.name, subtitle: `SKU: ${p.sku || 'N/A'} · ₹${p.base_price || 0}` })) });

        // Search Invoices
        const invoices = db.prepare(`
            SELECT i.id, i.invoice_number, i.total_amount, i.status,
                   COALESCE(a.name, '') as account_name
            FROM invoices i LEFT JOIN accounts a ON a.id = i.account_id
            WHERE i.invoice_number LIKE ? OR a.name LIKE ? LIMIT 5
        `).all(like, like);
        if (invoices.length) results.push({ module: 'Finance', type: 'Invoices', icon: 'file-text', path: '/finance', items: invoices.map(i => ({ id: i.id, title: i.invoice_number, subtitle: `${i.account_name} · ₹${(i.total_amount || 0).toLocaleString()}`, badge: i.status })) });

        // Search Employees
        const employees = db.prepare(`
            SELECT id, first_name || ' ' || last_name as name, email, designation, employee_id as emp_code FROM employees
            WHERE first_name || ' ' || last_name LIKE ? OR email LIKE ? OR employee_id LIKE ? LIMIT 5
        `).all(like, like, like);
        if (employees.length) results.push({ module: 'HRMS', type: 'Employees', icon: 'user-check', path: '/hrms', items: employees.map(e => ({ id: e.id, title: e.name, subtitle: e.designation || e.email })) });

        // Search Tickets
        const tickets = db.prepare(`
            SELECT id, ticket_number, subject, status, priority FROM tickets
            WHERE ticket_number LIKE ? OR subject LIKE ? LIMIT 5
        `).all(like, like);
        if (tickets.length) results.push({ module: 'Support', type: 'Tickets', icon: 'life-buoy', path: '/support', items: tickets.map(t => ({ id: t.id, title: t.ticket_number, subtitle: t.subject, badge: t.status })) });

        // Search Projects
        const projects = db.prepare(`
            SELECT id, name, status, progress FROM projects
            WHERE name LIKE ? LIMIT 5
        `).all(like);
        if (projects.length) results.push({ module: 'Projects', type: 'Projects', icon: 'folder-kanban', path: '/projects', items: projects.map(p => ({ id: p.id, title: p.name, subtitle: `${p.progress || 0}% complete`, badge: p.status })) });

        const total = results.reduce((sum, g) => sum + g.items.length, 0);
        res.json({ results, total, query: q });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed: ' + err.message });
    }
});

export default router;
