import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Play, Pause, Trash2, Eye, Zap, ArrowRight, Clock, CheckCircle, XCircle, AlertTriangle, ChevronRight, Copy, ToggleLeft, ToggleRight, RefreshCw, Filter, Settings, Bell, FileText, Users, Package, ShoppingCart, LifeBuoy, FolderKanban, DollarSign } from 'lucide-react';

const MODULE_ICONS = { crm: Users, finance: DollarSign, inventory: Package, hrms: Users, support: LifeBuoy, projects: FolderKanban, sales: ShoppingCart };
const MODULE_COLORS = { crm: '#6366f1', finance: '#10b981', inventory: '#f59e0b', hrms: '#ec4899', support: '#06b6d4', projects: '#8b5cf6', sales: '#ef4444' };
const MODULES = ['crm', 'finance', 'inventory', 'hrms', 'support', 'projects', 'sales'];
const EVENTS = {
    crm: ['CREATE_LEAD', 'UPDATE_LEAD', 'CREATE_OPP', 'UPDATE_OPP', 'CREATE_ACCOUNT', 'CREATE_CONTACT'],
    finance: ['CREATE_INVOICE', 'UPDATE_INVOICE', 'CREATE_EXPENSE', 'CREATE_PAYMENT'],
    inventory: ['CREATE_MOVEMENT', 'LOW_STOCK', 'STOCK_TRANSFER'],
    hrms: ['CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'LEAVE_REQUEST', 'ATTENDANCE_MARK'],
    support: ['CREATE_TICKET', 'UPDATE_TICKET', 'TICKET_ESCALATION'],
    projects: ['CREATE_PROJECT', 'UPDATE_PROJECT', 'TASK_COMPLETE', 'DEADLINE_APPROACHING'],
    sales: ['CREATE_ORDER', 'UPDATE_ORDER', 'ORDER_SHIPPED'],
};
const OPERATORS = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'is_empty', label: 'Is Empty' },
    { value: 'is_not_empty', label: 'Is Not Empty' },
];
const ACTION_TYPES = [
    { value: 'create_notification', label: 'Send Notification', icon: Bell, color: '#6366f1' },
    { value: 'update_field', label: 'Update Field', icon: Settings, color: '#10b981' },
    { value: 'create_task', label: 'Create Task', icon: FileText, color: '#f59e0b' },
    { value: 'create_activity', label: 'Create Activity', icon: Clock, color: '#06b6d4' },
    { value: 'send_email', label: 'Send Email', icon: FileText, color: '#ec4899' },
    { value: 'webhook', label: 'Webhook', icon: Zap, color: '#8b5cf6' },
];

export default function WorkflowsPage() {
    const [tab, setTab] = useState('workflows');
    const [workflows, setWorkflows] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showBuilder, setShowBuilder] = useState(false);
    const [showLogs, setShowLogs] = useState(null);
    const [logs, setLogs] = useState([]);
    const [editWorkflow, setEditWorkflow] = useState(null);
    const [builderStep, setBuilderStep] = useState(0);
    const [form, setForm] = useState({
        name: '', description: '', module: 'crm', trigger_type: 'event',
        trigger_config: { event: '' }, conditions: [], actions: [], is_active: 1
    });
    const toast = useToast();

    const fetchWorkflows = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api('/workflows');
            setWorkflows(data.workflows || []);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, []);

    const fetchTemplates = useCallback(async () => {
        try {
            const data = await api('/workflows/templates/list');
            setTemplates(data.templates || []);
        } catch (err) { toast(err.message, 'error'); }
    }, []);

    const fetchLogs = async (id) => {
        try {
            const data = await api(`/workflows/${id}/logs`);
            setLogs(data.logs || []);
            setShowLogs(id);
        } catch (err) { toast(err.message, 'error'); }
    };

    useEffect(() => { fetchWorkflows(); fetchTemplates(); }, []);

    const filtered = workflows.filter(w =>
        w.name?.toLowerCase().includes(search.toLowerCase()) ||
        w.module?.toLowerCase().includes(search.toLowerCase())
    );

    const handleSave = async () => {
        if (!form.name || !form.module) { toast('Name and module are required', 'error'); return; }
        if (!form.trigger_config?.event) { toast('Select a trigger event', 'error'); return; }
        if (form.actions.length === 0) { toast('Add at least one action', 'error'); return; }
        try {
            if (editWorkflow) {
                await api(`/workflows/${editWorkflow.id}`, { method: 'PUT', body: form });
                toast('Workflow updated', 'success');
            } else {
                await api('/workflows', { method: 'POST', body: form });
                toast('Workflow created', 'success');
            }
            setShowBuilder(false); setEditWorkflow(null); resetForm(); fetchWorkflows();
        } catch (err) { toast(err.message, 'error'); }
    };

    const toggleWorkflow = async (wf) => {
        try {
            await api(`/workflows/${wf.id}`, { method: 'PUT', body: { is_active: wf.is_active ? 0 : 1 } });
            toast(`Workflow ${wf.is_active ? 'disabled' : 'enabled'}`, 'success');
            fetchWorkflows();
        } catch (err) { toast(err.message, 'error'); }
    };

    const deleteWorkflow = async (id) => {
        if (!confirm('Delete this workflow? This cannot be undone.')) return;
        try {
            await api(`/workflows/${id}`, { method: 'DELETE' });
            toast('Workflow deleted', 'success');
            fetchWorkflows();
        } catch (err) { toast(err.message, 'error'); }
    };

    const installTemplate = (tpl) => {
        setForm({
            name: tpl.name, description: `Auto-created from template: ${tpl.name}`,
            module: tpl.module, trigger_type: tpl.trigger_type,
            trigger_config: tpl.trigger_config || {}, conditions: tpl.conditions || [],
            actions: tpl.actions || [], is_active: 1
        });
        setEditWorkflow(null); setBuilderStep(0); setShowBuilder(true);
        toast('Template loaded — customize and save', 'info');
    };

    const openEdit = async (wf) => {
        try {
            const full = await api(`/workflows/${wf.id}`);
            setForm({
                name: full.name, description: full.description || '',
                module: full.module, trigger_type: full.trigger_type || 'event',
                trigger_config: full.trigger_config || {}, conditions: full.conditions || [],
                actions: full.actions || [], is_active: full.is_active
            });
            setEditWorkflow(full); setBuilderStep(0); setShowBuilder(true);
        } catch (err) { toast(err.message, 'error'); }
    };

    const resetForm = () => setForm({
        name: '', description: '', module: 'crm', trigger_type: 'event',
        trigger_config: { event: '' }, conditions: [], actions: [], is_active: 1
    });

    const addCondition = () => setForm(f => ({ ...f, conditions: [...f.conditions, { field: '', operator: 'equals', value: '' }] }));
    const removeCondition = (i) => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
    const updateCondition = (i, key, val) => setForm(f => ({ ...f, conditions: f.conditions.map((c, idx) => idx === i ? { ...c, [key]: val } : c) }));

    const addAction = (type) => {
        const base = { type };
        if (type === 'create_notification') Object.assign(base, { message: '', priority: 'normal' });
        if (type === 'update_field') Object.assign(base, { table: '', field: '', value: '' });
        if (type === 'create_task') Object.assign(base, { title: '', priority: 'medium' });
        if (type === 'create_activity') Object.assign(base, { subject: '', activity_type: 'task' });
        if (type === 'send_email') Object.assign(base, { to: '', subject: '', body: '' });
        if (type === 'webhook') Object.assign(base, { url: '', method: 'POST' });
        setForm(f => ({ ...f, actions: [...f.actions, base] }));
    };
    const removeAction = (i) => setForm(f => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));
    const updateAction = (i, key, val) => setForm(f => ({ ...f, actions: f.actions.map((a, idx) => idx === i ? { ...a, [key]: val } : a) }));

    const builderSteps = [
        { label: 'Trigger', desc: 'When should this run?' },
        { label: 'Conditions', desc: 'What must be true?' },
        { label: 'Actions', desc: 'What should happen?' },
        { label: 'Review', desc: 'Confirm and save' },
    ];

    return (
        <div>
            <div className="page-header">
                <h2>Workflow Automation</h2>
                <div className="page-actions">
                    <button className="btn btn-primary" onClick={() => { resetForm(); setEditWorkflow(null); setBuilderStep(0); setShowBuilder(true); }}>
                        <Plus size={16} /> New Workflow
                    </button>
                </div>
            </div>

            <div className="tabs">
                <button className={`tab-item ${tab === 'workflows' ? 'active' : ''}`} onClick={() => setTab('workflows')}>
                    <Zap size={16} /> My Workflows
                </button>
                <button className={`tab-item ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
                    <Copy size={16} /> Templates
                </button>
            </div>

            {/* Templates Gallery */}
            {tab === 'templates' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>
                    {templates.map(tpl => {
                        const Icon = MODULE_ICONS[tpl.module] || Zap;
                        const color = MODULE_COLORS[tpl.module] || '#6366f1';
                        return (
                            <div key={tpl.id} className="card" style={{ cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--border-color)' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = color}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon size={20} style={{ color }} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{tpl.name}</div>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{tpl.module}</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                                    <span style={{ fontWeight: 500 }}>Trigger:</span> {tpl.trigger_config?.event || tpl.trigger_type}
                                    {(tpl.conditions || []).length > 0 && <> · {tpl.conditions.length} condition{tpl.conditions.length > 1 ? 's' : ''}</>}
                                    {' · '}{(tpl.actions || []).length} action{(tpl.actions || []).length > 1 ? 's' : ''}
                                </div>
                                {/* Visual flow preview */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
                                    <span className="badge" style={{ background: color + '1a', color, fontSize: '0.7rem' }}>
                                        <Zap size={10} /> {tpl.trigger_config?.event || 'Event'}
                                    </span>
                                    {(tpl.conditions || []).length > 0 && <>
                                        <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                                        <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                                            <Filter size={10} /> {tpl.conditions.length} filter{tpl.conditions.length > 1 ? 's' : ''}
                                        </span>
                                    </>}
                                    <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                                    {(tpl.actions || []).map((a, i) => {
                                        const at = ACTION_TYPES.find(t => t.value === a.type);
                                        return <span key={i} className="badge" style={{ background: (at?.color || '#666') + '1a', color: at?.color || '#666', fontSize: '0.7rem' }}>
                                            {at?.label || a.type}
                                        </span>;
                                    })}
                                </div>
                                <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => installTemplate(tpl)}>
                                    <Plus size={14} /> Use Template
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Workflows List */}
            {tab === 'workflows' && (
                <>
                    <div className="toolbar" style={{ marginTop: 'var(--space-md)' }}>
                        <div className="search-box"><Search className="search-icon" size={16} />
                            <input type="text" className="form-input" placeholder="Search workflows..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>{filtered.length} workflow{filtered.length !== 1 ? 's' : ''}</span>
                    </div>

                    {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                        <div style={{ display: 'grid', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                            {filtered.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                                    <Zap size={48} style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }} />
                                    <h3 style={{ marginBottom: 'var(--space-sm)' }}>No workflows yet</h3>
                                    <p className="text-muted">Create your first automation or start from a template</p>
                                    <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center', marginTop: 'var(--space-lg)' }}>
                                        <button className="btn btn-primary" onClick={() => { resetForm(); setShowBuilder(true); }}><Plus size={16} /> Create New</button>
                                        <button className="btn btn-secondary" onClick={() => setTab('templates')}><Copy size={16} /> Browse Templates</button>
                                    </div>
                                </div>
                            ) : filtered.map(wf => {
                                const Icon = MODULE_ICONS[wf.module] || Zap;
                                const color = MODULE_COLORS[wf.module] || '#6366f1';
                                let triggerConfig, actions;
                                try { triggerConfig = JSON.parse(wf.trigger_config || '{}'); } catch { triggerConfig = {}; }
                                try { actions = JSON.parse(wf.actions || '[]'); } catch { actions = []; }
                                return (
                                    <div key={wf.id} className="card" style={{ padding: 'var(--space-lg)', borderLeft: `3px solid ${wf.is_active ? color : 'var(--border-color)'}`, opacity: wf.is_active ? 1 : 0.6 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
                                            <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-start', flex: 1 }}>
                                                <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Icon size={22} style={{ color }} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 2 }}>{wf.name}</div>
                                                    {wf.description && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>{wf.description}</div>}
                                                    {/* Flow visualization */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <span className="badge" style={{ background: color + '1a', color, fontSize: '0.72rem' }}>
                                                            <Zap size={10} /> {triggerConfig.event || wf.trigger_type}
                                                        </span>
                                                        <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                                                        {actions.map((a, i) => {
                                                            const at = ACTION_TYPES.find(t => t.value === a.type);
                                                            return <span key={i} className="badge" style={{ background: (at?.color || '#666') + '1a', color: at?.color || '#666', fontSize: '0.72rem' }}>{at?.label || a.type}</span>;
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>
                                                {wf.execution_count > 0 && (
                                                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                        <Play size={10} /> {wf.execution_count} runs
                                                    </span>
                                                )}
                                                <button className="btn btn-ghost btn-sm btn-icon" title={wf.is_active ? 'Disable' : 'Enable'} onClick={() => toggleWorkflow(wf)}>
                                                    {wf.is_active ? <ToggleRight size={20} style={{ color: 'var(--color-success)' }} /> : <ToggleLeft size={20} />}
                                                </button>
                                                <button className="btn btn-ghost btn-sm btn-icon" title="View Logs" onClick={() => fetchLogs(wf.id)}><Eye size={16} /></button>
                                                <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(wf)}><Settings size={16} /></button>
                                                <button className="btn btn-ghost btn-sm btn-icon" title="Delete" onClick={() => deleteWorkflow(wf.id)}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                        {wf.last_executed_at && (
                                            <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                <Clock size={10} /> Last run: {new Date(wf.last_executed_at).toLocaleString('en-IN')}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Execution Logs Modal */}
            {showLogs && (
                <div className="modal-overlay" onClick={() => setShowLogs(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
                        <div className="modal-header">
                            <h3>Execution Logs</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowLogs(null)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
                            {logs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
                                    <Clock size={32} style={{ marginBottom: 8 }} /><p>No executions yet</p>
                                </div>
                            ) : logs.map(log => (
                                <div key={log.id} style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                                    <div style={{ marginTop: 2 }}>
                                        {log.status === 'success' ? <CheckCircle size={16} style={{ color: 'var(--color-success)' }} /> :
                                            log.status === 'skipped' ? <XCircle size={16} style={{ color: 'var(--text-muted)' }} /> :
                                                <AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span className={`badge ${log.status === 'success' ? 'badge-success' : log.status === 'skipped' ? 'badge-neutral' : 'badge-danger'}`}>{log.status}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {log.conditions_met ? 'Conditions met' : 'Conditions not met'}
                                            {log.duration_ms !== undefined && <> · {log.duration_ms}ms</>}
                                        </div>
                                        {log.error_message && <div style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: 4 }}>{log.error_message}</div>}
                                        {log.actions_executed && (() => {
                                            let parsed; try { parsed = JSON.parse(log.actions_executed); } catch { return null; }
                                            return (
                                                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    {parsed.map((a, i) => <span key={i} className={`badge ${a.status === 'success' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>{a.type}: {a.status}</span>)}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Workflow Builder Modal */}
            {showBuilder && (
                <div className="modal-overlay" onClick={() => setShowBuilder(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3>{editWorkflow ? 'Edit Workflow' : 'Create Workflow'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowBuilder(false)}>✕</button>
                        </div>

                        {/* Step indicator */}
                        <div style={{ display: 'flex', padding: '0 var(--space-lg)', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface-2)' }}>
                            {builderSteps.map((s, i) => (
                                <button key={i} onClick={() => setBuilderStep(i)}
                                    style={{
                                        flex: 1, padding: 'var(--space-md) var(--space-sm)', background: 'none', border: 'none', cursor: 'pointer',
                                        borderBottom: builderStep === i ? '2px solid var(--color-primary)' : '2px solid transparent',
                                        color: builderStep === i ? 'var(--color-primary)' : 'var(--text-muted)', fontWeight: builderStep === i ? 600 : 400,
                                        fontSize: '0.82rem', transition: 'all 0.2s'
                                    }}>
                                    <div>{i + 1}. {s.label}</div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 400 }}>{s.desc}</div>
                                </button>
                            ))}
                        </div>

                        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                            {/* Step 0: Trigger */}
                            {builderStep === 0 && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Workflow Name <span className="required">*</span></label>
                                        <input className="form-input" placeholder="e.g. Auto-assign new leads" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <textarea className="form-textarea" placeholder="What does this workflow do?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Module <span className="required">*</span></label>
                                            <select className="form-select" value={form.module} onChange={e => setForm({ ...form, module: e.target.value, trigger_config: { event: '' } })}>
                                                {MODULES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Trigger Event <span className="required">*</span></label>
                                            <select className="form-select" value={form.trigger_config?.event || ''} onChange={e => setForm({ ...form, trigger_config: { ...form.trigger_config, event: e.target.value } })}>
                                                <option value="">Select event...</option>
                                                {(EVENTS[form.module] || []).map(ev => <option key={ev} value={ev}>{ev.replace(/_/g, ' ')}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Step 1: Conditions */}
                            {builderStep === 1 && (
                                <>
                                    <div style={{ marginBottom: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>Conditions</div>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>All conditions must be true (AND logic). Leave empty to always run.</div>
                                        </div>
                                        <button className="btn btn-secondary btn-sm" onClick={addCondition}><Plus size={14} /> Add Condition</button>
                                    </div>
                                    {form.conditions.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)', background: 'var(--bg-surface-2)', borderRadius: 'var(--border-radius)' }}>
                                            <Filter size={24} style={{ marginBottom: 8 }} />
                                            <p style={{ fontSize: '0.85rem' }}>No conditions — runs every time the trigger fires</p>
                                        </div>
                                    ) : form.conditions.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', marginBottom: 'var(--space-sm)', padding: 'var(--space-md)', background: 'var(--bg-surface-2)', borderRadius: 'var(--border-radius)' }}>
                                            <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                                <label className="form-label" style={{ fontSize: '0.72rem' }}>Field</label>
                                                <input className="form-input" placeholder="e.g. status, amount, priority" value={c.field} onChange={e => updateCondition(i, 'field', e.target.value)} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                                <label className="form-label" style={{ fontSize: '0.72rem' }}>Operator</label>
                                                <select className="form-select" value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)}>
                                                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                                <label className="form-label" style={{ fontSize: '0.72rem' }}>Value</label>
                                                <input className="form-input" placeholder="Expected value" value={c.value} onChange={e => updateCondition(i, 'value', e.target.value)} />
                                            </div>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeCondition(i)} style={{ marginBottom: 2 }}><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Step 2: Actions */}
                            {builderStep === 2 && (
                                <>
                                    <div style={{ marginBottom: 'var(--space-md)' }}>
                                        <div style={{ fontWeight: 600 }}>Actions</div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>What should happen when this workflow runs?</div>
                                    </div>
                                    {/* Action type picker */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                                        {ACTION_TYPES.map(at => (
                                            <button key={at.value} className="btn btn-secondary btn-sm" onClick={() => addAction(at.value)}
                                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 'var(--space-md)', height: 'auto' }}>
                                                <at.icon size={18} style={{ color: at.color }} />
                                                <span style={{ fontSize: '0.72rem' }}>{at.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {/* Configured actions */}
                                    {form.actions.map((a, i) => {
                                        const at = ACTION_TYPES.find(t => t.value === a.type);
                                        return (
                                            <div key={i} style={{ padding: 'var(--space-md)', background: 'var(--bg-surface-2)', borderRadius: 'var(--border-radius)', marginBottom: 'var(--space-sm)', borderLeft: `3px solid ${at?.color || '#666'}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: at?.color }}>{at?.label || a.type}</span>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeAction(i)}><Trash2 size={14} /></button>
                                                </div>
                                                {a.type === 'create_notification' && (
                                                    <div className="form-row">
                                                        <div className="form-group" style={{ margin: 0, flex: 2 }}><input className="form-input" placeholder="Notification message" value={a.message || ''} onChange={e => updateAction(i, 'message', e.target.value)} /></div>
                                                        <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                                            <select className="form-select" value={a.priority || 'normal'} onChange={e => updateAction(i, 'priority', e.target.value)}>
                                                                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                                {a.type === 'update_field' && (
                                                    <div className="form-row">
                                                        <div className="form-group" style={{ margin: 0 }}><input className="form-input" placeholder="Table" value={a.table || ''} onChange={e => updateAction(i, 'table', e.target.value)} /></div>
                                                        <div className="form-group" style={{ margin: 0 }}><input className="form-input" placeholder="Field name" value={a.field || ''} onChange={e => updateAction(i, 'field', e.target.value)} /></div>
                                                        <div className="form-group" style={{ margin: 0 }}><input className="form-input" placeholder="New value" value={a.value || ''} onChange={e => updateAction(i, 'value', e.target.value)} /></div>
                                                    </div>
                                                )}
                                                {a.type === 'create_task' && (
                                                    <div className="form-row">
                                                        <div className="form-group" style={{ margin: 0, flex: 2 }}><input className="form-input" placeholder="Task title" value={a.title || ''} onChange={e => updateAction(i, 'title', e.target.value)} /></div>
                                                        <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                                            <select className="form-select" value={a.priority || 'medium'} onChange={e => updateAction(i, 'priority', e.target.value)}>
                                                                <option>low</option><option>medium</option><option>high</option><option>critical</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                                {a.type === 'create_activity' && (
                                                    <div className="form-row">
                                                        <div className="form-group" style={{ margin: 0, flex: 2 }}><input className="form-input" placeholder="Activity subject" value={a.subject || ''} onChange={e => updateAction(i, 'subject', e.target.value)} /></div>
                                                        <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                                            <select className="form-select" value={a.activity_type || 'task'} onChange={e => updateAction(i, 'activity_type', e.target.value)}>
                                                                <option>task</option><option>call</option><option>email</option><option>meeting</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                                {a.type === 'send_email' && (
                                                    <>
                                                        <div className="form-row">
                                                            <div className="form-group" style={{ margin: 0 }}><input className="form-input" placeholder="To email" value={a.to || ''} onChange={e => updateAction(i, 'to', e.target.value)} /></div>
                                                            <div className="form-group" style={{ margin: 0 }}><input className="form-input" placeholder="Subject" value={a.subject || ''} onChange={e => updateAction(i, 'subject', e.target.value)} /></div>
                                                        </div>
                                                    </>
                                                )}
                                                {a.type === 'webhook' && (
                                                    <div className="form-row">
                                                        <div className="form-group" style={{ margin: 0, flex: 2 }}><input className="form-input" placeholder="Webhook URL" value={a.url || ''} onChange={e => updateAction(i, 'url', e.target.value)} /></div>
                                                        <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                                            <select className="form-select" value={a.method || 'POST'} onChange={e => updateAction(i, 'method', e.target.value)}>
                                                                <option>POST</option><option>GET</option><option>PUT</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {form.actions.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 'var(--space-lg)', color: 'var(--text-muted)', background: 'var(--bg-surface-2)', borderRadius: 'var(--border-radius)' }}>
                                            Click an action above to add it
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Step 3: Review */}
                            {builderStep === 3 && (
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: 'var(--space-md)' }}>Review Workflow</div>
                                    {/* Visual flow summary */}
                                    <div className="card" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-color)' }}>
                                        <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-color)' }}>
                                            <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{form.name || 'Untitled Workflow'}</div>
                                            {form.description && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{form.description}</div>}
                                        </div>
                                        {/* Trigger */}
                                        <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366f11a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={16} style={{ color: '#6366f1' }} /></div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Trigger</div>
                                                <div style={{ fontWeight: 500 }}>{form.module?.toUpperCase()} · {(form.trigger_config?.event || '').replace(/_/g, ' ')}</div>
                                            </div>
                                        </div>
                                        {/* Conditions */}
                                        {form.conditions.length > 0 && (
                                            <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f59e0b1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Filter size={16} style={{ color: '#f59e0b' }} /></div>
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Conditions ({form.conditions.length})</div>
                                                    {form.conditions.map((c, i) => <div key={i} style={{ fontSize: '0.85rem' }}>{c.field} <strong>{c.operator?.replace('_', ' ')}</strong> {c.value}</div>)}
                                                </div>
                                            </div>
                                        )}
                                        {/* Actions */}
                                        <div style={{ padding: 'var(--space-md)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Actions ({form.actions.length})</div>
                                            {form.actions.map((a, i) => {
                                                const at = ACTION_TYPES.find(t => t.value === a.type);
                                                return (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 6 }}>
                                                        <div style={{ width: 24, height: 24, borderRadius: 6, background: (at?.color || '#666') + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {at?.icon && <at.icon size={12} style={{ color: at.color }} />}
                                                        </div>
                                                        <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{at?.label}:</span>
                                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{a.message || a.title || a.subject || a.url || a.field || ''}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer with navigation */}
                        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                            <button className="btn btn-secondary" onClick={() => builderStep > 0 ? setBuilderStep(s => s - 1) : setShowBuilder(false)}>
                                {builderStep > 0 ? '← Back' : 'Cancel'}
                            </button>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                {builderStep < 3 ? (
                                    <button className="btn btn-primary" onClick={() => setBuilderStep(s => s + 1)}>
                                        Next: {builderSteps[builderStep + 1]?.label} →
                                    </button>
                                ) : (
                                    <button className="btn btn-primary" onClick={handleSave}>
                                        <CheckCircle size={16} /> {editWorkflow ? 'Update Workflow' : 'Create Workflow'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
