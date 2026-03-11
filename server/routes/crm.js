import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog, captureOldValues } from '../middleware/audit.js';
const router = Router();

// === TEAM USER LIST (lightweight, for dropdowns) ===
router.get('/users', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    try {
        const users = db.prepare(`SELECT u.id, u.first_name || ' ' || u.last_name as name, u.email, r.name as role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.is_active = 1 ORDER BY u.first_name`).all();
        res.json(users);
    } catch (e) {
        try {
            const users = db.prepare(`SELECT id, first_name || ' ' || last_name as name, email FROM users ORDER BY first_name`).all();
            res.json(users);
        } catch (e2) {
            res.json([]);
        }
    }
});

// Helper: create follow-up notification for a lead
function createFollowUpNotification(db, lead, followUpDate, assignedTo) {
    if (!followUpDate) return;
    const userId = assignedTo || lead.assigned_to || lead.created_by;
    if (!userId) return;
    const leadName = `${lead.first_name} ${lead.last_name}`;
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = followUpDate < today;
    const isDueToday = followUpDate === today;
    const priority = isOverdue ? 'high' : isDueToday ? 'high' : 'normal';
    const title = isOverdue ? `⚠️ Overdue Follow-up: ${leadName}` : isDueToday ? `📞 Follow-up Today: ${leadName}` : `📅 Follow-up Scheduled: ${leadName}`;
    const message = `Follow-up ${isOverdue ? 'was due' : 'is due'} on ${followUpDate} for ${leadName}${lead.company ? ` (${lead.company})` : ''}. ${lead.notes ? 'Notes: ' + lead.notes.substring(0, 100) : ''}`;

    db.prepare(`DELETE FROM notifications WHERE resource_id = ? AND resource_type = 'lead_followup' AND is_read = 0`).run(lead.id);
    db.prepare(`INSERT INTO notifications (id, user_id, type, title, message, module, resource_type, resource_id, priority, created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`).run(
        uuidv4(), userId, 'follow_up', title, message, 'crm', 'lead_followup', lead.id, priority
    );
}

// Auto-calculate lead score from status
function calcLeadScore(status) {
    const SCORE_MAP = { new: 10, contacted: 30, qualified: 70, converted: 100, unqualified: 0 };
    const score = SCORE_MAP[status] ?? 10;
    const label = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
    return { score, label };
}

// === LEADS ===
router.get('/leads', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status, source, assigned_to, score_label } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(l.first_name LIKE ? OR l.last_name LIKE ? OR l.email LIKE ? OR l.company LIKE ?)"); const s = `%${search}%`; params.push(s, s, s, s); }
    if (status) { where.push("l.status = ?"); params.push(status); }
    if (source) { where.push("l.source = ?"); params.push(source); }
    if (assigned_to) { where.push("l.assigned_to = ?"); params.push(assigned_to); }
    if (score_label) { where.push("l.score_label = ?"); params.push(score_label); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM leads l WHERE ${where.join(' AND ')}`).get(...params);
    const leads = db.prepare(`SELECT l.*, u.first_name || ' ' || u.last_name as assigned_to_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const stats = db.prepare(`SELECT status, COUNT(*) as count FROM leads GROUP BY status`).all();
    res.json({ leads, total: total.count, page: +page, limit: +limit, stats });
});

router.get('/leads/:id', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const lead = db.prepare(`SELECT l.*, u.first_name || ' ' || u.last_name as assigned_to_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE l.id = ?`).get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    lead.activities = db.prepare("SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    res.json(lead);
});

router.post('/leads', checkPermission('crm', 'create'), auditLog('crm', 'CREATE_LEAD'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4();
    const b = req.body;
    if (!b.first_name || !b.last_name) return res.status(400).json({ error: 'First name and last name required' });
    const { score, label: scoreLabel } = calcLeadScore(b.status || 'new');
    db.prepare(`INSERT INTO leads (id,first_name,last_name,email,phone,company,job_title,source,status,score,score_label,assigned_to,website,industry,annual_revenue,employee_count,address,city,state,country,notes,tags,next_follow_up,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.first_name, b.last_name, b.email, b.phone, b.company, b.job_title, b.source || 'manual', b.status || 'new', score, scoreLabel, b.assigned_to, b.website, b.industry, b.annual_revenue, b.employee_count, b.address, b.city, b.state, b.country || 'India', b.notes, JSON.stringify(b.tags || []), b.next_follow_up, req.user.id);
    if (b.next_follow_up) {
        try { createFollowUpNotification(db, { id, first_name: b.first_name, last_name: b.last_name, company: b.company, notes: b.notes, assigned_to: b.assigned_to, created_by: req.user.id }, b.next_follow_up, b.assigned_to || req.user.id); } catch (e) { /* non-critical */ }
    }
    req._auditNewValues = { id, first_name: b.first_name, last_name: b.last_name };
    res.status(201).json(db.prepare('SELECT * FROM leads WHERE id = ?').get(id));
});

router.put('/leads/:id', checkPermission('crm', 'edit'), captureOldValues('leads'), auditLog('crm', 'UPDATE_LEAD'), (req, res) => {
    const db = req.companyDb;
    if (!db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Not found' });
    if (req.body.status) {
        const { score, label } = calcLeadScore(req.body.status);
        req.body.score = score;
        req.body.score_label = label;
    }
    const fields = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'source', 'status', 'score', 'score_label', 'assigned_to', 'website', 'industry', 'annual_revenue', 'employee_count', 'address', 'city', 'state', 'country', 'notes', 'next_follow_up'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); } });
    if (req.body.tags) { updates.push('tags = ?'); values.push(JSON.stringify(req.body.tags)); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push("updated_at = datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updatedLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (req.body.next_follow_up !== undefined) {
        try { createFollowUpNotification(db, updatedLead, req.body.next_follow_up, req.body.assigned_to); } catch (e) { /* non-critical */ }
    }
    res.json(updatedLead);
});

router.delete('/leads/:id', checkPermission('crm', 'delete'), auditLog('crm', 'DELETE_LEAD'), (req, res) => {
    const db = req.companyDb;
    db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// === BULK IMPORT LEADS ===
router.post('/leads/import', checkPermission('crm', 'create'), auditLog('crm', 'IMPORT_LEADS'), (req, res) => {
    const db = req.companyDb;
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: 'Provide a "leads" array' });
    if (leads.length > 500) return res.status(400).json({ error: 'Max 500 leads per import' });

    const insertStmt = db.prepare(`INSERT INTO leads (id,first_name,last_name,email,phone,company,job_title,source,status,score,score_label,assigned_to,country,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`);

    let imported = 0, skipped = 0;
    const errors = [];

    const insertMany = db.transaction((rows) => {
        for (const [idx, row] of rows.entries()) {
            if (!row.first_name || !row.last_name) {
                skipped++;
                errors.push({ row: idx + 1, error: 'Missing first_name or last_name' });
                continue;
            }
            if (row.email && db.prepare('SELECT id FROM leads WHERE email = ?').get(row.email)) {
                skipped++;
                errors.push({ row: idx + 1, error: `Duplicate email: ${row.email}` });
                continue;
            }
            const { score, label } = calcLeadScore(row.status || 'new');
            try {
                insertStmt.run(
                    uuidv4(), row.first_name, row.last_name, row.email || null,
                    row.phone || null, row.company || null, row.job_title || null,
                    row.source || 'import', row.status || 'new', score, label,
                    null, row.country || 'India', req.user.id
                );
                imported++;
            } catch (e) {
                skipped++;
                errors.push({ row: idx + 1, error: e.message });
            }
        }
    });

    insertMany(leads);
    req._auditNewValues = { imported, skipped };
    res.json({ imported, skipped, total: leads.length, errors: errors.slice(0, 20) });
});

// Convert Lead → Opportunity + Account + Contact
router.post('/leads/:id/convert', checkPermission('crm', 'create'), auditLog('crm', 'CONVERT_LEAD'), (req, res) => {
    const db = req.companyDb;
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    let accountId = req.body.account_id;
    if (!accountId && lead.company) {
        const existing = db.prepare('SELECT id FROM accounts WHERE name = ?').get(lead.company);
        accountId = existing ? existing.id : uuidv4();
        if (!existing) db.prepare(`INSERT INTO accounts (id,name,industry,email,phone,status,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?,datetime('now'),datetime('now'))`).run(accountId, lead.company, lead.industry, lead.email, lead.phone, req.user.id, req.user.id);
    }
    const contactId = uuidv4();
    db.prepare(`INSERT INTO contacts (id,account_id,first_name,last_name,email,phone,job_title,lead_source,is_primary,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,datetime('now'),datetime('now'))`).run(contactId, accountId, lead.first_name, lead.last_name, lead.email, lead.phone, lead.job_title, lead.source, req.user.id, req.user.id);
    const oppId = uuidv4();
    db.prepare(`INSERT INTO opportunities (id,name,account_id,contact_id,lead_id,stage,amount,expected_close_date,source,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'prospecting',?,?,?,?,?,datetime('now'),datetime('now'))`).run(oppId, req.body.name || `${lead.company || lead.first_name} Deal`, accountId, contactId, lead.id, req.body.amount || 0, req.body.expected_close_date, lead.source, req.user.id, req.user.id);
    const { score, label } = calcLeadScore('converted');
    db.prepare("UPDATE leads SET status='converted',score=?,score_label=?,converted_to_opportunity_id=?,converted_to_contact_id=?,converted_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(score, label, oppId, contactId, lead.id);
    res.json({ success: true, opportunityId: oppId, contactId, accountId });
});

// === OPPORTUNITIES ===
router.get('/opportunities', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, stage, owner_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(o.name LIKE ? OR a.name LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (stage) { where.push("o.stage = ?"); params.push(stage); }
    if (owner_id) { where.push("o.owner_id = ?"); params.push(owner_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM opportunities o LEFT JOIN accounts a ON a.id = o.account_id WHERE ${where.join(' AND ')}`).get(...params);
    const opportunities = db.prepare(`SELECT o.*, a.name as account_name, c.first_name||' '||c.last_name as contact_name, u.first_name||' '||u.last_name as owner_name FROM opportunities o LEFT JOIN accounts a ON a.id=o.account_id LEFT JOIN contacts c ON c.id=o.contact_id LEFT JOIN users u ON u.id=o.owner_id WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const pipelineStats = db.prepare(`SELECT stage, COUNT(*) as count, COALESCE(SUM(amount),0) as total_value FROM opportunities GROUP BY stage`).all();
    res.json({ opportunities, total: total.count, page: +page, limit: +limit, pipelineStats });
});

router.get('/opportunities/:id', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const opp = db.prepare(`SELECT o.*, a.name as account_name FROM opportunities o LEFT JOIN accounts a ON a.id=o.account_id WHERE o.id=?`).get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Not found' });
    opp.activities = db.prepare("SELECT * FROM activities WHERE opportunity_id=? ORDER BY created_at DESC").all(req.params.id);
    opp.quotes = db.prepare("SELECT * FROM quotes WHERE opportunity_id=? ORDER BY created_at DESC").all(req.params.id);
    res.json(opp);
});

router.post('/opportunities', checkPermission('crm', 'create'), auditLog('crm', 'CREATE_OPP'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Name required' });
    const probMap = { prospecting: 10, qualification: 25, proposal: 50, negotiation: 75, closed_won: 100, closed_lost: 0 };
    db.prepare(`INSERT INTO opportunities (id,name,account_id,contact_id,lead_id,stage,probability,amount,expected_close_date,type,source,description,next_step,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.account_id, b.contact_id, b.lead_id, b.stage || 'prospecting', b.probability || probMap[b.stage || 'prospecting'] || 10, b.amount || 0, b.expected_close_date, b.type || 'new_business', b.source, b.description, b.next_step, b.owner_id || req.user.id, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM opportunities WHERE id=?').get(id));
});

router.put('/opportunities/:id', checkPermission('crm', 'edit'), captureOldValues('opportunities'), auditLog('crm', 'UPDATE_OPP'), (req, res) => {
    const db = req.companyDb;
    if (!db.prepare('SELECT id FROM opportunities WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const fields = ['name', 'account_id', 'contact_id', 'stage', 'probability', 'amount', 'expected_close_date', 'actual_close_date', 'type', 'source', 'description', 'next_step', 'competitor', 'loss_reason', 'win_reason', 'owner_id'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if ((req.body.stage === 'closed_won' || req.body.stage === 'closed_lost') && !req.body.actual_close_date) updates.push("actual_close_date=date('now')");
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE opportunities SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM opportunities WHERE id=?').get(req.params.id));
});

router.delete('/opportunities/:id', checkPermission('crm', 'delete'), auditLog('crm', 'DELETE_OPP'), (req, res) => {
    req.companyDb.prepare('DELETE FROM opportunities WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === ACCOUNTS ===
router.get('/accounts', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status, type } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(a.name LIKE ? OR a.email LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("a.status=?"); params.push(status); }
    if (type) { where.push("a.type=?"); params.push(type); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM accounts a WHERE ${where.join(' AND ')}`).get(...params);
    const accounts = db.prepare(`SELECT a.*,(SELECT COUNT(*) FROM contacts WHERE account_id=a.id) as contact_count,(SELECT COUNT(*) FROM opportunities WHERE account_id=a.id) as opp_count FROM accounts a WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ accounts, total: total.count, page: +page, limit: +limit });
});

router.get('/accounts/:id', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Not found' });
    account.contacts = db.prepare('SELECT * FROM contacts WHERE account_id=?').all(req.params.id);
    account.opportunities = db.prepare('SELECT * FROM opportunities WHERE account_id=?').all(req.params.id);
    account.invoices = db.prepare('SELECT * FROM invoices WHERE account_id=?').all(req.params.id);
    res.json(account);
});

router.post('/accounts', checkPermission('crm', 'create'), auditLog('crm', 'CREATE_ACCOUNT'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Name required' });
    db.prepare(`INSERT INTO accounts (id,name,industry,website,email,phone,address_line1,address_line2,city,state,country,postal_code,annual_revenue,employee_count,type,status,owner_id,notes,tags,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.industry, b.website, b.email, b.phone, b.address_line1, b.address_line2, b.city, b.state, b.country || 'India', b.postal_code, b.annual_revenue || 0, b.employee_count || 0, b.type || 'prospect', b.status || 'active', b.owner_id || req.user.id, b.notes, JSON.stringify(b.tags || []), req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM accounts WHERE id=?').get(id));
});

router.put('/accounts/:id', checkPermission('crm', 'edit'), captureOldValues('accounts'), auditLog('crm', 'UPDATE_ACCOUNT'), (req, res) => {
    const db = req.companyDb;
    const fields = ['name', 'industry', 'website', 'email', 'phone', 'address_line1', 'address_line2', 'city', 'state', 'country', 'postal_code', 'annual_revenue', 'employee_count', 'type', 'status', 'owner_id', 'notes'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE accounts SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id));
});

router.delete('/accounts/:id', checkPermission('crm', 'delete'), auditLog('crm', 'DELETE_ACCOUNT'), (req, res) => {
    req.companyDb.prepare('DELETE FROM accounts WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === CONTACTS ===
router.get('/contacts', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, account_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)"); const s = `%${search}%`; params.push(s, s, s); }
    if (account_id) { where.push("c.account_id=?"); params.push(account_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM contacts c WHERE ${where.join(' AND ')}`).get(...params);
    const contacts = db.prepare(`SELECT c.*,a.name as account_name FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ contacts, total: total.count, page: +page, limit: +limit });
});

router.post('/contacts', checkPermission('crm', 'create'), auditLog('crm', 'CREATE_CONTACT'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.first_name || !b.last_name) return res.status(400).json({ error: 'Name required' });
    db.prepare(`INSERT INTO contacts (id,account_id,first_name,last_name,email,phone,mobile,job_title,department,address,city,state,country,linkedin_url,is_primary,lead_source,notes,tags,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.account_id, b.first_name, b.last_name, b.email, b.phone, b.mobile, b.job_title, b.department, b.address, b.city, b.state, b.country || 'India', b.linkedin_url, b.is_primary || 0, b.lead_source, b.notes, JSON.stringify(b.tags || []), req.user.id, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id=?').get(id));
});

router.put('/contacts/:id', checkPermission('crm', 'edit'), auditLog('crm', 'UPDATE_CONTACT'), (req, res) => {
    const db = req.companyDb;
    const fields = ['account_id', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'job_title', 'department', 'address', 'city', 'state', 'country', 'linkedin_url', 'is_primary', 'notes', 'is_active'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE contacts SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id));
});

router.delete('/contacts/:id', checkPermission('crm', 'delete'), auditLog('crm', 'DELETE_CONTACT'), (req, res) => {
    req.companyDb.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === ACTIVITIES ===
router.get('/activities', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, type, status, lead_id, opportunity_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (type) { where.push("a.type=?"); params.push(type); }
    if (status) { where.push("a.status=?"); params.push(status); }
    if (lead_id) { where.push("a.lead_id=?"); params.push(lead_id); }
    if (opportunity_id) { where.push("a.opportunity_id=?"); params.push(opportunity_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM activities a WHERE ${where.join(' AND ')}`).get(...params);
    const activities = db.prepare(`SELECT a.*,u.first_name||' '||u.last_name as assigned_name FROM activities a LEFT JOIN users u ON u.id=a.assigned_to WHERE ${where.join(' AND ')} ORDER BY a.due_date ASC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ activities, total: total.count });
});

router.post('/activities', checkPermission('crm', 'create'), auditLog('crm', 'CREATE_ACTIVITY'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.type || !b.subject) return res.status(400).json({ error: 'Type and subject required' });
    db.prepare(`INSERT INTO activities (id,type,subject,description,status,priority,due_date,duration_minutes,contact_id,account_id,lead_id,opportunity_id,assigned_to,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.type, b.subject, b.description, b.status || 'planned', b.priority || 'normal', b.due_date, b.duration_minutes, b.contact_id, b.account_id, b.lead_id, b.opportunity_id, b.assigned_to || req.user.id, b.notes, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM activities WHERE id=?').get(id));
});

router.put('/activities/:id', checkPermission('crm', 'edit'), auditLog('crm', 'UPDATE_ACTIVITY'), (req, res) => {
    const db = req.companyDb;
    const fields = ['subject', 'description', 'status', 'priority', 'due_date', 'completed_at', 'duration_minutes', 'assigned_to', 'outcome', 'notes'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'completed' && !req.body.completed_at) updates.push("completed_at=datetime('now')");
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE activities SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM activities WHERE id=?').get(req.params.id));
});

router.delete('/activities/:id', checkPermission('crm', 'delete'), (req, res) => {
    req.companyDb.prepare('DELETE FROM activities WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === STATS ===
router.get('/stats', checkPermission('crm', 'view'), (req, res) => {
    const db = req.companyDb;
    const totalLeads = db.prepare(`SELECT COUNT(*) as v FROM leads`).get().v;
    const converted = db.prepare(`SELECT COUNT(*) as v FROM leads WHERE status='converted'`).get().v;
    const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
    const pipelineValue = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM opportunities WHERE stage NOT IN ('closed_won','closed_lost')`).get().v;
    const hotLeads = db.prepare(`SELECT COUNT(*) as v FROM leads WHERE score_label='hot' AND status NOT IN ('converted','unqualified')`).get().v;
    const wonThisMonth = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM opportunities WHERE stage='closed_won' AND actual_close_date >= date('now','start of month')`).get().v;
    const totalAccounts = db.prepare(`SELECT COUNT(*) as v FROM accounts WHERE status='active'`).get().v;
    const overdueFollowUps = db.prepare(`SELECT COUNT(*) as v FROM leads WHERE next_follow_up < date('now') AND next_follow_up IS NOT NULL AND status NOT IN ('converted','unqualified')`).get().v;
    const followUpsDueToday = db.prepare(`SELECT COUNT(*) as v FROM leads WHERE next_follow_up = date('now') AND status NOT IN ('converted','unqualified')`).get().v;
    res.json({ totalLeads, conversionRate, pipelineValue, hotLeads, wonThisMonth, totalAccounts, overdueFollowUps, followUpsDueToday });
});

export default router;
