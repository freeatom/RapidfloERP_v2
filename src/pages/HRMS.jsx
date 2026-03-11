import React, { useState, useEffect, useCallback } from 'react';
import { api, useToast } from '../App';
import { Plus, Search, Edit2, Trash2, Users, Clock, Calendar, Wallet, Play, CheckCircle, XCircle, Download } from 'lucide-react';

function fmtCur(v) { return `₹${(v || 0).toLocaleString('en-IN')}`; }

export default function HRMSPage() {
    const [tab, setTab] = useState('employees');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({});
    const [editItem, setEditItem] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [payrollSummary, setPayrollSummary] = useState(null);
    const [payrollMonth, setPayrollMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [payrollYear, setPayrollYear] = useState(new Date().getFullYear());
    const toast = useToast();

    const tabs = [
        { id: 'employees', label: 'Employees', icon: Users },
        { id: 'departments', label: 'Departments' },
        { id: 'attendance', label: 'Attendance', icon: Clock },
        { id: 'leaves', label: 'Leaves', icon: Calendar },
        { id: 'payroll', label: 'Payroll', icon: Wallet },
    ];

    // Load employees & departments for dropdowns
    useEffect(() => {
        api('/hrms/employees?limit=200').then(d => setEmployees(d.employees || [])).catch(() => { });
        api('/hrms/departments').then(d => setDepartments(d.departments || [])).catch(() => { });
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (tab === 'payroll') {
                const data = await api(`/hrms/payroll?month=${payrollMonth}&year=${payrollYear}`);
                setItems(data.payroll || []);
                setPayrollSummary(data.summary || null);
                setTotal(data.payroll?.length || 0);
            } else if (tab === 'attendance') {
                const data = await api(`/hrms/attendance`);
                setItems(data.attendance || []);
                setTotal(data.attendance?.length || 0);
            } else if (tab === 'leaves') {
                const data = await api(`/hrms/leaves`);
                setItems(data.leaves || []);
                setTotal(data.leaves?.length || 0);
            } else if (tab === 'departments') {
                const data = await api(`/hrms/departments`);
                setItems(data.departments || []);
                setTotal(data.departments?.length || 0);
            } else {
                const data = await api(`/hrms/employees?page=${page}&search=${search}`);
                setItems(data.employees || []);
                setTotal(data.total || 0);
            }
        } catch (err) { toast(err.message, 'error'); }
        setLoading(false);
    }, [tab, page, search, payrollMonth, payrollYear]);
    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        try {
            if (tab === 'payroll') {
                // For payroll, saving updates status
                if (editItem) {
                    await api(`/hrms/payroll/${editItem.id}`, { method: 'PUT', body: form });
                    toast('Payroll updated', 'success');
                }
            } else if (tab === 'attendance') {
                if (!form.employee_id) { toast('Select an employee', 'error'); return; }
                await api(`/hrms/attendance`, { method: 'POST', body: form });
                toast('Attendance recorded', 'success');
            } else if (tab === 'leaves') {
                if (editItem) {
                    await api(`/hrms/leaves/${editItem.id}`, { method: 'PUT', body: { status: form.status, rejection_reason: form.rejection_reason } });
                    toast('Leave updated', 'success');
                } else {
                    if (!form.employee_id || !form.start_date || !form.end_date) { toast('Fill required fields', 'error'); return; }
                    await api(`/hrms/leaves`, { method: 'POST', body: form });
                    toast('Leave created', 'success');
                }
            } else if (tab === 'departments') {
                if (editItem) { await api(`/hrms/departments/${editItem.id}`, { method: 'PUT', body: form }); }
                else { if (!form.name) { toast('Name required', 'error'); return; } await api(`/hrms/departments`, { method: 'POST', body: form }); }
                toast(editItem ? 'Updated' : 'Created', 'success');
            } else {
                if (editItem) { await api(`/hrms/employees/${editItem.id}`, { method: 'PUT', body: form }); }
                else {
                    if (!form.first_name || !form.last_name || !form.email) { toast('Name and email required', 'error'); return; }
                    await api(`/hrms/employees`, { method: 'POST', body: form });
                }
                toast(editItem ? 'Updated' : 'Created', 'success');
            }
            setShowModal(false); setEditItem(null); setForm({}); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure?')) return;
        try {
            await api(`/hrms/${tab === 'employees' ? 'employees' : 'departments'}/${id}`, { method: 'DELETE' });
            toast('Deleted', 'success'); fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const generatePayroll = async () => {
        if (!confirm(`Generate payroll for ${payrollMonth}/${payrollYear} for all active employees?`)) return;
        try {
            const data = await api('/hrms/payroll/generate', { method: 'POST', body: { month: payrollMonth, year: payrollYear } });
            toast(`Payroll generated for ${data.generated} employees`, 'success');
            fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const updatePayrollStatus = async (id, status) => {
        try {
            await api(`/hrms/payroll/${id}`, { method: 'PUT', body: { status } });
            toast(`Payroll ${status}`, 'success');
            fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const updateLeaveStatus = async (id, status) => {
        try {
            await api(`/hrms/leaves/${id}`, { method: 'PUT', body: { status } });
            toast(`Leave ${status}`, 'success');
            fetchData();
        } catch (err) { toast(err.message, 'error'); }
    };

    const openNew = () => {
        setEditItem(null);
        if (tab === 'attendance') setForm({ date: new Date().toISOString().split('T')[0], status: 'present' });
        else if (tab === 'leaves') setForm({ leave_type: 'casual', status: 'pending' });
        else if (tab === 'employees') setForm({ employment_type: 'full-time', status: 'active' });
        else setForm({});
        setShowModal(true);
    };

    return (
        <div>
            <div className="page-header"><h2>Human Resource Management</h2>
                <div className="page-actions">
                    {tab === 'payroll' && <>
                        <select className="form-select" style={{ width: 90 }} value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)}>
                            {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => <option key={m} value={m}>{new Date(2000, +m - 1).toLocaleString('en', { month: 'short' })}</option>)}
                        </select>
                        <input type="number" className="form-input" style={{ width: 80 }} value={payrollYear} onChange={e => setPayrollYear(+e.target.value)} />
                        <button className="btn btn-primary" onClick={generatePayroll}><Play size={16} /> Generate Payroll</button>
                    </>}
                    {tab !== 'payroll' && <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> New {tab === 'employees' ? 'Employee' : tab === 'departments' ? 'Department' : tab === 'attendance' ? 'Record' : 'Leave'}</button>}
                </div>
            </div>

            <div className="tabs">{tabs.map(t => <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setPage(1); }}>{t.label}</button>)}</div>

            {/* Payroll Summary KPIs */}
            {tab === 'payroll' && payrollSummary && (
                <div className="kpi-grid" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="kpi-card" style={{ '--kpi-color': '#6366f1', '--kpi-color-bg': '#6366f11f' }}><div className="kpi-value">{fmtCur(payrollSummary.totalGross)}</div><div className="kpi-label">Total Gross</div></div>
                    <div className="kpi-card" style={{ '--kpi-color': '#ef4444', '--kpi-color-bg': '#ef44441f' }}><div className="kpi-value">{fmtCur(payrollSummary.totalDeductions)}</div><div className="kpi-label">Total Deductions</div></div>
                    <div className="kpi-card" style={{ '--kpi-color': '#10b981', '--kpi-color-bg': '#10b9811f' }}><div className="kpi-value">{fmtCur(payrollSummary.totalNet)}</div><div className="kpi-label">Total Net Pay</div></div>
                    <div className="kpi-card" style={{ '--kpi-color': '#06b6d4', '--kpi-color-bg': '#06b6d41f' }}><div className="kpi-value">{payrollSummary.count}</div><div className="kpi-label">Employees</div></div>
                </div>
            )}

            {/* Search (employees only) */}
            {tab === 'employees' && (
                <div className="toolbar">
                    <div className="search-box"><Search className="search-icon" size={16} /><input type="text" className="form-input" placeholder="Search employees..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
                    <span className="text-muted" style={{ fontSize: '0.85rem' }}>{total} records</span>
                </div>
            )}

            {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead><tr>
                                {tab === 'employees' && <><th>Employee</th><th>ID</th><th>Department</th><th>Designation</th><th>Type</th><th>Salary</th><th>Status</th><th>Actions</th></>}
                                {tab === 'departments' && <><th>Name</th><th>Code</th><th>Head</th><th>Budget</th><th>Headcount</th><th>Actions</th></>}
                                {tab === 'attendance' && <><th>Employee</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Overtime</th><th>Status</th></>}
                                {tab === 'leaves' && <><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></>}
                                {tab === 'payroll' && <><th>Employee</th><th>Emp Code</th><th>Department</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th>Actions</th></>}
                            </tr></thead>
                            <tbody>
                                {items.length === 0 ? <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>{tab === 'payroll' ? 'No payroll records. Click "Generate Payroll" to create.' : `No ${tab} found`}</td></tr> : items.map(item => (
                                    <tr key={item.id}>
                                        {tab === 'employees' && <>
                                            <td><div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                                <div className="avatar avatar-sm">{item.first_name?.[0]}{item.last_name?.[0]}</div>
                                                <div><span style={{ fontWeight: 500 }}>{item.first_name} {item.last_name}</span><div className="text-muted" style={{ fontSize: '0.75rem' }}>{item.email}</div></div>
                                            </div></td>
                                            <td className="font-mono">{item.employee_id}</td>
                                            <td>{item.department_name || '-'}</td>
                                            <td>{item.designation || '-'}</td>
                                            <td><span className="badge badge-neutral">{(item.employment_type || '').replace('-', ' ')}</span></td>
                                            <td>{fmtCur(item.base_salary)}</td>
                                            <td><span className={`badge ${item.status === 'active' ? 'badge-success' : item.status === 'on_leave' ? 'badge-warning' : 'badge-danger'}`}><span className="badge-dot"></span>{item.status}</span></td>
                                            <td><div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button>
                                                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button>
                                            </div></td>
                                        </>}
                                        {tab === 'departments' && <>
                                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                                            <td className="font-mono">{item.code}</td>
                                            <td>{item.head_name || '-'}</td>
                                            <td>{fmtCur(item.budget)}</td>
                                            <td><span className="badge badge-info">{item.headcount || 0}</span></td>
                                            <td><div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditItem(item); setForm({ ...item }); setShowModal(true); }}><Edit2 size={14} /></button>
                                            </div></td>
                                        </>}
                                        {tab === 'attendance' && <>
                                            <td style={{ fontWeight: 500 }}>{item.employee_name || '-'}</td>
                                            <td>{item.date}</td>
                                            <td>{item.clock_in || '-'}</td>
                                            <td>{item.clock_out || '-'}</td>
                                            <td>{item.work_hours ? `${parseFloat(item.work_hours).toFixed(1)}h` : '-'}</td>
                                            <td>{item.overtime_hours ? `${parseFloat(item.overtime_hours).toFixed(1)}h` : '-'}</td>
                                            <td><span className={`badge ${item.status === 'present' ? 'badge-success' : item.status === 'half_day' ? 'badge-warning' : item.status === 'late' ? 'badge-warning' : 'badge-danger'}`}>{item.status}</span></td>
                                        </>}
                                        {tab === 'leaves' && <>
                                            <td style={{ fontWeight: 500 }}>{item.employee_name || '-'}</td>
                                            <td><span className="badge badge-neutral">{item.leave_type}</span></td>
                                            <td>{item.start_date}</td>
                                            <td>{item.end_date}</td>
                                            <td>{item.days}</td>
                                            <td className="text-muted" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.reason || '-'}</td>
                                            <td><span className={`badge ${item.status === 'approved' ? 'badge-success' : item.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{item.status}</span></td>
                                            <td><div style={{ display: 'flex', gap: 4 }}>
                                                {item.status === 'pending' && <>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => updateLeaveStatus(item.id, 'approved')} title="Approve"><CheckCircle size={14} style={{ color: '#10b981' }} /></button>
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => updateLeaveStatus(item.id, 'rejected')} title="Reject"><XCircle size={14} style={{ color: '#ef4444' }} /></button>
                                                </>}
                                            </div></td>
                                        </>}
                                        {tab === 'payroll' && <>
                                            <td style={{ fontWeight: 500 }}>{item.employee_name || '-'}</td>
                                            <td className="font-mono">{item.emp_code || '-'}</td>
                                            <td>{item.department_name || '-'}</td>
                                            <td>{fmtCur(item.gross_salary)}</td>
                                            <td style={{ color: '#ef4444' }}>-{fmtCur(item.total_deductions)}</td>
                                            <td style={{ fontWeight: 600 }}>{fmtCur(item.net_salary)}</td>
                                            <td><span className={`badge ${item.status === 'paid' ? 'badge-success' : item.status === 'approved' ? 'badge-info' : 'badge-warning'}`}>{item.status}</span></td>
                                            <td><div style={{ display: 'flex', gap: 4 }}>
                                                {item.status === 'draft' && <button className="btn btn-ghost btn-sm" onClick={() => updatePayrollStatus(item.id, 'approved')} style={{ fontSize: '0.75rem' }}>Approve</button>}
                                                {item.status === 'approved' && <button className="btn btn-ghost btn-sm" onClick={() => updatePayrollStatus(item.id, 'paid')} style={{ fontSize: '0.75rem', color: '#10b981' }}>Mark Paid</button>}
                                            </div></td>
                                        </>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {tab === 'employees' && total > 25 && (
                        <div className="pagination" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
                            <span>Page {page}</span>
                            <div className="pagination-btns">
                                <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                                <button className="pagination-btn" disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}>Next</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ======= MODAL ======= */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>{editItem ? 'Edit' : 'New'} {tab === 'employees' ? 'Employee' : tab === 'departments' ? 'Department' : tab === 'attendance' ? 'Attendance Record' : tab === 'leaves' ? 'Leave Application' : 'Payroll'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button></div>
                        <div className="modal-body">
                            {/* EMPLOYEE FORM */}
                            {tab === 'employees' && <>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">First Name <span className="required">*</span></label><input className="form-input" value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Last Name <span className="required">*</span></label><input className="form-input" value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Email <span className="required">*</span></label><input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Designation</label><input className="form-input" value={form.designation || ''} onChange={e => setForm({ ...form, designation: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Department</label>
                                        <select className="form-select" value={form.department_id || ''} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                                            <option value="">Select Department</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Employment Type</label>
                                        <select className="form-select" value={form.employment_type || 'full-time'} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
                                            <option value="full-time">Full Time</option><option value="part-time">Part Time</option><option value="contract">Contract</option><option value="intern">Intern</option>
                                        </select>
                                    </div>
                                    <div className="form-group"><label className="form-label">Base Salary (₹)</label><input type="number" className="form-input" value={form.base_salary || ''} onChange={e => setForm({ ...form, base_salary: +e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Joining Date</label><input type="date" className="form-input" value={form.date_of_joining || ''} onChange={e => setForm({ ...form, date_of_joining: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Gender</label>
                                        <select className="form-select" value={form.gender || ''} onChange={e => setForm({ ...form, gender: e.target.value })}>
                                            <option value="">Select</option><option>male</option><option>female</option><option>other</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Shift</label>
                                        <select className="form-select" value={form.shift || 'general'} onChange={e => setForm({ ...form, shift: e.target.value })}>
                                            <option>general</option><option>morning</option><option>evening</option><option>night</option>
                                        </select>
                                    </div>
                                    <div className="form-group"><label className="form-label">Work Location</label>
                                        <select className="form-select" value={form.work_location || 'office'} onChange={e => setForm({ ...form, work_location: e.target.value })}>
                                            <option>office</option><option>remote</option><option>hybrid</option>
                                        </select>
                                    </div>
                                </div>
                            </>}

                            {/* DEPARTMENT FORM */}
                            {tab === 'departments' && <>
                                <div className="form-group"><label className="form-label">Name <span className="required">*</span></label><input className="form-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Code</label><input className="form-input" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. ENG" /></div>
                                    <div className="form-group"><label className="form-label">Budget (₹)</label><input type="number" className="form-input" value={form.budget || ''} onChange={e => setForm({ ...form, budget: +e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}></textarea></div>
                            </>}

                            {/* ATTENDANCE FORM */}
                            {tab === 'attendance' && <>
                                <div className="form-group"><label className="form-label">Employee <span className="required">*</span></label>
                                    <select className="form-select" value={form.employee_id || ''} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                                        <option value="">Select Employee</option>
                                        {employees.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_id})</option>)}
                                    </select>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Status</label>
                                        <select className="form-select" value={form.status || 'present'} onChange={e => setForm({ ...form, status: e.target.value })}>
                                            <option>present</option><option>absent</option><option>half_day</option><option>late</option><option>on_leave</option><option>work_from_home</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Clock In</label><input type="time" className="form-input" value={form.clock_in || ''} onChange={e => setForm({ ...form, clock_in: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">Clock Out</label><input type="time" className="form-input" value={form.clock_out || ''} onChange={e => setForm({ ...form, clock_out: e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this attendance record"></textarea></div>
                            </>}

                            {/* LEAVE FORM */}
                            {tab === 'leaves' && <>
                                {!editItem && <div className="form-group"><label className="form-label">Employee <span className="required">*</span></label>
                                    <select className="form-select" value={form.employee_id || ''} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                                        <option value="">Select Employee</option>
                                        {employees.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                                    </select>
                                </div>}
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">Leave Type</label>
                                        <select className="form-select" value={form.leave_type || 'casual'} onChange={e => setForm({ ...form, leave_type: e.target.value })}><option>casual</option><option>sick</option><option>earned</option><option>maternity</option><option>paternity</option><option>unpaid</option></select>
                                    </div>
                                    {editItem && <div className="form-group"><label className="form-label">Status</label>
                                        <select className="form-select" value={form.status || 'pending'} onChange={e => setForm({ ...form, status: e.target.value })}><option>pending</option><option>approved</option><option>rejected</option></select>
                                    </div>}
                                </div>
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label">From <span className="required">*</span></label><input type="date" className="form-input" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                                    <div className="form-group"><label className="form-label">To <span className="required">*</span></label><input type="date" className="form-input" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Reason</label><textarea className="form-textarea" value={form.reason || ''} onChange={e => setForm({ ...form, reason: e.target.value })}></textarea></div>
                            </>}
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Update' : tab === 'attendance' ? 'Record' : 'Create'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
