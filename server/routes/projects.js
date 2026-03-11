import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission } from '../middleware/rbac.js';
import { auditLog, captureOldValues } from '../middleware/audit.js';
const router = Router();

// === PROJECTS ===
router.get('/', checkPermission('projects', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status, priority, owner_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(p.name LIKE ? OR p.code LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("p.status=?"); params.push(status); }
    if (priority) { where.push("p.priority=?"); params.push(priority); }
    if (owner_id) { where.push("p.owner_id=?"); params.push(owner_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM projects p WHERE ${where.join(' AND ')}`).get(...params);
    const projects = db.prepare(`SELECT p.*,u.first_name||' '||u.last_name as owner_name,d.name as department_name,(SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as task_count,(SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status='done') as completed_tasks FROM projects p LEFT JOIN users u ON u.id=p.owner_id LEFT JOIN departments d ON d.id=p.department_id WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const stats = {
        total: total.count,
        planning: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='planning'").get().c,
        active: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='active'").get().c,
        completed: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='completed'").get().c,
        totalBudget: db.prepare("SELECT COALESCE(SUM(budget),0) as t FROM projects WHERE status IN ('planning','active')").get().t
    };
    res.json({ projects, total: total.count, page: +page, limit: +limit, stats });
});


// === STATS (must be before /:id to avoid route conflict) ===
router.get('/stats', checkPermission('projects', 'view'), (req, res) => {
    const db = req.companyDb;
    const activeProjects = db.prepare("SELECT COUNT(*) as v FROM projects WHERE status IN ('planning','in_progress')").get().v;
    const overdue = db.prepare("SELECT COUNT(*) as v FROM projects WHERE end_date < date('now') AND status NOT IN ('completed','cancelled','on_hold')").get().v;
    const totalTasks = db.prepare("SELECT COUNT(*) as v FROM tasks").get().v;
    const completedTasks = db.prepare("SELECT COUNT(*) as v FROM tasks WHERE status='completed'").get().v;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const totalBudget = db.prepare("SELECT COALESCE(SUM(budget),0) as v FROM projects WHERE status NOT IN ('cancelled')").get().v;
    const actualSpend = db.prepare("SELECT COALESCE(SUM(actual_cost),0) as v FROM projects WHERE status NOT IN ('cancelled')").get().v;
    const budgetUtilization = totalBudget > 0 ? Math.round((actualSpend / totalBudget) * 100) : 0;
    res.json({ activeProjects, overdue, completionRate, totalTasks, completedTasks, budgetUtilization, totalBudget, actualSpend });
});

// === TIME ENTRIES (must be before /:id to avoid route conflict) ===
router.get('/time-entries', checkPermission('projects', 'view'), (req, res) => {
    const db = req.companyDb;
    const { project_id, user_id, from_date, to_date, status } = req.query;
    let where = ['1=1'], params = [];
    if (project_id) { where.push("te.project_id=?"); params.push(project_id); }
    if (user_id) { where.push("te.user_id=?"); params.push(user_id); }
    if (from_date) { where.push("te.date>=?"); params.push(from_date); }
    if (to_date) { where.push("te.date<=?"); params.push(to_date); }
    if (status) { where.push("te.status=?"); params.push(status); }
    const entries = db.prepare(`SELECT te.*,p.name as project_name,u.first_name||' '||u.last_name as user_name,t.title as task_name FROM time_entries te LEFT JOIN projects p ON p.id=te.project_id LEFT JOIN users u ON u.id=te.user_id LEFT JOIN tasks t ON t.id=te.task_id WHERE ${where.join(' AND ')} ORDER BY te.date DESC LIMIT 500`).all(...params);
    const summary = { totalHours: entries.reduce((s, e) => s + e.hours, 0), billableHours: entries.filter(e => e.is_billable).reduce((s, e) => s + e.hours, 0), totalRevenue: entries.filter(e => e.is_billable).reduce((s, e) => s + e.hours * e.billing_rate, 0) };
    res.json({ entries, summary });
});

router.post('/time-entries', checkPermission('projects', 'create'), auditLog('projects', 'LOG_TIME'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.project_id || !b.hours) return res.status(400).json({ error: 'Project and hours required' });
    const project = db.prepare('SELECT billing_rate FROM projects WHERE id=?').get(b.project_id);
    db.prepare(`INSERT INTO time_entries (id,task_id,project_id,user_id,date,hours,description,is_billable,billing_rate,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.task_id, b.project_id, b.user_id || req.user.id, b.date || new Date().toISOString().split('T')[0], b.hours, b.description, b.is_billable ?? 1, b.billing_rate || project?.billing_rate || 0, b.status || 'pending');
    // Update task actual_hours
    if (b.task_id) {
        const totalHours = db.prepare('SELECT COALESCE(SUM(hours),0) as t FROM time_entries WHERE task_id=?').get(b.task_id);
        db.prepare(`UPDATE tasks SET actual_hours=?,updated_at=datetime('now') WHERE id=?`).run(totalHours.t, b.task_id);
    }
    res.status(201).json(db.prepare('SELECT * FROM time_entries WHERE id=?').get(id));
});

// === GLOBAL TASKS LISTING (must be before /:id) ===
router.get('/tasks', checkPermission('projects', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status, priority, assignee_id, project_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(t.title LIKE ? OR p.name LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("t.status=?"); params.push(status); }
    if (priority) { where.push("t.priority=?"); params.push(priority); }
    if (assignee_id) { where.push("t.assignee_id=?"); params.push(assignee_id); }
    if (project_id) { where.push("t.project_id=?"); params.push(project_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE ${where.join(' AND ')}`).get(...params);
    const tasks = db.prepare(`SELECT t.*,p.name as project_name,u.first_name||' '||u.last_name as assignee_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE ${where.join(' AND ')} ORDER BY t.due_date ASC, t.created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ tasks, total: total.count, page: +page, limit: +limit });
});

// === GLOBAL MILESTONES LISTING (must be before /:id) ===
router.get('/milestones', checkPermission('projects', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, search, status, project_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'], params = [];
    if (search) { where.push("(m.name LIKE ? OR p.name LIKE ?)"); const s = `%${search}%`; params.push(s, s); }
    if (status) { where.push("m.status=?"); params.push(status); }
    if (project_id) { where.push("m.project_id=?"); params.push(project_id); }
    const total = db.prepare(`SELECT COUNT(*) as count FROM milestones m LEFT JOIN projects p ON p.id=m.project_id WHERE ${where.join(' AND ')}`).get(...params);
    const milestones = db.prepare(`SELECT m.*,p.name as project_name FROM milestones m LEFT JOIN projects p ON p.id=m.project_id WHERE ${where.join(' AND ')} ORDER BY m.due_date ASC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    res.json({ milestones, total: total.count, page: +page, limit: +limit });
});

router.get('/:id', checkPermission('projects', 'view'), (req, res) => {
    const db = req.companyDb;
    const project = db.prepare(`SELECT p.*,u.first_name||' '||u.last_name as owner_name FROM projects p LEFT JOIN users u ON u.id=p.owner_id WHERE p.id=?`).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    project.tasks = db.prepare(`SELECT t.*,u.first_name||' '||u.last_name as assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? ORDER BY t.sort_order,t.created_at`).all(req.params.id);
    project.milestones = db.prepare('SELECT * FROM milestones WHERE project_id=? ORDER BY due_date').all(req.params.id);
    project.members = db.prepare(`SELECT DISTINCT u.id,u.first_name||' '||u.last_name as name,u.email FROM users u INNER JOIN tasks t ON t.assignee_id=u.id WHERE t.project_id=?`).all(req.params.id);
    const timeAgg = db.prepare('SELECT COALESCE(SUM(hours),0) as total,COALESCE(SUM(CASE WHEN is_billable=1 THEN hours ELSE 0 END),0) as billable FROM time_entries WHERE project_id=?').get(req.params.id);
    project.totalHours = timeAgg.total;
    project.billableHours = timeAgg.billable;
    res.json(project);
});

router.post('/', checkPermission('projects', 'create'), auditLog('projects', 'CREATE_PROJECT'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Name required' });
    const code = b.code || `PRJ-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    db.prepare(`INSERT INTO projects (id,name,code,description,status,priority,start_date,end_date,budget,owner_id,department_id,account_id,methodology,is_billable,billing_rate,tags,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, code, b.description, b.status || 'planning', b.priority || 'medium', b.start_date, b.end_date, b.budget || 0, b.owner_id || req.user.id, b.department_id, b.account_id, b.methodology || 'agile', b.is_billable ?? 1, b.billing_rate || 0, JSON.stringify(b.tags || []), b.notes, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(id));
});

router.put('/:id', checkPermission('projects', 'edit'), captureOldValues('projects'), auditLog('projects', 'UPDATE_PROJECT'), (req, res) => {
    const db = req.companyDb;
    const fields = ['name', 'description', 'status', 'priority', 'start_date', 'end_date', 'actual_start_date', 'actual_end_date', 'budget', 'actual_cost', 'progress', 'owner_id', 'department_id', 'methodology', 'is_billable', 'billing_rate', 'notes'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.tags) { updates.push('tags=?'); values.push(JSON.stringify(req.body.tags)); }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE projects SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id));
});

router.delete('/:id', checkPermission('projects', 'delete'), auditLog('projects', 'DELETE_PROJECT'), (req, res) => {
    const db = req.companyDb;
    db.prepare('DELETE FROM time_entries WHERE project_id=?').run(req.params.id);
    db.prepare('DELETE FROM tasks WHERE project_id=?').run(req.params.id);
    db.prepare('DELETE FROM milestones WHERE project_id=?').run(req.params.id);
    db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === TASKS ===
router.get('/:projectId/tasks', checkPermission('projects', 'view'), (req, res) => {
    const db = req.companyDb;
    const { status, assignee_id, priority, sprint } = req.query;
    let where = ['t.project_id=?'], params = [req.params.projectId];
    if (status) { where.push("t.status=?"); params.push(status); }
    if (assignee_id) { where.push("t.assignee_id=?"); params.push(assignee_id); }
    if (priority) { where.push("t.priority=?"); params.push(priority); }
    if (sprint) { where.push("t.sprint=?"); params.push(sprint); }
    const tasks = db.prepare(`SELECT t.*,u.first_name||' '||u.last_name as assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE ${where.join(' AND ')} ORDER BY t.sort_order, t.created_at`).all(...params);
    // Kanban columns
    const kanban = { todo: tasks.filter(t => t.status === 'todo'), in_progress: tasks.filter(t => t.status === 'in_progress'), review: tasks.filter(t => t.status === 'review'), done: tasks.filter(t => t.status === 'done') };
    res.json({ tasks, kanban });
});

router.post('/:projectId/tasks', checkPermission('projects', 'create'), auditLog('projects', 'CREATE_TASK'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.title) return res.status(400).json({ error: 'Title required' });
    db.prepare(`INSERT INTO tasks (id,project_id,title,description,status,priority,assignee_id,reporter_id,parent_task_id,start_date,due_date,estimated_hours,label,sprint,story_points,sort_order,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, req.params.projectId, b.title, b.description, b.status || 'todo', b.priority || 'medium', b.assignee_id, b.reporter_id || req.user.id, b.parent_task_id, b.start_date, b.due_date, b.estimated_hours || 0, b.label, b.sprint, b.story_points, b.sort_order || 0, req.user.id);
    // Update project task count and re-calc progress
    const stats = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='done' THEN 1 END) as done FROM tasks WHERE project_id=?").get(req.params.projectId);
    if (stats.total > 0) db.prepare('UPDATE projects SET progress=?,updated_at=datetime(\'now\') WHERE id=?').run(Math.round(stats.done / stats.total * 100), req.params.projectId);
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
});

router.put('/tasks/:id', checkPermission('projects', 'edit'), auditLog('projects', 'UPDATE_TASK'), (req, res) => {
    const db = req.companyDb;
    const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const fields = ['title', 'description', 'status', 'priority', 'assignee_id', 'parent_task_id', 'start_date', 'due_date', 'estimated_hours', 'actual_hours', 'label', 'sprint', 'story_points', 'sort_order'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'done' && task.status !== 'done') updates.push("completed_at=datetime('now')");
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE tasks SET ${updates.join(',')} WHERE id=?`).run(...values);
    // Re-calc project progress
    const stats = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='done' THEN 1 END) as done FROM tasks WHERE project_id=?").get(task.project_id);
    if (stats.total > 0) db.prepare('UPDATE projects SET progress=?,updated_at=datetime(\'now\') WHERE id=?').run(Math.round(stats.done / stats.total * 100), task.project_id);
    res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id));
});

router.delete('/tasks/:id', checkPermission('projects', 'delete'), (req, res) => {
    const db = req.companyDb;
    const task = db.prepare('SELECT project_id FROM tasks WHERE id=?').get(req.params.id);
    db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
    if (task) {
        const stats = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='done' THEN 1 END) as done FROM tasks WHERE project_id=?").get(task.project_id);
        if (stats.total > 0) db.prepare('UPDATE projects SET progress=?,updated_at=datetime(\'now\') WHERE id=?').run(Math.round(stats.done / stats.total * 100), task.project_id);
    }
    res.json({ success: true });
});

// === MILESTONES ===
router.post('/:projectId/milestones', checkPermission('projects', 'create'), auditLog('projects', 'CREATE_MILESTONE'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    db.prepare(`INSERT INTO milestones (id,project_id,name,description,due_date,owner_id,deliverables,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, req.params.projectId, b.name, b.description, b.due_date, b.owner_id, b.deliverables);
    res.status(201).json(db.prepare('SELECT * FROM milestones WHERE id=?').get(id));
});

router.put('/milestones/:id', checkPermission('projects', 'edit'), auditLog('projects', 'UPDATE_MILESTONE'), (req, res) => {
    const db = req.companyDb;
    const fields = ['name', 'description', 'due_date', 'status', 'owner_id', 'deliverables'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.status === 'completed') updates.push("completed_at=datetime('now')");
    updates.push("updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE milestones SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM milestones WHERE id=?').get(req.params.id));
});

export default router;
