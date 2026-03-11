import { Router } from 'express';

const router = Router();

// GET /api/dashboard - Executive Dashboard Data
router.get('/', (req, res) => {
  try {
    const db = req.app.get('db');

    // === KPI CARDS ===
    // Revenue (invoices paid)
    const revenue = db.prepare("SELECT COALESCE(SUM(paid_amount), 0) as total FROM invoices WHERE status IN ('paid', 'partial') AND type = 'sales'").get();
    const revenueThisMonth = db.prepare("SELECT COALESCE(SUM(paid_amount), 0) as total FROM invoices WHERE status IN ('paid', 'partial') AND type = 'sales' AND strftime('%Y-%m', issue_date) = strftime('%Y-%m', 'now')").get();
    const revenueLastMonth = db.prepare("SELECT COALESCE(SUM(paid_amount), 0) as total FROM invoices WHERE status IN ('paid', 'partial') AND type = 'sales' AND strftime('%Y-%m', issue_date) = strftime('%Y-%m', 'now', '-1 month')").get();

    // Pipeline Value
    const pipeline = db.prepare("SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM opportunities WHERE stage NOT IN ('closed_won', 'closed_lost')").get();

    // Expenses
    const expenses = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses WHERE status = 'approved'").get();
    const expensesThisMonth = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses WHERE status = 'approved' AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')").get();

    // Cash Flow (Revenue - Expenses)
    const cashFlow = (revenue.total || 0) - (expenses.total || 0);

    // Customers
    const customers = db.prepare("SELECT COUNT(*) as count FROM accounts WHERE status = 'active'").get();
    const newCustomersThisMonth = db.prepare("SELECT COUNT(*) as count FROM accounts WHERE status = 'active' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')").get();

    // Leads
    const activeLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status NOT IN ('converted', 'lost', 'disqualified')").get();
    const leadsThisMonth = db.prepare("SELECT COUNT(*) as count FROM leads WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')").get();
    const convertedLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'converted'").get();
    const totalLeads = db.prepare("SELECT COUNT(*) as count FROM leads").get();
    const conversionRate = totalLeads.count > 0 ? ((convertedLeads.count / totalLeads.count) * 100).toFixed(1) : 0;

    // Inventory
    const inventoryValue = db.prepare("SELECT COALESCE(SUM(total_value), 0) as total FROM stock_levels").get();
    const lowStockItems = db.prepare("SELECT COUNT(*) as count FROM stock_levels sl JOIN products p ON p.id = sl.product_id WHERE sl.available_quantity <= p.min_stock_level AND p.is_stockable = 1").get();

    // Open Invoices
    const openInvoices = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE status IN ('sent', 'overdue', 'partial')").get();

    // Overdue Invoices
    const overdueInvoices = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE status = 'overdue' OR (due_date < date('now') AND status IN ('sent', 'partial'))").get();

    // Employees
    const activeEmployees = db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = 'active'").get();

    // Support Tickets
    const openTickets = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status IN ('open', 'in_progress')").get();
    const avgResolutionTime = db.prepare("SELECT AVG(CAST((julianday(resolved_at) - julianday(created_at)) * 24 AS INTEGER)) as avg_hours FROM tickets WHERE resolved_at IS NOT NULL").get();

    // Projects
    const activeProjects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status IN ('active', 'in_progress')").get();

    // Win Rate
    const wonDeals = db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE stage = 'closed_won'").get();
    const closedDeals = db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE stage IN ('closed_won', 'closed_lost')").get();
    const winRate = closedDeals.count > 0 ? ((wonDeals.count / closedDeals.count) * 100).toFixed(1) : 0;

    // === CHART DATA ===
    // Parse date range from query params
    const range = req.query.range || '12m';
    const customFrom = req.query.from;
    const customTo = req.query.to;

    let dateOffset, groupBy;
    if (range === 'custom' && customFrom && customTo) {
      dateOffset = null; // use custom dates
      groupBy = 'month';
    } else {
      switch (range) {
        case '7d': dateOffset = '-7 days'; groupBy = 'day'; break;
        case '30d': dateOffset = '-30 days'; groupBy = 'day'; break;
        case '90d': dateOffset = '-3 months'; groupBy = 'month'; break;
        case 'ytd': dateOffset = `-${new Date().getMonth() + 1} months`; groupBy = 'month'; break;
        case '12m': default: dateOffset = '-12 months'; groupBy = 'month'; break;
      }
    }

    const dateFilter = dateOffset
      ? `>= date('now', '${dateOffset}')`
      : `BETWEEN '${customFrom}' AND '${customTo}'`;

    const strftimeFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m';

    // Revenue Trend
    const revenueTrend = db.prepare(`
            SELECT strftime('${strftimeFormat}', issue_date) as period,
                   COALESCE(SUM(paid_amount), 0) as revenue,
                   COALESCE(SUM(total_amount), 0) as invoiced
            FROM invoices WHERE type = 'sales' AND issue_date ${dateFilter}
            GROUP BY strftime('${strftimeFormat}', issue_date) ORDER BY period
        `).all();

    // Expense Trend
    const expenseTrend = db.prepare(`
            SELECT strftime('${strftimeFormat}', expense_date) as period,
                   COALESCE(SUM(total_amount), 0) as amount
            FROM expenses WHERE status = 'approved' AND expense_date ${dateFilter}
            GROUP BY strftime('${strftimeFormat}', expense_date) ORDER BY period
        `).all();

    // Combined revenue vs expenses
    const revenueVsExpenses = [];
    const monthMap = {};
    revenueTrend.forEach(r => { monthMap[r.period] = { month: r.period, revenue: r.revenue, expenses: 0 }; });
    expenseTrend.forEach(e => {
      if (monthMap[e.period]) monthMap[e.period].expenses = e.amount;
      else monthMap[e.period] = { month: e.period, revenue: 0, expenses: e.amount };
    });
    Object.keys(monthMap).sort().forEach(k => revenueVsExpenses.push(monthMap[k]));

    // Pipeline Funnel
    const pipelineFunnel = db.prepare(`
      SELECT stage, COUNT(*) as count, COALESCE(SUM(amount), 0) as value
      FROM opportunities GROUP BY stage
      ORDER BY CASE stage 
        WHEN 'prospecting' THEN 1 WHEN 'qualification' THEN 2 
        WHEN 'proposal' THEN 3 WHEN 'negotiation' THEN 4
        WHEN 'closed_won' THEN 5 WHEN 'closed_lost' THEN 6 END
    `).all();

    // Expense Breakdown by Category
    const expenseBreakdown = db.prepare(`
      SELECT category, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as count
      FROM expenses WHERE status = 'approved'
      GROUP BY category ORDER BY amount DESC LIMIT 8
    `).all();

    // Department Headcount
    const deptHeadcount = db.prepare(`
      SELECT COALESCE(d.name, 'Unassigned') as department, COUNT(*) as count
      FROM employees e LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status = 'active' GROUP BY d.name ORDER BY count DESC
    `).all();

    // Ticket Status Distribution
    const ticketStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM tickets GROUP BY status
    `).all();

    // Project Progress
    const projectProgress = db.prepare(`
      SELECT name, progress, status, budget, actual_cost
      FROM projects WHERE status IN ('active', 'in_progress')
      ORDER BY updated_at DESC LIMIT 10
    `).all();

    // Top Products by Revenue
    const topProducts = db.prepare(`
      SELECT p.name, COALESCE(SUM(ii.total_amount), 0) as revenue, COALESCE(SUM(ii.quantity), 0) as units_sold
      FROM invoice_items ii JOIN products p ON p.id = ii.product_id
      JOIN invoices i ON i.id = ii.invoice_id WHERE i.status IN ('paid', 'partial')
      GROUP BY p.name ORDER BY revenue DESC LIMIT 10
    `).all();

    // Leads by Source
    const leadsBySource = db.prepare(`
      SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC
    `).all();

    // Recent Activities
    const recentActivities = db.prepare(`
      SELECT a.*, u.first_name || ' ' || u.last_name as user_name
      FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 15
    `).all();

    // Sales by Region
    const salesByRegion = db.prepare(`
      SELECT COALESCE(ac.state, 'Other') as region, COALESCE(SUM(i.total_amount), 0) as amount
      FROM invoices i JOIN accounts ac ON ac.id = i.account_id
      WHERE i.type = 'sales' GROUP BY ac.state ORDER BY amount DESC LIMIT 10
    `).all();

    res.json({
      kpis: {
        revenue: { total: revenue.total, thisMonth: revenueThisMonth.total, lastMonth: revenueLastMonth.total, growth: revenueLastMonth.total > 0 ? (((revenueThisMonth.total - revenueLastMonth.total) / revenueLastMonth.total) * 100).toFixed(1) : 0 },
        pipeline: { value: pipeline.total, count: pipeline.count },
        cashFlow: { total: cashFlow },
        expenses: { total: expenses.total, thisMonth: expensesThisMonth.total },
        customers: { total: customers.count, new: newCustomersThisMonth.count },
        leads: { active: activeLeads.count, thisMonth: leadsThisMonth.count, conversionRate },
        inventory: { value: inventoryValue.total, lowStock: lowStockItems.count },
        invoices: { open: openInvoices.count, openValue: openInvoices.total, overdue: overdueInvoices.count, overdueValue: overdueInvoices.total },
        employees: { active: activeEmployees.count },
        tickets: { open: openTickets.count, avgResolution: avgResolutionTime.avg_hours || 0 },
        projects: { active: activeProjects.count },
        deals: { winRate }
      },
      charts: {
        revenueVsExpenses,
        revenueTrend,
        pipelineFunnel,
        expenseBreakdown,
        deptHeadcount,
        ticketStatus,
        projectProgress,
        topProducts,
        leadsBySource,
        salesByRegion
      },
      recentActivities
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard: ' + err.message });
  }
});

export default router;
