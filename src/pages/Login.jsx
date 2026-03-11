import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Lock, Mail, Eye, EyeOff, AlertCircle, Zap } from 'lucide-react';

export default function LoginPage() {
    const { login, isAuth } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (isAuth) { navigate('/', { replace: true }); return null; }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email || !password) { setError('Please enter email and password'); return; }
        setLoading(true);
        try {
            await login(email, password);
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message || 'Invalid credentials');
        } finally { setLoading(false); }
    };

    const quickLogin = (email) => { setEmail(email); setPassword('Admin@123'); };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                        <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg,var(--color-primary),var(--color-secondary))', borderRadius: 'var(--border-radius)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Zap size={28} color="white" />
                        </div>
                    </div>
                    <h1>Rapidflo</h1>
                    <p>Enterprise Resource Planning Platform</p>
                </div>

                {error && (
                    <div style={{ background: 'var(--color-danger-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--border-radius)', padding: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', color: 'var(--color-danger)', fontSize: '0.85rem' }}>
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="email"
                                className="form-input"
                                style={{ paddingLeft: 36 }}
                                placeholder="you@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type={showPw ? 'text' : 'password'}
                                className="form-input"
                                style={{ paddingLeft: 36, paddingRight: 36 }}
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading} style={{ marginTop: 'var(--space-md)' }}>
                        {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></div> Signing in...</> : 'Sign In'}
                    </button>
                </form>

                {/* Demo accounts */}
                <div style={{ marginTop: 'var(--space-xl)', borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-lg)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>Demo Accounts (click to fill)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                        {[
                            { label: 'Super Admin', email: 'superadmin@rapidflo.com' },
                            { label: 'Admin', email: 'admin@rapidflo.com' },
                            { label: 'Manager', email: 'sales.mgr@rapidflo.com' },
                            { label: 'Employee', email: 'employee1@rapidflo.com' },
                        ].map(acc => (
                            <button key={acc.email} className="btn btn-secondary btn-sm" onClick={() => quickLogin(acc.email)} style={{ fontSize: '0.75rem' }}>
                                {acc.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-disabled)', textAlign: 'center', marginTop: 'var(--space-sm)' }}>All passwords: Admin@123</div>
                </div>
            </div>
        </div>
    );
}
