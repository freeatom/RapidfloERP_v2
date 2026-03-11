// Main Platform Database Schema
// This DB stores ONLY platform-level data: companies, superadmin, user directory, sessions
// All business data lives in per-company SQLite databases (see companyDbPool.js)

import Database from 'better-sqlite3';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createCompanyDb, getCompanyDb } from './companyDbPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initializeDatabase() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const companiesDir = path.join(dataDir, 'companies');
    if (!fs.existsSync(companiesDir)) fs.mkdirSync(companiesDir, { recursive: true });

    const dbPath = path.join(dataDir, 'rapiderp.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('temp_store = MEMORY');

    createMainTables(db);
    seedSuperAdmin(db);
    migrateExistingData(db);
    return db;
}

function createMainTables(db) {
    db.exec(`
    -- Company Registry
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
      logo_url TEXT, address TEXT, city TEXT, state TEXT, country TEXT DEFAULT 'India',
      phone TEXT, email TEXT, website TEXT, industry TEXT,
      gst_number TEXT, pan_number TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT
    );

    -- SuperAdmin users (platform-level, NOT company-bound)
    CREATE TABLE IF NOT EXISTS super_admins (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT, avatar_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_locked INTEGER NOT NULL DEFAULT 0, failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT, mfa_enabled INTEGER NOT NULL DEFAULT 0, mfa_secret TEXT,
      timezone TEXT DEFAULT 'Asia/Kolkata', locale TEXT DEFAULT 'en-IN',
      preferences TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- User directory for login routing: maps email → company_id
    CREATE TABLE IF NOT EXISTS user_directory (
      email TEXT NOT NULL, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      PRIMARY KEY(email, company_id)
    );

    -- Sessions (shared across all)
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, user_type TEXT DEFAULT 'company',
      company_id TEXT, token_hash TEXT NOT NULL, ip_address TEXT, user_agent TEXT,
      device_info TEXT, is_active INTEGER NOT NULL DEFAULT 1, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Platform audit logs
    CREATE TABLE IF NOT EXISTS platform_audit_logs (
      id TEXT PRIMARY KEY, user_id TEXT, user_email TEXT,
      action TEXT NOT NULL, module TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
      old_values TEXT, new_values TEXT, ip_address TEXT, user_agent TEXT,
      status TEXT DEFAULT 'success', error_message TEXT, duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- System settings (platform-wide)
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
      value_type TEXT DEFAULT 'string', description TEXT, is_sensitive INTEGER DEFAULT 0,
      updated_by TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, key)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);
    CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active);
    CREATE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins(email);
    CREATE INDEX IF NOT EXISTS idx_user_directory_email ON user_directory(email);
    CREATE INDEX IF NOT EXISTS idx_user_directory_company ON user_directory(company_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON platform_audit_logs(created_at);
  `);
}

function seedSuperAdmin(db) {
    const count = db.prepare('SELECT COUNT(*) as c FROM super_admins').get().c;
    if (count > 0) return;

    // Try to migrate from old users table
    try {
        const oldAdmin = db.prepare(`SELECT u.* FROM users u JOIN roles r ON r.id = u.role_id WHERE r.level <= 1 AND u.is_active = 1 LIMIT 1`).get();
        if (oldAdmin) {
            db.prepare(`INSERT INTO super_admins (id, email, password_hash, first_name, last_name, phone, avatar_url, is_active, timezone, locale, preferences, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?)`).run(
                oldAdmin.id, oldAdmin.email, oldAdmin.password_hash, oldAdmin.first_name, oldAdmin.last_name,
                oldAdmin.phone, oldAdmin.avatar_url, oldAdmin.timezone || 'Asia/Kolkata', oldAdmin.locale || 'en-IN',
                oldAdmin.preferences || '{}', oldAdmin.created_at, oldAdmin.updated_at
            );
            console.log(`✅ Migrated SuperAdmin from old DB: ${oldAdmin.email}`);
            return;
        }
    } catch (e) { /* old tables don't exist */ }

    // Create default super admin
    const hash = bcrypt.hashSync('Admin@123', 12);
    db.prepare(`INSERT INTO super_admins (id, email, password_hash, first_name, last_name, is_active)
        VALUES (?, 'admin@rapidflo.com', ?, 'Super', 'Admin', 1)`).run(crypto.randomUUID(), hash);
    console.log('✅ Default SuperAdmin created: admin@rapidflo.com / Admin@123');
}

function migrateExistingData(db) {
    // Ensure company DBs exist for all active companies
    try {
        const companies = db.prepare('SELECT * FROM companies WHERE is_active = 1').all();
        for (const company of companies) {
            const dbPath = path.join(__dirname, '..', 'data', 'companies', `company_${company.id}.db`);
            if (!fs.existsSync(dbPath)) {
                console.log(`📦 Creating company DB for: ${company.name}`);
                createCompanyDb(company.id);
            }
        }
    } catch (e) { /* no companies yet */ }

    // If no companies exist but old data does, create a default company and migrate
    try {
        const companyCount = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
        if (companyCount === 0) {
            // Check if old business tables exist with data
            const hasOldData = checkForOldData(db);
            if (hasOldData) {
                console.log('📦 Found old data, creating default company and migrating...');
                const companyId = crypto.randomUUID();
                db.prepare(`INSERT INTO companies (id, name, code, country, is_active, created_at, updated_at) VALUES (?, 'Rapidflo', 'RAPIDFLO', 'India', 1, datetime('now'), datetime('now'))`).run(companyId);

                // Create company DB and migrate business data
                createCompanyDb(companyId);
                migrateOldBusinessData(db, companyId);
                console.log('✅ Default company created and old data migrated');
            }
        }
    } catch (e) {
        console.log('⚠️ Migration check skipped:', e.message);
    }

    // Drop old business tables from main DB to avoid confusion
    dropOldBusinessTables(db);
}

function checkForOldData(db) {
    try {
        const r = db.prepare('SELECT COUNT(*) as c FROM leads').get();
        return r.c > 0;
    } catch { return false; }
}

function migrateOldBusinessData(db, companyId) {
    const companyDb = getCompanyDb(companyId);
    if (!companyDb) return;

    // List of old tables to migrate
    const TABLES_TO_MIGRATE = [
        'users', 'roles', 'permissions', 'role_permissions',
        'leads', 'contacts', 'accounts', 'opportunities', 'activities',
        'products', 'quotes', 'quote_items', 'sales_orders', 'order_items',
        'invoices', 'invoice_items', 'payment_records', 'expenses', 'gl_entries', 'tax_rules',
        'warehouses', 'stock_levels', 'stock_movements', 'purchase_orders', 'po_items',
        'vendors', 'vendor_contacts', 'procurement_requests',
        'departments', 'employees', 'attendance', 'leaves', 'payroll_records',
        'projects', 'tasks', 'milestones', 'time_entries',
        'tickets', 'ticket_comments', 'sla_policies', 'knowledge_articles',
        'workflows', 'workflow_logs',
        'notifications', 'audit_logs', 'documents', 'module_config'
    ];

    for (const table of TABLES_TO_MIGRATE) {
        try {
            const rows = db.prepare(`SELECT * FROM ${table}`).all();
            if (rows.length === 0) continue;

            // Get columns from company DB table
            const companyColumns = companyDb.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
            if (companyColumns.length === 0) continue;

            for (const row of rows) {
                // Filter row to only include columns that exist in the company DB table
                const cols = [];
                const vals = [];
                for (const col of companyColumns) {
                    if (col === 'company_id') continue; // Skip company_id
                    if (row[col] !== undefined) {
                        cols.push(col);
                        vals.push(row[col]);
                    }
                }
                if (cols.length === 0) continue;

                try {
                    companyDb.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
                } catch (insertErr) {
                    // Skip individual row errors (schema mismatch, etc.)
                }
            }

            // Add users to user_directory
            if (table === 'users') {
                for (const row of rows) {
                    if (row.email && row.id) {
                        try {
                            db.prepare('INSERT OR IGNORE INTO user_directory (email, company_id, user_id) VALUES (?,?,?)').run(row.email.toLowerCase(), companyId, row.id);
                        } catch { }
                    }
                }
            }

            console.log(`  ✅ Migrated ${rows.length} rows from ${table}`);
        } catch (e) {
            // Table doesn't exist in old DB, skip
        }
    }
}

function dropOldBusinessTables(db) {
    // Drop old business tables from main DB after migration
    // These should ONLY live in per-company DBs now
    const OLD_TABLES = [
        'leads', 'contacts', 'accounts', 'opportunities', 'activities',
        'products', 'quotes', 'quote_items', 'sales_orders', 'order_items',
        'invoices', 'invoice_items', 'payment_records', 'expenses', 'gl_entries', 'tax_rules',
        'price_rules', 'warehouses', 'stock_levels', 'stock_movements', 'purchase_orders', 'po_items',
        'vendors', 'vendor_contacts', 'procurement_requests',
        'departments', 'employees', 'attendance', 'leaves', 'payroll_records',
        'projects', 'tasks', 'milestones', 'time_entries',
        'tickets', 'ticket_comments', 'sla_policies', 'knowledge_articles',
        'workflows', 'workflow_logs',
        'notifications', 'audit_logs', 'documents', 'module_config',
        'users', 'roles', 'permissions', 'role_permissions', 'user_preferences',
        'price_rules'
    ];

    let dropped = 0;
    for (const table of OLD_TABLES) {
        try {
            db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
            dropped++;
        } catch (e) { /* foreign key or other constraint */ }
    }

    if (dropped > 0) {
        console.log(`🧹 Cleaned up ${dropped} old business tables from main DB`);
        db.pragma('wal_checkpoint(TRUNCATE)');
    }
}

export default { initializeDatabase };
