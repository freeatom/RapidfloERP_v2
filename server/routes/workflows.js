import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkPermission, requireRole } from '../middleware/rbac.js';
import { auditLog } from '../middleware/audit.js';
const router = Router();

// === WORKFLOW DEFINITIONS ===
router.get('/', checkPermission('admin', 'view'), (req, res) => {
    const db = req.companyDb;
    const { module, is_active } = req.query;
    let where = ['1=1'], params = [];
    if (module) { where.push("module=?"); params.push(module); }
    if (is_active !== undefined) { where.push("is_active=?"); params.push(+is_active); }
    const workflows = db.prepare(`SELECT w.*,u.first_name||' '||u.last_name as created_by_name FROM workflows w LEFT JOIN users u ON u.id=w.created_by WHERE ${where.join(' AND ')} ORDER BY w.name`).all(...params);
    res.json({ workflows });
});

router.get('/:id', checkPermission('admin', 'view'), (req, res) => {
    const db = req.companyDb;
    const workflow = db.prepare('SELECT * FROM workflows WHERE id=?').get(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Not found' });
    workflow.recentLogs = db.prepare('SELECT * FROM workflow_logs WHERE workflow_id=? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
    // Parse JSON fields
    try { workflow.trigger_config = JSON.parse(workflow.trigger_config); } catch (e) { }
    try { workflow.conditions = JSON.parse(workflow.conditions); } catch (e) { }
    try { workflow.actions = JSON.parse(workflow.actions); } catch (e) { }
    res.json(workflow);
});

router.post('/', requireRole('admin'), auditLog('admin', 'CREATE_WORKFLOW'), (req, res) => {
    const db = req.companyDb;
    const id = uuidv4(); const b = req.body;
    if (!b.name || !b.module || !b.trigger_type) return res.status(400).json({ error: 'Name, module, and trigger required' });
    db.prepare(`INSERT INTO workflows (id,name,description,module,trigger_type,trigger_config,conditions,actions,is_active,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(id, b.name, b.description, b.module, b.trigger_type, JSON.stringify(b.trigger_config || {}), JSON.stringify(b.conditions || []), JSON.stringify(b.actions || []), b.is_active ?? 1, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM workflows WHERE id=?').get(id));
});

router.put('/:id', requireRole('admin'), auditLog('admin', 'UPDATE_WORKFLOW'), (req, res) => {
    const db = req.companyDb;
    const fields = ['name', 'description', 'module', 'trigger_type', 'is_active'];
    const updates = [], values = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
    if (req.body.trigger_config) { updates.push('trigger_config=?'); values.push(JSON.stringify(req.body.trigger_config)); }
    if (req.body.conditions) { updates.push('conditions=?'); values.push(JSON.stringify(req.body.conditions)); }
    if (req.body.actions) { updates.push('actions=?'); values.push(JSON.stringify(req.body.actions)); }
    updates.push("version=version+1", "updated_at=datetime('now')"); values.push(req.params.id);
    db.prepare(`UPDATE workflows SET ${updates.join(',')} WHERE id=?`).run(...values);
    res.json(db.prepare('SELECT * FROM workflows WHERE id=?').get(req.params.id));
});

router.delete('/:id', requireRole('super_admin'), auditLog('admin', 'DELETE_WORKFLOW'), (req, res) => {
    req.companyDb.prepare('DELETE FROM workflows WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// === WORKFLOW ENGINE (Execution Core) ===
// This evaluates and executes workflows based on trigger events
router.post('/execute', checkPermission('admin', 'create'), (req, res) => {
    const db = req.companyDb;
    const { module, event, data } = req.body;
    if (!module || !event) return res.status(400).json({ error: 'Module and event required' });
    const startTime = Date.now();
    const workflows = db.prepare("SELECT * FROM workflows WHERE module=? AND trigger_type='event' AND is_active=1").all(module);
    const results = [];
    workflows.forEach(wf => {
        try {
            const triggerConfig = JSON.parse(wf.trigger_config || '{}');
            // Check if event matches
            if (triggerConfig.event !== event && triggerConfig.event !== '*') return;
            // Evaluate conditions
            const conditions = JSON.parse(wf.conditions || '[]');
            let conditionsMet = true;
            conditions.forEach(c => {
                const fieldValue = data?.[c.field];
                switch (c.operator) {
                    case 'equals': conditionsMet = conditionsMet && fieldValue == c.value; break;
                    case 'not_equals': conditionsMet = conditionsMet && fieldValue != c.value; break;
                    case 'contains': conditionsMet = conditionsMet && String(fieldValue).includes(c.value); break;
                    case 'greater_than': conditionsMet = conditionsMet && fieldValue > c.value; break;
                    case 'less_than': conditionsMet = conditionsMet && fieldValue < c.value; break;
                    case 'is_empty': conditionsMet = conditionsMet && (!fieldValue || fieldValue === ''); break;
                    case 'is_not_empty': conditionsMet = conditionsMet && fieldValue && fieldValue !== ''; break;
                }
            });
            if (!conditionsMet) {
                db.prepare(`INSERT INTO workflow_logs (id,workflow_id,trigger_data,conditions_met,status,duration_ms,executed_by,created_at) VALUES (?,?,?,0,'skipped',?,?,datetime('now'))`).run(uuidv4(), wf.id, JSON.stringify({ event, data }), Date.now() - startTime, req.user?.id);
                return;
            }
            // Execute actions
            const actions = JSON.parse(wf.actions || '[]');
            const executedActions = [];
            actions.forEach(action => {
                try {
                    switch (action.type) {
                        case 'update_field':
                            if (action.table && action.record_id && action.field) {
                                db.prepare(`UPDATE ${action.table} SET ${action.field}=?,updated_at=datetime('now') WHERE id=?`).run(action.value, action.record_id || data?.id);
                                executedActions.push({ type: action.type, status: 'success', field: action.field });
                            }
                            break;
                        case 'create_notification':
                            db.prepare(`INSERT INTO notifications (id,user_id,type,title,message,module,resource_type,resource_id,priority,created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`).run(uuidv4(), action.user_id || data?.assigned_to || data?.owner_id, action.notification_type || 'workflow', 'Workflow: ' + wf.name, action.message || `Triggered by ${event}`, module, action.resource_type, data?.id, action.priority || 'normal');
                            executedActions.push({ type: action.type, status: 'success' });
                            break;
                        case 'create_task':
                            db.prepare(`INSERT INTO tasks (id,project_id,title,description,status,priority,assignee_id,created_by,created_at,updated_at) VALUES (?,?,?,?,'todo',?,?,?,datetime('now'),datetime('now'))`).run(uuidv4(), action.project_id, action.title || `Auto-task from ${wf.name}`, action.description, action.priority || 'medium', action.assignee_id || data?.assigned_to, req.user?.id);
                            executedActions.push({ type: action.type, status: 'success' });
                            break;
                        case 'create_activity':
                            db.prepare(`INSERT INTO activities (id,type,subject,description,status,assigned_to,lead_id,opportunity_id,created_by,created_at,updated_at) VALUES (?,?,?,?,'planned',?,?,?,?,datetime('now'),datetime('now'))`).run(uuidv4(), action.activity_type || 'task', action.subject || `Follow-up: ${wf.name}`, action.description, action.assignee_id || data?.assigned_to, data?.lead_id, data?.opportunity_id, req.user?.id);
                            executedActions.push({ type: action.type, status: 'success' });
                            break;
                        case 'send_email':
                            // Email placeholder — would integrate with email service
                            executedActions.push({ type: action.type, status: 'queued', to: action.to });
                            break;
                        case 'webhook':
                            // Webhook placeholder — would make HTTP request
                            executedActions.push({ type: action.type, status: 'queued', url: action.url });
                            break;
                        default:
                            executedActions.push({ type: action.type, status: 'unknown_type' });
                    }
                } catch (e) {
                    executedActions.push({ type: action.type, status: 'error', error: e.message });
                }
            });
            // Log execution
            db.prepare(`INSERT INTO workflow_logs (id,workflow_id,trigger_data,conditions_met,actions_executed,status,duration_ms,executed_by,created_at) VALUES (?,?,?,1,?,'success',?,?,datetime('now'))`).run(uuidv4(), wf.id, JSON.stringify({ event, data }), JSON.stringify(executedActions), Date.now() - startTime, req.user?.id);
            db.prepare("UPDATE workflows SET execution_count=execution_count+1,last_executed_at=datetime('now') WHERE id=?").run(wf.id);
            results.push({ workflowId: wf.id, name: wf.name, status: 'executed', actions: executedActions });
        } catch (e) {
            db.prepare(`INSERT INTO workflow_logs (id,workflow_id,trigger_data,status,error_message,duration_ms,executed_by,created_at) VALUES (?,?,?,'error',?,?,?,datetime('now'))`).run(uuidv4(), wf.id, JSON.stringify({ event, data }), e.message, Date.now() - startTime, req.user?.id);
            results.push({ workflowId: wf.id, name: wf.name, status: 'error', error: e.message });
        }
    });
    res.json({ triggeredWorkflows: results.length, results });
});

// === WORKFLOW LOGS ===
router.get('/:id/logs', checkPermission('admin', 'view'), (req, res) => {
    const db = req.companyDb;
    const { page = 1, limit = 25, status } = req.query;
    const offset = (page - 1) * limit;
    let where = ['workflow_id=?'], params = [req.params.id];
    if (status) { where.push("status=?"); params.push(status); }
    const logs = db.prepare(`SELECT * FROM workflow_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, +limit, offset);
    const total = db.prepare(`SELECT COUNT(*) as count FROM workflow_logs WHERE ${where.join(' AND ')}`).get(...params);
    res.json({ logs, total: total.count });
});

// === WORKFLOW TEMPLATES ===
router.get('/templates/list', checkPermission('admin', 'view'), (req, res) => {
    const templates = [
        { id: 'lead_assignment', name: 'Auto Lead Assignment', module: 'crm', trigger_type: 'event', trigger_config: { event: 'CREATE_LEAD' }, conditions: [], actions: [{ type: 'create_notification', notification_type: 'assignment', message: 'New lead created and assigned' }] },
        { id: 'deal_won_notify', name: 'Deal Won Notification', module: 'crm', trigger_type: 'event', trigger_config: { event: 'UPDATE_OPP' }, conditions: [{ field: 'stage', operator: 'equals', value: 'closed_won' }], actions: [{ type: 'create_notification', priority: 'high', message: 'Deal won!' }] },
        { id: 'low_stock_alert', name: 'Low Stock Alert', module: 'inventory', trigger_type: 'event', trigger_config: { event: 'CREATE_MOVEMENT' }, conditions: [{ field: 'type', operator: 'equals', value: 'outbound' }], actions: [{ type: 'create_notification', notification_type: 'alert', priority: 'high', message: 'Stock level is low' }] },
        { id: 'invoice_overdue', name: 'Invoice Overdue Alert', module: 'finance', trigger_type: 'scheduled', trigger_config: { schedule: 'daily' }, conditions: [{ field: 'balance_due', operator: 'greater_than', value: 0 }], actions: [{ type: 'create_notification', priority: 'high', message: 'Invoice past due date' }] },
        { id: 'ticket_escalation', name: 'Auto Ticket Escalation', module: 'support', trigger_type: 'event', trigger_config: { event: 'UPDATE_TICKET' }, conditions: [{ field: 'priority', operator: 'equals', value: 'critical' }], actions: [{ type: 'create_notification', priority: 'high', message: 'Critical ticket needs attention' }, { type: 'create_activity', activity_type: 'task', subject: 'Urgent: Resolve critical ticket' }] },
        { id: 'new_employee_onboard', name: 'Employee Onboarding', module: 'hrms', trigger_type: 'event', trigger_config: { event: 'CREATE_EMPLOYEE' }, actions: [{ type: 'create_task', title: 'Complete onboarding for new employee', priority: 'high' }, { type: 'create_notification', message: 'New employee onboarding tasks created' }] },
        { id: 'expense_approval', name: 'Expense Auto-Route', module: 'finance', trigger_type: 'event', trigger_config: { event: 'CREATE_EXPENSE' }, conditions: [{ field: 'amount', operator: 'greater_than', value: 10000 }], actions: [{ type: 'create_notification', notification_type: 'approval', priority: 'high', message: 'High-value expense requires approval' }] },
        { id: 'project_deadline', name: 'Project Deadline Reminder', module: 'projects', trigger_type: 'scheduled', trigger_config: { schedule: 'daily' }, conditions: [], actions: [{ type: 'create_notification', message: 'Project deadline approaching' }] }
    ];
    res.json({ templates });
});

export default router;
