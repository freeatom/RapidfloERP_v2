import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog, captureOldValues } from '../middleware/audit.js';
const router = Router();

// === PRODUCTS ===
router.get('/products', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, category, type } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(name LIKE ? OR sku LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (category) { where.push("category=?"); params.push(category); }
    if (type) { where.push("type=?"); params.push(type); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM products WHERE ${where.join(' AND ')}`).get(...params);
    const products = db.prepare(`SELECT p.*, COALESCE((SELECT SUM(sl.available_quantity) FROM stock_levels sl WHERE sl.product_id=p.id),0) as total_stock FROM products p WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const categories = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category").all();
    res.json({ products, total: total.count, page: +page, limit: +limit, categories });
});

router.get('/products/:id', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    product.stock_levels = db.prepare('SELECT sl.*,w.name as warehouse_name FROM stock_levels sl LEFT JOIN warehouses w ON w.id=sl.warehouse_id WHERE sl.product_id=?').all(req.params.id);
    product.price_rules = db.prepare('SELECT * FROM price_rules WHERE product_id=? AND is_active=1').all(req.params.id);
    res.json(product);
});

router.post('/products', checkPermission('sales', 'create'), auditLog('sales', 'CREATE_PRODUCT'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Product name required' });
    const sku = b.sku || `SKU-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`INSERT INTO products (id,name,sku,description,category,type,unit,base_price,cost_price,tax_rate,is_active,is_stockable,min_stock_level,reorder_quantity,weight,dimensions,barcode,hsn_code,tags,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, sku, b.description, b.category, b.type || 'goods', b.unit || 'piece', b.base_price || 0, b.cost_price || 0, b.tax_rate ?? 18, b.is_active ?? 1, b.is_stockable ?? 1, b.min_stock_level || 10, b.reorder_quantity || 50, b.weight, b.dimensions, b.barcode, b.hsn_code, JSON.stringify(b.tags || []), req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(id));
});

router.put('/products/:id', checkPermission('sales', 'edit'), captureOldValues('products'), auditLog('sales', 'UPDATE_PRODUCT'), (req, res) => {
    const db = req.companyDb;
    const fields = ['name', 'sku', 'description', 'category', 'type', 'unit', 'base_price', 'cost_price', 'tax_rate', 'is_active', 'is_stockable', 'min_stock_level', 'reorder_quantity', 'weight', 'dimensions', 'barcode', 'hsn_code'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.tags) { updates.push('tags=?'); values.push(JSON.stringify(req.body.tags)); }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE products SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
});

router.delete('/products/:id', checkPermission('sales', 'delete'), auditLog('sales', 'DELETE_PRODUCT'), (req, res) => {
    req.companyDb.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === QUOTES ===
router.get('/quotes', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(q.quote_number LIKE ? OR a.name LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("q.status=?"); params.push(status); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM quotes q LEFT JOIN accounts a ON a.id=q.account_id WHERE ${where.join(' AND ')}`).get(...params);
    const quotes = db.prepare(`SELECT q.*,a.name as account_name FROM quotes q LEFT JOIN accounts a ON a.id=q.account_id WHERE ${where.join(' AND ')} ORDER BY q.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ quotes, total: total.count, page: +page, limit: +limit });
});

router.get('/quotes/:id', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const quote = db.prepare('SELECT q.*,a.name as account_name FROM quotes q LEFT JOIN accounts a ON a.id=q.account_id WHERE q.id=?').get(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Not found' });
    quote.items = db.prepare('SELECT qi.*,p.name as product_name FROM quote_items qi LEFT JOIN products p ON p.id=qi.product_id WHERE qi.quote_id=? ORDER BY qi.sort_order').all(req.params.id);
    res.json(quote);
});

router.post('/quotes', checkPermission('sales', 'create'), auditLog('sales', 'CREATE_QUOTE'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    const quoteNum = `QT-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`INSERT INTO quotes (id,quote_number,opportunity_id,account_id,contact_id,status,currency,valid_until,terms_and_conditions,notes,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, quoteNum, b.opportunity_id, b.account_id, b.contact_id, b.status || 'draft', b.currency || 'INR', b.valid_until, b.terms_and_conditions, b.notes, b.owner_id || req.user.id, req.user.id);
    // Add items
    let subtotal = 0, taxAmount = 0;
    if (b.items && Array.isArray(b.items)) {
        b.items.forEach((item, i) => {
            const itemId = uuidv4();
            const qty = item.quantity || 1, price = item.unit_price || 0, disc = item.discount_percent || 0, tax = item.tax_rate ?? 18;
            const lineTotal = qty * price * (1 - disc / 100);
            const lineTax = lineTotal * tax / 100;
            db.prepare(`INSERT INTO quote_items (id,quote_id,product_id,description,quantity,unit_price,discount_percent,tax_rate,tax_amount,total_amount,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(itemId, id, item.product_id, item.description, qty, price, disc, tax, lineTax, lineTotal + lineTax, i);
            subtotal += lineTotal; taxAmount += lineTax;
        });
    }
    const discountAmt = b.discount_amount || 0;
    db.prepare('UPDATE quotes SET subtotal=?,discount_amount=?,tax_amount=?,total_amount=? WHERE id=?').run(subtotal, discountAmt, taxAmount, subtotal - discountAmt + taxAmount, id);
    res.status(201).json(db.prepare('SELECT * FROM quotes WHERE id=?').get(id));
});

router.put('/quotes/:id', checkPermission('sales', 'edit'), auditLog('sales', 'UPDATE_QUOTE'), (req, res) => {
    const db = req.companyDb;
    const fields = ['status', 'valid_until', 'terms_and_conditions', 'notes', 'discount_amount'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'approved') { updates.push("approved_by=?", "approved_at=datetime('now')"); values.push(req.user.id); }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE quotes SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM quotes WHERE id=?').get(req.params.id));
});

router.delete('/quotes/:id', checkPermission('sales', 'delete'), (req, res) => {
    const db = req.companyDb;
    db.prepare('DELETE FROM quote_items WHERE quote_id=?').run(req.params.id);
    db.prepare('DELETE FROM quotes WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// Convert Quote → Sales Order
router.post('/quotes/:id/convert', checkPermission('sales', 'create'), auditLog('sales', 'CONVERT_QUOTE'), (req, res) => {
    const db = req.companyDb;
    const quote = db.prepare('SELECT * FROM quotes WHERE id=?').get(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Not found' });
    const orderId = uuidv4();
    const orderNum = `SO-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`INSERT INTO sales_orders (id,order_number,quote_id,account_id,contact_id,status,subtotal,discount_amount,tax_amount,total_amount,currency,payment_terms,notes,owner_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'confirmed',?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(orderId, orderNum, quote.id, quote.account_id, quote.contact_id, quote.subtotal, quote.discount_amount, quote.tax_amount, quote.total_amount, quote.currency, req.body.payment_terms || 'net30', quote.notes, req.user.id, req.user.id);
    // Copy items
    const items = db.prepare('SELECT * FROM quote_items WHERE quote_id=?').all(req.params.id);
    items.forEach(item => {
        db.prepare(`INSERT INTO order_items (id,order_id,product_id,description,quantity,unit_price,discount_percent,tax_rate,tax_amount,total_amount,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(uuidv4(), orderId, item.product_id, item.description, item.quantity, item.unit_price, item.discount_percent, item.tax_rate, item.tax_amount, item.total_amount, item.sort_order);
    });
    db.prepare("UPDATE quotes SET status='converted',updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ success: true, orderId, orderNumber: orderNum });
});

// === SALES ORDERS ===
router.get('/orders', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(so.order_number LIKE ? OR a.name LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("so.status=?"); params.push(status); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM sales_orders so LEFT JOIN accounts a ON a.id=so.account_id WHERE ${where.join(' AND ')}`).get(...params);
    const orders = db.prepare(`SELECT so.*,a.name as account_name FROM sales_orders so LEFT JOIN accounts a ON a.id=so.account_id WHERE ${where.join(' AND ')} ORDER BY so.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ orders, total: total.count, page: +page, limit: +limit });
});

router.get('/orders/:id', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const order = db.prepare('SELECT so.*,a.name as account_name FROM sales_orders so LEFT JOIN accounts a ON a.id=so.account_id WHERE so.id=?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });
    order.items = db.prepare('SELECT oi.*,p.name as product_name FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? ORDER BY oi.sort_order').all(req.params.id);
    res.json(order);
});

router.put('/orders/:id', checkPermission('sales', 'edit'), auditLog('sales', 'UPDATE_ORDER'), (req, res) => {
    const db = req.companyDb;
    const fields = ['status', 'payment_terms', 'delivery_date', 'shipping_address', 'billing_address', 'notes'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'fulfilled') updates.push("fulfilled_at=datetime('now')");
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE sales_orders SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM sales_orders WHERE id=?').get(req.params.id));
});

// === PRICE RULES ===
router.get('/price-rules', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const rules = db.prepare('SELECT pr.*,p.name as product_name FROM price_rules pr LEFT JOIN products p ON p.id=pr.product_id ORDER BY pr.priority DESC').all();
    res.json({ priceRules: rules });
});

router.post('/price-rules', checkPermission('sales', 'create'), auditLog('sales', 'CREATE_PRICE_RULE'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    db.prepare(`INSERT INTO price_rules (id,name,product_id,type,min_quantity,max_quantity,discount_type,discount_value,customer_type,account_id,valid_from,valid_until,is_active,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.product_id, b.type, b.min_quantity || 1, b.max_quantity, b.discount_type || 'percentage', b.discount_value || 0, b.customer_type, b.account_id, b.valid_from, b.valid_until, b.is_active ?? 1, b.priority || 0);
    res.status(201).json(db.prepare('SELECT * FROM price_rules WHERE id=?').get(id));
});

// === STATS ===
router.get('/stats', checkPermission('sales', 'view'), (req, res) => {
    const db = req.companyDb;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_amount),0) as v FROM sales_orders WHERE status NOT IN ('cancelled','draft')").get().v;
    const ordersThisMonth = db.prepare("SELECT COUNT(*) as v FROM sales_orders WHERE created_at >= date('now','start of month')").get().v;
    const avgOrderValue = db.prepare("SELECT COALESCE(AVG(total_amount),0) as v FROM sales_orders WHERE status NOT IN ('cancelled','draft')").get().v;
    const pendingQuotes = db.prepare("SELECT COUNT(*) as v FROM quotes WHERE status IN ('draft','sent')").get().v;
    const totalProducts = db.prepare("SELECT COUNT(*) as v FROM products WHERE is_active=1").get().v;
    const lowStock = db.prepare("SELECT COUNT(DISTINCT p.id) as v FROM products p LEFT JOIN stock_levels sl ON sl.product_id=p.id WHERE p.is_stockable=1 AND COALESCE(sl.available_quantity,0) < p.min_stock_level").get().v;
    res.json({ totalRevenue, ordersThisMonth, avgOrderValue: Math.round(avgOrderValue), pendingQuotes, totalProducts, lowStock });
});

export default router;
