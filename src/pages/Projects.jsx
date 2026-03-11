import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, CheckCircle, Clock, AlertTriangle, FolderKanban, Download, FileText, Target, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const PRIORITY_COLORS = { critical: 'badge-danger', high: 'badge-warning', medium: 'badge-info', low: 'badge-neutral' };

export default function ProjectsPage() {
    const [tab, setTab] = useState('projects');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState({});
    const [stats, setStats] = useState({});
    const toast = useToast();

    const tabs = [{ id: 'projects', label: 'Projects', icon: FolderKanban }, { id: 'tasks', label: 'Tasks', icon: CheckCircle }, { id: 'milestones', label: 'Milestones', icon: Target }];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const endpoint = tab === 'projects' ? '/projects' : `/projects/${tab}`;
            const [data, s] = await Promise.all([
                api(`${endpoint}?page=${page}&search=${search}`),
                api('/projects/stats')
            ]);
            setItems(data[tab] || data.projects || data.tasks || data.milestones || []);
            setTotal(data.total || 0);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, page, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        try {
            const endpoint = tab === 'projects' ? '/projects' : `/projects/${tab}`;
            if (editItem) { await api(`${endpoint}/${editItem.id}`, { method: 'PUT', body: form }); }
            else { await api(endpoint, { method: 'POST', body: form }); }
            toast(editItem ? 'Updated' : 'Created', 'success');
            setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const kpis = [
        { label: 'Active Projects', value: stats.activeProjects || 0, icon: FolderKanban, color: '#6366f1' },
        { label: 'Overdue', value: stats.overdue || 0, icon: AlertTriangle, color: stats.overdue > 0 ? '#ef4444' : '#10b981' },
        { label: 'Completion Rate', value: `${stats.completionRate || 0}%`, icon: TrendingUp, color: '#10b981' },
        { label: 'Total Tasks', value: `${stats.completedTasks || 0}/${stats.totalTasks || 0}`, icon: CheckCircle, color: '#06b6d4' },
        { label: 'Budget Used', value: `${stats.budgetUtilization || 0}%`, icon: DollarSign, color: stats.budgetUtilization > 90 ? '#ef4444' : '#f59e0b' },
        { label: 'Total Budget', value: `₹${((stats.totalBudget || 0) / 100000).toFixed(1)}L`, icon: BarChart3, color: '#8b5cf6' },
    ];

    return (
        <div>
            <div className="page-header">
                <h2><FolderKanban size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Project Management</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `projects_${tab}`)}><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`Projects - ${tab}`)}><FileText size={15} /> PDF</button>
                    <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({}); setShowModal(true); }}><Plus size={16} /> New {tab.slice(0, -1)}</button>
                </div>
            </div>

            <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {kpis.map((k, i) => (
                    <div key={i} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${k.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <k.icon size={18} color={k.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{k.label}</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{k.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="tabs">{tabs.map(t => <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setPage(1); }}><t.icon size={14} style={{ marginRight: 6 }} />{t.label}</button>)}</div>

            <div className="toolbar">
                <div className="search-box"><Search className="search-icon" size={16} /><input type="text" className="form-input" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{total} {tab}</span>
            </div>

            {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr>
                                {tab === 'projects' && <><th>Project</th><th>Code</th><th>Priority</th><th>Start</th><th>End</th><th>Progress</th><th>Status</th><th>Actions</th></>}
                                {tab === 'tasks' && <><th>Task</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Due Date</th><th>Progress</th><th>Status</th><th>Actions</th></>}
                                {tab === 'milestones' && <><th>Milestone</th><th>Project</th><th>Due Date</th><th>Status</th><th>Actions</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No {tab} found</td></tr> : items.map(item => (
                                    <tr key={item.id}>
                                        {tab === 'projects' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td className="font-mono">{item.code}</td>
                                            <td><span className={`badge ${PRIORITY_COLORS[item.priority] || 'badge-neutral'}`}>{item.priority}</span></td>
                                            <td>{item.start_date || '-'}</td>
                                            <td style={{ color: item.end_date && new Date(item.end_date) < new Date() && item.status !== 'completed' ? 'var(--danger)' : 'inherit' }}>{item.end_date || '-'}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                                                        <div style={{ width: `${item.progress || 0}%`, height: '100%', background: (item.progress || 0) === 100 ? 'var(--success)' : 'var(--primary)', borderRadius: 3, transition: 'width 0.3s' }}></div>
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: 32 }}>{item.progress || 0}%</span>
                                                </div>
                                            </td>
                                            <td><span className={`badge ${item.status === 'completed' ? 'badge-success' : item.status === 'in_progress' ? 'badge-info' : item.status === 'on_hold' ? 'badge-warning' : 'badge-neutral'}`}>{item.status?.replace('_', ' ')}</span></td>
                                        </>}
                                        {tab === 'tasks' && <>
                                            <td style={{ fontWeight: 500 }}>{item.title || item.name}</td>
                                            <td>{item.project_name || '-'}</td>
                                            <td>{item.assignee_name || '-'}</td>
                                            <td><span className={`badge ${PRIORITY_COLORS[item.priority] || 'badge-neutral'}`}>{item.priority}</span></td>
                                            <td style={{ color: item.due_date && new Date(item.due_date) < new Date() && item.status !== 'completed' ? 'var(--danger)' : 'inherit' }}>{item.due_date || '-'}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                                                        <div style={{ width: `${item.progress || 0}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }}></div>
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: 32 }}>{item.progress || 0}%</span>
                                                </div>
                                            </td>
                                            <td><span className={`badge ${item.status === 'completed' ? 'badge-success' : item.status === 'in_progress' ? 'badge-info' : 'badge-neutral'}`}>{item.status?.replace('_', ' ')}</span></td>
                                        </>}
                                        {tab === 'milestones' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td>{item.project_name || '-'}</td>
                                            <td>{item.due_date || '-'}</td>
                                            <td><span className={`badge ${item.status === 'completed' ? 'badge-success' : item.status === 'missed' ? 'badge-danger' : 'badge-warning'}`}>{item.status}</span></td>
                                        </>}
                                        <td><button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {total > 25 && <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
                        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                        <span className="text-muted" style={{ fontSize: '0.85rem', lineHeight: '32px' }}>Page {page} of {Math.ceil(total / 25)}</span>
                        <button className="btn btn-ghost btn-sm" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(p => p + 1)}>Next →</button>
                    </div>}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab === 'projects' ? 'Project' : tab === 'tasks' ? 'Task' : 'Milestone'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'projects' && <>
                                <div className="form-group"><label className="form-label">Project Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}></textarea></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Priority</label><select className="form-select" value={form.priority || 'medium'} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></div>
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'planning'} onChange={e => setForm({ ...form, status: e.target.value })}><option>planning</option><option>in_progress</option><option>on_hold</option><option>completed</option><option>cancelled</option></select></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Start Date</label><input type="date" className="form-input" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">End Date</label><input type="date" className="form-input" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Budget (₹)</label><input type="number" className="form-input" value={form.budget || ''} onChange={e => setForm({ ...form, budget: +e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Progress (%)</label><input type="number" min="0" max="100" className="form-input" value={form.progress ?? ''} onChange={e => setForm({ ...form, progress: +e.target.value })} /></div>
                                </div>
                            </>}
                            {tab === 'tasks' && <>
                                <div className="form-group"><label className="form-label">Title <span className="required">*</span></label><input className="form-input" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Project ID</label><input className="form-input" value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Priority</label><select className="form-select" value={form.priority || 'medium'} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></div>
                                    <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-input" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                                </div>
                            </>}
                            {tab === 'milestones' && <>
                                <div className="form-group"><label className="form-label">Milestone Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Project ID</label><input className="form-input" value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-input" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                            </>}
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : 'Create'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
