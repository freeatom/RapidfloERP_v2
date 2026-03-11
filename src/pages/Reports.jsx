import React, { useState, useEffect } from 'react';
import { api, useToast } from '../App';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Download, TrendingUp, DollarSign, Users, Package, Clock, Shield, BarChart3 } from 'lucide-react';

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
function fmtCur(v) {
    if (!v) return '₹0';
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
    return `₹${Math.round(v)}`;
}

// Transforms raw backend responses into a unified UI structure per report tab
function transformReport(tab, raw) {
    if (!raw) return null;
    switch (tab) {
        case 'revenue': {
            const t = raw.totals || {};
            return {
                summary: [
                    { label: 'Total Revenue', value: fmtCur(t.revenue), color: '#6366f1' },
                    { label: 'Collected', value: fmtCur(t.collected), color: '#10b981' },
                    { label: 'Outstanding', value: fmtCur(t.outstanding), color: '#f59e0b' },
                    { label: 'Invoice Count', value: t.count || 0, color: '#06b6d4' },
                ],
                chartData: (raw.data || []).map(d => ({ label: d.period, value: d.total_revenue })),
                chartTitle: 'Revenue Trend',
                breakdown: (raw.topAccounts || []).map(a => ({ label: a.name, value: a.revenue })),
                breakdownTitle: 'Top Accounts by Revenue',
                tableData: raw.data || [],
                tableTitle: 'Revenue by Period',
            };
        }
        case 'pipeline': {
            return {
                summary: [
                    { label: 'Win Rate', value: `${parseFloat(raw.winRate || 0).toFixed(1)}%`, color: '#10b981' },
                    { label: 'Avg Deal Size', value: fmtCur(raw.avgDealSize), color: '#6366f1' },
                    { label: 'Avg Cycle (days)', value: Math.round(raw.avgCycleTime || 0), color: '#f59e0b' },
                    { label: 'Total Stages', value: (raw.pipeline || []).length, color: '#06b6d4' },
                ],
                chartData: (raw.pipeline || []).map(s => ({ label: s.stage?.replace('_', ' '), value: s.value, count: s.count })),
                chartTitle: 'Pipeline by Stage',
                breakdown: (raw.byOwner || []).map(o => ({ label: o.owner, value: o.value })),
                breakdownTitle: 'Pipeline by Owner',
                tableData: raw.byOwner || [],
                tableTitle: 'Sales Rep Performance',
            };
        }
        case 'expenses': {
            const t = raw.totals || {};
            return {
                summary: [
                    { label: 'Total Expenses', value: fmtCur(t.total), color: '#ef4444' },
                    { label: 'Approved', value: fmtCur(t.approved), color: '#10b981' },
                    { label: 'Pending', value: fmtCur(t.pending), color: '#f59e0b' },
                    { label: 'Categories', value: (raw.byCategory || []).length, color: '#06b6d4' },
                ],
                chartData: (raw.byMonth || []).map(m => ({ label: m.month, value: m.total })),
                chartTitle: 'Expense Trend',
                breakdown: (raw.byCategory || []).map(c => ({ label: c.category, value: c.total })),
                breakdownTitle: 'Expenses by Category',
                tableData: raw.byDepartment || [],
                tableTitle: 'Expenses by Department',
            };
        }
        case 'inventory': {
            return {
                summary: [
                    { label: 'Total Valuation', value: fmtCur(raw.valuation), color: '#6366f1' },
                    { label: 'Low Stock Items', value: (raw.lowStock || []).length, color: '#ef4444' },
                    { label: 'Categories', value: (raw.byCategory || []).length, color: '#06b6d4' },
                    { label: 'Movements (30d)', value: (raw.movements || []).reduce((s, m) => s + m.count, 0), color: '#10b981' },
                ],
                chartData: (raw.byCategory || []).map(c => ({ label: c.category, value: c.total_value })),
                chartTitle: 'Inventory by Category',
                breakdown: (raw.movements || []).map(m => ({ label: m.type, value: m.total_qty })),
                breakdownTitle: 'Stock Movements (30 days)',
                tableData: raw.topMoving || [],
                tableTitle: 'Top Moving Products',
            };
        }
        case 'hr': {
            const h = raw.headcount || {};
            return {
                summary: [
                    { label: 'Total Employees', value: h.total || 0, color: '#6366f1' },
                    { label: 'Active', value: h.active || 0, color: '#10b981' },
                    { label: 'Avg Tenure', value: `${parseFloat(raw.avgTenure || 0).toFixed(1)}yr`, color: '#06b6d4' },
                    { label: 'Turnover (12m)', value: raw.turnover || 0, color: '#ef4444' },
                    { label: 'Payroll (Month)', value: fmtCur(raw.payrollSummary), color: '#f59e0b' },
                ],
                chartData: (raw.byDept || []).map(d => ({ label: d.department, value: d.count })),
                chartTitle: 'Headcount by Department',
                breakdown: (raw.byType || []).map(t => ({ label: t.employment_type, value: t.count })),
                breakdownTitle: 'By Employment Type',
                tableData: raw.leaveBalance || [],
                tableTitle: 'Leave Summary',
            };
        }
        case 'projects': {
            return {
                summary: [
                    { label: 'Active', value: (raw.overview || []).find(o => o.status === 'active')?.count || 0, color: '#10b981' },
                    { label: 'Total Budget', value: fmtCur((raw.overview || []).reduce((s, o) => s + o.budget, 0)), color: '#6366f1' },
                    { label: 'Actual Cost', value: fmtCur((raw.overview || []).reduce((s, o) => s + o.cost, 0)), color: '#f59e0b' },
                    { label: 'Overdue', value: (raw.overdue || []).length, color: '#ef4444' },
                ],
                chartData: (raw.overview || []).map(o => ({ label: o.status, value: o.count })),
                chartTitle: 'Projects by Status',
                breakdown: (raw.revenue || []).map(r => ({ label: r.name, value: r.billed })),
                breakdownTitle: 'Revenue by Project',
                tableData: raw.utilization || [],
                tableTitle: 'Team Utilization (30 days)',
            };
        }
        case 'support': {
            return {
                summary: [
                    { label: 'SLA Compliance', value: `${parseFloat(raw.slaCompliance || 0).toFixed(1)}%`, color: '#10b981' },
                    { label: 'Open', value: (raw.overview || []).find(o => o.status === 'open')?.count || 0, color: '#f59e0b' },
                    { label: 'Resolved', value: (raw.overview || []).find(o => o.status === 'resolved')?.count || 0, color: '#06b6d4' },
                    { label: 'Agents', value: (raw.byAgent || []).length, color: '#8b5cf6' },
                ],
                chartData: (raw.trend || []).map(t => ({ label: t.month, value: t.created, resolved: t.resolved })),
                chartTitle: 'Ticket Trend',
                breakdown: (raw.byPriority || []).map(p => ({ label: p.priority, value: p.count })),
                breakdownTitle: 'By Priority',
                tableData: raw.byAgent || [],
                tableTitle: 'Agent Performance',
            };
        }
        default:
            return null;
    }
}

export default function ReportsPage() {
    const [tab, setTab] = useState('revenue');
    const [rawData, setRawData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('monthly');
    const toast = useToast();

    const tabs = [
        { id: 'revenue', label: 'Revenue', icon: DollarSign },
        { id: 'pipeline', label: 'Pipeline', icon: TrendingUp },
        { id: 'expenses', label: 'Expenses', icon: BarChart3 },
        { id: 'inventory', label: 'Inventory', icon: Package },
        { id: 'hr', label: 'HR', icon: Users },
        { id: 'projects', label: 'Projects', icon: Clock },
        { id: 'support', label: 'Support', icon: Shield },
    ];

    useEffect(() => {
        setLoading(true);
        setRawData(null);
        api(`/reports/${tab}?period=${period}`)
            .then(setRawData)
            .catch(err => toast(err.message, 'error'))
            .finally(() => setLoading(false));
    }, [tab, period]);

    const data = transformReport(tab, rawData);

    if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;

    return (
        <div>
            <div className="page-header">
                <h2>Reports & Analytics</h2>
                <div className="page-actions">
                    {tab === 'revenue' && (
                        <select className="form-select" style={{ width: 140 }} value={period} onChange={e => setPeriod(e.target.value)}>
                            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                        </select>
                    )}
                    <button className="btn btn-secondary"><Download size={16} /> Export</button>
                </div>
            </div>

            <div className="tabs">{tabs.map(t => <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>

            {!data ? <div className="empty-state"><h3>No report data available</h3></div> : (
                <div>
                    {/* KPI Summary */}
                    {data.summary && (
                        <div className="kpi-grid" style={{ marginBottom: 'var(--space-xl)' }}>
                            {data.summary.map((kpi, i) => (
                                <div className="kpi-card" key={i} style={{ '--kpi-color': kpi.color, '--kpi-color-bg': kpi.color + '1f' }}>
                                    <div className="kpi-value">{kpi.value}</div>
                                    <div className="kpi-label">{kpi.label}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Charts */}
                    <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                        {data.chartData && data.chartData.length > 0 && (
                            <div className="card">
                                <div className="card-header"><div className="card-title">{data.chartTitle || 'Trend Analysis'}</div></div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={data.chartData}>
                                            <defs>
                                                <linearGradient id="rptGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                                            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                                            <YAxis tickFormatter={v => typeof v === 'number' && v > 1000 ? fmtCur(v) : v} tick={{ fill: '#64748b', fontSize: 12 }} />
                                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, color: '#f1f5f9' }} formatter={v => typeof v === 'number' && v > 1000 ? fmtCur(v) : v} />
                                            <Area type="monotone" dataKey="value" stroke="#6366f1" fill="url(#rptGrad)" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {data.breakdown && data.breakdown.length > 0 && (
                            <div className="card">
                                <div className="card-header"><div className="card-title">{data.breakdownTitle || 'Breakdown'}</div></div>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={data.breakdown} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2} label={({ label, percent }) => `${(label || '').substring(0, 12)} ${(percent * 100).toFixed(0)}%`}>
                                                {data.breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, color: '#f1f5f9' }} formatter={v => typeof v === 'number' && v > 1000 ? fmtCur(v) : v} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Data Table */}
                    {data.tableData && data.tableData.length > 0 && (
                        <div className="card" style={{ padding: 0 }}>
                            <div className="card-header" style={{ padding: 'var(--space-md) var(--space-lg)' }}><div className="card-title">{data.tableTitle || 'Detailed Report'}</div></div>
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead><tr>{Object.keys(data.tableData[0]).map(k => <th key={k}>{k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</th>)}</tr></thead>
                                    <tbody>
                                        {data.tableData.slice(0, 20).map((row, i) => (
                                            <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{typeof v === 'number' && v > 1000 ? fmtCur(v) : String(v ?? '-')}</td>)}</tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
