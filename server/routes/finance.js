import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog, captureOldValues } from '../middleware/audit.js';
const router = Router();

// === INVOICES ===
router.get('/invoices', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 25, search, status, type } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(i.invoice_number LIKE ? OR a.name LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("i.status=?"); params.push(status); }
    if (type) { where.push("i.type=?"); params.push(type); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM invoices i LEFT JOIN accounts a ON a.id=i.account_id WHERE ${where.join(' AND ')}`).get(...params);
    const invoices = db.prepare(`SELECT i.*,a.name as account_name FROM invoices i LEFT JOIN accounts a ON a.id=i.account_id WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const summary = db.prepare(`SELECT status,COUNT(*) as count,COALESCE(SUM(total_amount),0) as total FROM invoices GROUP BY status`).all();
    res.json({ invoices, total: total.count, page: +page, limit: +limit, summary });
});

router.get('/invoices/:id', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const invoice = db.prepare('SELECT i.*,a.name as account_name FROM invoices i LEFT JOIN accounts a ON a.id=i.account_id WHERE i.id=?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    invoice.items = db.prepare('SELECT ii.*,p.name as product_name FROM invoice_items ii LEFT JOIN products p ON p.id=ii.product_id WHERE ii.invoice_id=? ORDER BY ii.sort_order').all(req.params.id);
    invoice.payments = db.prepare('SELECT * FROM payment_records WHERE invoice_id=? ORDER BY payment_date DESC').all(req.params.id);
    res.json(invoice);
});

router.post('/invoices', checkPermission('finance', 'create'), auditLog('finance', 'CREATE_INVOICE'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    const invNum = `INV-${Date.now().toString(36).toUpperCase()}`;
    const dueDate = b.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    db.prepare(`INSERT INTO invoices (id,invoice_number,type,sales_order_id,account_id,contact_id,vendor_id,status,issue_date,due_date,currency,payment_terms,notes,terms_and_conditions,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, invNum, b.type || 'sales', b.sales_order_id, b.account_id, b.contact_id, b.vendor_id, b.status || 'draft', b.issue_date || new Date().toISOString().split('T')[0], dueDate, b.currency || 'INR', b.payment_terms || 'net30', b.notes, b.terms_and_conditions, req.user.id);
    let subtotal = 0, taxAmount = 0;
    if (b.items && Array.isArray(b.items)) {
        b.items.forEach((item, i) => {
            const itemId = uuidv4();
            const qty = item.quantity || 1, price = item.unit_price || 0, disc = item.discount_percent || 0, tax = item.tax_rate ?? 18;
            const lineTotal = qty * price * (1 - disc / 100);
            const lineTax = lineTotal * tax / 100;
            db.prepare(`INSERT INTO invoice_items (id,invoice_id,product_id,description,quantity,unit_price,discount_percent,tax_rate,tax_amount,total_amount,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(itemId, id, item.product_id, item.description, qty, price, disc, tax, lineTax, lineTotal + lineTax, i);
            subtotal += lineTotal; taxAmount += lineTax;
        });
    }
    const discAmt = b.discount_amount || 0;
    const totalAmt = subtotal - discAmt + taxAmount;
    db.prepare('UPDATE invoices SET subtotal=?,discount_amount=?,tax_amount=?,total_amount=?,balance_due=? WHERE id=?').run(subtotal, discAmt, taxAmount, totalAmt, totalAmt, id);
    // Create GL entries
    db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'1100','Accounts Receivable','Invoice '||?,?,0,'invoice',?,?,datetime('now'))`).run(uuidv4(), invNum, totalAmt, id, req.user.id);
    db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'4000','Sales Revenue','Invoice '||?,0,?,'invoice',?,?,datetime('now'))`).run(uuidv4(), invNum, subtotal, id, req.user.id);
    if (taxAmount > 0) db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'2100','Tax Payable','Tax on '||?,0,?,'invoice',?,?,datetime('now'))`).run(uuidv4(), invNum, taxAmount, id, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id=?').get(id));
});

router.put('/invoices/:id', checkPermission('finance', 'edit'), captureOldValues('invoices'), auditLog('finance', 'UPDATE_INVOICE'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['status', 'due_date', 'notes', 'terms_and_conditions', 'payment_terms'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE invoices SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id));
});

router.delete('/invoices/:id', checkPermission('finance', 'delete'), auditLog('finance', 'DELETE_INVOICE'), (req, res) => {
    const db = req.app.get('db');
    db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(req.params.id);
    db.prepare("DELETE FROM gl_entries WHERE reference_type='invoice' AND reference_id=?").run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === PAYMENTS ===
router.post('/payments', checkPermission('finance', 'create'), auditLog('finance', 'CREATE_PAYMENT'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.invoice_id || !b.amount) return res.status(400).json({ error: 'Invoice and amount required' });
    const payNum = `PAY-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`INSERT INTO payment_records (id,payment_number,invoice_id,amount,payment_date,payment_method,reference_number,bank_name,status,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(id, payNum, b.invoice_id, b.amount, b.payment_date || new Date().toISOString().split('T')[0], b.payment_method || 'bank_transfer', b.reference_number, b.bank_name, b.status || 'completed', b.notes, req.user.id);
    // Update invoice
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(b.invoice_id);
    if (invoice) {
        const newPaid = (invoice.paid_amount || 0) + b.amount;
        const newBalance = invoice.total_amount - newPaid;
        const newStatus = newBalance <= 0 ? 'paid' : 'partial';
        db.prepare('UPDATE invoices SET paid_amount=?,balance_due=?,status=?,updated_at=datetime(\'now\') WHERE id=?').run(newPaid, Math.max(0, newBalance), newStatus, b.invoice_id);
        // GL entry for payment
        db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'1000','Cash/Bank','Payment '||?,?,0,'payment',?,?,datetime('now'))`).run(uuidv4(), payNum, b.amount, id, req.user.id);
        db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'1100','Accounts Receivable','Payment '||?,0,?,'payment',?,?,datetime('now'))`).run(uuidv4(), payNum, b.amount, id, req.user.id);
    }
    res.status(201).json(db.prepare('SELECT * FROM payment_records WHERE id=?').get(id));
});

router.get('/payments', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const payments = db.prepare('SELECT pr.*,i.invoice_number,a.name as account_name FROM payment_records pr LEFT JOIN invoices i ON i.id=pr.invoice_id LEFT JOIN accounts a ON a.id=i.account_id ORDER BY pr.payment_date DESC LIMIT 100').all();
    res.json({ payments });
});

// === EXPENSES ===
router.get('/expenses', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 25, search, status, category } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(description LIKE ? OR expense_number LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("status=?"); params.push(status); }
    if (category) { where.push("category=?"); params.push(category); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM expenses WHERE ${where.join(' AND ')}`).get(...params);
    const expenses = db.prepare(`SELECT e.*,u.first_name||' '||u.last_name as created_by_name FROM expenses e LEFT JOIN users u ON u.id=e.created_by WHERE ${where.join(' AND ')} ORDER BY e.expense_date DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ expenses, total: total.count, page: +page, limit: +limit });
});

router.post('/expenses', checkPermission('finance', 'create'), auditLog('finance', 'CREATE_EXPENSE'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.category || !b.amount) return res.status(400).json({ error: 'Category and amount required' });
    const expNum = `EXP-${Date.now().toString(36).toUpperCase()}`;
    const taxAmt = b.tax_amount || (b.amount * 0.18);
    const totalAmt = b.amount + taxAmt;
    db.prepare(`INSERT INTO expenses (id,expense_number,category,description,amount,tax_amount,total_amount,currency,expense_date,status,payment_method,vendor_id,project_id,department,employee_id,reimbursable,notes,tags,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, expNum, b.category, b.description, b.amount, taxAmt, totalAmt, b.currency || 'INR', b.expense_date || new Date().toISOString().split('T')[0], b.status || 'pending', b.payment_method, b.vendor_id, b.project_id, b.department, b.employee_id, b.reimbursable || 0, b.notes, JSON.stringify(b.tags || []), req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id=?').get(id));
});

router.put('/expenses/:id', checkPermission('finance', 'edit'), auditLog('finance', 'UPDATE_EXPENSE'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['category', 'description', 'amount', 'tax_amount', 'total_amount', 'status', 'payment_method', 'notes', 'expense_date'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'approved') { updates.push("approved_by=?", "approved_at=datetime('now')"); values.push(req.user.id); }
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE expenses SET ${updates.join(',')} WHERE id=?`).run(...values);
    // If approved, create GL entry
    if (req.body.status === 'approved') {
        const exp = db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id);
        if (exp) {
            db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,department,created_by,created_at) VALUES (?,?,?,'Expenses',?,?,0,'expense',?,?,?,datetime('now'))`).run(uuidv4(), exp.expense_date, '5000-' + exp.category.substring(0, 3).toUpperCase(), exp.description || exp.category, exp.total_amount, req.params.id, exp.department, req.user.id);
        }
    }
    res.json(db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id));
});

router.delete('/expenses/:id', checkPermission('finance', 'delete'), (req, res) => {
    req.app.get('db').prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === GL ENTRIES ===
router.get('/gl-entries', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 50, account_code, from_date, to_date } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (account_code) { where.push("account_code=?"); params.push(account_code); }
    if (from_date) { where.push("date>=?"); params.push(from_date); }
    if (to_date) { where.push("date<=?"); params.push(to_date); }
    const entries = db.prepare(`SELECT * FROM gl_entries WHERE ${where.join(' AND ')} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const total = db.prepare(`SELECT COUNT(*) as count FROM gl_entries WHERE ${where.join(' AND ')}`).get(...params);
    // Trial balance
    const trialBalance = db.prepare('SELECT account_code,account_name,SUM(debit) as total_debit,SUM(credit) as total_credit FROM gl_entries GROUP BY account_code ORDER BY account_code').all();
    res.json({ entries, total: total.count, trialBalance });
});

// === TAX RULES ===
router.get('/tax-rules', checkPermission('finance', 'view'), (req, res) => {
    res.json({ taxRules: req.app.get('db').prepare('SELECT * FROM tax_rules ORDER BY rate').all() });
});

router.post('/tax-rules', checkPermission('finance', 'create'), auditLog('finance', 'CREATE_TAX'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    db.prepare(`INSERT INTO tax_rules (id,name,code,rate,type,region,category,is_compound,is_active,effective_from,effective_until,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.code, b.rate, b.type || 'GST', b.region, b.category, b.is_compound || 0, b.is_active ?? 1, b.effective_from, b.effective_until);
    res.status(201).json(db.prepare('SELECT * FROM tax_rules WHERE id=?').get(id));
});

// === FINANCIAL STATEMENTS ===
router.get('/statements/pnl', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { from_date, to_date } = req.query;
    const dateFilter = from_date && to_date ? `AND date BETWEEN '${from_date}' AND '${to_date}'` : '';
    const revenue = db.prepare(`SELECT COALESCE(SUM(credit)-SUM(debit),0) as total FROM gl_entries WHERE account_code LIKE '4%' ${dateFilter}`).get();
    const cogs = db.prepare(`SELECT COALESCE(SUM(debit)-SUM(credit),0) as total FROM gl_entries WHERE account_code LIKE '5%' ${dateFilter}`).get();
    const opex = db.prepare(`SELECT COALESCE(SUM(debit)-SUM(credit),0) as total FROM gl_entries WHERE account_code LIKE '6%' ${dateFilter}`).get();
    const grossProfit = revenue.total - cogs.total;
    const netIncome = grossProfit - opex.total;
    const breakdown = db.prepare(`SELECT account_name,account_code,SUM(debit) as debit,SUM(credit) as credit FROM gl_entries WHERE 1=1 ${dateFilter} GROUP BY account_code ORDER BY account_code`).all();
    res.json({ revenue: revenue.total, costOfGoods: cogs.total, grossProfit, operatingExpenses: opex.total, netIncome, breakdown });
});

router.get('/statements/balance-sheet', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const assets = db.prepare("SELECT account_name,account_code,SUM(debit)-SUM(credit) as balance FROM gl_entries WHERE account_code LIKE '1%' GROUP BY account_code").all();
    const liabilities = db.prepare("SELECT account_name,account_code,SUM(credit)-SUM(debit) as balance FROM gl_entries WHERE account_code LIKE '2%' GROUP BY account_code").all();
    const equity = db.prepare("SELECT account_name,account_code,SUM(credit)-SUM(debit) as balance FROM gl_entries WHERE account_code LIKE '3%' GROUP BY account_code").all();
    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0);
    const retainedEarnings = totalAssets - totalLiabilities - totalEquity;
    res.json({ assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, retainedEarnings });
});

// === STATS ===
router.get('/stats', checkPermission('finance', 'view'), (req, res) => {
    const db = req.app.get('db');
    const revenueMTD = db.prepare("SELECT COALESCE(SUM(credit)-SUM(debit),0) as v FROM gl_entries WHERE account_code LIKE '4%' AND date >= date('now','start of month')").get().v;
    const outstandingAR = db.prepare("SELECT COALESCE(SUM(balance_due),0) as v FROM invoices WHERE type='sales' AND status IN ('sent','partial','overdue')").get().v;
    const outstandingAP = db.prepare("SELECT COALESCE(SUM(balance_due),0) as v FROM invoices WHERE type='purchase' AND status IN ('sent','partial','overdue')").get().v;
    const cashBalance = db.prepare("SELECT COALESCE(SUM(debit)-SUM(credit),0) as v FROM gl_entries WHERE account_code LIKE '1000%'").get().v;
    const overdueInvoices = db.prepare("SELECT COUNT(*) as v FROM invoices WHERE status NOT IN ('paid','cancelled','draft') AND due_date < date('now')").get().v;
    const expensesMTD = db.prepare("SELECT COALESCE(SUM(total_amount),0) as v FROM expenses WHERE expense_date >= date('now','start of month') AND status != 'rejected'").get().v;
    res.json({ revenueMTD, outstandingAR, outstandingAP, cashBalance, overdueInvoices, expensesMTD });
});

export default router;
