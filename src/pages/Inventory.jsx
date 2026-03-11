import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Trash2, AlertTriangle, Package, Download, FileText, Warehouse, ArrowUpDown, BarChart3, TrendingUp } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const fmtCur = v => `₹${(v || 0).toLocaleString('en-IN')}`;

export default function InventoryPage() {
    const [tab, setTab] = useState('stock');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({});
    const [stats, setStats] = useState({});
    const toast = useToast();

    const tabs = [{ id: 'stock', label: 'Stock Levels', icon: Package }, { id: 'warehouses', label: 'Warehouses', icon: Warehouse }, { id: 'movements', label: 'Movements', icon: ArrowUpDown }, { id: 'purchase-orders', label: 'Purchase Orders', icon: FileText }];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, s] = await Promise.all([
                api(`/inventory/${tab}?search=${search}`),
                api('/inventory/stats')
            ]);
            setItems(data[tab.replace('-', '_')] || data.stock_levels || data.warehouses || data.movements || data.purchase_orders || data.purchaseOrders || []);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const kpis = [
        { label: 'Total SKUs', value: stats.totalSKUs || 0, icon: Package, color: '#6366f1' },
        { label: 'Low Stock Alerts', value: stats.lowStock || 0, icon: AlertTriangle, color: stats.lowStock > 0 ? '#ef4444' : '#10b981' },
        { label: 'Stock Value', value: fmtCur(stats.stockValue), icon: TrendingUp, color: '#10b981' },
        { label: 'Movements Today', value: stats.movementsToday || 0, icon: ArrowUpDown, color: '#f59e0b' },
        { label: 'Warehouses', value: stats.warehouses || 0, icon: Warehouse, color: '#8b5cf6' },
        { label: 'Total Units', value: (stats.totalUnits || 0).toLocaleString(), icon: BarChart3, color: '#06b6d4' },
    ];

    return (
        <div>
            <div className="page-header">
                <h2><Package size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Inventory Management</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `inventory_${tab}`)}><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`Inventory - ${tab}`)}><FileText size={15} /> PDF</button>
                    <button className="btn btn-primary" onClick={() => { setForm({}); setShowModal(true); }}><Plus size={16} /> New {tab === 'stock' ? 'Movement' : 'Entry'}</button>
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

            <div className="tabs">{tabs.map(t => <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><t.icon size={14} style={{ marginRight: 6 }} />{t.label}</button>)}</div>

            <div className="toolbar">
                <div className="search-box"><Search className="search-icon" size={16} /><input type="text" className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            </div>

            {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr>
                                {tab === 'stock' && <><th>Product</th><th>SKU</th><th>Warehouse</th><th>Available</th><th>Reserved</th><th>Reorder Level</th><th>Status</th></>}
                                {tab === 'warehouses' && <><th>Name</th><th>Code</th><th>Location</th><th>Manager</th><th>Capacity</th><th>Status</th></>}
                                {tab === 'movements' && <><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Reference</th></>}
                                {tab === 'purchase-orders' && <><th>PO #</th><th>Vendor</th><th>Amount</th><th>Date</th><th>Status</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={7} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No data found</td></tr> : items.map((item, idx) => (
                                    <tr key={item.id || idx}>
                                        {tab === 'stock' && <>
                                            <td style={{ fontWeight: 500 }}>{item.product_name || item.name || '-'}</td>
                                            <td className="font-mono">{item.sku || '-'}</td>
                                            <td>{item.warehouse_name || '-'}</td>
                                            <td style={{ fontWeight: 600, color: (item.available_quantity || 0) < (item.min_stock_level || 10) ? 'var(--danger)' : 'var(--success)' }}>{item.available_quantity ?? 0}</td>
                                            <td>{item.reserved_quantity ?? 0}</td>
                                            <td>{item.min_stock_level || item.reorder_point || '-'}</td>
                                            <td><span className={`badge ${(item.available_quantity || 0) < (item.min_stock_level || 10) ? 'badge-danger' : 'badge-success'}`}>{(item.available_quantity || 0) < (item.min_stock_level || 10) ? 'Low' : 'OK'}</span></td>
                                        </>}
                                        {tab === 'warehouses' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td className="font-mono">{item.code}</td>
                                            <td>{item.city || item.location || '-'}</td>
                                            <td>{item.manager_name || '-'}</td>
                                            <td>{item.capacity || '-'}</td>
                                            <td><span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                                        </>}
                                        {tab === 'movements' && <>
                                            <td>{item.created_at?.split('T')[0] || '-'}</td>
                                            <td>{item.product_name || '-'}</td>
                                            <td><span className={`badge ${item.type === 'inbound' ? 'badge-success' : item.type === 'outbound' ? 'badge-danger' : 'badge-info'}`}>{item.type}</span></td>
                                            <td style={{ fontWeight: 600 }}>{item.quantity}</td>
                                            <td>{item.from_warehouse_name || '-'}</td>
                                            <td>{item.to_warehouse_name || '-'}</td>
                                            <td className="font-mono">{item.reference_number || '-'}</td>
                                        </>}
                                        {tab === 'purchase-orders' && <>
                                            <td className="font-mono">{item.po_number || '-'}</td>
                                            <td>{item.vendor_name || '-'}</td>
                                            <td>{fmtCur(item.total_amount)}</td>
                                            <td>{item.order_date || item.created_at?.split('T')[0] || '-'}</td>
                                            <td><span className={`badge ${item.status === 'received' ? 'badge-success' : item.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}`}>{item.status}</span></td>
                                        </>}
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
                        <div className="modal-header"><h3>New {tab === 'stock' ? 'Stock Movement' : 'Entry'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            <div className="form-group"><label className="form-label">Product ID <span className="required">*</span></label><input className="form-input" value={form.product_id || ''} onChange={e => setForm({ ...form, product_id: e.target.value })} /></div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">Type</label>
                                    <select className="form-select" value={form.type || 'inbound'} onChange={e => setForm({ ...form, type: e.target.value })}>
                                        <option>inbound</option><option>outbound</option><option>transfer</option><option>adjustment</option>
                                    </select>
                                </div>
                                <div className="form-group"><label className="form-label">Quantity</label><input type="number" className="form-input" value={form.quantity || ''} onChange={e => setForm({ ...form, quantity: +e.target.value })} /></div>
                            </div>
                            <div className="form-group"><label className="form-label">Reference</label><input className="form-input" value={form.reference_number || ''} onChange={e => setForm({ ...form, reference_number: e.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}></textarea></div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={async () => {
                                try { await api('/inventory/movements', { method: 'POST', body: form }); toast('Movement created', 'success'); setShowModal(false); setForm({}); fetchData(); } catch (err) { toast(err.message, 'error'); }
                            }}>Create</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
