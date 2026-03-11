import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../App';
import { Activity, Clock, User, Zap, Filter, RefreshCw } from 'lucide-react';

const ICON_MAP = {
    CREATE: '🆕', UPDATE: '✏️', DELETE: '🗑️', LOGIN: '🔐', APPROVE: '✅',
    EXPORT: '📤', IMPORT: '📥', DEFAULT: '📋'
};

const getActionIcon = (action) => {
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (action?.toUpperCase().includes(key)) return icon;
    }
    return ICON_MAP.DEFAULT;
};

const timeAgo = (date) => {
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : `${d}d ago`;
};

export default function ActivityFeed({ limit = 30, compact = false }) {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    const fetchActivities = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api(`/admin/audit-log?limit=${limit}`);
            setActivities(data.logs || []);
        } catch (err) { console.error('Activity feed error:', err); }
        setLoading(false);
    }, [limit]);

    useEffect(() => { fetchActivities(); }, [fetchActivities]);

    const filtered = filter === 'all'
        ? activities
        : activities.filter(a => a.module?.toLowerCase() === filter);

    const modules = [...new Set(activities.map(a => a.module).filter(Boolean))];

    if (compact) {
        return (
            <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={16} color="var(--color-primary)" /> Recent Activity
                    </span>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={fetchActivities}><RefreshCw size={14} /></button>
                </div>
                {loading ? <div className="loading-overlay"><div className="spinner"></div></div> :
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {filtered.slice(0, 10).map((a, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < 9 ? '1px solid var(--border-light)' : 'none', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{getActionIcon(a.action)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                        {a.user_name || 'System'} <span style={{ color: 'var(--text-muted)' }}>{a.action?.replace(/_/g, ' ').toLowerCase()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.module} · {timeAgo(a.created_at)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                }
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h2><Activity size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Activity Feed</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={fetchActivities}><RefreshCw size={14} /></button>
                </div>
            </div>

            <div className="filter-pills" style={{ marginBottom: 16 }}>
                <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
                {modules.map(m => (
                    <button key={m} className={`filter-pill ${filter === m ? 'active' : ''}`} onClick={() => setFilter(m)}>{m}</button>
                ))}
            </div>

            {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                <div className="card" style={{ padding: 0 }}>
                    {filtered.map((a, i) => (
                        <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 20px', borderBottom: '1px solid var(--border-light)', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: 2 }}>{getActionIcon(a.action)}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>
                                    <span style={{ color: 'var(--color-primary-light)' }}>{a.user_name || 'System'}</span>
                                    {' '}{a.action?.replace(/_/g, ' ').toLowerCase()}
                                </div>
                                {a.entity_id && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>ID: {a.entity_id}</div>}
                                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Zap size={11} />{a.module}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{timeAgo(a.created_at)}</span>
                                    {a.ip_address && <span>{a.ip_address}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="empty-state"><p>No activities found</p></div>}
                </div>
            )}
        </div>
    );
}
