import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// === API Helper ===
const API = '/api';
async function api(path, options = {}) {
    const token = localStorage.getItem('erp_token');
    const config = {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
        ...options,
    };
    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }
    const res = await fetch(`${API}${path}`, config);
    if (res.status === 401) {
        localStorage.removeItem('erp_token');
        localStorage.removeItem('erp_user');
        window.location.href = '/login';
        throw new Error('Session expired');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// === Auth Context ===
const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('erp_user')); } catch { return null; }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('erp_token');
        if (token) {
            api('/auth/me').then(u => { setUser(u); localStorage.setItem('erp_user', JSON.stringify(u)); })
                .catch(() => { localStorage.removeItem('erp_token'); localStorage.removeItem('erp_user'); setUser(null); })
                .finally(() => setLoading(false));
        } else { setLoading(false); }
    }, []);

    const login = async (email, password) => {
        const data = await api('/auth/login', { method: 'POST', body: { email, password } });
        localStorage.setItem('erp_token', data.token);
        localStorage.setItem('erp_user', JSON.stringify(data.user));
        setUser(data.user);
        return data;
    };

    const logout = async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch { }
        localStorage.removeItem('erp_token');
        localStorage.removeItem('erp_user');
        setUser(null);
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><span>Loading Rapidflo...</span></div>;
    return <AuthContext.Provider value={{ user, login, logout, isAuth: !!user }}>{children}</AuthContext.Provider>;
}

// === Toast Context ===
const ToastContext = createContext(null);
export function useToast() { return useContext(ToastContext); }

function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);
    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`}>
                        <span>{t.message}</span>
                        <button className="btn-ghost btn-sm" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>✕</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// === Protected Route ===
function ProtectedRoute({ children }) {
    const { isAuth } = useAuth();
    return isAuth ? children : <Navigate to="/login" replace />;
}

// === Lazy-loaded Pages ===
import LoginPage from './pages/Login';
import Layout from './components/Layout';
import DashboardPage from './pages/Dashboard';
import CRMPage from './pages/CRM';
import SalesPage from './pages/Sales';
import FinancePage from './pages/Finance';
import InventoryPage from './pages/Inventory';
import ProcurementPage from './pages/Procurement';
import HRMSPage from './pages/HRMS';
import ProjectsPage from './pages/Projects';
import SupportPage from './pages/Support';
import ReportsPage from './pages/Reports';
import AdminPage from './pages/Admin';
import WorkflowsPage from './pages/Workflows';
import ScannerPage from './pages/Scanner';
import ProfilePage from './pages/Profile';

// === App Component ===
function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                            <Route index element={<DashboardPage />} />
                            <Route path="crm/*" element={<CRMPage />} />
                            <Route path="sales/*" element={<SalesPage />} />
                            <Route path="finance/*" element={<FinancePage />} />
                            <Route path="inventory/*" element={<InventoryPage />} />
                            <Route path="procurement/*" element={<ProcurementPage />} />
                            <Route path="hrms/*" element={<HRMSPage />} />
                            <Route path="projects/*" element={<ProjectsPage />} />
                            <Route path="support/*" element={<SupportPage />} />
                            <Route path="reports/*" element={<ReportsPage />} />
                            <Route path="admin/*" element={<AdminPage />} />
                            <Route path="workflows/*" element={<WorkflowsPage />} />
                            <Route path="scanner/*" element={<ScannerPage />} />
                            <Route path="profile" element={<ProfilePage />} />
                        </Route>
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    );
}

export { api };
export default App;
