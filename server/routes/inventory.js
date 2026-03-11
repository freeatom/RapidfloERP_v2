import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog } from '../middleware/audit.js';
const router = Router();

// === WAREHOUSES ===
router.get('/warehouses', checkPermission('inventory', 'view'), (req, res) => {
    const db = req.companyDb;
    const warehouses = db.prepare(`SELECT w.*, u.first_name||' '||u.last_name as manager_name FROM warehouses w LEFT JOIN users u ON u.id=w.manager_id ORDER BY w.name`).all();
    res.json({ warehouses });
});

router.post('/warehouses', checkPermission('inventory', 'create'), auditLog('inventory', 'CREATE_WAREHOUSE'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    db.prepare(`INSERT INTO warehouses (id,name,code,address,city,state,country,manager_id,type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.code || `WH-${Date.now().toString(36).toUpperCase().slice(-4)}`, b.address, b.city, b.state, b.country || 'India', b.manager_id, b.type || 'main');
    res.status(201).json(db.prepare('SELECT * FROM warehouses WHERE id=?').get(id));
});

// === STOCK LEVELS ===
router.get('/stock', checkPermission('inventory', 'view'), (req, res) => {
    const db = req.companyDb;
    const { search, warehouse_id, low_stock } = req.query;
    let where = ['1=1'], params = [];
    if (search) { where.push("(p.name LIKE ? OR p.sku LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (warehouse_id) { where.push("sl.warehouse_id=?"); params.push(warehouse_id); }
    if (low_stock === 'true') { where.push("sl.available_quantity <= p.min_stock_level"); }
    const stock = db.prepare(`SELECT sl.*,p.name as product_name,p.sku,p.category,p.min_stock_level,p.unit,w.name as warehouse_name FROM stock_levels sl JOIN products p ON p.id=sl.product_id LEFT JOIN warehouses w ON w.id=sl.warehouse_id WHERE ${where.join(' AND ')} ORDER BY p.name`).all(...params);
    const summary = { totalProducts: stock.length, totalValue: stock.reduce((s, i) => s + i.total_value, 0), lowStockCount: stock.filter(i => i.available_quantity <= i.min_stock_level).length };
    res.json({ stock, summary });
});

// === STOCK MOVEMENTS ===
router.get('/movements', checkPermission('inventory', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, product_id, type, warehouse_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (product_id) { where.push("sm.product_id=?"); params.push(product_id); }
    if (type) { where.push("sm.type=?"); params.push(type); }
    if (warehouse_id) { where.push("(sm.warehouse_id=? OR sm.to_warehouse_id=?)"); params.push(warehouse_id, warehouse_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM stock_movements sm WHERE ${where.join(' AND ')}`).get(...params);
    const movements = db.prepare(`SELECT sm.*,p.name as product_name,p.sku,w.name as warehouse_name FROM stock_movements sm JOIN products p ON p.id=sm.product_id LEFT JOIN warehouses w ON w.id=sm.warehouse_id WHERE ${where.join(' AND ')} ORDER BY sm.movement_date DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ movements, total: total.count });
});

router.post('/movements', checkPermission('inventory', 'create'), auditLog('inventory', 'CREATE_MOVEMENT'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.product_id || !b.type || !b.quantity) return res.status(400).json({ error: 'Product, type, and quantity required' });
    db.prepare(`INSERT INTO stock_movements (id,product_id,warehouse_id,to_warehouse_id,type,quantity,unit_cost,reference_type,reference_id,batch_number,reason,notes,movement_date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(id, b.product_id, b.warehouse_id, b.to_warehouse_id, b.type, b.quantity, b.unit_cost || 0, b.reference_type, b.reference_id, b.batch_number, b.reason, b.notes, b.movement_date || new Date().toISOString(), req.user.id);
    // Update stock levels
    const updateStock = (prodId, whId, qtyChange) => {
        if (!whId) return;
        const existing = db.prepare('SELECT * FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(prodId, whId);
        if (existing) {
            const newQty = existing.quantity + qtyChange;
            const newAvail = existing.available_quantity + qtyChange;
            db.prepare('UPDATE stock_levels SET quantity=?,available_quantity=?,total_value=?*COALESCE(unit_cost,0),updated_at=datetime(\'now\') WHERE id=?').run(Math.max(0, newQty), Math.max(0, newAvail), Math.max(0, newQty), existing.id);
        } else if (qtyChange > 0) {
            db.prepare(`INSERT INTO stock_levels (id,product_id,warehouse_id,quantity,available_quantity,unit_cost,total_value,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`).run(uuidv4(), prodId, whId, qtyChange, qtyChange, b.unit_cost || 0, qtyChange * (b.unit_cost || 0));
        }
    };
    if (b.type === 'inbound' || b.type === 'purchase') { updateStock(b.product_id, b.warehouse_id, b.quantity); }
    else if (b.type === 'outbound' || b.type === 'sale') { updateStock(b.product_id, b.warehouse_id, -b.quantity); }
    else if (b.type === 'transfer') { updateStock(b.product_id, b.warehouse_id, -b.quantity); updateStock(b.product_id, b.to_warehouse_id, b.quantity); }
    res.status(201).json(db.prepare('SELECT * FROM stock_movements WHERE id=?').get(id));
});

// === PURCHASE ORDERS ===
router.get('/purchase-orders', checkPermission('inventory', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, status, vendor_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (status) { where.push("po.status=?"); params.push(status); }
    if (vendor_id) { where.push("po.vendor_id=?"); params.push(vendor_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM purchase_orders po WHERE ${where.join(' AND ')}`).get(...params);
    const orders = db.prepare(`SELECT po.*,v.name as vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id WHERE ${where.join(' AND ')} ORDER BY po.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ orders, total: total.count });
});

router.get('/purchase-orders/:id', checkPermission('inventory', 'view'), (req, res) => {
    const db = req.companyDb;
    const po = db.prepare('SELECT po.*,v.name as vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id WHERE po.id=?').get(req.params.id);
    if (!po) return res.status(404).json({ error: 'Not found' });
    po.items = db.prepare('SELECT pi.*,p.name as product_name FROM po_items pi LEFT JOIN products p ON p.id=pi.product_id WHERE pi.po_id=?').all(req.params.id);
    res.json(po);
});

router.post('/purchase-orders', checkPermission('inventory', 'create'), auditLog('inventory', 'CREATE_PO'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    const poNum = `PO-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`INSERT INTO purchase_orders (id,po_number,vendor_id,warehouse_id,status,currency,order_date,expected_date,payment_terms,shipping_method,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, poNum, b.vendor_id, b.warehouse_id, b.status || 'draft', b.currency || 'INR', b.order_date || new Date().toISOString().split('T')[0], b.expected_date, b.payment_terms || 'net30', b.shipping_method, b.notes, req.user.id);
    let subtotal = 0, taxAmount = 0;
    if (b.items && Array.isArray(b.items)) {
        b.items.forEach((item, i) => {
            const qty = item.quantity || 1, price = item.unit_price || 0, tax = item.tax_rate ?? 18;
            const lineTotal = qty * price, lineTax = lineTotal * tax / 100;
            db.prepare(`INSERT INTO po_items (id,po_id,product_id,description,quantity,unit_price,tax_rate,tax_amount,total_amount,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(uuidv4(), id, item.product_id, item.description, qty, price, tax, lineTax, lineTotal + lineTax, i);
            subtotal += lineTotal; taxAmount += lineTax;
        });
    }
    db.prepare('UPDATE purchase_orders SET subtotal=?,tax_amount=?,total_amount=? WHERE id=?').run(subtotal, taxAmount, subtotal + taxAmount, id);
    res.status(201).json(db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(id));
});

router.put('/purchase-orders/:id', checkPermission('inventory', 'edit'), auditLog('inventory', 'UPDATE_PO'), (req, res) => {
    const db = req.companyDb;
    const fields = ['status', 'expected_date', 'notes', 'payment_terms'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'received') {
        updates.push("received_date=date('now')");
        // Auto-create stock movements for received items
        const items = db.prepare('SELECT * FROM po_items WHERE po_id=?').all(req.params.id);
        const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id);
        items.forEach(item => {
            if (item.product_id) {
                const mvId = uuidv4();
                db.prepare(`INSERT INTO stock_movements (id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,movement_date,created_by,created_at) VALUES (?,?,?,'purchase',?,?,'purchase_order',?,datetime('now'),?,datetime('now'))`).run(mvId, item.product_id, po?.warehouse_id, item.quantity, item.unit_price, req.params.id, req.user.id);
                // Update stock
                const existing = db.prepare('SELECT * FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(item.product_id, po?.warehouse_id);
                if (existing) {
                    db.prepare('UPDATE stock_levels SET quantity=quantity+?,available_quantity=available_quantity+?,unit_cost=?,total_value=(quantity+?)*?,updated_at=datetime(\'now\') WHERE id=?').run(item.quantity, item.quantity, item.unit_price, item.quantity, item.unit_price, existing.id);
                } else if (po?.warehouse_id) {
                    db.prepare(`INSERT INTO stock_levels (id,product_id,warehouse_id,quantity,available_quantity,unit_cost,total_value,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`).run(uuidv4(), item.product_id, po.warehouse_id, item.quantity, item.quantity, item.unit_price, item.quantity * item.unit_price);
                }
            }
        });
        // Create GL entry
        const poData = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id);
        if (poData) {
            db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'1200','Inventory','PO '||?,?,0,'purchase_order',?,?,datetime('now'))`).run(uuidv4(), poData.po_number, poData.total_amount, req.params.id, req.user.id);
            db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'2000','Accounts Payable','PO '||?,0,?,'purchase_order',?,?,datetime('now'))`).run(uuidv4(), poData.po_number, poData.total_amount, req.params.id, req.user.id);
        }
    }
    if (req.body.status === 'approved') { updates.push("approved_by=?", "approved_at=datetime('now')"); values.push(req.user.id); }
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE purchase_orders SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id));
});

// === INVENTORY PRODUCTS (aggregated view) ===
router.get('/products', checkPermission('inventory', 'view'), (req, res) => {
    const db = req.companyDb;
    const products = db.prepare(`SELECT p.*, COALESCE(SUM(sl.quantity),0) as total_stock, COALESCE(SUM(sl.available_quantity),0) as available_stock, COALESCE(SUM(sl.total_value),0) as stock_value FROM products p LEFT JOIN stock_levels sl ON sl.product_id=p.id WHERE p.is_stockable=1 GROUP BY p.id ORDER BY p.name`).all();
    res.json({ products });
});

// === STATS ===
router.get('/stats', checkPermission('inventory', 'view'), (req, res) => {
    const db = req.companyDb;
    const totalSKUs = db.prepare("SELECT COUNT(*) as v FROM products WHERE is_active=1 AND is_stockable=1").get().v;
    const lowStock = db.prepare("SELECT COUNT(DISTINCT p.id) as v FROM products p LEFT JOIN stock_levels sl ON sl.product_id=p.id WHERE p.is_stockable=1 AND COALESCE(sl.available_quantity,0) < p.min_stock_level").get().v;
    const stockValue = db.prepare("SELECT COALESCE(SUM(sl.available_quantity * p.cost_price),0) as v FROM stock_levels sl LEFT JOIN products p ON p.id=sl.product_id").get().v;
    const movementsToday = db.prepare("SELECT COUNT(*) as v FROM stock_movements WHERE created_at >= date('now')").get().v;
    const warehouses = db.prepare("SELECT COUNT(*) as v FROM warehouses WHERE is_active=1").get().v;
    const totalUnits = db.prepare("SELECT COALESCE(SUM(available_quantity),0) as v FROM stock_levels").get().v;
    res.json({ totalSKUs, lowStock, stockValue, movementsToday, warehouses, totalUnits });
});

export default router;
