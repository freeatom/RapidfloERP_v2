import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainDb = new Database(path.join(__dirname, '..', 'data', 'rapiderp.db'));

async function run() {
    const adminId = uuidv4();
    const email = 'superadmin2@rapidflo.com';
    const password = 'SuperPassword@123';
    
    // Hash password (12 rounds as per schema.js)
    const hash = await bcrypt.hash(password, 12);
    
    // Insert into super_admins table in the MAIN database
    mainDb.prepare(`
        INSERT INTO super_admins (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 'Second', 'SuperAdmin', 1, datetime('now'), datetime('now'))
    `).run(adminId, email, hash);
    
    console.log('--- NEW SUPERADMIN CREATED ---');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('------------------------------');
}

run().catch(console.error);
