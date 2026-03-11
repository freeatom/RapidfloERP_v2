import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Trash2, ShoppingCart, Download, FileText, TrendingUp, DollarSign, Package, AlertTriangle, BarChart3 } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const fmtCur = v => `₹${(v || 0).toLocaleString('en-IN')}`;

export default function SalesPage() {
    const [tab, setTab] = useState('products');
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

    const tabs = [{ id: 'products', label: 'Products', icon: Package }, { id: 'quotes', label: 'Quotes', icon: FileText }, { id: 'orders', label: 'Orders', icon: ShoppingCart }];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, s] = await Promise.all([
                api(`/sales/${tab}?page=${page}&search=${search}`),
                api('/sales/stats')
            ]);
            setItems(data[tab] || data.products || data.quotes || data.orders || []);
            setTotal(data.total || 0);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, page, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        try {
            if (editItem) { await api(`/sales/${tab}/${editItem.id}`, { method: 'PUT', body: form }); toast('Updated', 'success'); }
            else { await api(`/sales/${tab}`, { method: 'POST', body: form }); toast('Created', 'success'); }
            setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this record?')) return;
        try { await api(`/sales/${tab}/${id}`, { method: 'DELETE' }); toast('Deleted', 'success'); fetchData(); } catch (err) { toast(err.message, 'error'); }
    };

    const kpis = [
        { label: 'Total Revenue', value: fmtCur(stats.totalRevenue), icon: DollarSign, color: '#10b981' },
        { label: 'Orders This Month', value: stats.ordersThisMonth || 0, icon: ShoppingCart, color: '#6366f1' },
        { label: 'Avg Order Value', value: fmtCur(stats.avgOrderValue), icon: TrendingUp, color: '#f59e0b' },
        { label: 'Pending Quotes', value: stats.pendingQuotes || 0, icon: FileText, color: '#06b6d4' },
        { label: 'Active Products', value: stats.totalProducts || 0, icon: Package, color: '#8b5cf6' },
        { label: 'Low Stock Items', value: stats.lowStock || 0, icon: AlertTriangle, color: stats.lowStock > 0 ? '#ef4444' : '#10b981' },
    ];

    return (
        <div>
            <div className="page-header">
                <h2><BarChart3 size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Sales Management</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `sales_${tab}`)} title="Export CSV"><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`Sales - ${tab}`)} title="Export PDF"><FileText size={15} /> PDF</button>
                    <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({}); setShowModal(true); }}><Plus size={16} /> New {tab.slice(0, -1)}</button>
                </div>
            </div>

            {/* KPI Row */}
            <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {kpis.map((k, i) => (
                    <div key={i} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'default' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${k.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <k.icon size={18} color={k.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{k.label}</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>{k.value}</div>
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
                                {tab === 'products' && <><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></>}
                                {tab === 'quotes' && <><th>Quote #</th><th>Account</th><th>Amount</th><th>Valid Until</th><th>Status</th><th>Actions</th></>}
                                {tab === 'orders' && <><th>Order #</th><th>Account</th><th>Amount</th><th>Date</th><th>Status</th><th>Actions</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={7} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No {tab} found</td></tr> : items.map(item => (
                                    <tr key={item.id}>
                                        {tab === 'products' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td className="font-mono">{item.sku}</td>
                                            <td><span className="badge badge-neutral">{item.category}</span></td>
                                            <td>{fmtCur(item.base_price)}</td>
                                            <td style={{ color: (item.total_stock || 0) < 10 ? 'var(--danger)' : 'inherit', fontWeight: (item.total_stock || 0) < 10 ? 600 : 400 }}>{item.total_stock ?? '-'}</td>
                                            <td><span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}><span className="badge-dot"></span>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                                        </>}
                                        {tab === 'quotes' && <>
                                            <td className="font-mono">{item.quote_number}</td>
                                            <td>{item.account_name || '-'}</td>
                                            <td>{fmtCur(item.total_amount)}</td>
                                            <td>{item.valid_until || '-'}</td>
                                            <td><span className={`badge ${item.status === 'accepted' ? 'badge-success' : item.status === 'expired' ? 'badge-danger' : 'badge-info'}`}>{item.status}</span></td>
                                        </>}
                                        {tab === 'orders' && <>
                                            <td className="font-mono">{item.order_number}</td>
                                            <td>{item.account_name || '-'}</td>
                                            <td>{fmtCur(item.total_amount)}</td>
                                            <td>{item.order_date || '-'}</td>
                                            <td><span className={`badge ${item.status === 'delivered' ? 'badge-success' : item.status === 'processing' ? 'badge-warning' : 'badge-info'}`}>{item.status}</span></td>
                                        </>}
                                        <td><div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
                                        </div></td>
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
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab.slice(0, -1)}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'products' && <>
                                <div className="form-group"><label className="form-label">Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">SKU</label><input className="form-input" value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Base Price</label><input type="number" className="form-input" value={form.base_price || ''} onChange={e => setForm({ ...form, base_price: +e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Cost Price</label><input type="number" className="form-input" value={form.cost_price || ''} onChange={e => setForm({ ...form, cost_price: +e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Tax Rate (%)</label><input type="number" className="form-input" value={form.tax_rate ?? 18} onChange={e => setForm({ ...form, tax_rate: +e.target.value })} /></div>
                            </>}
                            {tab === 'quotes' && <>
                                <div className="form-group"><label className="form-label">Account ID</label><input className="form-input" value={form.account_id || ''} onChange={e => setForm({ ...form, account_id: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Valid Until</label><input type="date" className="form-input" value={form.valid_until || ''} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Discount %</label><input type="number" className="form-input" value={form.discount_percent || 0} onChange={e => setForm({ ...form, discount_percent: +e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}></textarea></div>
                            </>}
                            {tab === 'orders' && <>
                                <div className="form-group"><label className="form-label">Account ID</label><input className="form-input" value={form.account_id || ''} onChange={e => setForm({ ...form, account_id: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Status</label>
                                        <select className="form-select" value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}>
                                            <option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    <div className="form-group"><label className="form-label">Payment Terms</label>
                                        <select className="form-select" value={form.payment_terms || 'net30'} onChange={e => setForm({ ...form, payment_terms: e.target.value })}>
                                            <option>net15</option><option>net30</option><option>net60</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}></textarea></div>
                            </>}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : 'Create'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
