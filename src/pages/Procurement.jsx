import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Star, Truck, Download, FileText, DollarSign, CheckCircle, Clock, TrendingUp, Users } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const fmtCur = v => `₹${(v || 0).toLocaleString('en-IN')}`;

export default function ProcurementPage() {
    const [tab, setTab] = useState('vendors');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({});
    const [editItem, setEditItem] = useState(null);
    const [stats, setStats] = useState({});
    const toast = useToast();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, s] = await Promise.all([
                api(`/procurement/${tab}?search=${search}`),
                api('/procurement/stats')
            ]);
            setItems(data[tab] || data.vendors || data.requests || []);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, search]);
    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        try {
            if (editItem) { await api(`/procurement/${tab}/${editItem.id}`, { method: 'PUT', body: form }); }
            else { await api(`/procurement/${tab}`, { method: 'POST', body: form }); }
            toast(editItem ? 'Updated' : 'Created', 'success');
            setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const kpis = [
        { label: 'Active Vendors', value: stats.activeVendors || 0, icon: Users, color: '#10b981' },
        { label: 'Pending Requests', value: stats.pendingRequests || 0, icon: Clock, color: '#f59e0b' },
        { label: 'Total Spend', value: fmtCur(stats.totalSpend), icon: DollarSign, color: '#6366f1' },
        { label: 'Avg Vendor Rating', value: `${stats.avgRating || 0} ★`, icon: Star, color: '#f59e0b' },
        { label: 'Approved This Month', value: stats.approvedThisMonth || 0, icon: CheckCircle, color: '#10b981' },
        { label: 'Total Vendors', value: stats.totalVendors || 0, icon: Truck, color: '#8b5cf6' },
    ];

    return (
        <div>
            <div className="page-header"><h2><Truck size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Procurement</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `procurement_${tab}`)}><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`Procurement - ${tab}`)}><FileText size={15} /> PDF</button>
                    <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({}); setShowModal(true); }}><Plus size={16} /> New {tab === 'vendors' ? 'Vendor' : 'Request'}</button>
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

            <div className="tabs">
                <button className={`tab-item ${tab === 'vendors' ? 'active' : ''}`} onClick={() => setTab('vendors')}><Truck size={14} style={{ marginRight: 6 }} />Vendors</button>
                <button className={`tab-item ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}><FileText size={14} style={{ marginRight: 6 }} />Procurement Requests</button>
            </div>
            <div className="toolbar"><div className="search-box"><Search className="search-icon" size={16} /><input type="text" className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div></div>

            {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr>
                                {tab === 'vendors' && <><th>Vendor</th><th>Code</th><th>Category</th><th>Email</th><th>Rating</th><th>Terms</th><th>Status</th><th>Actions</th></>}
                                {tab === 'requests' && <><th>Request #</th><th>Title</th><th>Department</th><th>Priority</th><th>Budget</th><th>Status</th><th>Actions</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No data</td></tr> : items.map(item => (
                                    <tr key={item.id}>
                                        {tab === 'vendors' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td className="font-mono">{item.code}</td>
                                            <td><span className="badge badge-neutral">{item.category}</span></td>
                                            <td>{item.email}</td>
                                            <td><div style={{ display: 'flex', gap: 2 }}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} fill={i < (item.rating || 0) ? '#f59e0b' : 'transparent'} color={i < (item.rating || 0) ? '#f59e0b' : 'var(--text-disabled)'} />)}</div></td>
                                            <td>{item.payment_terms}</td>
                                            <td><span className={`badge ${item.status === 'active' ? 'badge-success' : 'badge-warning'}`}><span className="badge-dot"></span>{item.status}</span></td>
                                        </>}
                                        {tab === 'requests' && <>
                                            <td className="font-mono">{item.request_number || '-'}</td>
                                            <td style={{ fontWeight: 500 }}>{item.title}</td>
                                            <td>{item.department || '-'}</td>
                                            <td><span className={`badge ${item.priority === 'high' || item.priority === 'critical' ? 'badge-danger' : item.priority === 'medium' ? 'badge-warning' : 'badge-info'}`}>{item.priority}</span></td>
                                            <td>{fmtCur(item.estimated_budget)}</td>
                                            <td><span className={`badge ${item.status === 'approved' ? 'badge-success' : item.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{item.status}</span></td>
                                        </>}
                                        <td><button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab === 'vendors' ? 'Vendor' : 'Request'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'vendors' && <>
                                <div className="form-group"><label className="form-label">Vendor Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Code</label><input className="form-input" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Payment Terms</label>
                                        <select className="form-select" value={form.payment_terms || 'net30'} onChange={e => setForm({ ...form, payment_terms: e.target.value })}><option>net15</option><option>net30</option><option>net60</option><option>net90</option></select>
                                    </div>
                                </div>
                            </>}
                            {tab === 'requests' && <>
                                <div className="form-group"><label className="form-label">Title <span className="required">*</span></label><input className="form-input" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}></textarea></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Priority</label>
                                        <select className="form-select" value={form.priority || 'medium'} onChange={e => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option><option>critical</option></select>
                                    </div>
                                    <div className="form-group"><label className="form-label">Budget</label><input type="number" className="form-input" value={form.estimated_budget || ''} onChange={e => setForm({ ...form, estimated_budget: +e.target.value })} /></div>
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
