import { initializeDatabase } from './db/schema.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

console.log('🌱 Seeding Rapidflo v2 database...');
const db = initializeDatabase();
const now = "datetime('now')";

// Helper
function insert(table, data) {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(',');
    db.prepare(`INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`).run(...keys.map(k => data[k]));
}

// === ROLES ===
const roles = [
    { id: 'role-sa', name: 'super_admin', description: 'Full system access', level: 1, is_system: 1 },
    { id: 'role-admin', name: 'admin', description: 'Administrative access', level: 2, is_system: 1 },
    { id: 'role-mgr', name: 'manager', description: 'Manager access', level: 3, is_system: 1 },
    { id: 'role-emp', name: 'employee', description: 'Standard employee access', level: 4, is_system: 1 },
    { id: 'role-view', name: 'viewer', description: 'Read-only access', level: 5, is_system: 1 },
];
roles.forEach(r => insert('roles', { ...r, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === PERMISSIONS ===
const modules = ['crm', 'sales', 'finance', 'inventory', 'procurement', 'hrms', 'projects', 'support', 'reports', 'admin'];
const actions = ['view', 'create', 'edit', 'delete', 'export', 'approve'];
modules.forEach(mod => {
    actions.forEach(act => {
        insert('permissions', { id: `perm-${mod}-${act}`, module: mod, action: act, description: `${act} ${mod}` });
    });
});
// Grant all permissions to super_admin and admin
const allPerms = db.prepare('SELECT id FROM permissions').all();
allPerms.forEach(p => {
    insert('role_permissions', { id: uuidv4(), role_id: 'role-sa', permission_id: p.id });
    insert('role_permissions', { id: uuidv4(), role_id: 'role-admin', permission_id: p.id });
});
// Grant view/create/edit to manager
const mgrPerms = db.prepare("SELECT id FROM permissions WHERE action IN ('view','create','edit')").all();
mgrPerms.forEach(p => insert('role_permissions', { id: uuidv4(), role_id: 'role-mgr', permission_id: p.id }));
// Grant view/create to employee
const empPerms = db.prepare("SELECT id FROM permissions WHERE action IN ('view','create')").all();
empPerms.forEach(p => insert('role_permissions', { id: uuidv4(), role_id: 'role-emp', permission_id: p.id }));
// Grant view to viewer
const viewPerms = db.prepare("SELECT id FROM permissions WHERE action='view'").all();
viewPerms.forEach(p => insert('role_permissions', { id: uuidv4(), role_id: 'role-view', permission_id: p.id }));

// === USERS ===
const passwordHash = bcrypt.hashSync('Admin@123', 12);
const users = [
    { id: 'user-sa', email: 'superadmin@rapidflo.com', first_name: 'Super', last_name: 'Admin', role_id: 'role-sa', phone: '+91-9000000001' },
    { id: 'user-admin', email: 'admin@rapidflo.com', first_name: 'Raj', last_name: 'Kumar', role_id: 'role-admin', phone: '+91-9000000002' },
    { id: 'user-mgr1', email: 'sales.mgr@rapidflo.com', first_name: 'Priya', last_name: 'Sharma', role_id: 'role-mgr', phone: '+91-9000000003' },
    { id: 'user-mgr2', email: 'hr.mgr@rapidflo.com', first_name: 'Vikram', last_name: 'Singh', role_id: 'role-mgr', phone: '+91-9000000004' },
    { id: 'user-emp1', email: 'employee1@rapidflo.com', first_name: 'Ananya', last_name: 'Patel', role_id: 'role-emp', phone: '+91-9000000005' },
    { id: 'user-emp2', email: 'employee2@rapidflo.com', first_name: 'Arjun', last_name: 'Reddy', role_id: 'role-emp', phone: '+91-9000000006' },
    { id: 'user-emp3', email: 'employee3@rapidflo.com', first_name: 'Meera', last_name: 'Nair', role_id: 'role-emp', phone: '+91-9000000007' },
    { id: 'user-view', email: 'viewer@rapidflo.com', first_name: 'Guest', last_name: 'Viewer', role_id: 'role-view', phone: '+91-9000000008' },
];
users.forEach(u => insert('users', { ...u, password_hash: passwordHash, is_active: 1, timezone: 'Asia/Kolkata', locale: 'en-IN', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === MODULE CONFIG ===
const moduleConfigs = [
    { module: 'crm', display_name: 'CRM', icon: 'Users', sort_order: 1 },
    { module: 'sales', display_name: 'Sales', icon: 'ShoppingCart', sort_order: 2 },
    { module: 'finance', display_name: 'Finance', icon: 'DollarSign', sort_order: 3 },
    { module: 'inventory', display_name: 'Inventory', icon: 'Package', sort_order: 4 },
    { module: 'procurement', display_name: 'Procurement', icon: 'Truck', sort_order: 5 },
    { module: 'hrms', display_name: 'HRMS', icon: 'UserCheck', sort_order: 6 },
    { module: 'projects', display_name: 'Projects', icon: 'FolderKanban', sort_order: 7 },
    { module: 'support', display_name: 'Support', icon: 'LifeBuoy', sort_order: 8 },
    { module: 'reports', display_name: 'Reports', icon: 'BarChart3', sort_order: 9 },
    { module: 'admin', display_name: 'Admin', icon: 'Settings', sort_order: 10 },
];
moduleConfigs.forEach(mc => insert('module_config', { id: uuidv4(), ...mc, is_enabled: 1, config: '{}', updated_at: new Date().toISOString() }));

// === SYSTEM SETTINGS ===
const settings = [
    { category: 'company', key: 'name', value: 'Rapidflo Demo Corp', description: 'Company name' },
    { category: 'company', key: 'email', value: 'info@rapidflo.com', description: 'Company email' },
    { category: 'company', key: 'phone', value: '+91-1234567890', description: 'Company phone' },
    { category: 'company', key: 'address', value: 'Bangalore, Karnataka, India', description: 'Company address' },
    { category: 'company', key: 'currency', value: 'INR', description: 'Default currency' },
    { category: 'company', key: 'timezone', value: 'Asia/Kolkata', description: 'Default timezone' },
    { category: 'company', key: 'gst_number', value: '29AABCU9603R1ZM', description: 'GST Number' },
    { category: 'invoice', key: 'prefix', value: 'INV-', description: 'Invoice number prefix' },
    { category: 'invoice', key: 'payment_terms', value: 'net30', description: 'Default payment terms' },
    { category: 'invoice', key: 'default_tax_rate', value: '18', value_type: 'number', description: 'Default tax rate (GST)' },
    { category: 'security', key: 'session_timeout', value: '480', value_type: 'number', description: 'Session timeout (minutes)' },
    { category: 'security', key: 'max_login_attempts', value: '5', value_type: 'number', description: 'Max login attempts' },
    { category: 'security', key: 'password_expiry_days', value: '90', value_type: 'number', description: 'Password expiry' },
    { category: 'notifications', key: 'email_enabled', value: 'true', value_type: 'boolean', description: 'Email notifications' },
];
settings.forEach(s => insert('system_settings', { id: uuidv4(), ...s, value_type: s.value_type || 'string', is_sensitive: 0, updated_at: new Date().toISOString() }));

// === CRM DATA ===
const accounts = [
    { id: 'acc-1', name: 'TechVista Solutions', industry: 'Technology', email: 'info@techvista.in', phone: '+91-80-41234567', city: 'Bangalore', state: 'Karnataka', country: 'India', annual_revenue: 75000000, employee_count: 250, type: 'customer', status: 'active' },
    { id: 'acc-2', name: 'Global Pharma India', industry: 'Healthcare', email: 'contact@globalpharma.in', phone: '+91-22-23456789', city: 'Mumbai', state: 'Maharashtra', country: 'India', annual_revenue: 120000000, employee_count: 500, type: 'customer', status: 'active' },
    { id: 'acc-3', name: 'InfraMax Builders', industry: 'Construction', email: 'sales@inframax.in', phone: '+91-40-34567890', city: 'Hyderabad', state: 'Telangana', country: 'India', annual_revenue: 50000000, employee_count: 180, type: 'prospect', status: 'active' },
    { id: 'acc-4', name: 'FinServe Analytics', industry: 'Finance', email: 'info@finserve.in', phone: '+91-11-45678901', city: 'New Delhi', state: 'Delhi', country: 'India', annual_revenue: 95000000, employee_count: 320, type: 'customer', status: 'active' },
    { id: 'acc-5', name: 'EduPrime Academy', industry: 'Education', email: 'admin@eduprime.in', phone: '+91-44-56789012', city: 'Chennai', state: 'Tamil Nadu', country: 'India', annual_revenue: 30000000, employee_count: 100, type: 'prospect', status: 'active' },
];
accounts.forEach(a => insert('accounts', { ...a, owner_id: 'user-mgr1', created_by: 'user-sa', created_at: new Date(Date.now() - Math.random() * 90 * 86400000).toISOString(), updated_at: new Date().toISOString() }));

// Contacts
const contacts = [
    { id: 'cnt-1', account_id: 'acc-1', first_name: 'Sanjay', last_name: 'Gupta', email: 'sanjay@techvista.in', phone: '+91-9876543210', job_title: 'CTO', is_primary: 1 },
    { id: 'cnt-2', account_id: 'acc-1', first_name: 'Deepa', last_name: 'Menon', email: 'deepa@techvista.in', phone: '+91-9876543211', job_title: 'CFO' },
    { id: 'cnt-3', account_id: 'acc-2', first_name: 'Dr. Amit', last_name: 'Shah', email: 'amit@globalpharma.in', phone: '+91-9876543212', job_title: 'Managing Director', is_primary: 1 },
    { id: 'cnt-4', account_id: 'acc-3', first_name: 'Ramesh', last_name: 'Iyer', email: 'ramesh@inframax.in', phone: '+91-9876543213', job_title: 'CEO', is_primary: 1 },
    { id: 'cnt-5', account_id: 'acc-4', first_name: 'Kavitha', last_name: 'Rao', email: 'kavitha@finserve.in', phone: '+91-9876543214', job_title: 'VP Operations', is_primary: 1 },
    { id: 'cnt-6', account_id: 'acc-5', first_name: 'Arun', last_name: 'Krishnan', email: 'arun@eduprime.in', phone: '+91-9876543215', job_title: 'Director', is_primary: 1 },
];
contacts.forEach(c => insert('contacts', { ...c, is_primary: c.is_primary || 0, country: 'India', owner_id: 'user-mgr1', created_by: 'user-sa', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// Leads
const leads = [
    { id: 'lead-1', first_name: 'Nitin', last_name: 'Joshi', email: 'nitin@startupxyz.in', company: 'StartupXYZ', source: 'website', status: 'qualified', score: 85, score_label: 'hot', assigned_to: 'user-emp1' },
    { id: 'lead-2', first_name: 'Sunita', last_name: 'Verma', email: 'sunita@retailking.in', company: 'RetailKing', source: 'referral', status: 'contacted', score: 65, score_label: 'warm', assigned_to: 'user-emp2' },
    { id: 'lead-3', first_name: 'Ravi', last_name: 'Prasad', email: 'ravi@autoworks.in', company: 'AutoWorks India', source: 'event', status: 'new', score: 30, score_label: 'cold', assigned_to: 'user-emp1' },
    { id: 'lead-4', first_name: 'Pooja', last_name: 'Tiwari', email: 'pooja@greenenergyco.in', company: 'GreenEnergy Co', source: 'linkedin', status: 'qualified', score: 75, score_label: 'warm', assigned_to: 'user-mgr1' },
    { id: 'lead-5', first_name: 'Karthik', last_name: 'Subramanian', email: 'karthik@logisticsplus.in', company: 'LogisticsPlus', source: 'cold_call', status: 'new', score: 20, score_label: 'cold', assigned_to: 'user-emp2' },
];
leads.forEach(l => insert('leads', { ...l, country: 'India', created_by: 'user-sa', created_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(), updated_at: new Date().toISOString() }));

// Opportunities
const opps = [
    { id: 'opp-1', name: 'TechVista ERP Upgrade', account_id: 'acc-1', contact_id: 'cnt-1', stage: 'negotiation', probability: 75, amount: 2500000, expected_close_date: '2026-03-15', source: 'existing_customer' },
    { id: 'opp-2', name: 'Global Pharma Compliance Suite', account_id: 'acc-2', contact_id: 'cnt-3', stage: 'proposal', probability: 50, amount: 5000000, expected_close_date: '2026-04-01', source: 'referral' },
    { id: 'opp-3', name: 'InfraMax Project Tracker', account_id: 'acc-3', contact_id: 'cnt-4', stage: 'prospecting', probability: 10, amount: 1500000, expected_close_date: '2026-05-30', source: 'website' },
    { id: 'opp-4', name: 'FinServe Analytics Dashboard', account_id: 'acc-4', contact_id: 'cnt-5', stage: 'closed_won', probability: 100, amount: 3500000, actual_close_date: '2026-01-20', source: 'direct' },
    { id: 'opp-5', name: 'EduPrime Digital Platform', account_id: 'acc-5', contact_id: 'cnt-6', stage: 'qualification', probability: 25, amount: 800000, expected_close_date: '2026-06-15', source: 'event' },
];
opps.forEach(o => insert('opportunities', { ...o, type: 'new_business', owner_id: 'user-mgr1', created_by: 'user-sa', created_at: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString(), updated_at: new Date().toISOString() }));

// === PRODUCTS ===
const products = [
    { id: 'prod-1', name: 'Rapidflo Enterprise License', sku: 'RERP-ENT-001', category: 'Software', type: 'service', base_price: 500000, cost_price: 100000, tax_rate: 18, unit: 'license', is_stockable: 0 },
    { id: 'prod-2', name: 'Cloud Hosting (Annual)', sku: 'RERP-CLD-001', category: 'Service', type: 'service', base_price: 120000, cost_price: 40000, tax_rate: 18, unit: 'subscription', is_stockable: 0 },
    { id: 'prod-3', name: 'Implementation Support (40hrs)', sku: 'RERP-IMP-001', category: 'Service', type: 'service', base_price: 200000, cost_price: 80000, tax_rate: 18, unit: 'package', is_stockable: 0 },
    { id: 'prod-4', name: 'Dell PowerEdge Server', sku: 'HW-SRV-001', category: 'Hardware', type: 'goods', base_price: 350000, cost_price: 280000, tax_rate: 18, unit: 'piece', is_stockable: 1, min_stock_level: 5 },
    { id: 'prod-5', name: 'Cisco Switch 48-Port', sku: 'HW-NET-001', category: 'Hardware', type: 'goods', base_price: 85000, cost_price: 65000, tax_rate: 18, unit: 'piece', is_stockable: 1, min_stock_level: 10 },
    { id: 'prod-6', name: 'Training Workshop (1-day)', sku: 'RERP-TRN-001', category: 'Service', type: 'service', base_price: 50000, cost_price: 15000, tax_rate: 18, unit: 'session', is_stockable: 0 },
    { id: 'prod-7', name: 'Annual Support & Maintenance', sku: 'RERP-SUP-001', category: 'Service', type: 'service', base_price: 150000, cost_price: 30000, tax_rate: 18, unit: 'contract', is_stockable: 0 },
    { id: 'prod-8', name: 'UPS 3KVA Online', sku: 'HW-UPS-001', category: 'Hardware', type: 'goods', base_price: 45000, cost_price: 32000, tax_rate: 18, unit: 'piece', is_stockable: 1, min_stock_level: 8 },
];
products.forEach(p => insert('products', { ...p, is_active: 1, min_stock_level: p.min_stock_level || 0, reorder_quantity: 20, created_by: 'user-sa', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === WAREHOUSES & STOCK ===
const warehouses = [
    { id: 'wh-1', name: 'Main Warehouse - Bangalore', code: 'WH-BLR', city: 'Bangalore', state: 'Karnataka', manager_id: 'user-admin', type: 'main' },
    { id: 'wh-2', name: 'Mumbai Distribution Center', code: 'WH-MUM', city: 'Mumbai', state: 'Maharashtra', manager_id: 'user-mgr1', type: 'distribution' },
];
warehouses.forEach(w => insert('warehouses', { ...w, country: 'India', is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

const stockLevels = [
    { product_id: 'prod-4', warehouse_id: 'wh-1', quantity: 15, available_quantity: 12, unit_cost: 280000, total_value: 4200000 },
    { product_id: 'prod-5', warehouse_id: 'wh-1', quantity: 25, available_quantity: 22, unit_cost: 65000, total_value: 1625000 },
    { product_id: 'prod-8', warehouse_id: 'wh-1', quantity: 20, available_quantity: 18, unit_cost: 32000, total_value: 640000 },
    { product_id: 'prod-4', warehouse_id: 'wh-2', quantity: 8, available_quantity: 8, unit_cost: 280000, total_value: 2240000 },
    { product_id: 'prod-5', warehouse_id: 'wh-2', quantity: 12, available_quantity: 10, unit_cost: 65000, total_value: 780000 },
];
stockLevels.forEach(sl => insert('stock_levels', { id: uuidv4(), ...sl, updated_at: new Date().toISOString() }));

// === INVOICES & PAYMENTS ===
const invoices = [
    { id: 'inv-1', invoice_number: 'INV-2026-001', type: 'sales', account_id: 'acc-4', status: 'paid', issue_date: '2026-01-20', due_date: '2026-02-20', subtotal: 3500000, tax_amount: 630000, total_amount: 4130000, paid_amount: 4130000, balance_due: 0 },
    { id: 'inv-2', invoice_number: 'INV-2026-002', type: 'sales', account_id: 'acc-1', status: 'sent', issue_date: '2026-02-01', due_date: '2026-03-03', subtotal: 870000, tax_amount: 156600, total_amount: 1026600, paid_amount: 0, balance_due: 1026600 },
    { id: 'inv-3', invoice_number: 'INV-2026-003', type: 'sales', account_id: 'acc-2', status: 'partial', issue_date: '2026-01-15', due_date: '2026-02-15', subtotal: 700000, tax_amount: 126000, total_amount: 826000, paid_amount: 400000, balance_due: 426000 },
    { id: 'inv-4', invoice_number: 'INV-2026-004', type: 'sales', account_id: 'acc-1', status: 'overdue', issue_date: '2025-12-10', due_date: '2026-01-10', subtotal: 200000, tax_amount: 36000, total_amount: 236000, paid_amount: 0, balance_due: 236000 },
    { id: 'inv-5', invoice_number: 'INV-2026-005', type: 'sales', account_id: 'acc-3', status: 'draft', issue_date: '2026-02-10', due_date: '2026-03-12', subtotal: 1500000, tax_amount: 270000, total_amount: 1770000, paid_amount: 0, balance_due: 1770000 },
];
invoices.forEach(inv => insert('invoices', { ...inv, currency: 'INR', payment_terms: 'net30', created_by: 'user-mgr1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// Payments
insert('payment_records', { id: uuidv4(), payment_number: 'PAY-2026-001', invoice_id: 'inv-1', amount: 4130000, payment_date: '2026-02-05', payment_method: 'bank_transfer', status: 'completed', created_by: 'user-admin', created_at: new Date().toISOString() });
insert('payment_records', { id: uuidv4(), payment_number: 'PAY-2026-002', invoice_id: 'inv-3', amount: 400000, payment_date: '2026-01-25', payment_method: 'bank_transfer', status: 'completed', created_by: 'user-admin', created_at: new Date().toISOString() });

// === GL ENTRIES ===
const glEntries = [
    { account_code: '4000', account_name: 'Sales Revenue', date: '2026-01-20', debit: 0, credit: 3500000, reference_type: 'invoice', reference_id: 'inv-1', description: 'INV-2026-001 revenue' },
    { account_code: '1100', account_name: 'Accounts Receivable', date: '2026-01-20', debit: 4130000, credit: 0, reference_type: 'invoice', reference_id: 'inv-1', description: 'INV-2026-001' },
    { account_code: '2100', account_name: 'Tax Payable', date: '2026-01-20', debit: 0, credit: 630000, reference_type: 'invoice', reference_id: 'inv-1', description: 'GST on INV-2026-001' },
    { account_code: '1000', account_name: 'Cash/Bank', date: '2026-02-05', debit: 4130000, credit: 0, reference_type: 'payment', description: 'Payment for INV-2026-001' },
    { account_code: '1100', account_name: 'Accounts Receivable', date: '2026-02-05', debit: 0, credit: 4130000, reference_type: 'payment', description: 'Payment for INV-2026-001' },
    { account_code: '4000', account_name: 'Sales Revenue', date: '2026-02-01', debit: 0, credit: 870000, reference_type: 'invoice', reference_id: 'inv-2', description: 'INV-2026-002' },
    { account_code: '4000', account_name: 'Sales Revenue', date: '2026-01-15', debit: 0, credit: 700000, reference_type: 'invoice', reference_id: 'inv-3', description: 'INV-2026-003' },
    { account_code: '5000', account_name: 'Cost of Goods', date: '2026-01-15', debit: 400000, credit: 0, reference_type: 'expense', description: 'Product costs' },
    { account_code: '6100', account_name: 'Salary Expense', date: '2026-01-31', debit: 1200000, credit: 0, reference_type: 'payroll', description: 'Jan salaries' },
    { account_code: '6200', account_name: 'Rent Expense', date: '2026-01-01', debit: 250000, credit: 0, reference_type: 'expense', description: 'Office rent' },
    { account_code: '6300', account_name: 'Utilities', date: '2026-01-15', debit: 45000, credit: 0, reference_type: 'expense', description: 'Electricity & internet' },
    { account_code: '6400', account_name: 'Marketing', date: '2026-01-20', debit: 150000, credit: 0, reference_type: 'expense', description: 'Digital marketing' },
];
glEntries.forEach(gl => insert('gl_entries', { id: uuidv4(), ...gl, created_by: 'user-admin', created_at: new Date().toISOString() }));

// === EXPENSES ===
const expenses = [
    { category: 'rent', description: 'Monthly office rent - Feb 2026', amount: 250000, total_amount: 250000, status: 'approved', expense_date: '2026-02-01' },
    { category: 'utilities', description: 'Electricity & Internet', amount: 45000, total_amount: 45000, status: 'approved', expense_date: '2026-02-05' },
    { category: 'marketing', description: 'Google Ads campaign', amount: 80000, total_amount: 80000, status: 'approved', expense_date: '2026-02-03' },
    { category: 'travel', description: 'Client visit - Mumbai', amount: 35000, total_amount: 35000, status: 'pending', expense_date: '2026-02-08' },
    { category: 'software', description: 'AWS hosting charges', amount: 120000, total_amount: 120000, status: 'approved', expense_date: '2026-02-01' },
    { category: 'training', description: 'Team training program', amount: 60000, total_amount: 60000, status: 'pending', expense_date: '2026-02-10' },
];
expenses.forEach((e, i) => insert('expenses', { id: uuidv4(), expense_number: `EXP-2026-${String(i + 1).padStart(3, '0')}`, ...e, currency: 'INR', created_by: 'user-emp1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === TAX RULES ===
const taxRules = [
    { name: 'GST 0%', code: 'GST-0', rate: 0, type: 'GST', region: 'India', category: 'exempt' },
    { name: 'GST 5%', code: 'GST-5', rate: 5, type: 'GST', region: 'India', category: 'essentials' },
    { name: 'GST 12%', code: 'GST-12', rate: 12, type: 'GST', region: 'India', category: 'standard' },
    { name: 'GST 18%', code: 'GST-18', rate: 18, type: 'GST', region: 'India', category: 'services' },
    { name: 'GST 28%', code: 'GST-28', rate: 28, type: 'GST', region: 'India', category: 'luxury' },
];
taxRules.forEach(t => insert('tax_rules', { id: uuidv4(), ...t, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === DEPARTMENTS ===
const departments = [
    { id: 'dept-1', name: 'Engineering', code: 'ENG', budget: 5000000, head_id: 'user-admin' },
    { id: 'dept-2', name: 'Sales & Marketing', code: 'SM', budget: 3000000, head_id: 'user-mgr1' },
    { id: 'dept-3', name: 'Human Resources', code: 'HR', budget: 1500000, head_id: 'user-mgr2' },
    { id: 'dept-4', name: 'Finance & Accounts', code: 'FIN', budget: 2000000, head_id: 'user-admin' },
    { id: 'dept-5', name: 'Operations', code: 'OPS', budget: 2500000, head_id: 'user-mgr2' },
];
departments.forEach(d => insert('departments', { ...d, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === EMPLOYEES ===
const employees = [
    { id: 'emp-1', employee_id: 'EMP-001', user_id: 'user-admin', first_name: 'Raj', last_name: 'Kumar', email: 'admin@rapidflo.com', department_id: 'dept-1', designation: 'CTO', employment_type: 'full-time', date_of_joining: '2022-01-15', base_salary: 250000, gender: 'male' },
    { id: 'emp-2', employee_id: 'EMP-002', user_id: 'user-mgr1', first_name: 'Priya', last_name: 'Sharma', email: 'sales.mgr@rapidflo.com', department_id: 'dept-2', designation: 'Sales Manager', employment_type: 'full-time', date_of_joining: '2022-06-01', base_salary: 180000, gender: 'female' },
    { id: 'emp-3', employee_id: 'EMP-003', user_id: 'user-mgr2', first_name: 'Vikram', last_name: 'Singh', email: 'hr.mgr@rapidflo.com', department_id: 'dept-3', designation: 'HR Manager', employment_type: 'full-time', date_of_joining: '2023-03-10', base_salary: 160000, gender: 'male' },
    { id: 'emp-4', employee_id: 'EMP-004', user_id: 'user-emp1', first_name: 'Ananya', last_name: 'Patel', email: 'employee1@rapidflo.com', department_id: 'dept-1', designation: 'Senior Developer', employment_type: 'full-time', date_of_joining: '2023-07-01', base_salary: 120000, gender: 'female' },
    { id: 'emp-5', employee_id: 'EMP-005', user_id: 'user-emp2', first_name: 'Arjun', last_name: 'Reddy', email: 'employee2@rapidflo.com', department_id: 'dept-2', designation: 'Sales Executive', employment_type: 'full-time', date_of_joining: '2024-01-15', base_salary: 80000, gender: 'male' },
    { id: 'emp-6', employee_id: 'EMP-006', user_id: 'user-emp3', first_name: 'Meera', last_name: 'Nair', email: 'employee3@rapidflo.com', department_id: 'dept-4', designation: 'Accountant', employment_type: 'full-time', date_of_joining: '2024-04-01', base_salary: 75000, gender: 'female' },
];
employees.forEach(e => insert('employees', { ...e, status: 'active', country: 'India', nationality: 'Indian', shift: 'general', work_location: 'office', skills: '[]', created_by: 'user-sa', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === VENDORS ===
const vendors = [
    { id: 'ven-1', name: 'Dell Technologies India', code: 'V-DELL', email: 'enterprise@dell.in', category: 'Hardware', rating: 5, payment_terms: 'net30', status: 'active' },
    { id: 'ven-2', name: 'Amazon Web Services', code: 'V-AWS', email: 'support@aws.in', category: 'Cloud Services', rating: 5, payment_terms: 'net15', status: 'active' },
    { id: 'ven-3', name: 'Office Supplies Co.', code: 'V-OSC', email: 'orders@officesupplies.in', category: 'Supplies', rating: 4, payment_terms: 'net30', status: 'active' },
];
vendors.forEach(v => insert('vendors', { ...v, country: 'India', currency: 'INR', created_by: 'user-sa', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === PROJECTS ===
const projects = [
    { id: 'proj-1', name: 'Rapidflo v2 Development', code: 'PRJ-ERP2', status: 'active', priority: 'high', start_date: '2026-01-01', end_date: '2026-06-30', budget: 5000000, progress: 35, owner_id: 'user-admin', department_id: 'dept-1', methodology: 'agile', is_billable: 0 },
    { id: 'proj-2', name: 'FinServe Dashboard Project', code: 'PRJ-FSD', status: 'active', priority: 'high', start_date: '2026-01-15', end_date: '2026-03-31', budget: 3500000, progress: 60, owner_id: 'user-mgr1', account_id: 'acc-4', is_billable: 1, billing_rate: 5000 },
    { id: 'proj-3', name: 'Website Redesign', code: 'PRJ-WEB', status: 'planning', priority: 'medium', start_date: '2026-03-01', end_date: '2026-05-31', budget: 800000, progress: 0, owner_id: 'user-emp1', department_id: 'dept-2', is_billable: 0 },
];
projects.forEach(p => insert('projects', { ...p, created_by: 'user-sa', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// Tasks
const tasks = [
    { project_id: 'proj-1', title: 'Database Schema Design', status: 'done', priority: 'high', assignee_id: 'user-admin', estimated_hours: 40, actual_hours: 35, story_points: 8 },
    { project_id: 'proj-1', title: 'Backend API Development', status: 'in_progress', priority: 'high', assignee_id: 'user-emp1', estimated_hours: 120, actual_hours: 60, story_points: 21 },
    { project_id: 'proj-1', title: 'Frontend UI Implementation', status: 'todo', priority: 'high', assignee_id: 'user-emp1', estimated_hours: 160, story_points: 34 },
    { project_id: 'proj-1', title: 'Authentication & Authorization', status: 'done', priority: 'critical', assignee_id: 'user-admin', estimated_hours: 24, actual_hours: 20, story_points: 5 },
    { project_id: 'proj-1', title: 'Testing & QA', status: 'todo', priority: 'high', assignee_id: 'user-emp2', estimated_hours: 80, story_points: 13 },
    { project_id: 'proj-2', title: 'Dashboard Wireframes', status: 'done', priority: 'medium', assignee_id: 'user-mgr1', estimated_hours: 16, actual_hours: 12, story_points: 3 },
    { project_id: 'proj-2', title: 'Chart Components', status: 'in_progress', priority: 'high', assignee_id: 'user-emp1', estimated_hours: 40, actual_hours: 25, story_points: 8 },
    { project_id: 'proj-2', title: 'Data Integration', status: 'todo', priority: 'medium', assignee_id: 'user-emp2', estimated_hours: 32, story_points: 5 },
];
tasks.forEach(t => insert('tasks', { id: uuidv4(), ...t, actual_hours: t.actual_hours || 0, sort_order: 0, reporter_id: 'user-admin', created_by: 'user-sa', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

// === TICKETS ===
const sla = { id: 'sla-1', name: 'Standard SLA', priority: 'medium', first_response_hours: 4, resolution_hours: 24, escalation_hours: 8 };
insert('sla_policies', { ...sla, is_active: 1, business_hours_only: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
insert('sla_policies', { id: 'sla-2', name: 'Critical SLA', priority: 'critical', first_response_hours: 1, resolution_hours: 4, escalation_hours: 2, is_active: 1, business_hours_only: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

const tickets = [
    { ticket_number: 'TKT-001', subject: 'Login page not loading', status: 'open', priority: 'high', type: 'bug', category: 'Technical', account_id: 'acc-1', contact_id: 'cnt-1', assigned_to: 'user-emp1', sla_policy_id: 'sla-1' },
    { ticket_number: 'TKT-002', subject: 'Invoice format change request', status: 'in_progress', priority: 'medium', type: 'feature', category: 'Finance', account_id: 'acc-2', contact_id: 'cnt-3', assigned_to: 'user-emp3', sla_policy_id: 'sla-1', first_response_at: new Date().toISOString() },
    { ticket_number: 'TKT-003', subject: 'Dashboard data discrepancy', status: 'resolved', priority: 'critical', type: 'bug', category: 'Technical', account_id: 'acc-4', contact_id: 'cnt-5', assigned_to: 'user-admin', sla_policy_id: 'sla-2', resolved_at: new Date().toISOString(), csat_score: 5 },
    { ticket_number: 'TKT-004', subject: 'Need additional user licenses', status: 'open', priority: 'low', type: 'request', category: 'Account', account_id: 'acc-1', assigned_to: 'user-mgr1', sla_policy_id: 'sla-1' },
];
tickets.forEach(t => insert('tickets', { id: uuidv4(), ...t, channel: 'email', created_by: 'user-sa', created_at: new Date(Date.now() - Math.random() * 10 * 86400000).toISOString(), updated_at: new Date().toISOString() }));

// === KNOWLEDGE ARTICLES ===
insert('knowledge_articles', { id: uuidv4(), title: 'Getting Started with Rapidflo', content: '# Getting Started\n\nWelcome to Rapidflo! This guide will help you set up your account and begin using the system...\n\n## Login\nNavigate to the login page and enter your credentials.\n\n## Dashboard\nThe dashboard provides a real-time overview of all key metrics.\n\n## Modules\nExplore the modules in the sidebar to access CRM, Sales, Finance, and more.', category: 'Getting Started', status: 'published', views: 125, helpful_count: 89, author_id: 'user-admin', published_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
insert('knowledge_articles', { id: uuidv4(), title: 'Invoice Management Guide', content: '# Invoice Management\n\nLearn how to create, send, and track invoices in Rapidflo.\n\n## Creating Invoices\n1. Navigate to Finance > Invoices\n2. Click "New Invoice"\n3. Fill in customer and line item details\n\n## Payment Tracking\nPayments are automatically tracked and reconciled with invoices.', category: 'Finance', status: 'published', views: 67, helpful_count: 45, author_id: 'user-admin', published_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

// === NOTIFICATIONS ===
const notifs = [
    { user_id: 'user-sa', type: 'system', title: 'System Initialized', message: 'Rapidflo v2 has been seeded with demo data', module: 'admin', priority: 'normal' },
    { user_id: 'user-mgr1', type: 'deal', title: 'Deal Closed: FinServe Analytics', message: 'Opportunity worth ₹35L has been closed won', module: 'crm', priority: 'high' },
    { user_id: 'user-emp1', type: 'assignment', title: 'New Ticket Assigned', message: 'TKT-001: Login page not loading', module: 'support', priority: 'high' },
    { user_id: 'user-emp1', type: 'task', title: 'Task Due Tomorrow', message: 'Backend API Development is due soon', module: 'projects', priority: 'normal' },
    { user_id: 'user-admin', type: 'alert', title: 'Invoice Overdue', message: 'INV-2026-004 for TechVista is overdue', module: 'finance', priority: 'high' },
];
notifs.forEach(n => insert('notifications', { id: uuidv4(), ...n, is_read: 0, created_at: new Date().toISOString() }));

console.log('✅ Seed data created successfully!');
console.log('📧 Login Credentials:');
console.log('   Super Admin: superadmin@rapidflo.com / Admin@123');
console.log('   Admin: admin@rapidflo.com / Admin@123');
console.log('   Manager: sales.mgr@rapidflo.com / Admin@123');
console.log('   Employee: employee1@rapidflo.com / Admin@123');
console.log('   Viewer: viewer@rapidflo.com / Admin@123');

process.exit(0);
