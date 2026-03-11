import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import {
    Plus, Search, Edit2, Trash2, Shield, Settings, Users, Activity, Lock, Key,
    Download, RefreshCw, History, CheckSquare, Grid3X3, ToggleLeft, Database,
    UserCheck, UserX, ChevronDown, Check, X
} from 'lucide-react';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function AdminPage() {
    const [tab, setTab] = useState('users');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({});
    const [editItem, setEditItem] = useState(null);
    const [health, setHealth] = useState(null);
    const [roles, setRoles] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditPage, setAuditPage] = useState(1);
    const [auditTotal, setAuditTotal] = useState(0);
    const toast = useToast();

    // New state for enhanced features
    const [selectedUsers, setSelectedUsers] = useState(new Set());
    const [showBulkMenu, setShowBulkMenu] = useState(false);
    const [loginHistory, setLoginHistory] = useState([]);
    const [loginPage, setLoginPage] = useState(1);
    const [loginTotal, setLoginTotal] = useState(0);
    const [permissions, setPermissions] = useState([]);
    const [rolePermissions, setRolePermissions] = useState({});
    const [selectedRole, setSelectedRole] = useState(null);
    const [modules, setModules] = useState([]);
    const [savingPerms, setSavingPerms] = useState(false);

    const tabs = [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'roles', label: 'Roles', icon: Shield },
        { id: 'permissions', label: 'Permissions', icon: Grid3X3 },
        { id: 'login-history', label: 'Login History', icon: History },
        { id: 'modules', label: 'Modules', icon: ToggleLeft },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'health', label: 'Health', icon: Activity },
        { id: 'audit', label: 'Audit Log', icon: Key },
    ];

    // Fetch roles for dropdowns
    useEffect(() => {
        api('/admin/roles').then(d => setRoles(d.roles || [])).catch(() => { });
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (tab === 'health') {
                const data = await api('/admin/system-health');
                setHealth(data);
            } else if (tab === 'settings') {
                const data = await api('/admin/settings');
                setItems(data.settings || []);
            } else if (tab === 'roles') {
                const data = await api('/admin/roles');
                setItems(data.roles || []);
            } else if (tab === 'audit') {
                const data = await api(`/reports/audit?page=${auditPage}&limit=30`);
                setAuditLogs(data.logs || []);
                setAuditTotal(data.total || 0);
            } else if (tab === 'login-history') {
                const data = await api(`/admin/login-history?page=${loginPage}&limit=30`);
                setLoginHistory(data.logs || []);
                setLoginTotal(data.total || 0);
            } else if (tab === 'permissions') {
                const [permsData, rolesData] = await Promise.all([
                    api('/admin/permissions'),
                    api('/admin/roles')
                ]);
                setPermissions(permsData.permissions || []);
                setRoles(rolesData.roles || []);
                if (!selectedRole && rolesData.roles?.length) {
                    setSelectedRole(rolesData.roles[0].id);
                }
            } else if (tab === 'modules') {
                const data = await api('/admin/modules');
                setModules(data.modules || []);
            } else {
                const data = await api(`/admin/users?search=${search}`);
                setItems(data.users || []);
            }
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, search, auditPage, loginPage]);
    useEffect(() => { fetchData(); }, [fetchData]);

    // Fetch role permissions when selectedRole changes
    useEffect(() => {
        if (selectedRole && tab === 'permissions') {
            api(`/admin/roles/${selectedRole}/permissions`)
                .then(d => {
                    const map = {};
                    (d.permissions || []).forEach(p => { map[p.permission_id] = true; });
                    setRolePermissions(map);
                }).catch(() => { });
        }
    }, [selectedRole, tab]);

    const handleSave = async () => {
        try {
            if (tab === 'users') {
                const body = { ...form };
                if (editItem) {
                    if (!body.password) delete body.password;
                    await api(`/admin/users/${editItem.id}`, { method: 'PUT', body });
                } else {
                    if (!body.email || !body.first_name || !body.last_name || !body.password) {
                        toast('Please fill in all required fields', 'error'); return;
                    }
                    await api('/admin/users', { method: 'POST', body });
                }
            } else if (tab === 'roles') {
                const body = { ...form, level: form.level ? +form.level : 3 };
                if (editItem) { await api(`/admin/roles/${editItem.id}`, { method: 'PUT', body }); }
                else {
                    if (!body.name) { toast('Role name required', 'error'); return; }
                    await api('/admin/roles', { method: 'POST', body });
                }
            }
            toast(editItem ? 'Updated successfully' : 'Created successfully', 'success');
            setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
            await api(`/admin/${tab}/${id}`, { method: 'DELETE' });
            toast('Deleted successfully', 'success'); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const handleResetPassword = async (userId) => {
        if (!confirm('Reset this user\'s password?')) return;
        try {
            const data = await api(`/admin/users/${userId}/reset-password`, { method: 'POST', body: {} });
            toast(`Password reset. Temp: ${data.tempPassword || '(set by admin)'}`, 'success');
        } catch (err) { toast(err.message, 'error'); }
    };

    const handleExport = async (module) => {
        try {
            const data = await api(`/admin/export/${module}`);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${module}_export.json`; a.click();
            URL.revokeObjectURL(url);
            toast(`Exported ${data.count} ${module}`, 'success');
        } catch (err) { toast(err.message, 'error'); }
    };

    // Bulk operations
    const toggleSelectUser = (id) => {
        setSelectedUsers(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedUsers.size === items.length) setSelectedUsers(new Set());
        else setSelectedUsers(new Set(items.map(i => i.id)));
    };

    const handleBulkAction = async (action, value) => {
        if (selectedUsers.size === 0) return;
        try {
            const data = await api('/admin/users/bulk', { method: 'POST', body: { user_ids: [...selectedUsers], action, value } });
            toast(`${data.updated} users updated`, 'success');
            setSelectedUsers(new Set()); setShowBulkMenu(false); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    // Permission matrix save
    const savePermissions = async () => {
        if (!selectedRole) return;
        setSavingPerms(true);
        try {
            const permIds = Object.keys(rolePermissions).filter(k => rolePermissions[k]);
            await api(`/admin/roles/${selectedRole}/permissions`, { method: 'PUT', body: { permissions: permIds } });
            toast('Permissions saved', 'success');
        } catch (err) { toast(err.message, 'error'); }
        setSavingPerms(false);
    };

    const togglePermission = (permId) => {
        setRolePermissions(prev => ({ ...prev, [permId]: !prev[permId] }));
    };

    // Module toggle
    const toggleModule = async (mod) => {
        try {
            await api(`/admin/modules/${mod.id}`, { method: 'PUT', body: { is_enabled: mod.is_enabled ? 0 : 1 } });
            toast(`${mod.display_name} ${mod.is_enabled ? 'disabled' : 'enabled'}`, 'success');
            fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    // Group permissions by module
    const groupedPerms = {};
    permissions.forEach(p => {
        if (!groupedPerms[p.module]) groupedPerms[p.module] = [];
        groupedPerms[p.module].push(p);
    });

    return (
        <div>
            <div className="page-header"><h2>Administration</h2>
                <div className="page-actions">
                    {tab === 'users' && <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({ is_active: 1 }); setShowModal(true); }}><Plus size={16} /> New User</button>}
                    {tab === 'roles' && <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({ level: 3 }); setShowModal(true); }}><Plus size={16} /> New Role</button>}
                    {tab === 'users' && <button className="btn btn-secondary" onClick={() => handleExport('users')}><Download size={16} /> Export</button>}
                    {tab === 'permissions' && <button className="btn btn-primary" onClick={savePermissions} disabled={savingPerms}><Check size={16} /> {savingPerms ? 'Saving...' : 'Save Permissions'}</button>}
                </div>
            </div>

            <div className="tabs" style={{ flexWrap: 'wrap' }}>{tabs.map(t => <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><t.icon size={14} style={{ marginRight: 6 }} />{t.label}</button>)}</div>

            {/* ======= USERS TAB ======= */}
            {tab === 'users' && (
                <>
                    <div className="toolbar" style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="search-box" style={{ flex: 1, minWidth: 200 }}><Search className="search-icon" size={16} /><input type="text" className="form-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                        {selectedUsers.size > 0 && (
                            <div style={{ position: 'relative' }}>
                                <button className="btn btn-secondary" onClick={() => setShowBulkMenu(!showBulkMenu)}>
                                    <CheckSquare size={14} /> Bulk ({selectedUsers.size}) <ChevronDown size={14} />
                                </button>
                                {showBulkMenu && (
                                    <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowBulkMenu(false)} />
                                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 200, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-xl)', zIndex: 100, overflow: 'hidden' }}>
                                            <div onClick={() => handleBulkAction('activate')} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><UserCheck size={14} style={{ color: 'var(--color-success)' }} /> Activate</div>
                                            <div onClick={() => handleBulkAction('deactivate')} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><UserX size={14} style={{ color: 'var(--color-danger)' }} /> Deactivate</div>
                                            <div onClick={() => handleBulkAction('unlock')} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Lock size={14} style={{ color: 'var(--color-warning)' }} /> Unlock</div>
                                            <div style={{ borderTop: '1px solid var(--border-light)', padding: '8px 14px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Change Role:</div>
                                            {roles.map(r => (
                                                <div key={r.id} onClick={() => handleBulkAction('change_role', r.id)} style={{ padding: '8px 14px 8px 28px', cursor: 'pointer', fontSize: '0.82rem' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{(r.name || '').replace('_', ' ')}</div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                        <div className="card" style={{ padding: 0 }}>
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead><tr>
                                        <th style={{ width: 36 }}><input type="checkbox" checked={selectedUsers.size === items.length && items.length > 0} onChange={toggleSelectAll} /></th>
                                        <th>User</th><th>Email</th><th>Role</th><th>Last Login</th><th>Status</th><th>Actions</th>
                                    </tr></thead>
                                    <tbody>
                                        {items.length === 0 ? <tr><td colSpan={7} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No users found</td></tr> : items.map(item => (
                                            <tr key={item.id} style={{ background: selectedUsers.has(item.id) ? 'var(--bg-hover)' : undefined }}>
                                                <td><input type="checkbox" checked={selectedUsers.has(item.id)} onChange={() => toggleSelectUser(item.id)} /></td>
                                                <td><div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                                    <div className="avatar avatar-sm">{item.first_name?.[0]}{item.last_name?.[0]}</div>
                                                    <span style={{ fontWeight: 500 }}>{item.first_name} {item.last_name}</span>
                                                </div></td>
                                                <td>{item.email}</td>
                                                <td><span className={`badge ${item.role_name === 'super_admin' ? 'badge-danger' : item.role_name === 'admin' ? 'badge-warning' : 'badge-info'}`}>{(item.role_name || 'none').replace('_', ' ')}</span></td>
                                                <td className="text-muted">{item.last_login_at ? new Date(item.last_login_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never'}</td>
                                                <td><span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}><span className="badge-dot"></span>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                                                <td><div style={{ display: 'flex', gap: 4 }}>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ first_name: item.first_name, last_name: item.last_name, email: item.email, phone: item.phone, role_id: item.role_id, is_active: item.is_active }); setShowModal(true); }} title="Edit"><Edit2 size={14} /></button>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleResetPassword(item.id)} title="Reset Password"><Key size={14} /></button>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)} title="Delete"><Trash2 size={14} /></button>
                                                </div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ======= ROLES TAB ======= */}
            {tab === 'roles' && !loading && (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr><th>Role</th><th>Level</th><th>Description</th><th>Users</th><th>Type</th><th>Actions</th></tr></thead>
                            <tbody>
                                {items.map(item => (
                                    <tr key={item.id}>
                                        <td style={{ fontWeight: 500 }}>{(item.name || '').replace('_', ' ')}</td>
                                        <td><span className="badge badge-neutral">L{item.level}</span></td>
                                        <td className="text-muted">{item.description}</td>
                                        <td><span className="badge badge-info">{item.user_count || 0}</span></td>
                                        <td>{item.is_system ? <span className="badge badge-warning">System</span> : <span className="badge badge-neutral">Custom</span>}</td>
                                        <td><div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ name: item.name, description: item.description, level: item.level }); setShowModal(true); }}><Edit2 size={14} /></button>
                                        </div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ======= PERMISSION MATRIX TAB ======= */}
            {tab === 'permissions' && !loading && (
                <div>
                    <div style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                        <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Select Role:</label>
                        <select className="form-select" value={selectedRole || ''} onChange={e => setSelectedRole(e.target.value)} style={{ maxWidth: 300 }}>
                            {roles.map(r => <option key={r.id} value={r.id}>{(r.name || '').replace('_', ' ')} (L{r.level})</option>)}
                        </select>
                    </div>
                    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '0.82rem' }}>
                            <thead>
                                <tr>
                                    <th style={{ minWidth: 140, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 2 }}>Module</th>
                                    <th style={{ textAlign: 'center', minWidth: 80 }}>View</th>
                                    <th style={{ textAlign: 'center', minWidth: 80 }}>Create</th>
                                    <th style={{ textAlign: 'center', minWidth: 80 }}>Edit</th>
                                    <th style={{ textAlign: 'center', minWidth: 80 }}>Delete</th>
                                    <th style={{ textAlign: 'center', minWidth: 80 }}>Export</th>
                                    <th style={{ textAlign: 'center', minWidth: 80 }}>Approve</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(groupedPerms).map(([module, perms]) => {
                                    const actions = ['view', 'create', 'edit', 'delete', 'export', 'approve'];
                                    return (
                                        <tr key={module}>
                                            <td style={{ fontWeight: 600, textTransform: 'capitalize', position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1 }}>{module}</td>
                                            {actions.map(action => {
                                                const perm = perms.find(p => p.action === action);
                                                if (!perm) return <td key={action} style={{ textAlign: 'center' }}><span className="text-muted">—</span></td>;
                                                return (
                                                    <td key={action} style={{ textAlign: 'center' }}>
                                                        <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: rolePermissions[perm.id] ? 'var(--color-primary)' : 'var(--bg-hover)', color: rolePermissions[perm.id] ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                                                            <input type="checkbox" checked={!!rolePermissions[perm.id]} onChange={() => togglePermission(perm.id)} style={{ display: 'none' }} />
                                                            {rolePermissions[perm.id] ? <Check size={14} /> : <X size={14} />}
                                                        </label>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {Object.keys(groupedPerms).length === 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
                            No permissions defined. Seed the database with permission records to use this feature.
                        </div>
                    )}
                </div>
            )}

            {/* ======= LOGIN HISTORY TAB ======= */}
            {tab === 'login-history' && !loading && (
                <div className="card" style={{ padding: 0 }}>
                    <div className="card-header" style={{ padding: 'var(--space-md) var(--space-lg)' }}><div className="card-title">Login & Session History</div><span className="text-muted" style={{ fontSize: '0.82rem' }}>{loginTotal} entries</span></div>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Status</th><th>IP Address</th><th>Browser / Device</th></tr></thead>
                            <tbody>
                                {loginHistory.length === 0 ? <tr><td colSpan={6} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No login history</td></tr> : loginHistory.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                                        <td style={{ fontWeight: 500 }}>{log.first_name ? `${log.first_name} ${log.last_name}` : log.user_email || '—'}</td>
                                        <td><span className={`badge ${log.action === 'LOGIN' ? 'badge-success' : log.action === 'LOGIN_FAILED' ? 'badge-danger' : 'badge-neutral'}`} style={{ fontSize: '0.75rem' }}>{log.action}</span></td>
                                        <td><span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}`}>{log.status}</span></td>
                                        <td className="font-mono text-muted" style={{ fontSize: '0.78rem' }}>{log.ip_address || '—'}</td>
                                        <td className="text-muted" style={{ fontSize: '0.78rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.user_agent ? log.user_agent.substring(0, 60) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {loginTotal > 30 && (
                        <div className="pagination" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
                            <span>Page {loginPage} of {Math.ceil(loginTotal / 30)}</span>
                            <div className="pagination-btns">
                                <button className="pagination-btn" disabled={loginPage <= 1} onClick={() => setLoginPage(p => p - 1)}>Previous</button>
                                <button className="pagination-btn" disabled={loginPage * 30 >= loginTotal} onClick={() => setLoginPage(p => p + 1)}>Next</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ======= MODULE CONFIG TAB ======= */}
            {tab === 'modules' && !loading && (
                <div>
                    <div style={{ marginBottom: 'var(--space-md)' }}>
                        <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>Enable or disable ERP modules. Disabled modules are hidden from the sidebar.</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
                        {modules.map(mod => (
                            <div key={mod.id} className="card" style={{ padding: 'var(--space-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: mod.is_enabled ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: 4 }}>{mod.display_name || mod.module}</div>
                                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>/{mod.module}</div>
                                </div>
                                <button
                                    className={`btn btn-sm ${mod.is_enabled ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => toggleModule(mod)}
                                    style={{ minWidth: 80 }}
                                >
                                    {mod.is_enabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        ))}
                    </div>
                    {modules.length === 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
                            No module configuration found. Seed the database with module_config records.
                        </div>
                    )}
                </div>
            )}

            {/* ======= SYSTEM HEALTH TAB ======= */}
            {tab === 'health' && !loading && health && (
                <div>
                    <div className="kpi-grid" style={{ marginBottom: 'var(--space-xl)' }}>
                        {[
                            { label: 'Status', value: 'Online', color: '#10b981' },
                            { label: 'Uptime', value: `${((health.server?.uptime || 0) / 3600).toFixed(1)}h`, color: '#6366f1' },
                            { label: 'Memory (RSS)', value: `${((health.server?.memoryUsage?.rss || 0) / 1024 / 1024).toFixed(0)}MB`, color: '#06b6d4' },
                            { label: 'Heap Used', value: `${((health.server?.memoryUsage?.heapUsed || 0) / 1024 / 1024).toFixed(0)}MB`, color: '#8b5cf6' },
                            { label: 'DB Size', value: formatBytes(health.database?.size), color: '#f59e0b' },
                            { label: 'Tables', value: health.database?.tables || 0, color: '#14b8a6' },
                            { label: 'Node Version', value: health.server?.nodeVersion || '-', color: '#ec4899' },
                            { label: 'Platform', value: health.server?.platform || '-', color: '#ef4444' },
                        ].map((k, i) => <div className="kpi-card" key={i} style={{ '--kpi-color': k.color, '--kpi-color-bg': k.color + '1f' }}><div className="kpi-value">{k.value}</div><div className="kpi-label">{k.label}</div></div>)}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={fetchData}><RefreshCw size={14} /> Refresh</button>
                        <button className="btn btn-secondary" onClick={() => handleExport('users')}><Download size={14} /> Export Users</button>
                        <button className="btn btn-secondary" onClick={() => handleExport('leads')}><Download size={14} /> Export Leads</button>
                        <button className="btn btn-secondary" onClick={() => handleExport('products')}><Download size={14} /> Export Products</button>
                        <button className="btn btn-secondary" onClick={() => handleExport('invoices')}><Download size={14} /> Export Invoices</button>
                        <button className="btn btn-secondary" onClick={() => handleExport('employees')}><Download size={14} /> Export Employees</button>
                    </div>
                    {health.records && (
                        <div className="card">
                            <div className="card-header"><div className="card-title">Record Counts</div></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 'var(--space-sm)', padding: 'var(--space-md)' }}>
                                {Object.entries(health.records).map(([table, count], i) => (
                                    <div key={i} style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-hover)', borderRadius: 'var(--border-radius)', fontSize: '0.82rem' }}>
                                        <div style={{ fontWeight: 500 }}>{table.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                                        <div className="text-muted">{count} rows</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ======= SETTINGS TAB ======= */}
            {tab === 'settings' && !loading && (
                <div className="card">
                    <div className="card-header"><div className="card-title">System Settings</div>
                        <div className="page-actions">
                            <button className="btn btn-secondary btn-sm" onClick={fetchData}><RefreshCw size={14} /> Refresh</button>
                        </div>
                    </div>
                    <div>
                        {items.length === 0 ? (
                            <div className="empty-state" style={{ padding: 'var(--space-xl)' }}><p className="text-muted">No settings configured</p></div>
                        ) : items.map((item, idx) => (
                            <div key={item.id || idx} className="detail-row" style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div><div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{(item.key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>{item.description || item.category || ''}</div></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                    {item.is_sensitive ? <span className="badge badge-warning"><Lock size={12} /> Protected</span> : <span className="font-mono" style={{ fontSize: '0.85rem', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4 }}>{item.value}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ======= AUDIT LOG TAB ======= */}
            {tab === 'audit' && !loading && (
                <div className="card" style={{ padding: 0 }}>
                    <div className="card-header" style={{ padding: 'var(--space-md) var(--space-lg)' }}><div className="card-title">Audit Trail</div><span className="text-muted" style={{ fontSize: '0.82rem' }}>{auditTotal} entries</span></div>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Module</th><th>Status</th><th>IP</th></tr></thead>
                            <tbody>
                                {auditLogs.length === 0 ? <tr><td colSpan={6} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>No audit logs</td></tr> : auditLogs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                                        <td style={{ fontWeight: 500 }}>{log.user_name || log.user_email || '-'}</td>
                                        <td><span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>{log.action}</span></td>
                                        <td>{log.module}</td>
                                        <td><span className={`badge ${log.status === 'success' ? 'badge-success' : log.status === 'error' ? 'badge-danger' : 'badge-warning'}`}>{log.status}</span></td>
                                        <td className="text-muted font-mono" style={{ fontSize: '0.78rem' }}>{log.ip_address}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {auditTotal > 30 && (
                        <div className="pagination" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
                            <span>Page {auditPage} of {Math.ceil(auditTotal / 30)}</span>
                            <div className="pagination-btns">
                                <button className="pagination-btn" disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)}>Previous</button>
                                <button className="pagination-btn" disabled={auditPage * 30 >= auditTotal} onClick={() => setAuditPage(p => p + 1)}>Next</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ======= USER/ROLE CREATE/EDIT MODAL ======= */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab === 'users' ? 'User' : 'Role'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {tab === 'users' && <>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">First Name <span className="required">*</span></label><input className="form-input" value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="John" /></div>
                                    <div className="form-group"><label className="form-label">Last Name <span className="required">*</span></label><input className="form-input" value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Doe" /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Email <span className="required">*</span></label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" /></div>
                                {!editItem && <div className="form-group"><label className="form-label">Password <span className="required">*</span></label><input type="password" className="form-input" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars, uppercase, number, special" /></div>}
                                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 9876543210" /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Role <span className="required">*</span></label>
                                        <select className="form-select" value={form.role_id || ''} onChange={e => setForm({ ...form, role_id: e.target.value })}>
                                            <option value="">Select Role</option>
                                            {roles.map(r => <option key={r.id} value={r.id}>{(r.name || '').replace('_', ' ')} (L{r.level})</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group"><label className="form-label">Status</label>
                                        <select className="form-select" value={form.is_active ?? 1} onChange={e => setForm({ ...form, is_active: +e.target.value })}>
                                            <option value={1}>Active</option><option value={0}>Inactive</option>
                                        </select>
                                    </div>
                                </div>
                            </>}
                            {tab === 'roles' && <>
                                <div className="form-group"><label className="form-label">Role Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. sales_manager" /></div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe what this role can do"></textarea></div>
                                <div className="form-group"><label className="form-label">Level (1=highest, 5=lowest)</label><input type="number" min={1} max={5} className="form-input" value={form.level || 3} onChange={e => setForm({ ...form, level: +e.target.value })} /></div>
                            </>}
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : 'Create'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
