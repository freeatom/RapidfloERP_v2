import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCompanyDb } from '../db/companyDbPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainDb = new Database(path.join(__dirname, '..', 'data', 'rapiderp.db'));

function seedCompanyData() {
    console.log('Seeding dummy data for isolation test...');
    
    // Get companies
    const companies = mainDb.prepare('SELECT id, name FROM companies').all();
    
    for (const company of companies) {
        console.log(`\nSeeding data for ${company.name}...`);
        const db = getCompanyDb(company.id);
        if (!db) {
            console.log(`Skipping ${company.name} - DB not found`);
            continue;
        }
        
        // Clear existing test leads
        db.prepare("DELETE FROM leads WHERE email LIKE '%@test.com'").run();
        
        let leadsToInsert = [];
        
        if (company.name.includes('Rapidflo')) {
            // Seed Rapidflo specific data
            leadsToInsert = [
                { first_name: 'Rahul', last_name: 'Sharma', email: 'rahul.s@test.com', company: 'Tech India', status: 'new', source: 'website' },
                { first_name: 'Priya', last_name: 'Patel', email: 'priya.p@test.com', company: 'Global Solutions', status: 'contacted', source: 'referral' },
                { first_name: 'Amit', last_name: 'Kumar', email: 'amit.k@test.com', company: 'Innovate Tech', status: 'qualified', source: 'trade_show' }
            ];
        } else if (company.name.includes('Acme')) {
            // Seed Acme specific data
            leadsToInsert = [
                { first_name: 'John', last_name: 'Doe', email: 'john.d@test.com', company: 'Wayne Enterprises', status: 'contacted', source: 'cold_call' },
                { first_name: 'Jane', last_name: 'Smith', email: 'jane.s@test.com', company: 'Stark Industries', status: 'qualified', source: 'website' }
            ];
        } else {
            // Generic data for any other company
            leadsToInsert = [
                { first_name: 'Test', last_name: 'User', email: `test.user.${Date.now()}@test.com`, company: 'Test Corp', status: 'new', source: 'other' }
            ];
        }
        
        const insertLead = db.prepare(`
            INSERT INTO leads (id, first_name, last_name, email, company, status, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);
        
        let count = 0;
        for (const lead of leadsToInsert) {
            insertLead.run(uuidv4(), lead.first_name, lead.last_name, lead.email, lead.company, lead.status, lead.source);
            count++;
        }
        
        console.log(`✅ Inserted ${count} distinct leads into ${company.name} database.`);
    }
    
    console.log('\nDone seeding!');
}

seedCompanyData();
