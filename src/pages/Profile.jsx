import React, { useState, useEffect, useCallback } from 'react';
import { api, useAuth, useToast } from '../App';
import { User, Mail, Phone, Globe, Lock, Shield, Clock, Activity, Save, Eye, EyeOff, CheckCircle, Camera } from 'lucide-react';

export default function ProfilePage() {
    const { user, updateUser } = useAuth();
    const toast = useToast();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({});
    const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
    const [tab, setTab] = useState('profile');
    const [isEditing, setIsEditing] = useState(false);

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api('/profile');
            console.log("FRONTEND FETCHED PROFILE DATA:", data);
            setProfile(data);
            setForm({ first_name: data.first_name, last_name: data.last_name, phone: data.phone || '', timezone: data.timezone || 'Asia/Kolkata', locale: data.locale || 'en' });
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            await api('/profile', { method: 'PUT', body: form });
            if (updateUser) updateUser({ firstName: form.first_name, lastName: form.last_name });
            toast('Profile updated successfully', 'success');
            setIsEditing(false);
            fetchProfile();
        } catch (err) { toast(err.message, 'error'); }
        setSaving(false);
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return toast('Image exceeds 5MB limit', 'error');

        const formData = new FormData();
        formData.append('avatar', file);

        setSaving(true);
        try {
            const data = await api('/profile/avatar', { method: 'POST', body: formData });
            setProfile(data);
            if (updateUser) updateUser({ avatar: data.avatar_url });
            toast('Profile picture updated successfully', 'success');
        } catch (err) { toast(err.message, 'error'); }
        setSaving(false);
    };

    const handleChangePassword = async () => {
        if (passwordForm.new_password !== passwordForm.confirm_password) {
            toast('Passwords do not match', 'error'); return;
        }
        if (passwordForm.new_password.length < 8) {
            toast('Password must be at least 8 characters', 'error'); return;
        }
        setSaving(true);
        try {
            await api('/profile/password', { method: 'PUT', body: { current_password: passwordForm.current_password, new_password: passwordForm.new_password } });
            toast('Password changed successfully', 'success');
            setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
        } catch (err) { toast(err.message, 'error'); }
        setSaving(false);
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;

    return (
        <div>
            <div className="page-header">
                <h2><User size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />My Profile</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'flex-start' }}>
                {/* Profile Card */}
                <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: 90, height: 90, margin: '0 auto 16px' }}>
                        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: 'white', overflow: 'hidden', boxShadow: '0 8px 16px rgba(99,102,241,0.2)' }}>
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</>
                            )}
                        </div>
                        <label title="Change Photo" style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, background: 'var(--bg-surface)', border: '2px solid var(--card-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)', boxShadow: '0 2px 5px rgba(0,0,0,0.15)', transition: 'all 0.2s', zIndex: 10 }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = 'var(--text-primary)'; }}>
                            <Camera size={14} />
                            <input type="file" hidden accept="image/*" onChange={handleAvatarUpload} disabled={saving} />
                        </label>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{profile?.first_name} {profile?.last_name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>{profile?.email}</div>
                    <div style={{ marginTop: 8 }}>
                        <span className="badge badge-primary" style={{ textTransform: 'capitalize' }}><Shield size={12} style={{ marginRight: 4 }} />{profile?.role_name || 'User'}</span>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 16, paddingTop: 16, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Activity</span><strong>{profile?.activityCount || 0}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Joined</span><strong>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</strong></div>
                    </div>

                    {/* Tab Navigation */}
                    <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 16, paddingTop: 12 }}>
                        {[{ id: 'profile', label: 'Personal Info', icon: User }, { id: 'security', label: 'Security', icon: Lock }, { id: 'sessions', label: 'Login History', icon: Clock }]
                            .map(t => (
                                <button key={t.id} onClick={() => setTab(t.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: tab === t.id ? 600 : 400, background: tab === t.id ? 'var(--bg-secondary)' : 'transparent', color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)', marginBottom: 4, transition: 'all 0.15s' }}>
                                    <t.icon size={15} />{t.label}
                                </button>
                            ))}
                    </div>
                </div>

                {/* Main Content */}
                <div>
                    {tab === 'profile' && (
                        <div className="card" style={{ padding: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <h3 style={{ margin: 0 }}>Personal Information</h3>
                                {!isEditing && (
                                    <button className="btn btn-primary" onClick={() => setIsEditing(true)}>Edit Details</button>
                                )}
                            </div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">First Name</label><input className="form-input" value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} disabled={!isEditing} style={{ opacity: isEditing ? 1 : 0.8, background: isEditing ? 'var(--bg-surface)' : 'var(--bg-secondary)' }} /></div>
                                <div className="form-group"><label className="form-label">Last Name</label><input className="form-input" value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} disabled={!isEditing} style={{ opacity: isEditing ? 1 : 0.8, background: isEditing ? 'var(--bg-surface)' : 'var(--bg-secondary)' }} /></div>
                            </div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label"><Mail size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Email</label><input className="form-input" value={profile?.email || ''} disabled style={{ opacity: 0.6, background: 'var(--bg-secondary)' }} /></div>
                                <div className="form-group"><label className="form-label"><Phone size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Phone</label><input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} disabled={!isEditing} style={{ opacity: isEditing ? 1 : 0.8, background: isEditing ? 'var(--bg-surface)' : 'var(--bg-secondary)' }} /></div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label"><Globe size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Timezone</label>
                                    <select className="form-select" value={form.timezone || 'Asia/Kolkata'} disabled style={{ opacity: 0.6, background: 'var(--bg-secondary)' }}>
                                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                                        <option value="America/New_York">America/New_York (EST)</option>
                                        <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                                        <option value="Europe/London">Europe/London (GMT)</option>
                                        <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                                        <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                                        <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                                        <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Language</label>
                                    <select className="form-select" value={form.locale || 'en'} disabled style={{ opacity: 0.6, background: 'var(--bg-secondary)' }}>
                                        <option value="en">English</option>
                                        <option value="hi">Hindi</option>
                                        <option value="te">Telugu</option>
                                    </select>
                                </div>
                            </div>
                            {isEditing && (
                                <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                                    <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}><Save size={15} style={{ marginRight: 6 }} />{saving ? 'Saving...' : 'Save Changes'}</button>
                                    <button className="btn btn-ghost" onClick={() => { setIsEditing(false); setForm({ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone || '', timezone: profile.timezone || 'Asia/Kolkata', locale: profile.locale || 'en' }); }} disabled={saving}>Cancel</button>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'security' && (
                        <div className="card" style={{ padding: 24 }}>
                            <h3 style={{ marginBottom: 20 }}><Lock size={18} style={{ marginRight: 8 }} />Change Password</h3>
                            <div className="form-group" style={{ maxWidth: 400 }}>
                                <label className="form-label">Current Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input className="form-input" type={showPasswords.current ? 'text' : 'password'} value={passwordForm.current_password} onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })} />
                                    <button className="btn btn-ghost btn-icon" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}>{showPasswords.current ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                                </div>
                            </div>
                            <div className="form-group" style={{ maxWidth: 400 }}>
                                <label className="form-label">New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input className="form-input" type={showPasswords.new ? 'text' : 'password'} value={passwordForm.new_password} onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })} />
                                    <button className="btn btn-ghost btn-icon" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}>{showPasswords.new ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                                </div>
                            </div>
                            <div className="form-group" style={{ maxWidth: 400 }}>
                                <label className="form-label">Confirm New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input className="form-input" type={showPasswords.confirm ? 'text' : 'password'} value={passwordForm.confirm_password} onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })} />
                                    <button className="btn btn-ghost btn-icon" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}>{showPasswords.confirm ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                                </div>
                                {passwordForm.new_password && passwordForm.confirm_password && passwordForm.new_password === passwordForm.confirm_password && (
                                    <div style={{ color: 'var(--success)', fontSize: '0.8rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={13} /> Passwords match</div>
                                )}
                            </div>
                            <div style={{ marginTop: 20 }}>
                                <button className="btn btn-primary" onClick={handleChangePassword} disabled={saving || !passwordForm.current_password || !passwordForm.new_password}>
                                    <Lock size={15} style={{ marginRight: 6 }} />{saving ? 'Changing...' : 'Change Password'}
                                </button>
                            </div>
                            <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-lg)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                <strong>Password Requirements:</strong>
                                <ul style={{ margin: '8px 0 0 16px', lineHeight: 1.8 }}>
                                    <li>Minimum 8 characters</li>
                                    <li>Recommended: mix of upper/lowercase, numbers, and symbols</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {tab === 'sessions' && (
                        <div className="card" style={{ padding: 24 }}>
                            <h3 style={{ marginBottom: 20 }}><Clock size={18} style={{ marginRight: 8 }} />Login History</h3>
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead><tr><th>Action</th><th>IP Address</th><th>Browser</th><th>Time</th></tr></thead>
                                    <tbody>
                                        {(profile?.sessions || []).map((s, i) => (
                                            <tr key={i}>
                                                <td><span className={`badge ${s.action === 'LOGIN' ? 'badge-success' : 'badge-neutral'}`}>{s.action}</span></td>
                                                <td className="font-mono">{s.ip_address || '—'}</td>
                                                <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{s.user_agent || '—'}</td>
                                                <td>{s.created_at ? new Date(s.created_at).toLocaleString('en-IN') : '—'}</td>
                                            </tr>
                                        ))}
                                        {(!profile?.sessions || profile.sessions.length === 0) && <tr><td colSpan={4} className="text-center text-muted" style={{ padding: 24 }}>No login history found</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
