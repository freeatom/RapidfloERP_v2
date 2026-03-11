import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../App';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
    RadialBarChart, RadialBar, ComposedChart
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart, Package,
    FileText, AlertTriangle, CheckCircle, Clock, RefreshCw, Plus,
    BarChart3, Activity, Zap, ArrowUpRight, ArrowDownRight, Eye, Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

function formatCurrency(val) {
    if (!val) return '₹0';
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
    return `₹${val.toFixed(0)}`;
}

const tooltipStyle = { background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, color: '#f1f5f9' };

export default function DashboardPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('30d');
    const [revenueChartType, setRevenueChartType] = useState('area');
    const [showComparison, setShowComparison] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const navigate = useNavigate();

    const fetchData = useCallback(async () => {
        try {
            let url = `/dashboard?range=${dateRange}`;
            if (dateRange === 'custom' && customFrom && customTo) {
                url += `&from=${customFrom}&to=${customTo}`;
            }
            const d = await api(url);
            setData(d);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [dateRange, customFrom, customTo]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-refresh every 60s
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;
    if (!data) return <div className="empty-state"><h3>No data available</h3></div>;

    const kpis = data.kpis || {};
    const charts = data.charts || {};

    // Use revenueVsExpenses directly from API — backend handles filtering
    const revExpData = charts.revenueVsExpenses || [];

    // Pipeline data
    const pipelineData = (charts.pipelineFunnel || []).map(d => ({
        stage: (d.stage || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        value: d.value || 0, count: d.count || 0,
    }));

    // KPI Cards
    const kpiCards = [
        {
            label: 'Revenue', value: formatCurrency(kpis.revenue?.total),
            change: kpis.revenue?.growth ? parseFloat(kpis.revenue.growth) : null,
            sub: `This month: ${formatCurrency(kpis.revenue?.thisMonth)}`,
            icon: DollarSign, color: '#6366f1', bg: 'rgba(99,102,241,0.12)',
            onClick: () => navigate('/finance')
        },
        {
            label: 'Pipeline', value: formatCurrency(kpis.pipeline?.value),
            sub: `${kpis.pipeline?.count || 0} active deals`,
            icon: TrendingUp, color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',
            onClick: () => navigate('/crm')
        },
        {
            label: 'Expenses', value: formatCurrency(kpis.expenses?.total),
            sub: `This month: ${formatCurrency(kpis.expenses?.thisMonth)}`,
            icon: ShoppingCart, color: '#ef4444', bg: 'rgba(239,68,68,0.12)',
            onClick: () => navigate('/finance')
        },
        {
            label: 'Cash Flow', value: formatCurrency(kpis.cashFlow?.total),
            icon: Activity, color: kpis.cashFlow?.total >= 0 ? '#10b981' : '#ef4444',
            bg: kpis.cashFlow?.total >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
        },
        {
            label: 'Customers', value: kpis.customers?.total || 0,
            sub: kpis.customers?.new ? `+${kpis.customers.new} this month` : null,
            icon: Users, color: '#10b981', bg: 'rgba(16,185,129,0.12)',
            onClick: () => navigate('/crm')
        },
        {
            label: 'Win Rate', value: `${kpis.deals?.winRate || 0}%`,
            icon: CheckCircle, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',
        },
        {
            label: 'Inventory', value: formatCurrency(kpis.inventory?.value),
            sub: kpis.inventory?.lowStock ? `⚠ ${kpis.inventory.lowStock} low stock` : 'Stock OK',
            icon: Package, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',
            onClick: () => navigate('/inventory')
        },
        {
            label: 'Open Tickets', value: kpis.tickets?.open || 0,
            sub: kpis.tickets?.avgResolution ? `Avg: ${Math.round(kpis.tickets.avgResolution)}h` : null,
            icon: AlertTriangle, color: '#ec4899', bg: 'rgba(236,72,153,0.12)',
            onClick: () => navigate('/support')
        },
    ];

    // Quick actions
    const quickActions = [
        { label: 'New Invoice', icon: FileText, color: '#6366f1', path: '/finance' },
        { label: 'Add Lead', icon: Users, color: '#06b6d4', path: '/crm' },
        { label: 'Record Sale', icon: ShoppingCart, color: '#10b981', path: '/sales' },
        { label: 'New Ticket', icon: AlertTriangle, color: '#f59e0b', path: '/support' },
    ];

    // Revenue chart component based on type
    const renderRevenueChart = () => {
        const chartData = revExpData.map(d => ({
            month: d.month,
            revenue: d.revenue || 0,
            expenses: d.expenses || 0,
            profit: (d.revenue || 0) - (d.expenses || 0),
        }));

        const ChartComponent = revenueChartType === 'bar' ? ComposedChart : AreaChart;

        return (
            <ResponsiveContainer width="100%" height="100%">
                <ChartComponent data={chartData}>
                    <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => formatCurrency(v)} />
                    <Legend />
                    {revenueChartType === 'bar' ? (
                        <>
                            <Bar dataKey="revenue" fill="#6366f1" name="Revenue" radius={[4, 4, 0, 0]} />
                            {showComparison && <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[4, 4, 0, 0]} />}
                        </>
                    ) : (
                        <>
                            <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                            {showComparison && <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} name="Expenses" />}
                        </>
                    )}
                </ChartComponent>
            </ResponsiveContainer>
        );
    };

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h2 style={{ margin: 0 }}>Dashboard Overview</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Real-time business insights · Last updated {new Date().toLocaleTimeString('en-IN')}
                    </p>
                </div>
                <div className="page-actions" style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                    {/* Date range picker */}
                    <div style={{ display: 'flex', background: 'var(--bg-surface-2)', borderRadius: 'var(--border-radius)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        {[
                            { key: '7d', label: '7D' }, { key: '30d', label: '30D' },
                            { key: '90d', label: '90D' }, { key: 'ytd', label: 'YTD' },
                            { key: '12m', label: '12M' }, { key: 'custom', label: '📅' },
                        ].map(r => (
                            <button key={r.key} onClick={() => setDateRange(r.key)}
                                style={{
                                    padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                                    background: dateRange === r.key ? 'var(--color-primary)' : 'transparent',
                                    color: dateRange === r.key ? '#fff' : 'var(--text-muted)',
                                    transition: 'all 0.2s'
                                }}>
                                {r.label}
                            </button>
                        ))}
                    </div>
                    {dateRange === 'custom' && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="date" className="form-input" style={{ padding: '4px 8px', fontSize: '0.78rem', width: 130 }}
                                value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>to</span>
                            <input type="date" className="form-input" style={{ padding: '4px 8px', fontSize: '0.78rem', width: 130 }}
                                value={customTo} onChange={e => setCustomTo(e.target.value)} />
                        </div>
                    )}
                    {/* Auto-refresh indicator */}
                    <button className={`btn btn-sm ${autoRefresh ? 'btn-secondary' : 'btn-ghost'}`}
                        onClick={() => setAutoRefresh(!autoRefresh)} title={autoRefresh ? 'Auto-refresh ON (60s)' : 'Auto-refresh OFF'}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <RefreshCw size={14} className={autoRefresh ? 'spin-slow' : ''} />
                    </button>
                </div>
            </div>

            {/* Quick Actions Bar */}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
                {quickActions.map((qa, i) => (
                    <button key={i} className="btn btn-secondary btn-sm" onClick={() => navigate(qa.path)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: qa.color + '0d', border: `1px solid ${qa.color}30`,
                            color: qa.color, fontWeight: 600, transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = qa.color + '1a'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = qa.color + '0d'; }}>
                        <Plus size={14} /> {qa.label}
                    </button>
                ))}
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                {kpiCards.map((kpi, i) => (
                    <div className="kpi-card" key={i}
                        style={{ '--kpi-color': kpi.color, '--kpi-color-bg': kpi.bg, cursor: kpi.onClick ? 'pointer' : 'default', transition: 'all 0.2s' }}
                        onClick={kpi.onClick}
                        onMouseEnter={e => kpi.onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
                        onMouseLeave={e => kpi.onClick && (e.currentTarget.style.transform = 'translateY(0)')}>
                        <div className="kpi-icon"><kpi.icon size={22} /></div>
                        <div className="kpi-value">{kpi.value}</div>
                        <div className="kpi-label">{kpi.label}</div>
                        {kpi.change !== null && kpi.change !== undefined && (
                            <div className={`kpi-change ${kpi.change >= 0 ? 'positive' : 'negative'}`}>
                                {kpi.change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {Math.abs(kpi.change || 0).toFixed(1)}%
                            </div>
                        )}
                        {kpi.sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{kpi.sub}</div>}
                    </div>
                ))}
            </div>

            {/* Revenue vs Expenses — Main Chart */}
            <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div className="card-title">Revenue vs Expenses</div>
                        <div className="card-subtitle">Financial performance over time</div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                        {/* Comparison toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <input type="checkbox" checked={showComparison} onChange={e => setShowComparison(e.target.checked)}
                                style={{ accentColor: 'var(--color-primary)' }} />
                            Show Expenses
                        </label>
                        {/* Chart type toggle */}
                        <div style={{ display: 'flex', background: 'var(--bg-surface-2)', borderRadius: 'var(--border-radius)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                            {[
                                { key: 'area', label: 'Area' },
                                { key: 'bar', label: 'Bar' },
                            ].map(t => (
                                <button key={t.key} onClick={() => setRevenueChartType(t.key)}
                                    style={{
                                        padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500,
                                        background: revenueChartType === t.key ? 'var(--color-primary)' : 'transparent',
                                        color: revenueChartType === t.key ? '#fff' : 'var(--text-muted)',
                                    }}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="chart-container" style={{ height: 320 }}>
                    {revExpData.length > 0 ? renderRevenueChart() : (
                        <div className="empty-state" style={{ padding: 'var(--space-xl)' }}><p className="text-muted">No financial data yet</p></div>
                    )}
                </div>
            </div>

            {/* Charts Row 2 — Pipeline + Expense Breakdown */}
            <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                {/* Pipeline Funnel */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Sales Pipeline</div>
                            <div className="card-subtitle">{kpis.pipeline?.count || 0} deals · {formatCurrency(kpis.pipeline?.value)}</div>
                        </div>
                    </div>
                    <div className="chart-container">
                        {pipelineData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                                    <XAxis type="number" tickFormatter={formatCurrency} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <YAxis dataKey="stage" type="category" tick={{ fill: '#64748b', fontSize: 11 }} width={100} />
                                    <Tooltip contentStyle={tooltipStyle} formatter={v => formatCurrency(v)} />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                        {pipelineData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <div className="empty-state" style={{ padding: 'var(--space-xl)' }}><p className="text-muted">No pipeline data</p></div>}
                    </div>
                </div>

                {/* Expense Breakdown */}
                <div className="card">
                    <div className="card-header"><div className="card-title">Expense Breakdown</div></div>
                    <div className="chart-container">
                        {(charts.expenseBreakdown || []).length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={charts.expenseBreakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%"
                                        innerRadius={50} outerRadius={80} paddingAngle={2}
                                        label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                                        {(charts.expenseBreakdown).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={tooltipStyle} formatter={v => formatCurrency(v)} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <div className="empty-state" style={{ padding: 'var(--space-xl)' }}><p className="text-muted">No expense data</p></div>}
                    </div>
                </div>
            </div>

            {/* Charts Row 3 — Dept Headcount + Ticket Status */}
            <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="card">
                    <div className="card-header"><div className="card-title">Department Headcount</div></div>
                    <div className="chart-container">
                        {(charts.deptHeadcount || []).length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={charts.deptHeadcount} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <YAxis dataKey="department" type="category" tick={{ fill: '#64748b', fontSize: 11 }} width={100} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <div className="empty-state" style={{ padding: 'var(--space-xl)' }}><p className="text-muted">No department data</p></div>}
                    </div>
                </div>
                <div className="card">
                    <div className="card-header"><div className="card-title">Ticket Status</div></div>
                    <div className="chart-container">
                        {(charts.ticketStatus || []).length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={charts.ticketStatus} dataKey="count" nameKey="status" cx="50%" cy="50%"
                                        innerRadius={50} outerRadius={80} paddingAngle={2}
                                        label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}>
                                        {(charts.ticketStatus).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={tooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <div className="empty-state" style={{ padding: 'var(--space-xl)' }}><p className="text-muted">No ticket data</p></div>}
                    </div>
                </div>
            </div>

            {/* Tables Row — Top Products + Active Projects */}
            <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="card-title">Top Products by Revenue</div>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>View All <ArrowUpRight size={12} /></button>
                    </div>
                    <div className="table-wrapper" style={{ border: 'none' }}>
                        <table className="data-table">
                            <thead><tr><th>Product</th><th>Revenue</th><th>Units</th></tr></thead>
                            <tbody>
                                {(charts.topProducts || []).length === 0 ? (
                                    <tr><td colSpan={3} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No sales data</td></tr>
                                ) : (charts.topProducts || []).slice(0, 5).map((p, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                                        <td style={{ color: '#6366f1', fontWeight: 500 }}>{formatCurrency(p.revenue)}</td>
                                        <td>{p.units_sold}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="card-title">Active Projects</div>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')}>View All <ArrowUpRight size={12} /></button>
                    </div>
                    <div className="table-wrapper" style={{ border: 'none' }}>
                        <table className="data-table">
                            <thead><tr><th>Project</th><th>Progress</th><th>Budget</th></tr></thead>
                            <tbody>
                                {(charts.projectProgress || []).length === 0 ? (
                                    <tr><td colSpan={3} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No projects</td></tr>
                                ) : (charts.projectProgress || []).slice(0, 5).map((p, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${p.progress || 0}%`, background: 'var(--color-primary)', borderRadius: 3, transition: 'width 0.5s' }}></div>
                                                </div>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 500, minWidth: 32 }}>{p.progress || 0}%</span>
                                            </div>
                                        </td>
                                        <td>{formatCurrency(p.budget)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Recent Activity + Leads */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Recent Activity</div>
                    </div>
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {(data.recentActivities || []).length === 0 ? (
                            <div className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No recent activity</div>
                        ) : (data.recentActivities || []).slice(0, 10).map((act, i) => (
                            <div key={i} style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: COLORS[i % COLORS.length] + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Activity size={12} style={{ color: COLORS[i % COLORS.length] }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        <strong>{act.user_name || 'System'}</strong> · {act.action}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        {act.module} · {new Date(act.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="card-title">Leads by Source</div>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/crm')}>View All <ArrowUpRight size={12} /></button>
                    </div>
                    <div className="chart-container" style={{ height: 250 }}>
                        {(charts.leadsBySource || []).length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={charts.leadsBySource}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                                    <XAxis dataKey="source" tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                                        {(charts.leadsBySource || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <div className="empty-state" style={{ padding: 'var(--space-xl)' }}><p className="text-muted">No leads yet</p></div>}
                    </div>
                </div>
            </div>

            {/* CSS for auto-refresh spinner */}
            <style>{`
                .spin-slow { animation: spin-slow 2s linear infinite; }
                @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
