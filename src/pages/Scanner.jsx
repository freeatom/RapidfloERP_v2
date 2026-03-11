import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, useToast } from '../App';
import {
    Camera, CameraOff, Package, UserCheck, FileText, ShoppingCart,
    Search, CheckCircle, XCircle, AlertTriangle, ArrowRight, RotateCcw,
    Scan, History, Zap, Box, Clock, Hash
} from 'lucide-react';

const SCAN_MODES = [
    { id: 'inventory_in', label: 'Inventory In', icon: Package, color: '#10b981', desc: 'Receive stock into warehouse' },
    { id: 'inventory_out', label: 'Inventory Out', icon: Box, color: '#ef4444', desc: 'Ship or consume stock' },
    { id: 'attendance', label: 'Attendance', icon: UserCheck, color: '#6366f1', desc: 'Clock in/out employees' },
    { id: 'invoice_lookup', label: 'Invoice Lookup', icon: FileText, color: '#f59e0b', desc: 'Find and manage invoices' },
    { id: 'order_lookup', label: 'Order Lookup', icon: ShoppingCart, color: '#06b6d4', desc: 'Track sales orders' },
    { id: 'product_lookup', label: 'Product Lookup', icon: Search, color: '#8b5cf6', desc: 'View product details & stock' },
];

export default function ScannerPage() {
    const [mode, setMode] = useState('inventory_in');
    const [scanning, setScanning] = useState(false);
    const [manualCode, setManualCode] = useState('');
    const [result, setResult] = useState(null);
    const [scanHistory, setScanHistory] = useState([]);
    const [quantity, setQuantity] = useState(1);
    const [processing, setProcessing] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [batchMode, setBatchMode] = useState(false);
    const [batchItems, setBatchItems] = useState([]);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const toast = useToast();

    // Start camera
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                setScanning(true);
            }
        } catch (err) {
            toast('Camera access denied. Use manual entry below.', 'error');
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setScanning(false);
    };

    useEffect(() => { return () => stopCamera(); }, []);

    // Manual code lookup
    const handleManualLookup = async () => {
        if (!manualCode.trim()) { toast('Enter a barcode or code', 'error'); return; }
        await performLookup(manualCode.trim());
    };

    // Perform barcode lookup based on mode
    const performLookup = async (code) => {
        setProcessing(true);
        try {
            let data;
            switch (mode) {
                case 'inventory_in':
                case 'inventory_out':
                case 'product_lookup':
                    // Search stock levels for product matching code/SKU
                    data = await api(`/inventory/stock?search=${encodeURIComponent(code)}`);
                    const stockItems = data.stock_levels || [];
                    if (stockItems.length > 0) {
                        setResult({ type: 'product', data: stockItems[0], allStock: stockItems });
                    } else {
                        setResult({ type: 'not_found', query: code });
                        toast('Product not found. Try another code.', 'error');
                    }
                    break;
                case 'attendance':
                    data = await api(`/hrms/employees?search=${encodeURIComponent(code)}`);
                    const employees = data.employees || [];
                    if (employees.length > 0) {
                        setResult({ type: 'employee', data: employees[0] });
                    } else {
                        setResult({ type: 'not_found', query: code });
                        toast('Employee not found', 'error');
                    }
                    break;
                case 'invoice_lookup':
                    data = await api(`/finance/invoices?search=${encodeURIComponent(code)}`);
                    const invoices = data.invoices || [];
                    if (invoices.length > 0) {
                        setResult({ type: 'invoice', data: invoices[0] });
                    } else {
                        setResult({ type: 'not_found', query: code });
                        toast('Invoice not found', 'error');
                    }
                    break;
                case 'order_lookup':
                    data = await api(`/sales/orders?search=${encodeURIComponent(code)}`);
                    const orders = data.orders || [];
                    if (orders.length > 0) {
                        setResult({ type: 'order', data: orders[0] });
                    } else {
                        setResult({ type: 'not_found', query: code });
                        toast('Order not found', 'error');
                    }
                    break;
            }
            addToHistory(code, mode, result?.type !== 'not_found');
        } catch (err) {
            toast(err.message, 'error');
            setResult({ type: 'error', message: err.message });
        }
        setProcessing(false);
    };

    const addToHistory = (code, scanMode, success) => {
        setScanHistory(h => [
            { code, mode: scanMode, time: new Date().toISOString(), success },
            ...h.slice(0, 49)
        ]);
    };

    // Actions
    const recordMovement = async (type) => {
        if (!result?.data) return;
        setProcessing(true);
        try {
            await api('/inventory/movements', {
                method: 'POST',
                body: {
                    product_id: result.data.product_id || result.data.id,
                    warehouse_id: result.data.warehouse_id,
                    type: type,
                    quantity: quantity,
                    reason: `Scanned ${type} - ${new Date().toLocaleString('en-IN')}`
                }
            });
            toast(`${type === 'inbound' ? 'Received' : 'Shipped'} ${quantity} units`, 'success');
            if (batchMode) {
                setBatchItems(b => [...b, { product: result.data.product_name, qty: quantity, type }]);
                setResult(null);
                setManualCode('');
                setQuantity(1);
            } else {
                setResult(null);
            }
        } catch (err) { toast(err.message, 'error'); }
        setProcessing(false);
    };

    const clockInOut = async (action) => {
        if (!result?.data) return;
        setProcessing(true);
        try {
            const now = new Date();
            await api('/hrms/attendance', {
                method: 'POST',
                body: {
                    employee_id: result.data.id,
                    date: now.toISOString().split('T')[0],
                    [action === 'in' ? 'clock_in' : 'clock_out']: now.toTimeString().slice(0, 5),
                    status: 'present'
                }
            });
            toast(`${result.data.first_name} clocked ${action}`, 'success');
            setResult(null);
        } catch (err) { toast(err.message, 'error'); }
        setProcessing(false);
    };

    const modeConfig = SCAN_MODES.find(m => m.id === mode);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h2 style={{ margin: 0 }}>Barcode Scanner</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Scan barcodes or QR codes to perform operations
                    </p>
                </div>
                <div className="page-actions" style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button className={`btn btn-sm ${batchMode ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => { setBatchMode(!batchMode); setBatchItems([]); }}>
                        <Zap size={14} /> {batchMode ? 'Batch ON' : 'Batch Mode'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(!showHistory)}>
                        <History size={14} /> History ({scanHistory.length})
                    </button>
                </div>
            </div>

            {/* Mode Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                {SCAN_MODES.map(m => (
                    <button key={m.id} onClick={() => { setMode(m.id); setResult(null); }}
                        className="card" style={{
                            padding: 'var(--space-md)', cursor: 'pointer', textAlign: 'center',
                            border: mode === m.id ? `2px solid ${m.color}` : '2px solid transparent',
                            background: mode === m.id ? m.color + '0d' : 'var(--bg-card)',
                            transition: 'all 0.2s'
                        }}>
                        <m.icon size={24} style={{ color: m.color, marginBottom: 6 }} />
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{m.label}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.desc}</div>
                    </button>
                ))}
            </div>

            <div className="grid-2">
                {/* Scanner / Input Area */}
                <div>
                    {/* Camera view */}
                    <div className="card" style={{ marginBottom: 'var(--space-md)', overflow: 'hidden' }}>
                        <div style={{
                            position: 'relative', background: '#000', borderRadius: 'var(--border-radius)',
                            minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {scanning ? (
                                <>
                                    <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 'var(--border-radius)' }} />
                                    {/* Scan overlay */}
                                    <div style={{
                                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        pointerEvents: 'none'
                                    }}>
                                        <div style={{
                                            width: 200, height: 200, border: '2px solid rgba(99,102,241,0.7)',
                                            borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
                                            animation: 'pulse-border 2s infinite'
                                        }} />
                                    </div>
                                    <button className="btn btn-sm" onClick={stopCamera}
                                        style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none' }}>
                                        <CameraOff size={14} /> Stop
                                    </button>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: '#94a3b8' }}>
                                    <Scan size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                                    <div style={{ marginBottom: 'var(--space-md)' }}>Camera not active</div>
                                    <button className="btn btn-primary" onClick={startCamera}>
                                        <Camera size={16} /> Start Camera
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Manual entry */}
                    <div className="card" style={{ padding: 'var(--space-lg)' }}>
                        <div style={{ fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Hash size={16} /> Manual Entry
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                            <input className="form-input" placeholder="Enter barcode, SKU, employee code, or invoice number..."
                                value={manualCode} onChange={e => setManualCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
                                style={{ flex: 1 }} />
                            <button className="btn btn-primary" onClick={handleManualLookup} disabled={processing}>
                                {processing ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Search size={16} />}
                                Lookup
                            </button>
                        </div>
                    </div>

                    {/* Batch items */}
                    {batchMode && batchItems.length > 0 && (
                        <div className="card" style={{ marginTop: 'var(--space-md)' }}>
                            <div style={{ fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Batch Items ({batchItems.length})</span>
                                <button className="btn btn-ghost btn-sm" onClick={() => setBatchItems([])}>Clear</button>
                            </div>
                            {batchItems.map((b, i) => (
                                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                    <span>{b.product}</span>
                                    <span>
                                        <span className={`badge ${b.type === 'inbound' ? 'badge-success' : 'badge-danger'}`}>{b.type}</span>
                                        {' '} × {b.qty}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Result Panel */}
                <div>
                    {!result && !showHistory && (
                        <div className="card" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
                            <modeConfig.icon size={48} style={{ color: modeConfig.color, marginBottom: 'var(--space-md)', opacity: 0.4 }} />
                            <h3 style={{ marginBottom: 'var(--space-sm)' }}>Ready to Scan</h3>
                            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {modeConfig.desc}. Use camera or enter code manually.
                            </p>
                        </div>
                    )}

                    {/* Product Result */}
                    {result?.type === 'product' && (
                        <div className="card">
                            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-start' }}>
                                    <div style={{ width: 48, height: 48, borderRadius: 12, background: modeConfig.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Package size={24} style={{ color: modeConfig.color }} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{result.data.product_name}</div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            SKU: {result.data.sku || result.data.product_id?.slice(0, 8)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Stock Info */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6366f1' }}>{result.data.quantity || 0}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Qty</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{result.data.available_quantity || 0}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Available</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>₹{(result.data.total_value || 0).toLocaleString('en-IN')}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Value</div>
                                </div>
                            </div>
                            {/* Warehouse */}
                            <div style={{ padding: '0 var(--space-lg) var(--space-md)', fontSize: '0.85rem' }}>
                                <span className="text-muted">Warehouse:</span> <strong>{result.data.warehouse_name || 'N/A'}</strong>
                            </div>
                            {/* Actions */}
                            {(mode === 'inventory_in' || mode === 'inventory_out') && (
                                <div style={{ padding: 'var(--space-lg)', borderTop: '1px solid var(--border-color)' }}>
                                    <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                                        <label className="form-label">Quantity</label>
                                        <input type="number" className="form-input" value={quantity} min={1}
                                            onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} />
                                    </div>
                                    <button className="btn btn-primary" style={{ width: '100%' }} disabled={processing}
                                        onClick={() => recordMovement(mode === 'inventory_in' ? 'inbound' : 'outbound')}>
                                        {processing ? <div className="spinner" style={{ width: 14, height: 14 }} /> :
                                            mode === 'inventory_in' ? <><Package size={16} /> Receive {quantity} Units</> :
                                                <><Box size={16} /> Ship {quantity} Units</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Employee Result */}
                    {result?.type === 'employee' && (
                        <div className="card">
                            <div style={{ padding: 'var(--space-lg)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#6366f11a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <UserCheck size={28} style={{ color: '#6366f1' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{result.data.first_name} {result.data.last_name}</div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{result.data.designation || result.data.position}</div>
                                        <span className={`badge ${result.data.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{result.data.status}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                                    <button className="btn btn-primary" onClick={() => clockInOut('in')} disabled={processing}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--space-md)' }}>
                                        <CheckCircle size={18} /> Clock In
                                    </button>
                                    <button className="btn btn-secondary" onClick={() => clockInOut('out')} disabled={processing}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--space-md)' }}>
                                        <XCircle size={18} /> Clock Out
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Invoice Result */}
                    {result?.type === 'invoice' && (
                        <div className="card" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f59e0b1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FileText size={24} style={{ color: '#f59e0b' }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{result.data.invoice_number}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{result.data.account_name}</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#6366f1' }}>₹{(result.data.total_amount || 0).toLocaleString('en-IN')}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#10b981' }}>₹{(result.data.paid_amount || 0).toLocaleString('en-IN')}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Paid</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ef4444' }}>₹{(result.data.balance_due || 0).toLocaleString('en-IN')}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Balance</div>
                                </div>
                            </div>
                            <div><span className={`badge ${result.data.status === 'paid' ? 'badge-success' : result.data.status === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>{result.data.status}</span></div>
                        </div>
                    )}

                    {/* Order Result */}
                    {result?.type === 'order' && (
                        <div className="card" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#06b6d41a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShoppingCart size={24} style={{ color: '#06b6d4' }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{result.data.order_number}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{result.data.account_name || result.data.customer_name}</div>
                                    <span className={`badge ${result.data.status === 'delivered' ? 'badge-success' : result.data.status === 'shipped' ? 'badge-info' : 'badge-warning'}`}>{result.data.status}</span>
                                </div>
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#06b6d4' }}>₹{(result.data.total_amount || 0).toLocaleString('en-IN')}</div>
                        </div>
                    )}

                    {/* Not found */}
                    {result?.type === 'not_found' && (
                        <div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                            <XCircle size={48} style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-md)' }} />
                            <h3>Not Found</h3>
                            <p className="text-muted">No match for "{result.query}"</p>
                            <button className="btn btn-secondary" onClick={() => { setResult(null); setManualCode(''); }}>
                                <RotateCcw size={14} /> Try Again
                            </button>
                        </div>
                    )}

                    {/* Scan History */}
                    {showHistory && (
                        <div className="card" style={{ marginTop: result ? 'var(--space-md)' : 0 }}>
                            <div style={{ fontWeight: 600, padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                                <span><History size={16} /> Scan History</span>
                                <button className="btn btn-ghost btn-sm" onClick={() => setScanHistory([])}>Clear All</button>
                            </div>
                            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                {scanHistory.length === 0 ? (
                                    <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>No scans yet</div>
                                ) : scanHistory.map((h, i) => (
                                    <div key={i} style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                        {h.success ? <CheckCircle size={14} style={{ color: 'var(--color-success)' }} /> : <XCircle size={14} style={{ color: 'var(--color-danger)' }} />}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{h.code}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {SCAN_MODES.find(m => m.id === h.mode)?.label} · {new Date(h.time).toLocaleTimeString('en-IN')}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes pulse-border { 0%, 100% { border-color: rgba(99,102,241,0.7); } 50% { border-color: rgba(99,102,241,0.2); } }
            `}</style>
        </div>
    );
}
