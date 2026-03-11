import { Router } from 'express';
import { checkPermission } from '../middleware/rbac.js';
const router = Router();

// === COMPREHENSIVE REPORTS ===

// Revenue report
router.get('/revenue', checkPermission('reports', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { period = 'monthly', from_date, to_date, group_by } = req.query;
    const dateFilter = from_date && to_date ? `AND issue_date BETWEEN '${from_date}' AND '${to_date}'` : '';
    let groupClause;
    if (period === 'daily') groupClause = "strftime('%Y-%m-%d',issue_date)";
    else if (period === 'weekly') groupClause = "strftime('%Y-W%W',issue_date)";
    else if (period === 'yearly') groupClause = "strftime('%Y',issue_date)";
    else groupClause = "strftime('%Y-%m',issue_date)";
    const data = db.prepare(`SELECT ${groupClause} as period, COUNT(*) as invoice_count, COALESCE(SUM(total_amount),0) as total_revenue, COALESCE(SUM(paid_amount),0) as collected, COALESCE(SUM(balance_due),0) as outstanding FROM invoices WHERE type='sales' ${dateFilter} GROUP BY ${groupClause} ORDER BY period`).all();
    const totals = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue, COALESCE(SUM(paid_amount),0) as collected, COALESCE(SUM(balance_due),0) as outstanding FROM invoices WHERE type='sales' ${dateFilter}`).get();
    // Top accounts
    const topAccounts = db.prepare(`SELECT a.name, COUNT(i.id) as invoice_count, SUM(i.total_amount) as revenue FROM invoices i JOIN accounts a ON a.id=i.account_id WHERE i.type='sales' ${dateFilter} GROUP BY i.account_id ORDER BY revenue DESC LIMIT 10`).all();
    res.json({ data, totals, topAccounts });
});

// Sales pipeline report
router.get('/pipeline', checkPermission('reports', 'view'), (req, res) => {
    const db = req.app.get('db');
    const pipeline = db.prepare("SELECT stage, COUNT(*) as count, COALESCE(SUM(amount),0) as value, COALESCE(AVG(probability),0) as avg_probability, COALESCE(SUM(amount*probability/100),0) as weighted_value FROM opportunities GROUP BY stage ORDER BY CASE stage WHEN 'prospecting' THEN 1 WHEN 'qualification' THEN 2 WHEN 'proposal' THEN 3 WHEN 'negotiation' THEN 4 WHEN 'closed_won' THEN 5 WHEN 'closed_lost' THEN 6 END").all();
    const winRate = db.prepare("SELECT COALESCE(COUNT(CASE WHEN stage='closed_won' THEN 1 END)*100.0/NULLIF(COUNT(CASE WHEN stage IN ('closed_won','closed_lost') THEN 1 END),0),0) as rate FROM opportunities").get();
    const avgDealSize = db.prepare("SELECT COALESCE(AVG(amount),0) as avg FROM opportunities WHERE stage='closed_won'").get();
    const avgCycleTime = db.prepare("SELECT COALESCE(AVG(julianday(actual_close_date)-julianday(created_at)),0) as days FROM opportunities WHERE actual_close_date IS NOT NULL").get();
    const byOwner = db.prepare("SELECT u.first_name||' '||u.last_name as owner, COUNT(*) as deals, SUM(amount) as value, COUNT(CASE WHEN stage='closed_won' THEN 1 END) as wins FROM opportunities o JOIN users u ON u.id=o.owner_id GROUP BY o.owner_id ORDER BY value DESC").all();
    res.json({ pipeline, winRate: winRate.rate, avgDealSize: avgDealSize.avg, avgCycleTime: avgCycleTime.days, byOwner });
});

// Expense report
router.get('/expenses', checkPermission('reports', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { from_date, to_date } = req.query;
    const dateFilter = from_date && to_date ? `AND expense_date BETWEEN '${from_date}' AND '${to_date}'` : '';
    const byCategory = db.prepare(`SELECT category, COUNT(*) as count, SUM(total_amount) as total FROM expenses WHERE status!='rejected' ${dateFilter} GROUP BY category ORDER BY total DESC`).all();
    const byMonth = db.prepare(`SELECT strftime('%Y-%m',expense_date) as month, SUM(total_amount) as total FROM expenses WHERE status!='rejected' ${dateFilter} GROUP BY month ORDER BY month`).all();
    const byDepartment = db.prepare(`SELECT department, SUM(total_amount) as total, COUNT(*) as count FROM expenses WHERE status!='rejected' AND department IS NOT NULL ${dateFilter} GROUP BY department ORDER BY total DESC`).all();
    const totals = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(CASE WHEN status='pending' THEN total_amount END),0) as pending, COALESCE(SUM(CASE WHEN status='approved' THEN total_amount END),0) as approved FROM expenses WHERE 1=1 ${dateFilter}`).get();
    res.json({ byCategory, byMonth, byDepartment, totals });
});

// Inventory report
router.get('/inventory', checkPermission('reports', 'view'), (req, res) => {
    const db = req.app.get('db');
    const valuation = db.prepare('SELECT COALESCE(SUM(total_value),0) as total FROM stock_levels').get();
    const lowStock = db.prepare('SELECT p.name,p.sku,sl.quantity,p.min_stock_level,sl.warehouse_id,w.name as warehouse FROM stock_levels sl JOIN products p ON p.id=sl.product_id LEFT JOIN warehouses w ON w.id=sl.warehouse_id WHERE sl.available_quantity<=p.min_stock_level').all();
    const byCategory = db.prepare('SELECT p.category, COUNT(DISTINCT p.id) as product_count, SUM(sl.quantity) as total_qty, SUM(sl.total_value) as total_value FROM stock_levels sl JOIN products p ON p.id=sl.product_id GROUP BY p.category').all();
    const movements = db.prepare("SELECT type, COUNT(*) as count, SUM(quantity) as total_qty FROM stock_movements WHERE movement_date>=date('now','-30 days') GROUP BY type").all();
    const topMoving = db.prepare("SELECT p.name,p.sku,SUM(CASE WHEN sm.type IN ('sale','outbound') THEN sm.quantity ELSE 0 END) as outbound,SUM(CASE WHEN sm.type IN ('purchase','inbound') THEN sm.quantity ELSE 0 END) as inbound FROM stock_movements sm JOIN products p ON p.id=sm.product_id WHERE sm.movement_date>=date('now','-30 days') GROUP BY sm.product_id ORDER BY outbound DESC LIMIT 10").all();
    res.json({ valuation: valuation.total, lowStock, byCategory, movements, topMoving });
});

// HR report
router.get('/hr', checkPermission('reports', 'view'), (req, res) => {
    const db = req.app.get('db');
    const headcount = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='active' THEN 1 END) as active FROM employees").get();
    const byDept = db.prepare("SELECT d.name as department, COUNT(e.id) as count FROM employees e JOIN departments d ON d.id=e.department_id WHERE e.status='active' GROUP BY e.department_id ORDER BY count DESC").all();
    const byType = db.prepare("SELECT employment_type, COUNT(*) as count FROM employees WHERE status='active' GROUP BY employment_type").all();
    const avgTenure = db.prepare("SELECT COALESCE(AVG(julianday('now')-julianday(date_of_joining)),0)/365 as years FROM employees WHERE status='active'").get();
    const turnover = db.prepare("SELECT COUNT(*) as left_count FROM employees WHERE status='terminated' AND date_of_leaving>=date('now','-12 months')").get();
    const payrollSummary = db.prepare("SELECT COALESCE(SUM(net_salary),0) as total FROM payroll_records WHERE month=strftime('%m','now') AND year=CAST(strftime('%Y','now') AS INT)").get();
    const leaveBalance = db.prepare("SELECT l.leave_type, COUNT(*) as applications, SUM(l.days) as total_days FROM leaves l WHERE strftime('%Y',l.start_date)=strftime('%Y','now') GROUP BY l.leave_type").all();
    res.json({ headcount, byDept, byType, avgTenure: avgTenure.years, turnover: turnover.left_count, payrollSummary: payrollSummary.total, leaveBalance });
});

// Projects report
router.get('/projects', checkPermission('reports', 'view'), (req, res) => {
    const db = req.app.get('db');
    const overview = db.prepare("SELECT status, COUNT(*) as count, COALESCE(SUM(budget),0) as budget, COALESCE(SUM(actual_cost),0) as cost FROM projects GROUP BY status").all();
    const utilization = db.prepare("SELECT u.first_name||' '||u.last_name as user_name, SUM(te.hours) as total_hours, SUM(CASE WHEN te.is_billable=1 THEN te.hours ELSE 0 END) as billable FROM time_entries te JOIN users u ON u.id=te.user_id WHERE te.date>=date('now','-30 days') GROUP BY te.user_id ORDER BY total_hours DESC").all();
    const overdue = db.prepare("SELECT p.name,p.code,p.end_date,p.progress,u.first_name||' '||u.last_name as owner FROM projects p LEFT JOIN users u ON u.id=p.owner_id WHERE p.end_date<date('now') AND p.status NOT IN ('completed','cancelled')").all();
    const revenue = db.prepare("SELECT p.name, SUM(te.hours*te.billing_rate) as billed FROM time_entries te JOIN projects p ON p.id=te.project_id WHERE te.is_billable=1 GROUP BY te.project_id ORDER BY billed DESC LIMIT 10").all();
    res.json({ overview, utilization, overdue, revenue });
});

// Support report
router.get('/support', checkPermission('reports', 'view'), (req, res) => {
    const db = req.app.get('db');
    const overview = db.prepare("SELECT status, COUNT(*) as count FROM tickets GROUP BY status").all();
    const byPriority = db.prepare("SELECT priority, COUNT(*) as count, AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at)-julianday(created_at))*24 END) as avg_resolution_hours FROM tickets GROUP BY priority").all();
    const byAgent = db.prepare("SELECT u.first_name||' '||u.last_name as agent, COUNT(t.id) as total, COUNT(CASE WHEN t.status='resolved' THEN 1 END) as resolved, AVG(t.csat_score) as avg_csat FROM tickets t JOIN users u ON u.id=t.assigned_to GROUP BY t.assigned_to ORDER BY total DESC").all();
    const slaCompliance = db.prepare("SELECT COUNT(CASE WHEN sla_breach=0 THEN 1 END)*100.0/NULLIF(COUNT(*),0) as compliance FROM tickets WHERE sla_policy_id IS NOT NULL").get();
    const trend = db.prepare("SELECT strftime('%Y-%m',created_at) as month, COUNT(*) as created, COUNT(CASE WHEN status IN ('resolved','closed') THEN 1 END) as resolved FROM tickets GROUP BY month ORDER BY month DESC LIMIT 12").all();
    const topCategories = db.prepare("SELECT category, COUNT(*) as count FROM tickets WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 10").all();
    res.json({ overview, byPriority, byAgent, slaCompliance: slaCompliance?.compliance || 0, trend, topCategories });
});

// Audit log report
router.get('/audit', checkPermission('admin', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 50, module, user_id, action, from_date, to_date } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (module) { where.push("al.module=?"); params.push(module); }
    if (user_id) { where.push("al.user_id=?"); params.push(user_id); }
    if (action) { where.push("al.action LIKE ?"); params.push(`%${action}%`); }
    if (from_date) { where.push("al.created_at>=?"); params.push(from_date); }
    if (to_date) { where.push("al.created_at<=?"); params.push(to_date); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM audit_logs al WHERE ${where.join(' AND ')}`).get(...params);
    const logs = db.prepare(`SELECT al.*,u.first_name||' '||u.last_name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE ${where.join(' AND ')} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ logs, total: total.count, page: +page });
});

export default router;
