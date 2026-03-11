import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'rapiderp.db');

export function initializeDatabase() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');
    db.pragma('temp_store = MEMORY');

    createTables(db);
    createIndexes(db);
    return db;
}

function createTables(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, level INTEGER NOT NULL DEFAULT 5,
      is_system INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT, avatar_url TEXT,
      role_id TEXT NOT NULL REFERENCES roles(id), is_active INTEGER NOT NULL DEFAULT 1,
      is_locked INTEGER NOT NULL DEFAULT 0, failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT, password_changed_at TEXT, mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT, timezone TEXT DEFAULT 'Asia/Kolkata', locale TEXT DEFAULT 'en-IN',
      preferences TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY, module TEXT NOT NULL, action TEXT NOT NULL, description TEXT, UNIQUE(module, action)
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY, role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      field_restrictions TEXT DEFAULT '[]', record_filter TEXT, UNIQUE(role_id, permission_id)
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL, ip_address TEXT, user_agent TEXT, device_info TEXT,
      is_active INTEGER NOT NULL DEFAULT 1, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), user_email TEXT,
      action TEXT NOT NULL, module TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
      old_values TEXT, new_values TEXT, ip_address TEXT, user_agent TEXT, session_id TEXT,
      status TEXT DEFAULT 'success', error_message TEXT, duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
      value_type TEXT DEFAULT 'string', description TEXT, is_sensitive INTEGER DEFAULT 0,
      updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, key)
    );
    CREATE TABLE IF NOT EXISTS module_config (
      id TEXT PRIMARY KEY, module TEXT UNIQUE NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1,
      display_name TEXT NOT NULL, icon TEXT, sort_order INTEGER DEFAULT 0,
      config TEXT DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, title TEXT NOT NULL, message TEXT, module TEXT,
      resource_type TEXT, resource_id TEXT, action_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0, priority TEXT DEFAULT 'normal',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT, website TEXT, email TEXT, phone TEXT,
      address_line1 TEXT, address_line2 TEXT, city TEXT, state TEXT, country TEXT DEFAULT 'India',
      postal_code TEXT, annual_revenue REAL DEFAULT 0, employee_count INTEGER DEFAULT 0,
      type TEXT DEFAULT 'prospect', status TEXT DEFAULT 'active',
      owner_id TEXT REFERENCES users(id), parent_account_id TEXT REFERENCES accounts(id),
      tags TEXT DEFAULT '[]', notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT, phone TEXT, mobile TEXT,
      job_title TEXT, department TEXT, address TEXT, city TEXT, state TEXT,
      country TEXT DEFAULT 'India', linkedin_url TEXT, is_primary INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1, lead_source TEXT, tags TEXT DEFAULT '[]', notes TEXT,
      owner_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      email TEXT, phone TEXT, company TEXT, job_title TEXT,
      source TEXT DEFAULT 'manual', status TEXT DEFAULT 'new',
      score INTEGER DEFAULT 0, score_label TEXT DEFAULT 'cold',
      assigned_to TEXT REFERENCES users(id), converted_to_opportunity_id TEXT,
      converted_to_contact_id TEXT, converted_at TEXT,
      website TEXT, industry TEXT, annual_revenue REAL, employee_count INTEGER,
      address TEXT, city TEXT, state TEXT, country TEXT DEFAULT 'India',
      notes TEXT, tags TEXT DEFAULT '[]', last_activity_at TEXT, next_follow_up TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, account_id TEXT REFERENCES accounts(id),
      contact_id TEXT REFERENCES contacts(id), lead_id TEXT REFERENCES leads(id),
      stage TEXT DEFAULT 'prospecting', probability INTEGER DEFAULT 10,
      amount REAL DEFAULT 0, expected_close_date TEXT, actual_close_date TEXT,
      type TEXT DEFAULT 'new_business', source TEXT, description TEXT,
      next_step TEXT, competitor TEXT, loss_reason TEXT, win_reason TEXT,
      owner_id TEXT REFERENCES users(id), tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, subject TEXT NOT NULL,
      description TEXT, status TEXT DEFAULT 'planned', priority TEXT DEFAULT 'normal',
      due_date TEXT, completed_at TEXT, duration_minutes INTEGER,
      related_type TEXT, related_id TEXT,
      contact_id TEXT REFERENCES contacts(id), account_id TEXT REFERENCES accounts(id),
      lead_id TEXT REFERENCES leads(id), opportunity_id TEXT REFERENCES opportunities(id),
      assigned_to TEXT REFERENCES users(id), outcome TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE, description TEXT,
      category TEXT, type TEXT DEFAULT 'goods', unit TEXT DEFAULT 'piece',
      base_price REAL NOT NULL DEFAULT 0, cost_price REAL DEFAULT 0,
      tax_rate REAL DEFAULT 18, is_active INTEGER DEFAULT 1, is_stockable INTEGER DEFAULT 1,
      min_stock_level INTEGER DEFAULT 10, reorder_quantity INTEGER DEFAULT 50,
      weight REAL, dimensions TEXT, barcode TEXT, hsn_code TEXT, image_url TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS price_rules (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, product_id TEXT REFERENCES products(id),
      type TEXT NOT NULL, min_quantity INTEGER DEFAULT 1, max_quantity INTEGER,
      discount_type TEXT DEFAULT 'percentage', discount_value REAL DEFAULT 0,
      customer_type TEXT, account_id TEXT REFERENCES accounts(id),
      valid_from TEXT, valid_until TEXT, is_active INTEGER DEFAULT 1, priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY, quote_number TEXT UNIQUE NOT NULL,
      opportunity_id TEXT REFERENCES opportunities(id), account_id TEXT REFERENCES accounts(id),
      contact_id TEXT REFERENCES contacts(id), status TEXT DEFAULT 'draft',
      subtotal REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR', valid_until TEXT,
      terms_and_conditions TEXT, notes TEXT,
      approved_by TEXT REFERENCES users(id), approved_at TEXT, rejected_reason TEXT,
      owner_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS quote_items (
      id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id), description TEXT,
      quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0,
      discount_percent REAL DEFAULT 0, tax_rate REAL DEFAULT 18,
      tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0, sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sales_orders (
      id TEXT PRIMARY KEY, order_number TEXT UNIQUE NOT NULL,
      quote_id TEXT REFERENCES quotes(id), account_id TEXT REFERENCES accounts(id),
      contact_id TEXT REFERENCES contacts(id), status TEXT DEFAULT 'confirmed',
      subtotal REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR', payment_terms TEXT DEFAULT 'net30',
      delivery_date TEXT, shipping_address TEXT, billing_address TEXT, notes TEXT,
      fulfilled_at TEXT, owner_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id), description TEXT,
      quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0,
      discount_percent REAL DEFAULT 0, tax_rate REAL DEFAULT 18,
      tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0,
      delivered_quantity REAL DEFAULT 0, sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, invoice_number TEXT UNIQUE NOT NULL, type TEXT DEFAULT 'sales',
      sales_order_id TEXT REFERENCES sales_orders(id), account_id TEXT REFERENCES accounts(id),
      contact_id TEXT REFERENCES contacts(id), vendor_id TEXT,
      status TEXT DEFAULT 'draft', issue_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT, subtotal REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0, balance_due REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR', payment_terms TEXT DEFAULT 'net30',
      notes TEXT, terms_and_conditions TEXT,
      is_recurring INTEGER DEFAULT 0, recurrence_pattern TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id), description TEXT,
      quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0,
      discount_percent REAL DEFAULT 0, tax_rate REAL DEFAULT 18,
      tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0, sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, expense_number TEXT UNIQUE, category TEXT NOT NULL,
      description TEXT, amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR', expense_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT DEFAULT 'pending', payment_method TEXT, receipt_url TEXT,
      vendor_id TEXT, project_id TEXT, department TEXT, employee_id TEXT,
      approved_by TEXT REFERENCES users(id), approved_at TEXT,
      reimbursable INTEGER DEFAULT 0, notes TEXT, tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS gl_entries (
      id TEXT PRIMARY KEY, entry_number TEXT, date TEXT NOT NULL DEFAULT (date('now')),
      account_code TEXT NOT NULL, account_name TEXT NOT NULL, description TEXT,
      debit REAL DEFAULT 0, credit REAL DEFAULT 0,
      reference_type TEXT, reference_id TEXT, department TEXT, project_id TEXT,
      is_posted INTEGER DEFAULT 0, posted_by TEXT REFERENCES users(id), posted_at TEXT,
      fiscal_year TEXT, fiscal_period TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS tax_rules (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE, rate REAL NOT NULL,
      type TEXT DEFAULT 'GST', region TEXT, category TEXT,
      is_compound INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
      effective_from TEXT, effective_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payment_records (
      id TEXT PRIMARY KEY, payment_number TEXT UNIQUE, invoice_id TEXT REFERENCES invoices(id),
      amount REAL NOT NULL, payment_date TEXT NOT NULL DEFAULT (date('now')),
      payment_method TEXT DEFAULT 'bank_transfer', reference_number TEXT,
      bank_name TEXT, status TEXT DEFAULT 'completed', notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE, address TEXT,
      city TEXT, state TEXT, country TEXT DEFAULT 'India',
      manager_id TEXT REFERENCES users(id), is_active INTEGER DEFAULT 1,
      capacity TEXT, type TEXT DEFAULT 'main',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stock_levels (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
      warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
      quantity REAL NOT NULL DEFAULT 0, reserved_quantity REAL DEFAULT 0,
      available_quantity REAL DEFAULT 0, reorder_point INTEGER DEFAULT 10,
      max_stock_level INTEGER DEFAULT 1000, last_counted_at TEXT,
      unit_cost REAL DEFAULT 0, total_value REAL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_id, warehouse_id)
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
      warehouse_id TEXT REFERENCES warehouses(id), to_warehouse_id TEXT REFERENCES warehouses(id),
      type TEXT NOT NULL, quantity REAL NOT NULL, unit_cost REAL DEFAULT 0,
      reference_type TEXT, reference_id TEXT, batch_number TEXT, serial_number TEXT,
      reason TEXT, notes TEXT, movement_date TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY, po_number TEXT UNIQUE NOT NULL, vendor_id TEXT,
      warehouse_id TEXT REFERENCES warehouses(id), status TEXT DEFAULT 'draft',
      subtotal REAL DEFAULT 0, tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR', order_date TEXT NOT NULL DEFAULT (date('now')),
      expected_date TEXT, received_date TEXT, payment_terms TEXT DEFAULT 'net30',
      shipping_method TEXT, notes TEXT,
      approved_by TEXT REFERENCES users(id), approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS po_items (
      id TEXT PRIMARY KEY, po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id), description TEXT,
      quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0,
      tax_rate REAL DEFAULT 18, tax_amount REAL DEFAULT 0, total_amount REAL DEFAULT 0,
      received_quantity REAL DEFAULT 0, sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE, email TEXT, phone TEXT,
      website TEXT, address TEXT, city TEXT, state TEXT, country TEXT DEFAULT 'India',
      postal_code TEXT, tax_id TEXT, payment_terms TEXT DEFAULT 'net30',
      currency TEXT DEFAULT 'INR', rating INTEGER DEFAULT 3, status TEXT DEFAULT 'active',
      category TEXT, bank_name TEXT, bank_account TEXT, ifsc_code TEXT,
      notes TEXT, tags TEXT DEFAULT '[]',
      total_orders INTEGER DEFAULT 0, total_spend REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS vendor_contacts (
      id TEXT PRIMARY KEY, vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT, phone TEXT, designation TEXT,
      is_primary INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS procurement_requests (
      id TEXT PRIMARY KEY, request_number TEXT UNIQUE, title TEXT NOT NULL,
      description TEXT, department TEXT, requested_by TEXT REFERENCES users(id),
      status TEXT DEFAULT 'pending', priority TEXT DEFAULT 'normal',
      required_date TEXT, estimated_cost REAL DEFAULT 0, approved_cost REAL,
      approved_by TEXT REFERENCES users(id), approved_at TEXT, rejection_reason TEXT,
      vendor_id TEXT REFERENCES vendors(id), po_id TEXT REFERENCES purchase_orders(id),
      notes TEXT, items TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT UNIQUE,
      description TEXT, head_id TEXT REFERENCES users(id),
      parent_id TEXT REFERENCES departments(id), budget REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY, employee_id TEXT UNIQUE, user_id TEXT REFERENCES users(id),
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      phone TEXT, personal_email TEXT, date_of_birth TEXT, gender TEXT,
      marital_status TEXT, blood_group TEXT, nationality TEXT DEFAULT 'Indian',
      address TEXT, city TEXT, state TEXT, country TEXT DEFAULT 'India', postal_code TEXT,
      emergency_contact_name TEXT, emergency_contact_phone TEXT,
      department_id TEXT REFERENCES departments(id), designation TEXT,
      employment_type TEXT DEFAULT 'full-time', date_of_joining TEXT, date_of_leaving TEXT,
      reporting_manager_id TEXT REFERENCES employees(id),
      status TEXT DEFAULT 'active', base_salary REAL DEFAULT 0,
      bank_name TEXT, bank_account TEXT, ifsc_code TEXT,
      pan_number TEXT, aadhar_number TEXT, pf_number TEXT, esi_number TEXT,
      probation_end_date TEXT, confirmation_date TEXT, notice_period_days INTEGER DEFAULT 30,
      shift TEXT DEFAULT 'general', work_location TEXT DEFAULT 'office',
      skills TEXT DEFAULT '[]', qualifications TEXT DEFAULT '[]', notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL, clock_in TEXT, clock_out TEXT,
      status TEXT DEFAULT 'present', work_hours REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0, location TEXT, ip_address TEXT,
      notes TEXT, approved_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, date)
    );
    CREATE TABLE IF NOT EXISTS leaves (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
      leave_type TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      days REAL NOT NULL DEFAULT 1, reason TEXT, status TEXT DEFAULT 'pending',
      approved_by TEXT REFERENCES users(id), approved_at TEXT, rejection_reason TEXT,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payroll_records (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
      month TEXT NOT NULL, year INTEGER NOT NULL,
      basic_salary REAL DEFAULT 0, hra REAL DEFAULT 0, da REAL DEFAULT 0,
      special_allowance REAL DEFAULT 0, other_allowances REAL DEFAULT 0,
      gross_salary REAL DEFAULT 0, pf_deduction REAL DEFAULT 0,
      esi_deduction REAL DEFAULT 0, tax_deduction REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0, total_deductions REAL DEFAULT 0,
      net_salary REAL DEFAULT 0, overtime_pay REAL DEFAULT 0, bonus REAL DEFAULT 0,
      status TEXT DEFAULT 'draft', payment_date TEXT, payment_method TEXT DEFAULT 'bank_transfer',
      transaction_reference TEXT, approved_by TEXT REFERENCES users(id), notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, month, year)
    );
    CREATE TABLE IF NOT EXISTS benefits (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
      type TEXT NOT NULL, name TEXT NOT NULL, amount REAL DEFAULT 0,
      frequency TEXT DEFAULT 'monthly', start_date TEXT, end_date TEXT,
      status TEXT DEFAULT 'active', notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE, description TEXT,
      status TEXT DEFAULT 'planning', priority TEXT DEFAULT 'medium',
      start_date TEXT, end_date TEXT, actual_start_date TEXT, actual_end_date TEXT,
      budget REAL DEFAULT 0, actual_cost REAL DEFAULT 0, progress INTEGER DEFAULT 0,
      owner_id TEXT REFERENCES users(id), department_id TEXT REFERENCES departments(id),
      account_id TEXT REFERENCES accounts(id), methodology TEXT DEFAULT 'agile',
      is_billable INTEGER DEFAULT 1, billing_rate REAL DEFAULT 0,
      tags TEXT DEFAULT '[]', risks TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium', assignee_id TEXT REFERENCES users(id),
      reporter_id TEXT REFERENCES users(id), parent_task_id TEXT REFERENCES tasks(id),
      start_date TEXT, due_date TEXT, completed_at TEXT,
      estimated_hours REAL DEFAULT 0, actual_hours REAL DEFAULT 0,
      label TEXT, sprint TEXT, story_points INTEGER, sort_order INTEGER DEFAULT 0,
      attachments TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT, due_date TEXT, completed_at TEXT,
      status TEXT DEFAULT 'pending', owner_id TEXT REFERENCES users(id), deliverables TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL,
      hours REAL NOT NULL, description TEXT, is_billable INTEGER DEFAULT 1,
      billing_rate REAL DEFAULT 0, status TEXT DEFAULT 'pending',
      approved_by TEXT REFERENCES users(id), approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sla_policies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      priority TEXT NOT NULL, first_response_hours INTEGER NOT NULL DEFAULT 4,
      resolution_hours INTEGER NOT NULL DEFAULT 24, escalation_hours INTEGER DEFAULT 8,
      is_active INTEGER DEFAULT 1, business_hours_only INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, ticket_number TEXT UNIQUE NOT NULL, subject TEXT NOT NULL,
      description TEXT, status TEXT DEFAULT 'open', priority TEXT DEFAULT 'medium',
      type TEXT DEFAULT 'issue', category TEXT, channel TEXT DEFAULT 'email',
      account_id TEXT REFERENCES accounts(id), contact_id TEXT REFERENCES contacts(id),
      assigned_to TEXT REFERENCES users(id), sla_policy_id TEXT REFERENCES sla_policies(id),
      first_response_at TEXT, resolved_at TEXT, closed_at TEXT,
      sla_breach INTEGER DEFAULT 0, csat_score INTEGER, csat_comment TEXT,
      escalated INTEGER DEFAULT 0, escalated_to TEXT REFERENCES users(id), escalated_at TEXT,
      tags TEXT DEFAULT '[]', related_ticket_id TEXT REFERENCES tickets(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id), content TEXT NOT NULL,
      type TEXT DEFAULT 'reply', is_internal INTEGER DEFAULT 0,
      attachments TEXT DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
      category TEXT, tags TEXT DEFAULT '[]', status TEXT DEFAULT 'draft',
      views INTEGER DEFAULT 0, helpful_count INTEGER DEFAULT 0,
      not_helpful_count INTEGER DEFAULT 0, author_id TEXT REFERENCES users(id),
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      module TEXT NOT NULL, trigger_type TEXT NOT NULL,
      trigger_config TEXT DEFAULT '{}', conditions TEXT DEFAULT '[]',
      actions TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1,
      execution_count INTEGER DEFAULT 0, last_executed_at TEXT, version INTEGER DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS workflow_logs (
      id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id),
      trigger_data TEXT, conditions_met INTEGER DEFAULT 1,
      actions_executed TEXT DEFAULT '[]', status TEXT DEFAULT 'success',
      error_message TEXT, duration_ms INTEGER, executed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS approval_workflows (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, module TEXT NOT NULL,
      steps TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY, workflow_id TEXT REFERENCES approval_workflows(id),
      module TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
      requested_by TEXT NOT NULL REFERENCES users(id), current_step INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending', approvers TEXT DEFAULT '[]',
      approval_history TEXT DEFAULT '[]', notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function createIndexes(db) {
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
    CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opportunities_account ON opportunities(account_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
    CREATE INDEX IF NOT EXISTS idx_activities_due ON activities(due_date);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON sales_orders(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_gl_date ON gl_entries(date);
    CREATE INDEX IF NOT EXISTS idx_gl_account ON gl_entries(account_code);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payment_records(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_levels(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock_levels(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
    CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
    CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leaves(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll_records(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_records(month, year);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_time_project ON time_entries(project_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
    CREATE INDEX IF NOT EXISTS idx_kb_status ON knowledge_articles(status);
    CREATE INDEX IF NOT EXISTS idx_workflows_module ON workflows(module);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(is_read);

    -- Documents / Attachments
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      uploaded_by TEXT REFERENCES users(id),
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_docs_resource ON documents(resource_type, resource_id);
  `);
}

export default { initializeDatabase };
