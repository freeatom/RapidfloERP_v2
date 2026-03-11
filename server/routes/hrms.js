import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog, captureOldValues } from '../middleware/audit.js';
const router = Router();

// === DEPARTMENTS ===
router.get('/departments', checkPermission('hrms', 'view'), (req, res) => {
    const db = req.app.get('db');
    const depts = db.prepare(`SELECT d.*,(SELECT COUNT(*) FROM employees WHERE department_id=d.id AND status='active') as headcount, u.first_name||' '||u.last_name as head_name FROM departments d LEFT JOIN users u ON u.id=d.head_id ORDER BY d.name`).all();
    res.json({ departments: depts });
});

router.post('/departments', checkPermission('hrms', 'create'), auditLog('hrms', 'CREATE_DEPT'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    db.prepare(`INSERT INTO departments (id,name,code,description,head_id,parent_id,budget,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.code, b.description, b.head_id, b.parent_id, b.budget || 0);
    res.status(201).json(db.prepare('SELECT * FROM departments WHERE id=?').get(id));
});

router.put('/departments/:id', checkPermission('hrms', 'edit'), auditLog('hrms', 'UPDATE_DEPT'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['name', 'code', 'description', 'head_id', 'parent_id', 'budget', 'is_active'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE departments SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM departments WHERE id=?').get(req.params.id));
});

// === EMPLOYEES ===
router.get('/employees', checkPermission('hrms', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { page = 1, limit = 25, search, department_id, status, employment_type } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.employee_id LIKE ?)"); const s = `%${search}%`; params.push(s, s, s, s); }
    if (department_id) { where.push("e.department_id=?"); params.push(department_id); }
    if (status) { where.push("e.status=?"); params.push(status); }
    if (employment_type) { where.push("e.employment_type=?"); params.push(employment_type); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM employees e WHERE ${where.join(' AND ')}`).get(...params);
    const employees = db.prepare(`SELECT e.*,d.name as department_name,m.first_name||' '||m.last_name as manager_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.reporting_manager_id WHERE ${where.join(' AND ')} ORDER BY e.first_name LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const stats = { total: total.count, active: db.prepare("SELECT COUNT(*) as c FROM employees WHERE status='active'").get().c, departments: db.prepare("SELECT COUNT(DISTINCT department_id) as c FROM employees WHERE status='active'").get().c };
    res.json({ employees, total: total.count, page: +page, limit: +limit, stats });
});

router.get('/employees/:id', checkPermission('hrms', 'view'), (req, res) => {
    const db = req.app.get('db');
    const emp = db.prepare('SELECT e.*,d.name as department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=?').get(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Not found' });
    emp.attendance = db.prepare('SELECT * FROM attendance WHERE employee_id=? ORDER BY date DESC LIMIT 30').all(req.params.id);
    emp.leaves = db.prepare('SELECT * FROM leaves WHERE employee_id=? ORDER BY created_at DESC').all(req.params.id);
    emp.payroll = db.prepare('SELECT * FROM payroll_records WHERE employee_id=? ORDER BY year DESC, month DESC').all(req.params.id);
    res.json(emp);
});

router.post('/employees', checkPermission('hrms', 'create'), auditLog('hrms', 'CREATE_EMPLOYEE'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.first_name || !b.last_name || !b.email) return res.status(400).json({ error: 'Name and email required' });
    const empId = b.employee_id || `EMP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    db.prepare(`INSERT INTO employees (id,employee_id,user_id,first_name,last_name,email,phone,personal_email,date_of_birth,gender,marital_status,nationality,address,city,state,country,postal_code,emergency_contact_name,emergency_contact_phone,department_id,designation,employment_type,date_of_joining,reporting_manager_id,status,base_salary,bank_name,bank_account,ifsc_code,pan_number,aadhar_number,pf_number,shift,work_location,skills,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, empId, b.user_id, b.first_name, b.last_name, b.email, b.phone, b.personal_email, b.date_of_birth, b.gender, b.marital_status, b.nationality || 'Indian', b.address, b.city, b.state, b.country || 'India', b.postal_code, b.emergency_contact_name, b.emergency_contact_phone, b.department_id, b.designation, b.employment_type || 'full-time', b.date_of_joining || new Date().toISOString().split('T')[0], b.reporting_manager_id, b.status || 'active', b.base_salary || 0, b.bank_name, b.bank_account, b.ifsc_code, b.pan_number, b.aadhar_number, b.pf_number, b.shift || 'general', b.work_location || 'office', JSON.stringify(b.skills || []), b.notes, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM employees WHERE id=?').get(id));
});

router.put('/employees/:id', checkPermission('hrms', 'edit'), captureOldValues('employees'), auditLog('hrms', 'UPDATE_EMPLOYEE'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['first_name', 'last_name', 'email', 'phone', 'personal_email', 'date_of_birth', 'gender', 'marital_status', 'address', 'city', 'state', 'country', 'postal_code', 'emergency_contact_name', 'emergency_contact_phone', 'department_id', 'designation', 'employment_type', 'date_of_joining', 'date_of_leaving', 'reporting_manager_id', 'status', 'base_salary', 'bank_name', 'bank_account', 'ifsc_code', 'pan_number', 'shift', 'work_location', 'notes'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE employees SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id));
});

router.delete('/employees/:id', checkPermission('hrms', 'delete'), auditLog('hrms', 'DELETE_EMPLOYEE'), (req, res) => {
    req.app.get('db').prepare("UPDATE employees SET status='terminated',date_of_leaving=date('now'),updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ success: true });
});

// === ATTENDANCE ===
router.get('/attendance', checkPermission('hrms', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { employee_id, date, month } = req.query;
    let where = ['1=1'], params = [];
    if (employee_id) { where.push("a.employee_id=?"); params.push(employee_id); }
    if (date) { where.push("a.date=?"); params.push(date); }
    if (month) { where.push("strftime('%Y-%m',a.date)=?"); params.push(month); }
    const records = db.prepare(`SELECT a.*,e.first_name||' '||e.last_name as employee_name FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE ${where.join(' AND ')} ORDER BY a.date DESC LIMIT 500`).all(...params);
    res.json({ attendance: records });
});

router.post('/attendance', checkPermission('hrms', 'create'), auditLog('hrms', 'RECORD_ATTENDANCE'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.employee_id) return res.status(400).json({ error: 'Employee required' });
    const workHours = b.clock_in && b.clock_out ? ((new Date('2000-01-01T' + b.clock_out) - new Date('2000-01-01T' + b.clock_in)) / 3600000) : b.work_hours || 0;
    db.prepare(`INSERT OR REPLACE INTO attendance (id,employee_id,date,clock_in,clock_out,status,work_hours,overtime_hours,location,ip_address,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(id, b.employee_id, b.date || new Date().toISOString().split('T')[0], b.clock_in, b.clock_out, b.status || 'present', workHours, b.overtime_hours || Math.max(0, workHours - 8), b.location, req.ip, b.notes);
    res.status(201).json(db.prepare('SELECT * FROM attendance WHERE id=?').get(id));
});

// === LEAVES ===
router.get('/leaves', checkPermission('hrms', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { employee_id, status } = req.query;
    let where = ['1=1'], params = [];
    if (employee_id) { where.push("l.employee_id=?"); params.push(employee_id); }
    if (status) { where.push("l.status=?"); params.push(status); }
    const leaves = db.prepare(`SELECT l.*,e.first_name||' '||e.last_name as employee_name FROM leaves l JOIN employees e ON e.id=l.employee_id WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 200`).all(...params);
    res.json({ leaves });
});

router.post('/leaves', checkPermission('hrms', 'create'), auditLog('hrms', 'CREATE_LEAVE'), (req, res) => {
    const db = req.app.get('db');
    const id = uuidv4(); const b = req.body;
    if (!b.employee_id || !b.leave_type || !b.start_date || !b.end_date) return res.status(400).json({ error: 'Employee, type, dates required' });
    const days = b.days || Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / 86400000) + 1;
    db.prepare(`INSERT INTO leaves (id,employee_id,leave_type,start_date,end_date,days,reason,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.employee_id, b.leave_type, b.start_date, b.end_date, days, b.reason, b.status || 'pending');
    res.status(201).json(db.prepare('SELECT * FROM leaves WHERE id=?').get(id));
});

router.put('/leaves/:id', checkPermission('hrms', 'edit'), auditLog('hrms', 'UPDATE_LEAVE'), (req, res) => {
    const db = req.app.get('db');
    const updates = [], values = [];
    if (req.body.status) { updates.push("status=?"); values.push(req.body.status); }
    if (req.body.status === 'approved') { updates.push("approved_by=?", "approved_at=datetime('now')"); values.push(req.user.id); }
    if (req.body.status === 'rejected') { updates.push("rejection_reason=?"); values.push(req.body.rejection_reason || ''); }
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE leaves SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id));
});

// === PAYROLL ===
router.get('/payroll', checkPermission('hrms', 'view'), (req, res) => {
    const db = req.app.get('db');
    const { month, year, employee_id } = req.query;
    let where = ['1=1'], params = [];
    if (month) { where.push("pr.month=?"); params.push(month); }
    if (year) { where.push("pr.year=?"); params.push(+year); }
    if (employee_id) { where.push("pr.employee_id=?"); params.push(employee_id); }
    const records = db.prepare(`SELECT pr.*,e.first_name||' '||e.last_name as employee_name,e.employee_id as emp_code,d.name as department_name FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE ${where.join(' AND ')} ORDER BY e.first_name`).all(...params);
    const summary = { totalGross: records.reduce((s, r) => s + r.gross_salary, 0), totalDeductions: records.reduce((s, r) => s + r.total_deductions, 0), totalNet: records.reduce((s, r) => s + r.net_salary, 0), count: records.length };
    res.json({ payroll: records, summary });
});

router.post('/payroll/generate', checkPermission('hrms', 'create'), auditLog('hrms', 'GENERATE_PAYROLL'), (req, res) => {
    const db = req.app.get('db');
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'Month and year required' });
    const employees = db.prepare("SELECT * FROM employees WHERE status='active'").all();
    const results = [];
    employees.forEach(emp => {
        const existing = db.prepare('SELECT id FROM payroll_records WHERE employee_id=? AND month=? AND year=?').get(emp.id, month, +year);
        if (existing) return;
        const id = uuidv4();
        const basic = emp.base_salary * 0.5;
        const hra = emp.base_salary * 0.2;
        const da = emp.base_salary * 0.1;
        const special = emp.base_salary * 0.2;
        const gross = emp.base_salary;
        const pf = basic * 0.12;
        const esi = gross > 21000 ? 0 : gross * 0.0075;
        const tax = gross > 50000 ? (gross - 50000) * 0.1 : 0;
        const totalDed = pf + esi + tax;
        const net = gross - totalDed;
        db.prepare(`INSERT INTO payroll_records (id,employee_id,month,year,basic_salary,hra,da,special_allowance,gross_salary,pf_deduction,esi_deduction,tax_deduction,total_deductions,net_salary,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, emp.id, month, +year, basic, hra, da, special, gross, pf, esi, tax, totalDed, net, 'draft');
        results.push(id);
    });
    res.json({ success: true, generated: results.length });
});

router.put('/payroll/:id', checkPermission('hrms', 'edit'), auditLog('hrms', 'UPDATE_PAYROLL'), (req, res) => {
    const db = req.app.get('db');
    const fields = ['status', 'bonus', 'other_deductions', 'other_allowances', 'notes', 'payment_date', 'payment_method', 'transaction_reference'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'approved') { updates.push("approved_by=?"); values.push(req.user.id); }
    // If paid, create expense entry
    if (req.body.status === 'paid') {
        const pr = db.prepare('SELECT * FROM payroll_records WHERE id=?').get(req.params.id);
        if (pr) {
            db.prepare(`INSERT INTO expenses (id,expense_number,category,description,amount,total_amount,expense_date,status,department,employee_id,created_by,created_at,updated_at) VALUES (?,'SAL-'||?,'salary','Salary payment',?,?,date('now'),'approved','HR',?,?,datetime('now'),datetime('now'))`).run(uuidv4(), Date.now().toString(36), pr.net_salary, pr.net_salary, pr.employee_id, req.user.id);
            db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,department,created_by,created_at) VALUES (?,date('now'),'6100','Salary Expense','Payroll',?,0,'payroll',?,'HR',?,datetime('now'))`).run(uuidv4(), pr.gross_salary, req.params.id, req.user.id);
            db.prepare(`INSERT INTO gl_entries (id,date,account_code,account_name,description,debit,credit,reference_type,reference_id,created_by,created_at) VALUES (?,date('now'),'1000','Cash/Bank','Salary payment',0,?,'payroll',?,?,datetime('now'))`).run(uuidv4(), pr.net_salary, req.params.id, req.user.id);
        }
    }
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE payroll_records SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM payroll_records WHERE id=?').get(req.params.id));
});

// === STATS ===
router.get('/stats', checkPermission('hrms', 'view'), (req, res) => {
    const db = req.app.get('db');
    const totalEmployees = db.prepare("SELECT COUNT(*) as v FROM employees").get().v;
    const activeEmployees = db.prepare("SELECT COUNT(*) as v FROM employees WHERE status='active'").get().v;
    const departments = db.prepare("SELECT COUNT(*) as v FROM departments WHERE is_active=1").get().v;
    const avgSalary = db.prepare("SELECT COALESCE(AVG(base_salary),0) as v FROM employees WHERE status='active'").get().v;
    const pendingLeaves = db.prepare("SELECT COUNT(*) as v FROM leaves WHERE status='pending'").get().v;
    const todayPresent = db.prepare("SELECT COUNT(*) as v FROM attendance WHERE date=date('now') AND status='present'").get().v;
    const attendanceRate = activeEmployees > 0 ? Math.round((todayPresent / activeEmployees) * 100) : 0;
    res.json({ totalEmployees, activeEmployees, departments, avgSalary: Math.round(avgSalary), pendingLeaves, attendanceRate });
});

export default router;
