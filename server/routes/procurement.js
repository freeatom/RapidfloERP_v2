import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog } from '../middleware/audit.js';
const router = Router();

// === VENDORS ===
router.get('/vendors', checkPermission('procurement', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 25, search, status, category } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(name LIKE ? OR code LIKE ? OR email LIKE ?)"); const s = `%${search}%`; params.push(s, s, s); }
    if (status) { where.push("status=?"); params.push(status); }
    if (category) { where.push("category=?"); params.push(category); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM vendors WHERE ${where.join(' AND ')}`).get(...params);
    const vendors = db.prepare(`SELECT * FROM vendors WHERE ${where.join(' AND ')} ORDER BY name LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ vendors, total: total.count, page: +page });
});

router.get('/vendors/:id', checkPermission('procurement', 'view'), (req, res) => {
    const db = req.app.get('db');
    const vendor = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Not found' });
    vendor.contacts = db.prepare('SELECT * FROM vendor_contacts WHERE vendor_id=?').all(req.params.id);
    vendor.purchase_orders = db.prepare('SELECT * FROM purchase_orders WHERE vendor_id=? ORDER BY created_at DESC').all(req.params.id);
    res.json(vendor);
});

router.post('/vendors', checkPermission('procurement', 'create'), auditLog('procurement', 'CREATE_VENDOR'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Name required' });
    db.prepare(`INSERT INTO vendors (id,name,code,email,phone,website,address,city,state,country,postal_code,tax_id,payment_terms,currency,rating,status,category,bank_name,bank_account,ifsc_code,notes,tags,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.code || `V-${Date.now().toString(36).toUpperCase().slice(-5)}`, b.email, b.phone, b.website, b.address, b.city, b.state, b.country || 'India', b.postal_code, b.tax_id, b.payment_terms || 'net30', b.currency || 'INR', b.rating || 3, b.status || 'active', b.category, b.bank_name, b.bank_account, b.ifsc_code, b.notes, JSON.stringify(b.tags || []), req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id=?').get(id));
});

router.put('/vendors/:id', checkPermission('procurement', 'edit'), auditLog('procurement', 'UPDATE_VENDOR'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['name', 'code', 'email', 'phone', 'website', 'address', 'city', 'state', 'country', 'postal_code', 'tax_id', 'payment_terms', 'currency', 'rating', 'status', 'category', 'bank_name', 'bank_account', 'ifsc_code', 'notes'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE vendors SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id));
});

router.delete('/vendors/:id', checkPermission('procurement', 'delete'), (req, res) => {
    req.app.get('db').prepare('DELETE FROM vendors WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === PROCUREMENT REQUESTS ===
router.get('/requests', checkPermission('procurement', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 25, status } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (status) { where.push("pr.status=?"); params.push(status); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM procurement_requests pr WHERE ${where.join(' AND ')}`).get(...params);
    const requests = db.prepare(`SELECT pr.*,u.first_name||' '||u.last_name as requested_by_name FROM procurement_requests pr LEFT JOIN users u ON u.id=pr.requested_by WHERE ${where.join(' AND ')} ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ requests, total: total.count });
});

router.post('/requests', checkPermission('procurement', 'create'), auditLog('procurement', 'CREATE_REQUEST'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    const reqNum = `PR-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`INSERT INTO procurement_requests (id,request_number,title,description,department,requested_by,status,priority,required_date,estimated_cost,vendor_id,notes,items,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, reqNum, b.title, b.description, b.department, req.user.id, b.status || 'pending', b.priority || 'normal', b.required_date, b.estimated_cost || 0, b.vendor_id, b.notes, JSON.stringify(b.items || []));
    res.status(201).json(db.prepare('SELECT * FROM procurement_requests WHERE id=?').get(id));
});

router.put('/requests/:id', checkPermission('procurement', 'edit'), auditLog('procurement', 'UPDATE_REQUEST'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['title', 'description', 'status', 'priority', 'required_date', 'estimated_cost', 'vendor_id', 'notes'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'approved') { updates.push("approved_by=?", "approved_at=datetime('now')", "approved_cost=?"); values.push(req.user.id, req.body.approved_cost || req.body.estimated_cost); }
    if (req.body.status === 'rejected') { updates.push("rejection_reason=?"); values.push(req.body.rejection_reason || ''); }
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE procurement_requests SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM procurement_requests WHERE id=?').get(req.params.id));
});

// === STATS ===
router.get('/stats', checkPermission('procurement', 'view'), (req, res) => {
    const db = req.app.get('db');
    const activeVendors = db.prepare("SELECT COUNT(*) as v FROM vendors WHERE status='active'").get().v;
    const pendingRequests = db.prepare("SELECT COUNT(*) as v FROM procurement_requests WHERE status='pending'").get().v;
    const totalSpend = db.prepare("SELECT COALESCE(SUM(approved_cost),0) as v FROM procurement_requests WHERE status='approved'").get().v;
    const avgRating = db.prepare("SELECT COALESCE(AVG(rating),0) as v FROM vendors WHERE status='active'").get().v;
    const approvedThisMonth = db.prepare("SELECT COUNT(*) as v FROM procurement_requests WHERE status='approved' AND approved_at >= date('now','start of month')").get().v;
    const totalVendors = db.prepare("SELECT COUNT(*) as v FROM vendors").get().v;
    res.json({ activeVendors, pendingRequests, totalSpend, avgRating: Math.round(avgRating * 10) / 10, approvedThisMonth, totalVendors });
});

export default router;
