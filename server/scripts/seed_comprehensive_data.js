import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPANIES_DIR = path.join(__dirname, '..', 'data', 'companies');

function getCompanyDb(companyId) {
    const dbPath = path.join(COMPANIES_DIR, `company_${companyId}.db`);
    if (!fs.existsSync(dbPath)) return null;
    const db = new Database(dbPath);
    return db;
}

const mainDb = new Database(path.join(__dirname, '..', 'data', 'rapiderp.db'));

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

const firstNames = ['Amit', 'Priya', 'Rahul', 'Neha', 'Vikram', 'Anjali', 'Rohan', 'Sneha', 'Arjun', 'Kiara', 'John', 'Sarah', 'Michael', 'Emma', 'David'];
const lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Verma', 'Reddy', 'Rao', 'Das', 'Jain', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];
const companiesList = ['TechCorp', 'Global Solutions', 'Innovatech', 'NextGen Systems', 'Apex Industries', 'Summit Partners', 'Pioneer Group', 'Horizon Ltd'];
const industries = ['Technology', 'Manufacturing', 'Finance', 'Healthcare', 'Retail', 'Logistics'];
const productNames = ['Enterprise License', 'Cloud Storage 1TB', 'Consulting Hours', 'Hardware Server X1', 'Support Package', 'Implementation Fee'];

function seedComprehensiveData() {
    console.log('--- STARTING COMPREHENSIVE SEED ---');
    
    const companies = mainDb.prepare('SELECT id, name FROM companies WHERE is_active = 1').all();
    
    for (const company of companies) {
        console.log(`\n▶ Seeding database for: ${company.name}`);
        const db = getCompanyDb(company.id);
        if (!db) {
            console.log(`  Skipping - DB file not found.`);
            continue;
        }

        try {
            db.exec('BEGIN TRANSACTION');

            // 1. Get existing default user to use as creator/owner
            const existingUsers = db.prepare("SELECT id FROM users LIMIT 10").all();
            const creatorId = existingUsers.length > 0 ? existingUsers[0].id : null;
            
            // Randomly select actual user ids for assignees (not employee ids!)
            const userIds = existingUsers.map(u => u.id);

            // 2. Clear old test data to prevent bloat
            db.prepare("DELETE FROM employees").run();
            db.prepare("DELETE FROM accounts").run();
            db.prepare("DELETE FROM contacts").run();
            db.prepare("DELETE FROM opportunities").run();
            db.prepare("DELETE FROM products").run();
            db.prepare("DELETE FROM sales_orders").run();
            db.prepare("DELETE FROM invoices").run();
            db.prepare("DELETE FROM projects").run();
            db.prepare("DELETE FROM tasks").run();

            // 3. Departments & Employees
            console.log('  Seeding HRMS (Departments & Employees)...');
            const dpts = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
            const deptIds = [];
            
            for (const d of dpts) {
                const id = uuidv4();
                deptIds.push(id);
                try {
                    db.prepare("INSERT INTO departments (id, name, code, is_active) VALUES (?, ?, ?, 1)").run(id, d, d.substring(0, 3).toUpperCase());
                } catch(e) {} // ignore if exists
            }

            const empIds = [];
            for (let i = 0; i < 15; i++) {
                const id = uuidv4();
                empIds.push(id);
                const fname = firstNames[randInt(0, firstNames.length - 1)];
                const lname = lastNames[randInt(0, lastNames.length - 1)];
                db.prepare(`
                    INSERT INTO employees (id, employee_id, first_name, last_name, email, department_id, designation, base_salary, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
                `).run(
                    id, `EMP-${1000 + i}`, fname, lname, `${fname.toLowerCase()}.${lname.toLowerCase()}${i}@rapidflo.internal`,
                    deptIds[randInt(0, deptIds.length - 1)], 'Specialist', randInt(40000, 150000)
                );
            }

            // 4. Products
            console.log('  Seeding Inventory (Products)...');
            const productIds = [];
            for (let i = 0; i < productNames.length; i++) {
                const id = uuidv4();
                productIds.push(id);
                db.prepare(`
                    INSERT INTO products (id, name, sku, category, base_price, cost_price, is_active, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                `).run(
                    id, productNames[i], `SKU-${100+i}`, 'Software', randInt(500, 5000), randInt(100, 1000), creatorId
                );
            }

            // 5. CRM (Accounts, Contacts, Opportunities)
            console.log('  Seeding CRM (Accounts & Opportunities)...');
            const accountIds = [];
            for (let i = 0; i < 20; i++) {
                const id = uuidv4();
                accountIds.push(id);
                const cname = companiesList[randInt(0, companiesList.length - 1)] + ' ' + ['Inc.', 'LLC', 'Corp', 'Group'][randInt(0,3)];
                db.prepare(`
                    INSERT INTO accounts (id, name, industry, type, status, annual_revenue, employee_count, owner_id)
                    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
                `).run(
                    id, cname, industries[randInt(0, industries.length - 1)], ['customer', 'prospect', 'partner'][randInt(0,2)],
                    randInt(100000, 10000000), randInt(10, 500), creatorId
                );

                // Add 1-3 contacts per account
                for (let j = 0; j < randInt(1, 3); j++) {
                    const fname = firstNames[randInt(0, firstNames.length - 1)];
                    const lname = lastNames[randInt(0, lastNames.length - 1)];
                    db.prepare(`
                        INSERT INTO contacts (id, account_id, first_name, last_name, email, job_title, owner_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(), id, fname, lname, `${fname.toLowerCase()}@${cname.replace(/[^a-z]/ig, '').toLowerCase()}.com`, 
                        ['Manager', 'Director', 'VP', 'Executive'][randInt(0,3)], creatorId
                    );
                }

                // Add 1-2 opportunities per account
                const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
                for (let j = 0; j < randInt(1, 2); j++) {
                    db.prepare(`
                        INSERT INTO opportunities (id, name, account_id, stage, amount, probability, expected_close_date, owner_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(), `${cname} - Q${randInt(1,4)} Deal`, id, stages[randInt(0, stages.length - 1)],
                        randInt(5000, 150000), randInt(10, 100), randomDate(new Date(), new Date(2025, 12, 31)), creatorId
                    );
                }
            }

            // 6. Sales & Finance (Orders & Invoices)
            console.log('  Seeding Sales & Finance (Orders & Invoices)...');
            for (let i = 0; i < 10; i++) {
                const orderId = uuidv4();
                const accId = accountIds[randInt(0, accountIds.length - 1)];
                const amt = randInt(1000, 50000);
                
                db.prepare(`
                    INSERT INTO sales_orders (id, order_number, account_id, status, subtotal, total_amount, owner_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    orderId, `SO-${1000+i}`, accId, ['confirmed', 'shipped', 'delivered'][randInt(0,2)], amt, amt * 1.18, creatorId
                );

                const invoiceId = uuidv4();
                db.prepare(`
                    INSERT INTO invoices (id, invoice_number, sales_order_id, account_id, status, subtotal, total_amount, balance_due, issue_date, due_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    invoiceId, `INV-${1000+i}`, orderId, accId, ['draft', 'sent', 'paid', 'overdue'][randInt(0,3)], 
                    amt, amt * 1.18, amt * 1.18, randomDate(new Date(2024, 0, 1), new Date()), randomDate(new Date(), new Date(2025, 12, 31))
                );
            }

            // 7. Projects
            console.log('  Seeding Projects & Tasks...');
            const pStatus = ['planning', 'active', 'on_hold', 'completed'];
            for (let i = 0; i < 5; i++) {
                const projId = uuidv4();
                db.prepare(`
                    INSERT INTO projects (id, name, code, status, budget, progress, owner_id, department_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    projId, `${companiesList[i]} Implementation`, `PRJ-${100+i}`, pStatus[randInt(0, 3)], 
                    randInt(10000, 100000), randInt(0, 100), creatorId, deptIds[0]
                );

                // Add 5 tasks per project
                for (let j = 0; j < 5; j++) {
                    const assignee = userIds.length > 0 ? userIds[randInt(0, userIds.length - 1)] : null;
                    db.prepare(`
                        INSERT INTO tasks (id, project_id, title, status, priority, assignee_id)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(), projId, `Phase ${j+1} - Deliverable`, ['todo', 'in_progress', 'review', 'done'][randInt(0,3)],
                        ['low', 'medium', 'high'][randInt(0,2)], assignee
                    );
                }
            }

            db.exec('COMMIT');
            console.log(`✅ ${company.name} successfully seeded with rich randomized data!`);

        } catch (err) {
            db.exec('ROLLBACK');
            console.error(`❌ Error seeding ${company.name}:`, err.message);
        } finally {
            db.close();
        }
    }
    
    console.log('\n--- SEEDING COMPLETE ---');
}

seedComprehensiveData();
