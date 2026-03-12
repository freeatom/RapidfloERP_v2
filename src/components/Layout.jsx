import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, api } from '../App';
import CommandPalette from './CommandPalette';
import {
    LayoutDashboard, Users, ShoppingCart, DollarSign, Package,
    Truck, UserCheck, FolderKanban, LifeBuoy, BarChart3, Settings,
    Bell, Search, ChevronLeft, LogOut, Menu, X, Moon, Sun, Zap, ScanLine,
    ArrowRight, Command, Building2, ChevronDown, LogIn, Shield, ExternalLink
} from 'lucide-react';
import logo from "../assets/logo.png";

const navItems = [
    {
        section: 'Overview', items: [
            { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        ]
    },
    {
        section: 'Business', items: [
            { path: '/crm', icon: Users, label: 'CRM' },
            { path: '/sales', icon: ShoppingCart, label: 'Sales' },
            { path: '/finance', icon: DollarSign, label: 'Finance' },
            { path: '/inventory', icon: Package, label: 'Inventory' },
            { path: '/procurement', icon: Truck, label: 'Procurement' },
        ]
    },
    {
        section: 'Operations', items: [
            { path: '/hrms', icon: UserCheck, label: 'HRMS' },
            { path: '/projects', icon: FolderKanban, label: 'Projects' },
            { path: '/support', icon: LifeBuoy, label: 'Support' },
            { path: '/workflows', icon: Zap, label: 'Workflows' },
            { path: '/scanner', icon: ScanLine, label: 'Scanner' },
        ]
    },
    {
        section: 'System', items: [
            { path: '/reports', icon: BarChart3, label: 'Reports' },
            { path: '/admin', icon: Settings, label: 'Admin' },
            { path: '/companies', icon: Building2, label: 'Companies', adminOnly: true },
        ]
    },
];

export default function Layout() {
    const { user, logout, enterCompany, exitCompany } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const activeCompanyId = localStorage.getItem('erp_company_id');
    const isSuperAdmin = user?.isSuperAdmin || user?.roleLevel <= 1;
    const needsCompanyGate = isSuperAdmin && !activeCompanyId && location.pathname !== '/companies';
    const [companies, setCompanies] = useState([]);
    const [gateLoading, setGateLoading] = useState(true);
    const [gateSearch, setGateSearch] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showNotifs, setShowNotifs] = useState(false);
    const [enabledModules, setEnabledModules] = useState(null);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
    };

    // Initialize saved theme
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    }, []);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const searchRef = useRef(null);
    const searchTimerRef = useRef(null);

    // Fetch companies for SuperAdmin gate
    useEffect(() => {
        if (needsCompanyGate) {
            api('/admin/companies').then(d => { setCompanies(d.companies || []); setGateLoading(false); }).catch(() => setGateLoading(false));
        }
    }, [needsCompanyGate]);

    useEffect(() => {
        if (!needsCompanyGate) {
            api('/notifications').then(data => setNotifications(data.notifications || [])).catch(() => { });
            const interval = setInterval(() => {
                api('/notifications').then(data => setNotifications(data.notifications || [])).catch(() => { });
            }, 30000);
            return () => clearInterval(interval);
        }
    }, [needsCompanyGate]);

    // Fetch enabled modules on mount and when location changes
    useEffect(() => {
        if (!needsCompanyGate) {
            api('/modules/enabled').then(data => setEnabledModules(data.modules || [])).catch(() => { });
        }
    }, [location.pathname, needsCompanyGate]);

    // Ctrl+K shortcut
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
                setShowSearch(true);
            }
            if (e.key === 'Escape') {
                setShowSearch(false);
                setSearchResults(null);
                searchRef.current?.blur();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Debounced search
    const doSearch = useCallback(async (q) => {
        if (!q || q.length < 2) { setSearchResults(null); return; }
        setSearchLoading(true);
        try {
            const data = await api(`/search?q=${encodeURIComponent(q)}`);
            setSearchResults(data);
            setShowSearch(true);
        } catch { setSearchResults(null); }
        setSearchLoading(false);
    }, []);

    const handleSearchInput = (val) => {
        setSearchQuery(val);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => doSearch(val), 300);
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const handleLogout = async () => { await logout(); navigate('/login'); };

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    const getPageTitle = () => {
        const path = location.pathname;
        if (path === '/') return 'Dashboard';
        const segment = path.split('/')[1];
        return segment.charAt(0).toUpperCase() + segment.slice(1);
    };

    const markAsRead = async (id) => {
        try { await api(`/notifications/${id}/read`, { method: 'PUT' }); setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)); } catch { }
    };

    const handleResultClick = (group) => {
        navigate(group.path);
        setShowSearch(false);
        setSearchResults(null);
        setSearchQuery('');
    };

    // === COMPANY GATE for SuperAdmin ===
    if (needsCompanyGate) {
        const filtered = companies.filter(c =>
            !gateSearch || c.name.toLowerCase().includes(gateSearch.toLowerCase()) || c.code.toLowerCase().includes(gateSearch.toLowerCase())
        );
        return (
            <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
                {/* Top header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img src={logo} alt="Logo" style={{ height: 32 }} />
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Rapidflo</h2>
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700 }}>Super Admin</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle Theme">
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar">{user?.first_name?.[0]}{user?.last_name?.[0]}</div>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{user?.first_name} {user?.last_name}</span>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={async () => { await logout(); navigate('/login'); }} title="Logout"><LogOut size={18} /></button>
                    </div>
                </div>
                {/* Main area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <Shield size={48} style={{ color: 'var(--color-primary)', marginBottom: 16 }} />
                        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800 }}>Select a Company</h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15, maxWidth: 500 }}>Choose which company's ERP data you want to access. Data is fully isolated between companies.</p>
                    </div>
                    {/* Search + Manage */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 24, width: '100%', maxWidth: 500 }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="form-input" value={gateSearch} onChange={e => setGateSearch(e.target.value)} placeholder="Search companies..." style={{ paddingLeft: 36, width: '100%' }} />
                        </div>
                        <button className="btn-primary" onClick={() => navigate('/companies')}
                            style={{ borderRadius: 8, padding: '8px 16px', whiteSpace: 'nowrap', fontSize: 13 }}>
                            <Settings size={14} style={{ marginRight: 4 }} /> Manage Companies
                        </button>
                    </div>
                    {/* Company cards */}
                    {gateLoading ? (
                        <div style={{ padding: 60, color: 'var(--text-muted)' }}>Loading companies...</div>
                    ) : filtered.length === 0 ? (
                        <div className="card" style={{ padding: 60, textAlign: 'center', width: '100%', maxWidth: 600 }}>
                            <Building2 size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
                            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>{companies.length === 0 ? 'No companies yet' : 'No matching companies'}</h3>
                            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Create your first company from the Manage Companies panel</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, width: '100%', maxWidth: Object.keys(filtered).length <= 2 ? 800 : 1200, margin: '0 auto' }}>
                            {filtered.map(c => (
                                <div key={c.id} className="card" style={{ padding: '24px 28px', cursor: 'pointer', transition: 'transform .2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow .2s cubic-bezier(0.4, 0, 0.2, 1), border-color .2s', border: '2px solid transparent', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}
                                    onClick={() => enterCompany(c.id)}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,.1)'; e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'transparent'; }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                                        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, var(--color-primary), #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20, boxShadow: '0 4px 12px rgba(99,102,241,.3)' }}>
                                            {c.name?.[0]?.toUpperCase()}
                                        </div>
                                        <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, background: c.is_active ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: c.is_active ? '#16a34a' : '#dc2626', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            {c.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{c.name}</h3>
                                        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-muted)' }}>{c.code} {c.industry ? `• ${c.industry}` : ''}</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, borderTop: '1px solid var(--border-light)', paddingTop: 16, marginTop: 'auto' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontWeight: 500 }}>
                                            <Users size={16} /> <span>{c.user_count || 0} users</span>
                                        </div>
                                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-primary)', fontWeight: 700, fontSize: 13, opacity: 0.9 }}>
                                            Select <ArrowRight size={14} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // === NORMAL LAYOUT (company selected or non-SuperAdmin) ===
    return (
        <div className="app-layout">
            {/* Sidebar */}
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <img src={logo} alt="Logo" className="logo-icon" />
                    {!collapsed && <h1>Rapidflo</h1>}
                    <button className="btn btn-ghost btn-icon" onClick={() => { setCollapsed(!collapsed); setMobileOpen(false); }} style={{ marginLeft: 'auto' }}>
                        <ChevronLeft size={18} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'var(--transition)' }} />
                    </button>
                </div>
                <nav className="sidebar-nav">
                    {navItems.map((section) => {
                        // Filter section items by enabled modules
                        // Always-visible: /, /reports, /admin, /workflows, /scanner
                        const alwaysVisible = ['/', '/reports', '/admin', '/workflows', '/scanner', '/companies'];
                        const filteredItems = section.items.filter(item => {
                            if (item.path === '/companies') {
                                if (!isSuperAdmin || activeCompanyId) return false;
                            }
                            if (item.adminOnly && (!user || user.roleLevel > 2)) return false;
                            if (alwaysVisible.includes(item.path)) return true;
                            if (!enabledModules) return true; // Still loading, show all
                            const moduleName = item.path.replace('/', '');
                            return enabledModules.includes(moduleName);
                        });
                        if (filteredItems.length === 0) return null;
                        return (
                            <div key={section.section} className="nav-section">
                                {!collapsed && <div className="nav-section-title">{section.section}</div>}
                                {filteredItems.map((item) => (
                                    <div
                                        key={item.path}
                                        className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                                        onClick={() => { navigate(item.path); setMobileOpen(false); }}
                                        title={collapsed ? item.label : undefined}
                                    >
                                        <item.icon className="nav-icon" size={20} />
                                        {!collapsed && <span>{item.label}</span>}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </nav>
                <div className="sidebar-footer">
                    <div className="nav-item" onClick={handleLogout} title="Logout">
                        <LogOut className="nav-icon" size={20} />
                        {!collapsed && <span>Logout</span>}
                    </div>
                </div>
            </aside>

            {/* Mobile overlay */}
            {mobileOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }} onClick={() => setMobileOpen(false)} />}

            {/* Main Content */}
            <div className="main-content">
                <header className="topbar">
                    <div className="topbar-left">
                        <button className="btn btn-ghost btn-icon" onClick={() => setMobileOpen(true)} style={{ display: 'none' }}>
                            <Menu size={20} />
                        </button>
                        <div>
                            <div className="page-title">{getPageTitle()}</div>
                            <div className="breadcrumb">
                                <span>Home</span>
                                {location.pathname !== '/' && <span>{getPageTitle()}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="topbar-right">
                        {/* Current Company indicator (All users in a company) */}
                        {activeCompanyId && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.2)', fontSize: 13 }}>
                                    <Building2 size={16} style={{ color: 'var(--color-primary)' }} />
                                    {isSuperAdmin ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Viewing Company</span>
                                            <span style={{ fontWeight: 800, color: 'var(--text-primary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {user?.companyName || 'Unknown Company'}
                                            </span>
                                        </div>
                                    ) : (
                                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                                            {user?.companyName || 'Unknown Company'}
                                        </span>
                                    )}
                                </div>
                                {/* Exit Company (SuperAdmin only) */}
                                {isSuperAdmin && (
                                    <button onClick={exitCompany} title="Exit to Company Selector" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'var(--transition)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.2)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}>
                                        <LogOut size={16} /> Exit Company
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Global Search */}
                        <div style={{ position: 'relative' }}>
                            <div className="search-box" style={{ position: 'relative' }}>
                                <Search className="search-icon" size={16} />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    className="form-input"
                                    placeholder="Search everywhere... (Ctrl+K)"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchInput(e.target.value)}
                                    onFocus={() => searchQuery.length >= 2 && setShowSearch(true)}
                                />
                                <kbd style={{
                                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                    padding: '2px 6px', fontSize: '0.65rem', color: 'var(--text-muted)',
                                    border: '1px solid var(--border-color)', borderRadius: 4,
                                    background: 'var(--bg-surface-2)', pointerEvents: 'none'
                                }}>⌘K</kbd>
                            </div>

                            {/* Search Results Dropdown */}
                            {showSearch && searchResults && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowSearch(false)} />
                                    <div style={{
                                        position: 'absolute', right: 0, top: 'calc(100% + 4px)', width: 440,
                                        background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-xl)',
                                        zIndex: 200, maxHeight: 440, overflowY: 'auto'
                                    }}>
                                        <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            {searchLoading ? 'Searching...' : `${searchResults.total || 0} results for "${searchResults.query}"`}
                                        </div>
                                        {(searchResults.results || []).length === 0 && !searchLoading ? (
                                            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>No results found</div>
                                        ) : (searchResults.results || []).map((group, gi) => (
                                            <div key={gi}>
                                                <div style={{
                                                    padding: 'var(--space-xs) var(--space-md)', fontSize: '0.7rem',
                                                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                                                    color: 'var(--text-muted)', background: 'var(--bg-surface-2)',
                                                    borderBottom: '1px solid var(--border-light)'
                                                }}>
                                                    {group.module} · {group.type}
                                                </div>
                                                {group.items.map((item, ii) => (
                                                    <div key={ii} onClick={() => handleResultClick(group)}
                                                        style={{
                                                            padding: 'var(--space-sm) var(--space-md)', cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            borderBottom: '1px solid var(--border-light)',
                                                            transition: 'background 0.15s'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 500, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                                                            {item.subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.subtitle}</div>}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                            {item.badge && <span className={`badge ${item.badge === 'active' || item.badge === 'paid' ? 'badge-success' : item.badge === 'overdue' ? 'badge-danger' : 'badge-neutral'}`} style={{ fontSize: '0.68rem' }}>{item.badge}</span>}
                                                            <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Notifications */}
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowNotifs(!showNotifs)}>
                                <Bell size={20} />
                                {unreadCount > 0 && <span className="nav-badge" style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, textAlign: 'center' }}>{unreadCount}</span>}
                            </button>
                            {showNotifs && (
                                <div style={{ position: 'absolute', right: 0, top: '100%', width: 360, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-xl)', zIndex: 200, maxHeight: 400, overflowY: 'auto' }}>
                                    <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-color)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Notifications</span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {unreadCount > 0 && <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }} onClick={async () => { try { await api('/notifications/read-all', { method: 'PUT' }); setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 }))); } catch { } }}>Mark All Read</button>}
                                            <button className="btn btn-ghost btn-sm" onClick={() => setShowNotifs(false)}>✕</button>
                                        </div>
                                    </div>
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>No notifications</div>
                                    ) : notifications.slice(0, 10).map(n => (
                                        <div key={n.id} onClick={() => markAsRead(n.id)} style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', background: n.is_read ? 'transparent' : 'var(--bg-hover)', transition: 'background var(--transition-fast)' }}>
                                            <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: '0.85rem' }}>{n.title}</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{n.message}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* User */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }} onClick={() => navigate('/profile')} title="My Profile">
                            <div className="avatar" style={{ overflow: 'hidden' }}>
                                {user?.avatar ? (
                                    <img src={user.avatar} alt="User Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <>{user?.firstName?.[0]}{user?.lastName?.[0]}</>
                                )}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user?.firstName} {user?.lastName}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user?.role}</div>
                            </div>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={logout} title="Logout"><LogOut size={18} /></button>
                    </div>
                </header>

                <main className="page-content">
                    <Outlet />
                </main>
            </div>
            <CommandPalette />
        </div>
    );
}
