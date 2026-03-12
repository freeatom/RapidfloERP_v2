const Database = require('better-sqlite3');
const db = new Database('rapiderp.db');
const logs = db.prepare(`SELECT * FROM platform_audit_logs WHERE module='profile' ORDER BY created_at DESC LIMIT 5`).all();
console.log("PLATFORM LOGS:", logs);

const fs = require('fs');
const companyDbs = fs.readdirSync('companies').filter(f => f.endsWith('.db'));
for (const cdb of companyDbs) {
    const db2 = new Database(`companies/${cdb}`);
    const logs2 = db2.prepare(`SELECT * FROM audit_logs WHERE module='profile' ORDER BY created_at DESC LIMIT 5`).all();
    console.log(`COMPANY LOGS (${cdb}):`, logs2);
}
