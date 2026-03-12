const Database = require('better-sqlite3');
const fs = require('fs');

const dbFiles = fs.readdirSync('.').filter(f => f.startsWith('database_company_') && f.endsWith('.sqlite'));
if (dbFiles.length > 0) {
    const db = new Database(dbFiles[0]);
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    console.log("DB USER:", user);
} else {
    console.log("No company DB found");
}
