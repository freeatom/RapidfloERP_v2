import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, api } from '../App';
import { Building2, Plus, Users, Shield, Key, Pencil, Trash2, UserPlus, ChevronRight, Search, ToggleLeft, ToggleRight, Lock, Unlock, ArrowLeft, BadgeCheck, Eye, EyeOff } from 'lucide-react';

export default function CompanyAdmin() {
    const { user } = useAuth();
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [detail, setDetail] = useState(null);
    const [modal, setModal] = useState(null); // 'company' | 'user' | 'password' | 'admin'
    const [form, setForm] = useState({});
    const [roles, setRoles] = useState([]);
    const [allAdmins, setAllAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [tempPassword, setTempPassword] = useState('');

    const isSuperAdmin = user?.roleLevel <= 1;

    const fetchCompanies = useCallback(async () => {
        try {
            const data = await api(`/admin/companies${search ? `?search=${encodeURIComponent(search)}` : ''}`);
            setCompanies(data.companies || []);
        } catch { }
        setLoading(false);
    }, [search]);

    useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

    useEffect(() => {
        api('/admin/roles').then(d => setRoles(d.roles || [])).catch(() => { });
    }, []);

    const fetchDetail = async (id) => {
        try {
            const data = await api(`/admin/companies/${id}`);
            setDetail(data);
            setSelectedCompany(id);
        } catch (e) { alert(e.message); }
    };

    const saveCompany = async () => {
        try {
            if (form.id) {
                await api(`/admin/companies/${form.id}`, { method: 'PUT', body: form });
            } else {
                await api('/admin/companies', { method: 'POST', body: form });
            }
            setModal(null); setForm({}); fetchCompanies();
            if (selectedCompany) fetchDetail(selectedCompany);
        } catch (e) { alert(e.message); }
    };

    const deleteCompany = async (id) => {
        if (!confirm('Are you ABSOLUTELY sure? This will permanently delete the company and its isolated database!')) return;
        try {
            await api(`/admin/companies/${id}?permanent=true`, { method: 'DELETE' });
            if (selectedCompany === id) { setSelectedCompany(null); setDetail(null); }
            fetchCompanies();
        } catch (e) { alert(e.message); }
    };

    const saveUser = async () => {
        try {
            await api(`/admin/companies/${selectedCompany}/users`, { method: 'POST', body: form });
            setModal(null); setForm({}); fetchDetail(selectedCompany);
        } catch (e) { alert(e.message); }
    };

    const resetPassword = async (userId) => {
        setModal('password');
        setForm({ userId, password: '' });
        setTempPassword('');
    };

    const doResetPassword = async () => {
        try {
            const res = await api(`/admin/companies/${selectedCompany}/users/${form.userId}/reset-password`, {
                method: 'POST', body: form.password ? { password: form.password } : {}
            });
            if (res.tempPassword) setTempPassword(res.tempPassword);
            else { setModal(null); setForm({}); }
            fetchDetail(selectedCompany);
        } catch (e) { alert(e.message); }
    };

    const toggleUserStatus = async (userId, field, value) => {
        try {
            await api(`/admin/companies/${selectedCompany}/users/${userId}`, { method: 'PUT', body: { [field]: value ? 0 : 1 } });
            fetchDetail(selectedCompany);
        } catch (e) { alert(e.message); }
    };

    const assignAdmin = async () => {
        try {
            await api(`/admin/companies/${selectedCompany}/admins`, { method: 'POST', body: { userId: form.userId } });
            setModal(null); setForm({}); fetchDetail(selectedCompany);
        } catch (e) { alert(e.message); }
    };

    const removeAdmin = async (userId) => {
        if (!confirm('Remove this admin from this company?')) return;
        try {
            await api(`/admin/companies/${selectedCompany}/admins/${userId}`, { method: 'DELETE' });
            fetchDetail(selectedCompany);
        } catch (e) { alert(e.message); }
    };

    // Fetch admins list for assignment dropdown
    const openAssignAdmin = async () => {
        try {
            const d = await api('/admin/users?limit=100');
            setAllAdmins((d.users || []).filter(u => u.role_name === 'admin' || u.role_name === 'super_admin'));
            setModal('admin'); setForm({});
        } catch (e) { alert(e.message); }
    };

    // === DETAIL VIEW ===
    if (selectedCompany && detail) {
        return (
            <div className="page-content" style={{ padding: '24px', maxWidth: 1200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <button className="btn-ghost" onClick={() => { setSelectedCompany(null); setDetail(null); }} style={{ padding: '6px 12px', borderRadius: 8 }}>
                        <ArrowLeft size={18} /> Back
                    </button>
                    <Building2 size={28} style={{ color: 'var(--color-primary)' }} />
                    <div>
                        <h2 style={{ margin: 0, fontSize: 22 }}>{detail.name}</h2>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Code: {detail.code} • {detail.industry || 'N/A'} • {detail.is_active ? '🟢 Active' : '🔴 Inactive'}</span>
                    </div>
                    {isSuperAdmin && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button className="btn-primary" onClick={() => { setForm({ ...detail }); setModal('company'); }} style={{ borderRadius: 8, padding: '8px 16px' }}>
                                <Pencil size={14} /> Edit
                            </button>
                            <button onClick={() => deleteCompany(detail.id)} style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', color: '#ef4444', borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, transition: 'var(--transition)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}>
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
                    )}
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
                    {[
                        { label: 'Users', value: detail.users?.length || 0, icon: Users },
                        { label: 'Leads', value: detail.stats?.leads || 0, icon: BadgeCheck },
                        { label: 'Contacts', value: detail.stats?.contacts || 0, icon: Users },
                        { label: 'Opportunities', value: detail.stats?.opportunities || 0, icon: Building2 },
                    ].map(s => (
                        <div key={s.label} className="card" style={{ padding: '16px', textAlign: 'center' }}>
                            <s.icon size={20} style={{ color: 'var(--color-primary)', marginBottom: 6 }} />
                            <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Company Details */}
                {(detail.email || detail.phone || detail.address || detail.gst_number) && (
                    <div className="card" style={{ padding: 20, marginBottom: 24 }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Company Details</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, fontSize: 14 }}>
                            {detail.email && <div><strong>Email:</strong> {detail.email}</div>}
                            {detail.phone && <div><strong>Phone:</strong> {detail.phone}</div>}
                            {detail.website && <div><strong>Website:</strong> {detail.website}</div>}
                            {detail.address && <div><strong>Address:</strong> {detail.address}, {detail.city}, {detail.state}</div>}
                            {detail.gst_number && <div><strong>GST:</strong> {detail.gst_number}</div>}
                            {detail.pan_number && <div><strong>PAN:</strong> {detail.pan_number}</div>}
                        </div>
                    </div>
                )}

                {/* Assigned Admins */}
                <div className="card" style={{ padding: 20, marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>
                            <Shield size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Assigned Admins
                        </h3>
                        {isSuperAdmin && (
                            <button className="btn-primary btn-sm" onClick={openAssignAdmin} style={{ borderRadius: 6, padding: '6px 14px', fontSize: 13 }}>
                                <Plus size={14} /> Assign Admin
                            </button>
                        )}
                    </div>
                    {(!detail.admins || detail.admins.length === 0) ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No admins assigned yet</p>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {detail.admins.map(a => (
                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-bg)', padding: '8px 14px', borderRadius: 20, border: '1px solid var(--border)' }}>
                                    <Shield size={14} style={{ color: 'var(--color-primary)' }} />
                                    <span style={{ fontSize: 14 }}>{a.first_name} {a.last_name}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({a.email})</span>
                                    {isSuperAdmin && <button onClick={() => removeAdmin(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={14} /></button>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Users Table */}
                <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>
                            <Users size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Company Users ({detail.users?.length || 0})
                        </h3>
                        <button className="btn-primary btn-sm" onClick={() => { setForm({ company_id: selectedCompany }); setModal('user'); }} style={{ borderRadius: 6, padding: '6px 14px', fontSize: 13 }}>
                            <UserPlus size={14} /> Create User
                        </button>
                    </div>
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(detail.users || []).map(u => (
                                <tr key={u.id}>
                                    <td style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</td>
                                    <td>{u.email}</td>
                                    <td><span style={{ background: 'var(--primary-bg)', color: 'var(--color-primary)', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>{u.role_name}</span></td>
                                    <td>
                                        <span style={{ color: u.is_active ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: 13 }}>
                                            {u.is_active ? '● Active' : '● Inactive'}
                                        </span>
                                        {u.is_locked ? <span style={{ color: '#ef4444', marginLeft: 6, fontSize: 12 }}>🔒 Locked</span> : null}
                                    </td>
                                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button title={u.is_active ? 'Deactivate' : 'Activate'} className="btn-ghost btn-sm" onClick={() => toggleUserStatus(u.id, 'is_active', u.is_active)} style={{ padding: 4 }}>
                                                {u.is_active ? <ToggleRight size={16} style={{ color: '#22c55e' }} /> : <ToggleLeft size={16} style={{ color: '#ef4444' }} />}
                                            </button>
                                            {u.is_locked && (
                                                <button title="Unlock" className="btn-ghost btn-sm" onClick={() => toggleUserStatus(u.id, 'is_locked', u.is_locked)} style={{ padding: 4 }}>
                                                    <Unlock size={14} />
                                                </button>
                                            )}
                                            <button title="Reset Password" className="btn-ghost btn-sm" onClick={() => resetPassword(u.id)} style={{ padding: 4 }}>
                                                <Key size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {(!detail.users || detail.users.length === 0) && (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No users in this company yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Modals */}
                {modal && (
                    <div className="modal-overlay" onClick={() => { setModal(null); setTempPassword(''); }}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ width: modal === 'company' ? 600 : 440, maxHeight: '90vh', overflow: 'auto' }}>
                            {modal === 'company' && (
                                <>
                                    <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit Company' : 'New Company'}</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div><label>Name *</label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                        {!form.id && <div><label>Code *</label><input className="form-input" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. acme_corp" /></div>}
                                        {form.id && <div><label>Code</label><input className="form-input" value={form.code || ''} disabled style={{ opacity: .6 }} /></div>}
                                        <div><label>Industry</label><input className="form-input" value={form.industry || ''} onChange={e => setForm({ ...form, industry: e.target.value })} /></div>
                                        <div><label>Email</label><input className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                        <div><label>Phone</label><input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                                        <div><label>Website</label><input className="form-input" value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
                                        <div><label>GST Number</label><input className="form-input" value={form.gst_number || ''} onChange={e => setForm({ ...form, gst_number: e.target.value })} /></div>
                                        <div><label>PAN Number</label><input className="form-input" value={form.pan_number || ''} onChange={e => setForm({ ...form, pan_number: e.target.value })} /></div>
                                        <div style={{ gridColumn: '1 / -1' }}><label>Address</label><input className="form-input" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                                        <div><label>City</label><input className="form-input" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                                        <div><label>State</label><input className="form-input" value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                                        <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                                        <button className="btn-primary" onClick={saveCompany} disabled={!form.name || (!form.id && !form.code)}>{form.id ? 'Update' : 'Create'}</button>
                                    </div>
                                </>
                            )}
                            {modal === 'user' && (
                                <>
                                    <h3 style={{ marginTop: 0 }}>Create User for {detail.name}</h3>
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div><label>First Name *</label><input className="form-input" value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                                            <div><label>Last Name *</label><input className="form-input" value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                                        </div>
                                        <div><label>Email *</label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                        <div><label>Phone</label><input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                                        <div>
                                            <label>Role</label>
                                            <select className="form-input" value={form.role_id || ''} onChange={e => setForm({ ...form, role_id: e.target.value })}>
                                                <option value="">— Select Role —</option>
                                                {roles.filter(r => r.name !== 'super_admin').map(r => <option key={r.id} value={r.id}>{r.name} (Level {r.level})</option>)}
                                            </select>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <label>Password *</label>
                                            <input type={showPassword ? 'text' : 'password'} className="form-input" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 10, top: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0' }}>Min 8 chars, uppercase, lowercase, number, special char</p>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                                        <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                                        <button className="btn-primary" onClick={saveUser} disabled={!form.first_name || !form.last_name || !form.email || !form.password}>Create User</button>
                                    </div>
                                </>
                            )}
                            {modal === 'password' && (
                                <>
                                    <h3 style={{ marginTop: 0 }}>Reset Password</h3>
                                    {tempPassword ? (
                                        <div style={{ background: 'var(--success-bg, #dcfce7)', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                                            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Temporary Password Generated:</p>
                                            <code style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>{tempPassword}</code>
                                            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Share this with the user securely. They should change it after first login.</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Enter a new password, or leave empty to auto-generate a temporary password.</p>
                                            <label>New Password (optional)</label>
                                            <input type="text" className="form-input" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Leave empty to auto-generate" />
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                                        <button className="btn-ghost" onClick={() => { setModal(null); setTempPassword(''); }}>Close</button>
                                        {!tempPassword && <button className="btn-primary" onClick={doResetPassword}>Reset Password</button>}
                                    </div>
                                </>
                            )}
                            {modal === 'admin' && (
                                <>
                                    <h3 style={{ marginTop: 0 }}>Assign Admin to {detail.name}</h3>
                                    <select className="form-input" value={form.userId || ''} onChange={e => setForm({ userId: e.target.value })}>
                                        <option value="">— Select Admin —</option>
                                        {allAdmins.filter(a => !(detail.admins || []).find(x => x.id === a.id)).map(a => (
                                            <option key={a.id} value={a.id}>{a.first_name} {a.last_name} ({a.email}) — {a.role_name}</option>
                                        ))}
                                    </select>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                                        <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                                        <button className="btn-primary" onClick={assignAdmin} disabled={!form.userId}>Assign</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // === LIST VIEW ===
    return (
        <div className="page-content" style={{ padding: '24px', maxWidth: 1200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 26 }}>
                        <Building2 size={28} style={{ verticalAlign: 'middle', marginRight: 10, color: 'var(--color-primary)' }} />
                        Company Management
                    </h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>Manage companies, users, and access</p>
                </div>
                {isSuperAdmin && (
                    <button className="btn-primary" onClick={() => { setForm({}); setModal('company'); }} style={{ borderRadius: 10, padding: '10px 20px', fontWeight: 600 }}>
                        <Plus size={18} /> New Company
                    </button>
                )}
            </div>

            <div style={{ marginBottom: 20 }}>
                <div style={{ position: 'relative', maxWidth: 360 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." style={{ paddingLeft: 36 }} />
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading...</div>
            ) : companies.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                    <Building2 size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
                    <h3 style={{ color: 'var(--text-muted)' }}>No companies yet</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Create your first company to get started</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
                    {companies.map(c => (
                        <div key={c.id} className="card" style={{ padding: 20, cursor: 'pointer', transition: 'transform .15s, box-shadow .15s' }}
                            onClick={() => fetchDetail(c.id)}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{c.name}</h3>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{c.code} • {c.industry || 'General'}</span>
                                </div>
                                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: c.is_active ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: c.is_active ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                                    {c.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                                <div style={{ fontSize: 13 }}>
                                    <Users size={14} style={{ marginRight: 4, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                                    <strong>{c.user_count || 0}</strong> users
                                </div>
                                <div style={{ fontSize: 13 }}>
                                    <BadgeCheck size={14} style={{ marginRight: 4, verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                                    <strong>{c.lead_count || 0}</strong> leads
                                </div>
                                <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {modal === 'company' && !selectedCompany && (
                <div className="modal-overlay" onClick={() => setModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 650, maxHeight: '90vh', overflow: 'auto', padding: 0 }}>
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)' }}>
                            <div style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-primary)', padding: 10, borderRadius: 12 }}><Building2 size={24} /></div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 20 }}>{form.id ? 'Edit Company Profile' : 'Create New Company'}</h3>
                                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{form.id ? 'Update organizational details below.' : 'Configure a new isolated environment for the organization.'}</p>
                            </div>
                        </div>

                        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* SECTION 1: Core */}
                            <div>
                                <h4 style={{ margin: '0 0 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Shield size={14} /> Core Information
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Company Name *</label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Corporation" style={{ width: '100%' }} /></div>
                                    {!form.id && <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Code * <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(unique slug)</span></label><input className="form-input" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. acme_corp" style={{ width: '100%' }} /></div>}
                                    {form.id && <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Code</label><input className="form-input" value={form.code || ''} disabled style={{ opacity: .6, width: '100%' }} /></div>}
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Industry</label><input className="form-input" value={form.industry || ''} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Technology" style={{ width: '100%' }} /></div>
                                </div>
                            </div>

                            <hr style={{ border: 0, borderTop: '1px dashed var(--border)', margin: 0 }} />

                            {/* SECTION 2: Contact */}
                            <div>
                                <h4 style={{ margin: '0 0 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Users size={14} /> Contact & Address
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Email</label><input className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contact@company.com" style={{ width: '100%' }} /></div>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Phone</label><input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" style={{ width: '100%' }} /></div>
                                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Address</label><input className="form-input" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Business Rd" style={{ width: '100%' }} /></div>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>City</label><input className="form-input" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} style={{ width: '100%' }} /></div>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>State/Province</label><input className="form-input" value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })} style={{ width: '100%' }} /></div>
                                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Website</label><input className="form-input" value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://www.company.com" style={{ width: '100%' }} /></div>
                                </div>
                            </div>

                            <hr style={{ border: 0, borderTop: '1px dashed var(--border)', margin: 0 }} />

                            {/* SECTION 3: Tax/Legal */}
                            <div>
                                <h4 style={{ margin: '0 0 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BadgeCheck size={14} /> Legal & Compliance
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>GST Number</label><input className="form-input" value={form.gst_number || ''} onChange={e => setForm({ ...form, gst_number: e.target.value })} style={{ width: '100%' }} /></div>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>PAN Number</label><input className="form-input" value={form.pan_number || ''} onChange={e => setForm({ ...form, pan_number: e.target.value })} style={{ width: '100%' }} /></div>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '16px 32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--bg-surface)' }}>
                            <button className="btn-ghost" onClick={() => setModal(null)} style={{ padding: '10px 20px', borderRadius: 8 }}>Cancel</button>
                            <button className="btn-primary" onClick={saveCompany} disabled={!form.name || (!form.id && !form.code)} style={{ padding: '10px 24px', borderRadius: 8, fontWeight: 600 }}>{form.id ? 'Save Changes' : 'Create Company'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
