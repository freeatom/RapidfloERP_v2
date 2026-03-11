import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Download, FileText, AlertTriangle, Clock, CheckCircle, Headphones, Shield, BarChart3, BookOpen, MessageCircle, TrendingUp } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const PRIORITY_BADGE = { critical: 'badge-danger', high: 'badge-warning', medium: 'badge-info', low: 'badge-neutral' };

export default function SupportPage() {
    const [tab, setTab] = useState('tickets');
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

    const tabs = [{ id: 'tickets', label: 'Tickets', icon: Headphones }, { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen }];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, s] = await Promise.all([
                api(`/support/${tab}?page=${page}&search=${search}`),
                api('/support/stats')
            ]);
            setItems(data[tab] || data.tickets || data.articles || []);
            setTotal(data.total || 0);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, page, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        try {
            const endpoint = tab === 'tickets' ? '/support/tickets' : '/support/knowledge';
            if (editItem) { await api(`${endpoint}/${editItem.id}`, { method: 'PUT', body: form }); }
            else { await api(endpoint, { method: 'POST', body: form }); }
            toast(editItem ? 'Updated' : 'Created', 'success'); setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const kpis = [
        { label: 'Open Tickets', value: stats.openTickets || 0, icon: Headphones, color: '#6366f1' },
        { label: 'Critical', value: stats.criticalTickets || 0, icon: AlertTriangle, color: stats.criticalTickets > 0 ? '#ef4444' : '#10b981' },
        { label: 'Avg Resolution', value: `${stats.avgResolutionHours || 0}h`, icon: Clock, color: '#f59e0b' },
        { label: 'Resolved Today', value: stats.resolvedToday || 0, icon: CheckCircle, color: '#10b981' },
        { label: 'SLA Breach', value: stats.slaBreach || 0, icon: Shield, color: stats.slaBreach > 0 ? '#ef4444' : '#10b981' },
        { label: 'Total Tickets', value: stats.totalTickets || 0, icon: BarChart3, color: '#8b5cf6' },
    ];

    return (
        <div>
            <div className="page-header">
                <h2><Headphones size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Support Center</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `support_${tab}`)}><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`Support - ${tab}`)}><FileText size={15} /> PDF</button>
                    <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({}); setShowModal(true); }}><Plus size={16} /> New {tab === 'tickets' ? 'Ticket' : 'Article'}</button>
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
                                {tab === 'tickets' && <><th>Ticket #</th><th>Subject</th><th>Source</th><th>Priority</th><th>Assigned To</th><th>SLA</th><th>Status</th><th>Actions</th></>}
                                {tab === 'knowledge' && <><th>Title</th><th>Category</th><th>Views</th><th>Helpful</th><th>Status</th><th>Actions</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No {tab} found</td></tr> : items.map(item => (
                                    <tr key={item.id}>
                                        {tab === 'tickets' && <>
                                            <td className="font-mono" style={{ fontWeight: 500 }}>{item.ticket_number}</td>
                                            <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</td>
                                            <td><span className="badge badge-neutral">{item.source || 'web'}</span></td>
                                            <td><span className={`badge ${PRIORITY_BADGE[item.priority] || 'badge-neutral'}`}>{item.priority}</span></td>
                                            <td>{item.assigned_name || '-'}</td>
                                            <td>{item.sla_deadline ? (
                                                <span style={{ color: new Date(item.sla_deadline) < new Date() ? 'var(--danger)' : 'var(--success)', fontWeight: 500, fontSize: '0.8rem' }}>
                                                    {new Date(item.sla_deadline) < new Date() ? '⚠ Breached' : '✓ On Track'}
                                                </span>
                                            ) : '-'}</td>
                                            <td><span className={`badge ${item.status === 'resolved' || item.status === 'closed' ? 'badge-success' : item.status === 'in_progress' ? 'badge-info' : 'badge-warning'}`}><span className="badge-dot"></span>{item.status?.replace('_', ' ')}</span></td>
                                        </>}
                                        {tab === 'knowledge' && <>
                                            <td style={{ fontWeight: 500 }}>{item.title}</td>
                                            <td><span className="badge badge-neutral">{item.category}</span></td>
                                            <td>{item.view_count || 0}</td>
                                            <td>{item.helpful_count || 0} 👍</td>
                                            <td><span className={`badge ${item.status === 'published' ? 'badge-success' : 'badge-warning'}`}>{item.status}</span></td>
                                        </>}
                                        <td><button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {total > 25 && <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
                        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                        <span className="text-muted" style={{ fontSize: '0.85rem', lineHeight: '32px' }}>Page {page}</span>
                        <button className="btn btn-ghost btn-sm" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(p => p + 1)}>Next →</button>
                    </div>}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab === 'tickets' ? 'Ticket' : 'Article'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'tickets' && <>
                                <div className="form-group"><label className="form-label">Subject <span className="required">*</span></label><input className="form-input" value={form.subject || ''} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" rows={4} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}></textarea></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Priority</label><select className="form-select" value={form.priority || 'medium'} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></div>
                                    <div className="form-group"><label className="form-label">Source</label><select className="form-select" value={form.source || 'web'} onChange={e => setForm({ ...form, source: e.target.value })}><option>web</option><option>email</option><option>phone</option><option>chat</option></select></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'open'} onChange={e => setForm({ ...form, status: e.target.value })}><option>open</option><option>in_progress</option><option>waiting</option><option>resolved</option><option>closed</option></select></div>
                                    <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                                </div>
                            </>}
                            {tab === 'knowledge' && <>
                                <div className="form-group"><label className="form-label">Title <span className="required">*</span></label><input className="form-input" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Content</label><textarea className="form-textarea" rows={6} value={form.content || ''} onChange={e => setForm({ ...form, content: e.target.value })}></textarea></div>
                                <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}><option>draft</option><option>published</option><option>archived</option></select></div>
                            </>}
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : 'Create'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
