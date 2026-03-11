import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Trash2, Download, FileText, Users, Target, DollarSign, TrendingUp, Star, Activity, CheckCircle, BarChart3 } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const fmtCur = v => `₹${(v || 0).toLocaleString('en-IN')}`;

const STAGE_COLORS = { prospecting: '#60a5fa', qualification: '#f59e0b', proposal: '#8b5cf6', negotiation: '#ec4899', closed_won: '#10b981', closed_lost: '#ef4444' };

export default function CRMPage() {
    const [tab, setTab] = useState('leads');
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

    const tabs = [{ id: 'leads', label: 'Leads', icon: Target }, { id: 'accounts', label: 'Accounts', icon: Users }, { id: 'opportunities', label: 'Pipeline', icon: DollarSign }, { id: 'interactions', label: 'Activities', icon: Activity }];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, s] = await Promise.all([
                api(`/crm/${tab}?page=${page}&search=${search}`),
                api('/crm/stats')
            ]);
            setItems(data[tab] || data.leads || data.accounts || data.opportunities || data.interactions || []);
            setTotal(data.total || 0);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, page, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        try {
            if (editItem) { await api(`/crm/${tab}/${editItem.id}`, { method: 'PUT', body: form }); }
            else { await api(`/crm/${tab}`, { method: 'POST', body: form }); }
            toast(editItem ? 'Updated' : 'Created', 'success'); setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete?')) return;
        try { await api(`/crm/${tab}/${id}`, { method: 'DELETE' }); toast('Deleted', 'success'); fetchData(); } catch (err) { toast(err.message, 'error'); }
    };

    const kpis = [
        { label: 'Total Leads', value: stats.totalLeads || 0, icon: Target, color: '#6366f1' },
        { label: 'Conversion Rate', value: `${stats.conversionRate || 0}%`, icon: TrendingUp, color: '#10b981' },
        { label: 'Pipeline Value', value: fmtCur(stats.pipelineValue), icon: DollarSign, color: '#f59e0b' },
        { label: 'Hot Leads', value: stats.hotLeads || 0, icon: Star, color: '#ef4444' },
        { label: 'Won This Month', value: fmtCur(stats.wonThisMonth), icon: CheckCircle, color: '#10b981' },
        { label: 'Active Accounts', value: stats.totalAccounts || 0, icon: Users, color: '#8b5cf6' },
    ];

    return (
        <div>
            <div className="page-header">
                <h2><BarChart3 size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />CRM Pipeline</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `crm_${tab}`)}><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`CRM - ${tab}`)}><FileText size={15} /> PDF</button>
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
                <div className="search-box"><Search className="search-icon" size={16} /><input type="text" className="form-input" placeholder={`Search ${tab}...`} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{total} {tab}</span>
            </div>

            {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr>
                                {tab === 'leads' && <><th>Name</th><th>Company</th><th>Email</th><th>Score</th><th>Source</th><th>Status</th><th>Actions</th></>}
                                {tab === 'accounts' && <><th>Account</th><th>Industry</th><th>Revenue</th><th>City</th><th>Status</th><th>Actions</th></>}
                                {tab === 'opportunities' && <><th>Name</th><th>Account</th><th>Amount</th><th>Stage</th><th>Probability</th><th>Close Date</th><th>Actions</th></>}
                                {tab === 'interactions' && <><th>Date</th><th>Type</th><th>Subject</th><th>Contact</th><th>Notes</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={7} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No {tab} found</td></tr> : items.map(item => (
                                    <tr key={item.id}>
                                        {tab === 'leads' && <>
                                            <td style={{ fontWeight: 500 }}>{item.first_name} {item.last_name}</td>
                                            <td>{item.company || '-'}</td>
                                            <td>{item.email}</td>
                                            <td><span className={`badge ${item.score_label === 'hot' ? 'badge-danger' : item.score_label === 'warm' ? 'badge-warning' : 'badge-info'}`}>{item.score} ({item.score_label})</span></td>
                                            <td>{item.source || '-'}</td>
                                            <td><span className={`badge ${item.status === 'converted' ? 'badge-success' : item.status === 'unqualified' ? 'badge-danger' : 'badge-info'}`}><span className="badge-dot"></span>{item.status}</span></td>
                                        </>}
                                        {tab === 'accounts' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td><span className="badge badge-neutral">{item.industry || '-'}</span></td>
                                            <td>{fmtCur(item.annual_revenue)}</td>
                                            <td>{item.city || '-'}</td>
                                            <td><span className={`badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}`}><span className="badge-dot"></span>{item.status}</span></td>
                                        </>}
                                        {tab === 'opportunities' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td>{item.account_name || '-'}</td>
                                            <td style={{ fontWeight: 600 }}>{fmtCur(item.amount)}</td>
                                            <td><span className="badge" style={{ background: `${STAGE_COLORS[item.stage] || '#6b7280'}20`, color: STAGE_COLORS[item.stage] || '#6b7280', border: 'none' }}>{item.stage?.replace('_', ' ')}</span></td>
                                            <td>{item.probability || 0}%</td>
                                            <td style={{ color: item.expected_close_date && new Date(item.expected_close_date) < new Date() && item.stage !== 'closed_won' ? 'var(--danger)' : 'inherit' }}>{item.expected_close_date || '-'}</td>
                                        </>}
                                        {tab === 'interactions' && <>
                                            <td>{item.date || item.created_at?.split('T')[0] || '-'}</td>
                                            <td><span className="badge badge-neutral">{item.type}</span></td>
                                            <td style={{ fontWeight: 500 }}>{item.subject || '-'}</td>
                                            <td>{item.contact_name || '-'}</td>
                                            <td className="text-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.notes || '-'}</td>
                                        </>}
                                        {tab !== 'interactions' && <td><div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
                                        </div></td>}
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
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab.slice(0, -1)}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'leads' && <>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">First Name <span className="required">*</span></label><input className="form-input" value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Last Name <span className="required">*</span></label><input className="form-input" value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Email <span className="required">*</span></label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Company</label><input className="form-input" value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Source</label><select className="form-select" value={form.source || 'website'} onChange={e => setForm({ ...form, source: e.target.value })}><option>website</option><option>referral</option><option>social_media</option><option>email_campaign</option><option>cold_call</option></select></div>
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'new'} onChange={e => setForm({ ...form, status: e.target.value })}><option>new</option><option>contacted</option><option>qualified</option><option>unqualified</option><option>converted</option></select></div>
                                </div>
                            </>}
                            {tab === 'accounts' && <>
                                <div className="form-group"><label className="form-label">Account Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Industry</label><input className="form-input" value={form.industry || ''} onChange={e => setForm({ ...form, industry: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Annual Revenue</label><input type="number" className="form-input" value={form.annual_revenue || ''} onChange={e => setForm({ ...form, annual_revenue: +e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">City</label><input className="form-input" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })}><option>active</option><option>inactive</option><option>prospect</option></select></div>
                                </div>
                            </>}
                            {tab === 'opportunities' && <>
                                <div className="form-group"><label className="form-label">Opportunity Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Account ID</label><input className="form-input" value={form.account_id || ''} onChange={e => setForm({ ...form, account_id: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Amount</label><input type="number" className="form-input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: +e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Stage</label><select className="form-select" value={form.stage || 'prospecting'} onChange={e => setForm({ ...form, stage: e.target.value })}><option>prospecting</option><option>qualification</option><option>proposal</option><option>negotiation</option><option>closed_won</option><option>closed_lost</option></select></div>
                                    <div className="form-group"><label className="form-label">Close Date</label><input type="date" className="form-input" value={form.expected_close_date || ''} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} /></div>
                                </div>
                            </>}
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : 'Create'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
