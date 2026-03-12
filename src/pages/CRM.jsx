import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Trash2, Download, FileText, Users, Target, DollarSign, TrendingUp, Star, Activity, CheckCircle, BarChart3, Upload, Info, Phone, ChevronDown, ArrowRightCircle, UserPlus, Calendar, AlertTriangle, Clock, Flame } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../utils/export';

const fmtCur = v => `₹${(v || 0).toLocaleString('en-IN')}`;
const STAGE_COLORS = { prospecting: '#60a5fa', qualification: '#f59e0b', proposal: '#8b5cf6', negotiation: '#ec4899', closed_won: '#10b981', closed_lost: '#ef4444' };
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
const STATUS_COLORS = { new: 'badge-info', contacted: 'badge-neutral', qualified: 'badge-warning', unqualified: 'badge-danger', converted: 'badge-success' };
const OPP_STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const SCORE_LABEL = { hot: { color: '#ef4444', icon: '🔥', bg: 'rgba(239,68,68,0.12)' }, warm: { color: '#f59e0b', icon: '🌤', bg: 'rgba(245,158,11,0.12)' }, cold: { color: '#60a5fa', icon: '❄️', bg: 'rgba(96,165,250,0.12)' } };

// Follow-up display helper
function followUpLabel(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const fDate = new Date(dateStr); fDate.setHours(0, 0, 0, 0);
    const diff = Math.round((fDate - today) / 86400000);
    if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: '#ef4444', overdue: true };
    if (diff === 0) return { text: 'Today', color: '#f59e0b', overdue: false };
    if (diff === 1) return { text: 'Tomorrow', color: '#10b981', overdue: false };
    if (diff <= 7) return { text: `In ${diff}d`, color: '#10b981', overdue: false };
    return { text: dateStr, color: 'var(--text-muted)', overdue: false };
}

export default function CRMPage() {
    const [tab, setTab] = useState('leads');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [form, setForm] = useState({});
    const [stats, setStats] = useState({});
    const [showImport, setShowImport] = useState(false);
    const [importData, setImportData] = useState('');
    const [importing, setImporting] = useState(false);
    const [showFormatGuide, setShowFormatGuide] = useState(false);
    const [statusDropdown, setStatusDropdown] = useState(null);
    const [fadeIn, setFadeIn] = useState(true);
    const [teamUsers, setTeamUsers] = useState([]);
    const toast = useToast();

    const tabs = [
        { id: 'leads', label: 'Leads', icon: Target },
        { id: 'contacts', label: 'Contacts', icon: Phone },
        { id: 'accounts', label: 'Accounts', icon: Users },
        { id: 'opportunities', label: 'Pipeline', icon: DollarSign },
        { id: 'activities', label: 'Activities', icon: Activity },
    ];

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const endpoint = tab === 'activities' ? 'activities' : tab;
            const [data, s] = await Promise.all([
                api(`/crm/${endpoint}?page=${page}&search=${search}`),
                api('/crm/stats')
            ]);
            setItems(data[endpoint] || data[tab] || []);
            setTotal(data.total || 0);
            setStats(s);
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
        setInitialLoad(false);
    }, [tab, page, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Fetch team users once for assigned_to dropdowns
    useEffect(() => {
        api('/crm/users').then(u => setTeamUsers(Array.isArray(u) ? u : [])).catch(() => { });
    }, []);

    // Smooth tab transition
    const switchTab = (newTab) => {
        if (newTab === tab) return;
        setFadeIn(false);
        setTimeout(() => {
            setTab(newTab);
            setPage(1);
            setStatusDropdown(null);
            setFadeIn(true);
        }, 120);
    };

    const handleSave = async () => {
        try {
            const endpoint = tab === 'activities' ? 'activities' : tab;
            if (editItem) { await api(`/crm/${endpoint}/${editItem.id}`, { method: 'PUT', body: form }); }
            else { await api(`/crm/${endpoint}`, { method: 'POST', body: form }); }
            toast(editItem ? 'Updated' : 'Created', 'success');
            setShowModal(false); setEditItem(null); setForm({});
            fetchData(true);
        } catch (err) { toast(err.message, 'error'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete?')) return;
        try {
            const endpoint = tab === 'activities' ? 'activities' : tab;
            await api(`/crm/${endpoint}/${id}`, { method: 'DELETE' });
            toast('Deleted', 'success');
            fetchData(true);
        } catch (err) { toast(err.message, 'error'); }
    };

    // INLINE STATUS CHANGE — updates lead status directly, auto-syncs score
    const changeLeadStatus = async (item, newStatus) => {
        setStatusDropdown(null);
        try {
            await api(`/crm/leads/${item.id}`, { method: 'PUT', body: { status: newStatus } });

            // Auto-create contact when lead becomes qualified or converted
            if ((newStatus === 'qualified' || newStatus === 'converted') && item.status !== 'qualified' && item.status !== 'converted') {
                try {
                    await api('/crm/contacts', {
                        method: 'POST', body: {
                            first_name: item.first_name, last_name: item.last_name,
                            email: item.email, phone: item.phone,
                            job_title: item.job_title || '', lead_source: item.source || '',
                            notes: `Auto-created from lead (${newStatus})`
                        }
                    });
                    toast(`Lead → ${newStatus} + Contact created`, 'success');
                } catch { toast(`Lead → ${newStatus} (contact may already exist)`, 'success'); }
            } else {
                toast(`Status → ${newStatus}`, 'success');
            }
            fetchData(true);
        } catch (err) { toast(err.message, 'error'); }
    };

    // INLINE STAGE CHANGE for pipeline
    const changeOppStage = async (item, newStage) => {
        setStatusDropdown(null);
        try {
            await api(`/crm/opportunities/${item.id}`, { method: 'PUT', body: { stage: newStage } });
            toast(`Stage → ${newStage.replace('_', ' ')}`, 'success');
            fetchData(true);
        } catch (err) { toast(err.message, 'error'); }
    };

    // Excel / CSV import handler
    const handleImport = async () => {
        setImporting(true);
        try {
            let leads;
            try { leads = JSON.parse(importData); } catch {
                const lines = importData.trim().split('\n');
                if (lines.length < 2) throw new Error('Need header row + at least 1 data row');
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
                leads = lines.slice(1).filter(l => l.trim()).map(line => {
                    const vals = line.split(',').map(v => v.trim());
                    const obj = {};
                    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
                    return obj;
                });
            }
            if (!Array.isArray(leads)) leads = [leads];
            const result = await api('/crm/leads/import', { method: 'POST', body: { leads } });
            toast(`Imported ${result.imported} leads (${result.skipped} skipped)`, result.skipped > 0 ? 'warning' : 'success');
            setShowImport(false); setImportData(''); fetchData(true);
        } catch (err) { toast(err.message, 'error'); }
        setImporting(false);
    };

    // Convert lead to opportunity
    const convertLead = async (item) => {
        try {
            await api(`/crm/leads/${item.id}/convert`, {
                method: 'POST', body: {
                    name: `${item.company || item.first_name} Deal`,
                    amount: 0
                }
            });
            toast('Lead converted to deal + contact + account', 'success');
            fetchData(true);
        } catch (err) { toast(err.message, 'error'); }
    };

    const kpis = [
        { label: 'Total Leads', value: stats.totalLeads || 0, icon: Target, color: '#6366f1' },
        { label: 'Conversion', value: `${stats.conversionRate || 0}%`, icon: TrendingUp, color: '#10b981' },
        { label: 'Pipeline', value: fmtCur(stats.pipelineValue), icon: DollarSign, color: '#f59e0b' },
        { label: 'Hot Leads', value: stats.hotLeads || 0, icon: Flame, color: '#ef4444' },
        { label: 'Follow-ups Due', value: (stats.overdueFollowUps || 0) + (stats.followUpsDueToday || 0), icon: AlertTriangle, color: stats.overdueFollowUps > 0 ? '#ef4444' : '#f59e0b' },
        { label: 'Won', value: fmtCur(stats.wonThisMonth), icon: CheckCircle, color: '#10b981' },
    ];

    // Status badge component with inline dropdown
    const StatusBadge = ({ item, statuses, colorMap, currentKey, onSelect, stageMode }) => {
        const isOpen = statusDropdown === item.id;
        const current = stageMode ? item.stage : item.status;
        const badgeClass = stageMode ? '' : (colorMap?.[current] || 'badge-neutral');
        const badgeStyle = stageMode ? { background: `${STAGE_COLORS[current] || '#6b7280'}20`, color: STAGE_COLORS[current] || '#6b7280', border: 'none' } : {};

        return (
            <div style={{ position: 'relative', display: 'inline-block' }}>
                <span
                    className={`badge ${badgeClass}`}
                    style={{ ...badgeStyle, cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={(e) => { e.stopPropagation(); setStatusDropdown(isOpen ? null : item.id); }}
                >
                    <span className="badge-dot"></span>
                    {current?.replace(/_/g, ' ')}
                    <ChevronDown size={11} style={{ opacity: 0.6 }} />
                </span>
                {isOpen && <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setStatusDropdown(null)} />
                    <div style={{
                        position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 100,
                        background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                        borderRadius: 'var(--border-radius)', boxShadow: 'var(--shadow-xl)',
                        minWidth: 150, overflow: 'hidden'
                    }}>
                        {statuses.map(s => (
                            <div key={s}
                                onClick={(e) => { e.stopPropagation(); onSelect(item, s); }}
                                style={{
                                    padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem',
                                    fontWeight: s === current ? 600 : 400,
                                    background: s === current ? 'var(--bg-active)' : 'transparent',
                                    color: s === current ? 'var(--color-primary-light)' : 'var(--text-primary)',
                                    display: 'flex', alignItems: 'center', gap: 8
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = s === current ? 'var(--bg-active)' : 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = s === current ? 'var(--bg-active)' : 'transparent'}
                            >
                                {stageMode && <span style={{ width: 8, height: 8, borderRadius: '50%', background: STAGE_COLORS[s] || '#6b7280', flexShrink: 0 }} />}
                                {s.replace(/_/g, ' ')}
                                {s === current && <CheckCircle size={12} style={{ marginLeft: 'auto', color: 'var(--color-primary)' }} />}
                            </div>
                        ))}
                    </div>
                </>}
            </div>
        );
    };

    return (
        <div>
            <div className="page-header">
                <h2><BarChart3 size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />CRM</h2>
                <div className="page-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {tab === 'leads' && <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}><Upload size={15} /> Import</button>}
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items, `crm_${tab}`)}><Download size={15} /> CSV</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(`CRM - ${tab}`)}><FileText size={15} /> PDF</button>
                    {tab !== 'activities' && <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({}); setShowModal(true); }}><Plus size={16} /> New {tab === 'opportunities' ? 'Deal' : tab.slice(0, -1)}</button>}
                </div>
            </div>

            {/* KPIs - compact */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                {kpis.map((k, i) => (
                    <div key={i} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: `${k.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <k.icon size={16} color={k.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{k.label}</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{k.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="tabs">{tabs.map(t => (
                <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
                    <t.icon size={14} style={{ marginRight: 6 }} />{t.label}
                </button>
            ))}</div>

            {/* Toolbar */}
            <div className="toolbar">
                <div className="search-box"><Search className="search-icon" size={16} />
                    <input type="text" className="form-input" placeholder={`Search ${tab}...`} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{total} {tab}</span>
            </div>

            {/* Table with smooth fade */}
            <div style={{ opacity: fadeIn && !loading ? 1 : 0.4, transform: fadeIn ? 'none' : 'translateY(4px)', transition: 'opacity 150ms ease, transform 150ms ease' }}>
                {initialLoad ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead><tr>
                                    {tab === 'leads' && <><th>Name</th><th>Company</th><th>Phone</th><th>Score</th><th>Status</th><th>Follow-up</th><th>Assigned</th><th style={{ width: 100 }}>Actions</th></>}
                                    {tab === 'contacts' && <><th>Name</th><th>Account</th><th>Email</th><th>Phone</th><th>Job Title</th><th>Actions</th></>}
                                    {tab === 'accounts' && <><th>Account</th><th>Industry</th><th>Revenue</th><th>City</th><th>Status</th><th>Actions</th></>}
                                    {tab === 'opportunities' && <><th>Name</th><th>Account</th><th>Amount</th><th>Stage</th><th>Probability</th><th>Close Date</th><th>Actions</th></>}
                                    {tab === 'activities' && <><th>Date</th><th>Type</th><th>Subject</th><th>Status</th><th>Assigned To</th><th>Notes</th></>}
                                </tr></thead>
                                <tbody>
                                    {items.length === 0 ? (
                                        <tr><td colSpan={7} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No {tab} found</td></tr>
                                    ) : items.map(item => (
                                        <tr key={item.id}>
                                            {/* === LEADS === */}
                                            {tab === 'leads' && (() => {
                                                const fl = followUpLabel(item.next_follow_up);
                                                const sl = SCORE_LABEL[item.score_label] || SCORE_LABEL.cold;
                                                return <>
                                                    <td style={{ fontWeight: 500 }}>
                                                        <div>{item.first_name} {item.last_name}</div>
                                                        {item.job_title && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{item.job_title}</div>}
                                                    </td>
                                                    <td>{item.company || <span className="text-muted">—</span>}</td>
                                                    <td style={{ fontSize: '0.85rem' }}>{item.phone || <span className="text-muted">—</span>}</td>
                                                    <td>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600, background: sl.bg, color: sl.color }}>
                                                            <span>{sl.icon}</span>{item.score_label || 'cold'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <StatusBadge item={item} statuses={LEAD_STATUSES} colorMap={STATUS_COLORS} onSelect={changeLeadStatus} />
                                                    </td>
                                                    <td>
                                                        {fl ? (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: fl.overdue ? 600 : 500, color: fl.color }}>
                                                                {fl.overdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
                                                                {fl.text}
                                                            </span>
                                                        ) : <span className="text-muted" style={{ fontSize: '0.78rem' }}>—</span>}
                                                    </td>
                                                    <td style={{ fontSize: '0.8rem' }}>{item.assigned_to_name || <span className="text-muted">—</span>}</td>
                                                    <td><div style={{ display: 'flex', gap: 2 }}>
                                                        {item.status !== 'converted' && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => convertLead(item)} title="Convert to deal"><ArrowRightCircle size={14} color="#10b981" /></button>}
                                                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }} title="Edit"><Edit2 size={14} /></button>
                                                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)} title="Delete"><Trash2 size={14} /></button>
                                                    </div></td>
                                                </>;
                                            })()}
                                            {/* === CONTACTS === */}
                                            {tab === 'contacts' && <>
                                                <td style={{ fontWeight: 500 }}>{item.first_name} {item.last_name}</td>
                                                <td>{item.account_name || <span className="text-muted">—</span>}</td>
                                                <td style={{ fontSize: '0.85rem' }}>{item.email || <span className="text-muted">—</span>}</td>
                                                <td>{item.phone || item.mobile || <span className="text-muted">—</span>}</td>
                                                <td>{item.job_title || <span className="text-muted">—</span>}</td>
                                                <td><div style={{ display: 'flex', gap: 2 }}>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
                                                </div></td>
                                            </>}
                                            {/* === ACCOUNTS === */}
                                            {tab === 'accounts' && <>
                                                <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                <td><span className="badge badge-neutral">{item.industry || '—'}</span></td>
                                                <td>{fmtCur(item.annual_revenue)}</td>
                                                <td>{item.city || <span className="text-muted">—</span>}</td>
                                                <td><span className={`badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}`}><span className="badge-dot"></span>{item.status}</span></td>
                                                <td><div style={{ display: 'flex', gap: 2 }}>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
                                                </div></td>
                                            </>}
                                            {/* === PIPELINE === */}
                                            {tab === 'opportunities' && <>
                                                <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                <td>{item.account_name || <span className="text-muted">—</span>}</td>
                                                <td style={{ fontWeight: 600 }}>{fmtCur(item.amount)}</td>
                                                <td>
                                                    <StatusBadge item={item} statuses={OPP_STAGES} onSelect={changeOppStage} stageMode />
                                                </td>
                                                <td>{item.probability || 0}%</td>
                                                <td style={{ color: item.expected_close_date && new Date(item.expected_close_date) < new Date() && item.stage !== 'closed_won' ? 'var(--color-danger)' : 'inherit' }}>{item.expected_close_date || <span className="text-muted">—</span>}</td>
                                                <td><div style={{ display: 'flex', gap: 2 }}>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
                                                </div></td>
                                            </>}
                                            {/* === ACTIVITIES === */}
                                            {tab === 'activities' && <>
                                                <td style={{ whiteSpace: 'nowrap' }}>{item.due_date || item.created_at?.split('T')[0] || '—'}</td>
                                                <td><span className="badge badge-neutral">{item.type}</span></td>
                                                <td style={{ fontWeight: 500 }}>{item.subject || '—'}</td>
                                                <td><span className={`badge ${item.status === 'completed' ? 'badge-success' : item.status === 'overdue' ? 'badge-danger' : 'badge-info'}`}>{item.status}</span></td>
                                                <td>{item.assigned_name || <span className="text-muted">—</span>}</td>
                                                <td className="text-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.notes || '—'}</td>
                                            </>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {total > 25 && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12 }}>
                            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                            <span className="text-muted" style={{ fontSize: '0.82rem' }}>Page {page} of {Math.ceil(total / 25)}</span>
                            <button className="btn btn-ghost btn-sm" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(p => p + 1)}>Next →</button>
                        </div>}
                    </div>
                )}
            </div>

            {/* ===== CREATE / EDIT MODAL ===== */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab === 'opportunities' ? 'Deal' : tab.slice(0, -1)}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'leads' && <>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">First Name <span className="required">*</span></label><input className="form-input" value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Last Name <span className="required">*</span></label><input className="form-input" value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Phone</label><input type="tel" className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 9876543210" /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Company</label><input className="form-input" value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Job Title</label><input className="form-input" value={form.job_title || ''} onChange={e => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. CEO, Manager, Developer" /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Source</label><select className="form-select" value={form.source || 'website'} onChange={e => setForm({ ...form, source: e.target.value })}><option>website</option><option>referral</option><option>social_media</option><option>email_campaign</option><option>cold_call</option><option>linkedin</option><option>event</option><option>import</option></select></div>
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'new'} onChange={e => setForm({ ...form, status: e.target.value })}>{LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Assigned To</label><select className="form-select" value={form.assigned_to || ''} onChange={e => setForm({ ...form, assigned_to: e.target.value })}><option value="">— Unassigned —</option>{teamUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                                    <div className="form-group"><label className="form-label">Next Follow-up</label><input type="date" className="form-input" value={form.next_follow_up || ''} onChange={e => setForm({ ...form, next_follow_up: e.target.value })} min={new Date().toISOString().split('T')[0]} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Notes</label><textarea className="form-input" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Quick context: e.g. 'Call back after 15th', 'Interested in Plan B'" /></div>
                            </>}
                            {tab === 'contacts' && <>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">First Name <span className="required">*</span></label><input className="form-input" value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Last Name <span className="required">*</span></label><input className="form-input" value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Phone</label><input type="tel" className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 9876543210" /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Job Title</label><input className="form-input" value={form.job_title || ''} onChange={e => setForm({ ...form, job_title: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">City</label><input className="form-input" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">LinkedIn</label><input className="form-input" value={form.linkedin_url || ''} onChange={e => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." /></div>
                            </>}
                            {tab === 'accounts' && <>
                                <div className="form-group"><label className="form-label">Account Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Industry</label><input className="form-input" value={form.industry || ''} onChange={e => setForm({ ...form, industry: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Annual Revenue</label><input type="number" className="form-input" value={form.annual_revenue || ''} onChange={e => setForm({ ...form, annual_revenue: +e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Phone</label><input type="tel" className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">City</label><input className="form-input" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })}><option>active</option><option>inactive</option><option>prospect</option></select></div>
                                </div>
                            </>}
                            {tab === 'opportunities' && <>
                                <div className="form-group"><label className="form-label">Deal Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" className="form-input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: +e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Stage</label><select className="form-select" value={form.stage || 'prospecting'} onChange={e => setForm({ ...form, stage: e.target.value })}>{OPP_STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Close Date</label><input type="date" className="form-input" value={form.expected_close_date || ''} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Probability %</label><input type="number" min="0" max="100" className="form-input" value={form.probability || ''} onChange={e => setForm({ ...form, probability: +e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                            </>}
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : 'Create'}</button></div>
                    </div>
                </div>
            )}

            {/* ===== IMPORT MODAL ===== */}
            {showImport && (
                <div className="modal-overlay" onClick={() => setShowImport(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
                        <div className="modal-header">
                            <h3><Upload size={18} style={{ marginRight: 8 }} />Import Leads</h3>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowFormatGuide(!showFormatGuide)} title="Format guide" style={{ color: showFormatGuide ? 'var(--color-primary)' : 'var(--text-muted)' }}><Info size={16} /></button>
                                <button className="btn btn-ghost btn-icon" onClick={() => setShowImport(false)}>✕</button>
                            </div>
                        </div>
                        <div className="modal-body">
                            {showFormatGuide && (
                                <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--border-radius)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)', fontSize: '0.82rem', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-primary)' }}>📋 Excel / CSV Format</div>
                                    <div style={{ background: 'var(--bg-surface-2)', borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.78rem', overflowX: 'auto', marginBottom: 6 }}>
                                        first_name, last_name, email, phone, company, source
                                    </div>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>Required: first_name, last_name. Score auto-calculated. Max 500 per batch. Duplicate emails are skipped.</p>
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">Paste CSV data or JSON array</label>
                                <textarea className="form-input" rows={8} value={importData} onChange={e => setImportData(e.target.value)} placeholder={`first_name, last_name, email, phone, company, source\nRahul, Sharma, rahul@acme.com, +91 9876543210, Acme Corp, website\nPriya, Patel, priya@tech.com, +91 8765432109, TechVista, referral`} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleImport} disabled={importing || !importData.trim()}>{importing ? 'Importing...' : 'Import'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
