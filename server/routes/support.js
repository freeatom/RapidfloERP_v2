import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog } from '../middleware/audit.js';
const router = Router();

// === TICKETS ===
router.get('/tickets', checkPermission('support', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status, priority, assigned_to, category } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(t.ticket_number LIKE ? OR t.subject LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("t.status=?"); params.push(status); }
    if (priority) { where.push("t.priority=?"); params.push(priority); }
    if (assigned_to) { where.push("t.assigned_to=?"); params.push(assigned_to); }
    if (category) { where.push("t.category=?"); params.push(category); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM tickets t WHERE ${where.join(' AND ')}`).get(...params);
    const tickets = db.prepare(`SELECT t.*,a.name as account_name,c.first_name||' '||c.last_name as contact_name,u.first_name||' '||u.last_name as agent_name FROM tickets t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN contacts c ON c.id=t.contact_id LEFT JOIN users u ON u.id=t.assigned_to WHERE ${where.join(' AND ')} ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END, t.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const stats = {
        open: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='open'").get().c,
        in_progress: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='in_progress'").get().c,
        resolved: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='resolved'").get().c,
        avgResolutionHours: db.prepare("SELECT COALESCE(AVG((julianday(resolved_at)-julianday(created_at))*24),0) as h FROM tickets WHERE resolved_at IS NOT NULL").get().h,
        slaBreach: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE sla_breach=1 AND status NOT IN ('resolved','closed')").get().c,
        avgCsat: db.prepare("SELECT COALESCE(AVG(csat_score),0) as s FROM tickets WHERE csat_score IS NOT NULL").get().s
    };
    res.json({ tickets, total: total.count, page: +page, limit: +limit, stats });
});

router.get('/tickets/:id', checkPermission('support', 'view'), (req, res) => {
    const db = req.companyDb;
    const ticket = db.prepare(`SELECT t.*,a.name as account_name,c.first_name||' '||c.last_name as contact_name,u.first_name||' '||u.last_name as agent_name FROM tickets t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN contacts c ON c.id=t.contact_id LEFT JOIN users u ON u.id=t.assigned_to WHERE t.id=?`).get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    ticket.comments = db.prepare(`SELECT tc.*,u.first_name||' '||u.last_name as author_name FROM ticket_comments tc LEFT JOIN users u ON u.id=tc.user_id WHERE tc.ticket_id=? ORDER BY tc.created_at`).all(req.params.id);
    if (ticket.sla_policy_id) ticket.sla = db.prepare('SELECT * FROM sla_policies WHERE id=?').get(ticket.sla_policy_id);
    res.json(ticket);
});

router.post('/tickets', checkPermission('support', 'create'), auditLog('support', 'CREATE_TICKET'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.subject) return res.status(400).json({ error: 'Subject required' });
    const ticketNum = `TKT-${Date.now().toString(36).toUpperCase()}`;
    // Auto-assign SLA based on priority
    let slaId = b.sla_policy_id;
    if (!slaId) {
        const sla = db.prepare('SELECT id FROM sla_policies WHERE priority=? AND is_active=1').get(b.priority || 'medium');
        slaId = sla?.id;
    }
    db.prepare(`INSERT INTO tickets (id,ticket_number,subject,description,status,priority,type,category,channel,account_id,contact_id,assigned_to,sla_policy_id,tags,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, ticketNum, b.subject, b.description, b.status || 'open', b.priority || 'medium', b.type || 'issue', b.category, b.channel || 'web', b.account_id, b.contact_id, b.assigned_to, slaId, JSON.stringify(b.tags || []), req.user.id);
    // Create notification for assigned agent
    if (b.assigned_to) {
        db.prepare(`INSERT INTO notifications (id,user_id,type,title,message,module,resource_type,resource_id,created_at) VALUES (?,?,'assignment','New Ticket Assigned',?,?,'ticket',?,datetime('now'))`).run(uuidv4(), b.assigned_to, `Ticket ${ticketNum}: ${b.subject}`, 'support', id);
    }
    res.status(201).json(db.prepare('SELECT * FROM tickets WHERE id=?').get(id));
});

router.put('/tickets/:id', checkPermission('support', 'edit'), auditLog('support', 'UPDATE_TICKET'), (req, res) => {
    const db = req.companyDb;
    const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    const fields = ['subject', 'description', 'status', 'priority', 'type', 'category', 'assigned_to', 'sla_policy_id', 'csat_score', 'csat_comment'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    // Status transitions
    if (req.body.status === 'in_progress' && !ticket.first_response_at) updates.push("first_response_at=datetime('now')");
    if (req.body.status === 'resolved') updates.push("resolved_at=datetime('now')");
    if (req.body.status === 'closed') updates.push("closed_at=datetime('now')");
    // SLA breach check
    if (ticket.sla_policy_id && req.body.status !== 'resolved' && req.body.status !== 'closed') {
        const sla = db.prepare('SELECT * FROM sla_policies WHERE id=?').get(ticket.sla_policy_id);
        if (sla) {
            const ageHours = (Date.now() - new Date(ticket.created_at).getTime()) / 3600000;
            if (ageHours > sla.resolution_hours) { updates.push("sla_breach=1"); }
        }
    }
    // Escalation
    if (req.body.escalate_to) {
        updates.push("escalated=1", "escalated_to=?", "escalated_at=datetime('now')"); values.push(req.body.escalate_to);
        db.prepare(`INSERT INTO notifications (id,user_id,type,title,message,module,resource_type,resource_id,priority,created_at) VALUES (?,?,'escalation','Ticket Escalated',?,?,'ticket',?,'high',datetime('now'))`).run(uuidv4(), req.body.escalate_to, `${ticket.ticket_number}: ${ticket.subject}`, 'support', req.params.id);
    }
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE tickets SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id));
});

router.delete('/tickets/:id', checkPermission('support', 'delete'), (req, res) => {
    const db = req.companyDb;
    db.prepare('DELETE FROM ticket_comments WHERE ticket_id=?').run(req.params.id);
    db.prepare('DELETE FROM tickets WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === TICKET COMMENTS ===
router.post('/tickets/:id/comments', checkPermission('support', 'create'), auditLog('support', 'ADD_COMMENT'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.content) return res.status(400).json({ error: 'Content required' });
    db.prepare(`INSERT INTO ticket_comments (id,ticket_id,user_id,content,type,is_internal,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`).run(id, req.params.id, req.user.id, b.content, b.type || 'reply', b.is_internal || 0);
    // Update first_response_at if agent replies first time
    const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id);
    if (ticket && !ticket.first_response_at && !b.is_internal) {
        db.prepare("UPDATE tickets SET first_response_at=datetime('now'),status='in_progress',updated_at=datetime('now') WHERE id=?").run(req.params.id);
    }
    res.status(201).json(db.prepare('SELECT * FROM ticket_comments WHERE id=?').get(id));
});

// === SLA POLICIES ===
router.get('/sla-policies', checkPermission('support', 'view'), (req, res) => {
    res.json({ policies: req.companyDb.prepare('SELECT * FROM sla_policies ORDER BY first_response_hours').all() });
});

router.post('/sla-policies', checkPermission('support', 'create'), auditLog('support', 'CREATE_SLA'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    db.prepare(`INSERT INTO sla_policies (id,name,description,priority,first_response_hours,resolution_hours,escalation_hours,is_active,business_hours_only,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.description, b.priority, b.first_response_hours || 4, b.resolution_hours || 24, b.escalation_hours || 8, b.is_active ?? 1, b.business_hours_only ?? 1);
    res.status(201).json(db.prepare('SELECT * FROM sla_policies WHERE id=?').get(id));
});

// === KNOWLEDGE BASE ===
router.get('/knowledge', checkPermission('support', 'view'), (req, res) => {
    const db = req.companyDb;
    const { search, category, status } = req.query;
    let where = ['1=1'], params = [];
    if (search) { where.push("(title LIKE ? OR content LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (category) { where.push("category=?"); params.push(category); }
    if (status) { where.push("status=?"); params.push(status); }
    const articles = db.prepare(`SELECT ka.*,u.first_name||' '||u.last_name as author_name FROM knowledge_articles ka LEFT JOIN users u ON u.id=ka.author_id WHERE ${where.join(' AND ')} ORDER BY ka.views DESC`).all(...params);
    res.json({ articles });
});

router.post('/knowledge', checkPermission('support', 'create'), auditLog('support', 'CREATE_ARTICLE'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.title || !b.content) return res.status(400).json({ error: 'Title and content required' });
    db.prepare(`INSERT INTO knowledge_articles (id,title,content,category,tags,status,author_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.title, b.content, b.category, JSON.stringify(b.tags || []), b.status || 'draft', req.user.id);
    if (b.status === 'published') db.prepare("UPDATE knowledge_articles SET published_at=datetime('now') WHERE id=?").run(id);
    res.status(201).json(db.prepare('SELECT * FROM knowledge_articles WHERE id=?').get(id));
});

router.put('/knowledge/:id', checkPermission('support', 'edit'), auditLog('support', 'UPDATE_ARTICLE'), (req, res) => {
    const db = req.companyDb;
    const fields = ['title', 'content', 'category', 'status'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.tags) { updates.push('tags=?'); values.push(JSON.stringify(req.body.tags)); }
    if (req.body.status === 'published') updates.push("published_at=datetime('now')");
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE knowledge_articles SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM knowledge_articles WHERE id=?').get(req.params.id));
});

// Increment article views
router.post('/knowledge/:id/view', (req, res) => {
    req.companyDb.prepare('UPDATE knowledge_articles SET views=views+1 WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// Feedback
router.post('/knowledge/:id/feedback', (req, res) => {
    const db = req.companyDb;
    const field = req.body.helpful ? 'helpful_count' : 'not_helpful_count';
    db.prepare(`UPDATE knowledge_articles SET ${field}=${field}+1 WHERE id=?`).run(req.params.id);
    res.json({ success: true });
});

// === STATS ===
router.get('/stats', checkPermission('support', 'view'), (req, res) => {
    const db = req.companyDb;
    const openTickets = db.prepare("SELECT COUNT(*) as v FROM tickets WHERE status IN ('open','in_progress')").get().v;
    const criticalTickets = db.prepare("SELECT COUNT(*) as v FROM tickets WHERE priority='critical' AND status NOT IN ('resolved','closed')").get().v;
    const avgResolution = db.prepare("SELECT COALESCE(AVG(CAST((julianday(resolved_at)-julianday(created_at))*24 AS INTEGER)),0) as v FROM tickets WHERE resolved_at IS NOT NULL").get().v;
    const resolvedToday = db.prepare("SELECT COUNT(*) as v FROM tickets WHERE resolved_at >= date('now')").get().v;
    const slaBreach = db.prepare("SELECT COUNT(*) as v FROM tickets WHERE sla_breach=1 AND status NOT IN ('resolved','closed')").get().v;
    const totalTickets = db.prepare("SELECT COUNT(*) as v FROM tickets").get().v;
    res.json({ openTickets, criticalTickets, avgResolutionHours: avgResolution, resolvedToday, slaBreach, totalTickets });
});

export default router;
