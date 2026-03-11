import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCompanyDb, getCompanyDb } from '../db/companyDbPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainDb = new Database(path.join(__dirname, '..', 'data', 'rapiderp.db'));

async function run() {
    const companyId = uuidv4();
    const companyName = 'Acme Corporation';
    const companyCode = 'acme_corp';

    // 1. Create company in main database
    mainDb.prepare(`INSERT INTO companies (id, name, code, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`).run(companyId, companyName, companyCode);
    
    // 2. Create isolated SQLite database for the company
    createCompanyDb(companyId);
    
    const companyDb = getCompanyDb(companyId);
    
    // 3. Get the admin role ID from the newly seeded company DB
    const adminRole = companyDb.prepare("SELECT id FROM roles WHERE name = 'admin'").get();
    
    // 4. Create an admin user for this company
    const userId = uuidv4();
    const email = 'admin@acmecorp.com';
    const password = 'Password@123';
    const hash = await bcrypt.hash(password, 12);
    
    companyDb.prepare(`INSERT INTO users (id, email, password_hash, first_name, last_name, role_id, is_active) VALUES (?, ?, ?, 'Acme', 'Admin', ?, 1)`).run(userId, email, hash, adminRole.id);
    
    // 5. Link user in main directory for login routing
    mainDb.prepare(`INSERT INTO user_directory (email, company_id, user_id) VALUES (?, ?, ?)`).run(email, companyId, userId);
    
    console.log('--- COMPANY CREATED SUCCESSFULLY ---');
    console.log('Company:', companyName);
    console.log('Code:', companyCode);
    console.log('------------------------------------');
    console.log('Admin Email:', email);
    console.log('Admin Password:', password);
    console.log('------------------------------------');
}

run().catch(console.error);
