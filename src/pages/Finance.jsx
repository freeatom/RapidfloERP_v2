import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Download, FileText, DollarSign, TrendingUp, TrendingDown, CreditCard, AlertTriangle, BarChart3, Receipt, PieChart, Banknote } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const fmtCur = v => `₹${(v || 0).toLocaleString('en-IN')}`;

export default function FinancePage() {
    const [tab, setTab] = useState('invoices');
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

    const tabs = [
        { id: 'invoices', label: 'Invoices', icon: FileText },
        { id: 'payments', label: 'Payments', icon: CreditCard },
        { id: 'expenses', label: 'Expenses', icon: Receipt },
        { id: 'gl', label: 'GL Entries', icon: BarChart3 },
    ];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, s] = await Promise.all([
                api(`/finance/${tab}?page=${page}&search=${search}`),
                api('/finance/stats')
            ]);
            setItems(data[tab] || data.invoices || data.payments || data.expenses || data.entries || []);
            setTotal(data.total || 0);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, page, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        try {
            if (editItem) { await api(`/finance/${tab}/${editItem.id}`, { method: 'PUT', body: form }); }
            else { await api(`/finance/${tab}`, { method: 'POST', body: form }); }
            toast(editItem ? 'Updated' : 'Created', 'success');
            setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const kpis = [
        { label: 'Revenue MTD', value: fmtCur(stats.revenueMTD), icon: TrendingUp, color: '#10b981' },
        { label: 'Outstanding AR', value: fmtCur(stats.outstandingAR), icon: DollarSign, color: '#6366f1' },
        { label: 'Outstanding AP', value: fmtCur(stats.outstandingAP), icon: CreditCard, color: '#f59e0b' },
        { label: 'Cash Balance', value: fmtCur(stats.cashBalance), icon: Banknote, color: '#06b6d4' },
        { label: 'Overdue Invoices', value: stats.overdueInvoices || 0, icon: AlertTriangle, color: stats.overdueInvoices > 0 ? '#ef4444' : '#10b981' },
        { label: 'Expenses MTD', value: fmtCur(stats.expensesMTD), icon: TrendingDown, color: '#ef4444' },
    ];

    return (
        <div>
            <div className="page-header">
                <h2><PieChart size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Finance & Accounting</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `finance_${tab}`)}><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`Finance - ${tab}`)}><FileText size={15} /> PDF</button>
                    <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({}); setShowModal(true); }}><Plus size={16} /> New Entry</button>
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
                                {tab === 'invoices' && <><th>Invoice #</th><th>Type</th><th>Account</th><th>Amount</th><th>Balance</th><th>Due Date</th><th>Status</th><th>Actions</th></>}
                                {tab === 'payments' && <><th>Payment #</th><th>Type</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th></>}
                                {tab === 'expenses' && <><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Submitted By</th><th>Status</th><th>Actions</th></>}
                                {tab === 'gl' && <><th>Date</th><th>Account</th><th>Description</th><th>Debit</th><th>Credit</th><th>Reference</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No {tab} found</td></tr> : items.map(item => (
                                    <tr key={item.id}>
                                        {tab === 'invoices' && <>
                                            <td className="font-mono" style={{ fontWeight: 500 }}>{item.invoice_number}</td>
                                            <td><span className={`badge ${item.type === 'sales' ? 'badge-success' : 'badge-info'}`}>{item.type}</span></td>
                                            <td>{item.account_name || '-'}</td>
                                            <td style={{ fontWeight: 600 }}>{fmtCur(item.total_amount)}</td>
                                            <td style={{ color: (item.balance_due || 0) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}>{fmtCur(item.balance_due)}</td>
                                            <td style={{ color: item.due_date && new Date(item.due_date) < new Date() && item.status !== 'paid' ? 'var(--danger)' : 'inherit', fontWeight: item.due_date && new Date(item.due_date) < new Date() && item.status !== 'paid' ? 600 : 400 }}>{item.due_date || '-'}</td>
                                            <td><span className={`badge ${item.status === 'paid' ? 'badge-success' : item.status === 'overdue' ? 'badge-danger' : item.status === 'partial' ? 'badge-warning' : 'badge-info'}`}><span className="badge-dot"></span>{item.status}</span></td>
                                        </>}
                                        {tab === 'payments' && <>
                                            <td className="font-mono">{item.payment_number || '-'}</td>
                                            <td><span className={`badge ${item.type === 'received' ? 'badge-success' : 'badge-info'}`}>{item.type}</span></td>
                                            <td style={{ fontWeight: 600 }}>{fmtCur(item.amount)}</td>
                                            <td>{item.payment_method || '-'}</td>
                                            <td>{item.payment_date || '-'}</td>
                                            <td><span className={`badge ${item.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{item.status}</span></td>
                                        </>}
                                        {tab === 'expenses' && <>
                                            <td>{item.expense_date || '-'}</td>
                                            <td><span className="badge badge-neutral">{item.category}</span></td>
                                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</td>
                                            <td style={{ fontWeight: 600 }}>{fmtCur(item.total_amount || item.amount)}</td>
                                            <td>{item.submitted_by_name || '-'}</td>
                                            <td><span className={`badge ${item.status === 'approved' ? 'badge-success' : item.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{item.status}</span></td>
                                        </>}
                                        {tab === 'gl' && <>
                                            <td>{item.date || '-'}</td>
                                            <td className="font-mono">{item.account_code} - {item.account_name || '-'}</td>
                                            <td>{item.description || '-'}</td>
                                            <td style={{ color: item.debit > 0 ? 'var(--danger)' : 'inherit', fontWeight: item.debit > 0 ? 500 : 400 }}>{item.debit > 0 ? fmtCur(item.debit) : '-'}</td>
                                            <td style={{ color: item.credit > 0 ? 'var(--success)' : 'inherit', fontWeight: item.credit > 0 ? 500 : 400 }}>{item.credit > 0 ? fmtCur(item.credit) : '-'}</td>
                                            <td className="font-mono">{item.reference || '-'}</td>
                                        </>}
                                        {(tab === 'invoices' || tab === 'expenses') && <td><button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button></td>}
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
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab === 'invoices' ? 'Invoice' : tab === 'expenses' ? 'Expense' : 'Entry'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'invoices' && <>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type || 'sales'} onChange={e => setForm({ ...form, type: e.target.value })}><option>sales</option><option>purchase</option></select></div>
                                    <div className="form-group"><label className="form-label">Account ID</label><input className="form-input" value={form.account_id || ''} onChange={e => setForm({ ...form, account_id: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-input" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}><option>draft</option><option>sent</option><option>partial</option><option>paid</option><option>overdue</option><option>cancelled</option></select></div>
                                </div>
                                <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}></textarea></div>
                            </>}
                            {tab === 'expenses' && <>
                                <div className="form-group"><label className="form-label">Description <span className="required">*</span></label><input className="form-input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Category</label><select className="form-select" value={form.category || 'office_supplies'} onChange={e => setForm({ ...form, category: e.target.value })}><option>office_supplies</option><option>travel</option><option>software</option><option>hardware</option><option>meals</option><option>utilities</option><option>rent</option><option>other</option></select></div>
                                    <div className="form-group"><label className="form-label">Amount</label><input type="number" className="form-input" value={form.total_amount || ''} onChange={e => setForm({ ...form, total_amount: +e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={form.expense_date || ''} onChange={e => setForm({ ...form, expense_date: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'pending'} onChange={e => setForm({ ...form, status: e.target.value })}><option>pending</option><option>approved</option><option>rejected</option></select></div>
                                </div>
                            </>}
                            {tab === 'payments' && <>
                                <div className="form-group"><label className="form-label">Invoice ID</label><input className="form-input" value={form.invoice_id || ''} onChange={e => setForm({ ...form, invoice_id: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Amount</label><input type="number" className="form-input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: +e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Method</label><select className="form-select" value={form.payment_method || 'bank_transfer'} onChange={e => setForm({ ...form, payment_method: e.target.value })}><option>bank_transfer</option><option>credit_card</option><option>cash</option><option>cheque</option><option>upi</option></select></div>
                                </div>
                                <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={form.payment_date || ''} onChange={e => setForm({ ...form, payment_date: e.target.value })} /></div>
                            </>}
                            {tab === 'gl' && <>
                                <div className="form-group"><label className="form-label">Account Code</label><input className="form-input" value={form.account_code || ''} onChange={e => setForm({ ...form, account_code: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Debit</label><input type="number" className="form-input" value={form.debit || ''} onChange={e => setForm({ ...form, debit: +e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Credit</label><input type="number" className="form-input" value={form.credit || ''} onChange={e => setForm({ ...form, credit: +e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Description</label><input className="form-input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                            </>}
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : 'Create'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
