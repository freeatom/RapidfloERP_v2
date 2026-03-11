import React, { useRef, useState } from 'react';
import { Printer, Download, X, Building2, Phone, Mail, Globe, FileText } from 'lucide-react';

const COMPANY = {
    name: 'Rapidflo Technologies Pvt. Ltd.',
    address: '4th Floor, Tech Park, HITEC City, Hyderabad — 500081',
    phone: '+91 40 6666 7777',
    email: 'billing@rapidflo.com',
    gstin: '36AAACR1234F1ZE',
    website: 'www.rapidflo.com',
};

function formatCurrency(v) { return `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

export function InvoiceTemplate({ invoice, items = [], onClose }) {
    const ref = useRef();
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    const handlePrint = () => {
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Invoice ${invoice?.invoice_number || ''}</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', sans-serif; color: #1a1a2e; padding: 40px; font-size: 13px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #6366f1; }
            .company-name { font-size: 22px; font-weight: 700; color: #6366f1; }
            .company-detail { font-size: 11px; color: #64748b; margin-top: 4px; }
            .invoice-title { font-size: 28px; font-weight: 800; color: #6366f1; text-align: right; }
            .invoice-meta { text-align: right; font-size: 12px; color: #475569; margin-top: 8px; }
            .invoice-meta strong { color: #1a1a2e; }
            .parties { display: flex; justify-content: space-between; margin: 24px 0; }
            .party { width: 48%; }
            .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
            .party-name { font-weight: 600; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f1f5f9; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #e2e8f0; }
            td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
            .text-right { text-align: right; }
            .totals { display: flex; justify-content: flex-end; }
            .totals-table { width: 280px; }
            .totals-table td { padding: 6px 14px; font-size: 13px; }
            .totals-table .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #6366f1; color: #6366f1; }
            .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
            .terms { margin-top: 24px; font-size: 11px; color: #64748b; }
            .terms h4 { font-size: 11px; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
            @media print { body { padding: 20px; } }
        </style></head><body>${ref.current.innerHTML}
        <div class="footer">Thank you for your business! · ${COMPANY.name} · GSTIN: ${COMPANY.gstin}</div>
        </body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 800, width: '95%' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FileText size={18} style={{ marginRight: 8 }} />Invoice Preview</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handlePrint}><Printer size={14} /> Print / PDF</button>
                        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
                    </div>
                </div>
                <div className="modal-body" ref={ref} style={{ background: 'white', color: '#1a1a2e', padding: 32, borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottom: '3px solid #6366f1' }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>{COMPANY.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{COMPANY.address}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{COMPANY.phone} · {COMPANY.email}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>GSTIN: {COMPANY.gstin}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 26, fontWeight: 800, color: '#6366f1' }}>INVOICE</div>
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                                <strong>#{invoice?.invoice_number || 'INV-XXXX'}</strong><br />
                                Date: {formatDate(invoice?.invoice_date || new Date())}<br />
                                Due: {formatDate(invoice?.due_date)}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 0' }}>
                        <div style={{ width: '48%' }}>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>Bill To</div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{invoice?.account_name || invoice?.customer_name || 'Customer'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{invoice?.billing_address || ''}</div>
                        </div>
                        <div style={{ width: '48%' }}>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>Details</div>
                            <div style={{ fontSize: 12, color: '#475569' }}>
                                Status: <strong style={{ textTransform: 'capitalize' }}>{invoice?.status || 'draft'}</strong><br />
                                Type: <strong style={{ textTransform: 'capitalize' }}>{invoice?.type || 'sales'}</strong>
                            </div>
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>#</th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Description</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Qty</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Rate</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(items.length > 0 ? items : [{ description: 'Product/Service', quantity: 1, unit_price: invoice?.total_amount || 0 }]).map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>{idx + 1}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>{item.description || item.product_name || 'Item'}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{item.quantity}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(item.quantity * item.unit_price)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <table style={{ width: 260, borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr><td style={{ padding: '6px 14px', color: '#64748b' }}>Subtotal</td><td style={{ padding: '6px 14px', textAlign: 'right' }}>{formatCurrency(subtotal)}</td></tr>
                                <tr><td style={{ padding: '6px 14px', color: '#64748b' }}>GST (18%)</td><td style={{ padding: '6px 14px', textAlign: 'right' }}>{formatCurrency(tax)}</td></tr>
                                <tr><td style={{ padding: '8px 14px', fontWeight: 700, fontSize: 15, borderTop: '2px solid #6366f1', color: '#6366f1' }}>Total</td><td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, fontSize: 15, borderTop: '2px solid #6366f1', color: '#6366f1' }}>{formatCurrency(total)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div style={{ marginTop: 24, fontSize: 11, color: '#64748b' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>Terms & Conditions</div>
                        <p>1. Payment is due within 30 days of invoice date.</p>
                        <p>2. Late payments may incur an interest charge of 1.5% per month.</p>
                        {invoice?.notes && <p style={{ marginTop: 8 }}><strong>Note:</strong> {invoice.notes}</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function QuoteTemplate({ quote, items = [], onClose }) {
    const ref = useRef();
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    const handlePrint = () => {
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Quote ${quote?.quote_number || ''}</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', sans-serif; color: #1a1a2e; padding: 40px; font-size: 13px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #06b6d4; }
            .company-name { font-size: 22px; font-weight: 700; color: #06b6d4; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f0fdfa; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #0d9488; border-bottom: 2px solid #99f6e4; }
            td { padding: 10px 14px; border-bottom: 1px solid #f0fdfa; }
            .text-right { text-align: right; }
            .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #06b6d4; color: #06b6d4; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; }
            .validity { background: #f0fdfa; padding: 12px 16px; border-radius: 8px; margin-top: 20px; font-size: 12px; color: #0d9488; }
            @media print { body { padding: 20px; } }
        </style></head><body>${ref.current.innerHTML}
        <div class="footer">This is a quote, not a tax invoice. · ${COMPANY.name}</div>
        </body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 800, width: '95%' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FileText size={18} style={{ marginRight: 8 }} />Quotation Preview</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handlePrint}><Printer size={14} /> Print / PDF</button>
                        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
                    </div>
                </div>
                <div className="modal-body" ref={ref} style={{ background: 'white', color: '#1a1a2e', padding: 32, borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '3px solid #06b6d4' }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#06b6d4' }}>{COMPANY.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{COMPANY.address}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{COMPANY.phone} · {COMPANY.email}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 26, fontWeight: 800, color: '#06b6d4' }}>QUOTATION</div>
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                                <strong>#{quote?.quote_number || 'QT-XXXX'}</strong><br />
                                Date: {formatDate(quote?.quote_date || new Date())}<br />
                                Valid Until: {formatDate(quote?.valid_until)}
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>Prepared For</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{quote?.account_name || quote?.customer_name || 'Prospect'}</div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0' }}>
                        <thead>
                            <tr style={{ background: '#f0fdfa' }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#0d9488', borderBottom: '2px solid #99f6e4' }}>#</th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#0d9488', borderBottom: '2px solid #99f6e4' }}>Item</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#0d9488', borderBottom: '2px solid #99f6e4' }}>Qty</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#0d9488', borderBottom: '2px solid #99f6e4' }}>Unit Price</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#0d9488', borderBottom: '2px solid #99f6e4' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(items.length > 0 ? items : [{ description: 'Consulting Services', quantity: 1, unit_price: quote?.total_amount || 0 }]).map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0fdfa' }}>{idx + 1}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0fdfa' }}>{item.description || item.product_name || 'Item'}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0fdfa', textAlign: 'right' }}>{item.quantity}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0fdfa', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0fdfa', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(item.quantity * item.unit_price)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <table style={{ width: 260, borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr><td style={{ padding: '6px 14px', color: '#64748b' }}>Subtotal</td><td style={{ padding: '6px 14px', textAlign: 'right' }}>{formatCurrency(subtotal)}</td></tr>
                                <tr><td style={{ padding: '6px 14px', color: '#64748b' }}>GST (18%)</td><td style={{ padding: '6px 14px', textAlign: 'right' }}>{formatCurrency(tax)}</td></tr>
                                <tr><td style={{ padding: '8px 14px', fontWeight: 700, fontSize: 15, borderTop: '2px solid #06b6d4', color: '#06b6d4' }}>Total</td><td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, fontSize: 15, borderTop: '2px solid #06b6d4', color: '#06b6d4' }}>{formatCurrency(total)}</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <div style={{ background: '#f0fdfa', padding: '12px 16px', borderRadius: 8, marginTop: 20, fontSize: 12, color: '#0d9488' }}>
                        ⏰ This quotation is valid for 30 days from the date of issue.
                    </div>

                    {quote?.notes && <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}><strong>Notes:</strong> {quote.notes}</div>}
                </div>
            </div>
        </div>
    );
}

export function PurchaseOrderTemplate({ po, items = [], onClose }) {
    const ref = useRef();
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    const handlePrint = () => {
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>PO ${po?.po_number || ''}</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', sans-serif; color: #1a1a2e; padding: 40px; font-size: 13px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #f59e0b; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #fffbeb; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #92400e; border-bottom: 2px solid #fde68a; }
            td { padding: 10px 14px; border-bottom: 1px solid #fffbeb; }
            .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #f59e0b; color: #f59e0b; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; }
            @media print { body { padding: 20px; } }
        </style></head><body>${ref.current.innerHTML}
        <div class="footer">Purchase Order · ${COMPANY.name} · GSTIN: ${COMPANY.gstin}</div>
        </body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 800, width: '95%' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FileText size={18} style={{ marginRight: 8 }} />Purchase Order Preview</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handlePrint}><Printer size={14} /> Print / PDF</button>
                        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
                    </div>
                </div>
                <div className="modal-body" ref={ref} style={{ background: 'white', color: '#1a1a2e', padding: 32, borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '3px solid #f59e0b' }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{COMPANY.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{COMPANY.address}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>GSTIN: {COMPANY.gstin}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b' }}>PURCHASE ORDER</div>
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                                <strong>#{po?.po_number || 'PO-XXXX'}</strong><br />
                                Date: {formatDate(po?.order_date || new Date())}<br />
                                Expected: {formatDate(po?.expected_delivery)}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 0' }}>
                        <div style={{ width: '48%' }}>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>Vendor</div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{po?.vendor_name || 'Vendor'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{po?.vendor_address || ''}</div>
                        </div>
                        <div style={{ width: '48%' }}>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>Ship To</div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{COMPANY.name}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{COMPANY.address}</div>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0' }}>
                        <thead>
                            <tr style={{ background: '#fffbeb' }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#92400e', borderBottom: '2px solid #fde68a' }}>#</th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#92400e', borderBottom: '2px solid #fde68a' }}>Item</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#92400e', borderBottom: '2px solid #fde68a' }}>Qty</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#92400e', borderBottom: '2px solid #fde68a' }}>Rate</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', color: '#92400e', borderBottom: '2px solid #fde68a' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(items.length > 0 ? items : [{ description: 'Material/Service', quantity: 1, unit_price: po?.total_amount || 0 }]).map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #fffbeb' }}>{idx + 1}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #fffbeb' }}>{item.description || item.product_name || 'Item'}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #fffbeb', textAlign: 'right' }}>{item.quantity}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #fffbeb', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                                    <td style={{ padding: '10px 14px', borderBottom: '1px solid #fffbeb', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(item.quantity * item.unit_price)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <table style={{ width: 260, borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr><td style={{ padding: '6px 14px', color: '#64748b' }}>Subtotal</td><td style={{ padding: '6px 14px', textAlign: 'right' }}>{formatCurrency(subtotal)}</td></tr>
                                <tr><td style={{ padding: '6px 14px', color: '#64748b' }}>GST (18%)</td><td style={{ padding: '6px 14px', textAlign: 'right' }}>{formatCurrency(tax)}</td></tr>
                                <tr><td style={{ padding: '8px 14px', fontWeight: 700, fontSize: 15, borderTop: '2px solid #f59e0b', color: '#f59e0b' }}>Total</td><td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, fontSize: 15, borderTop: '2px solid #f59e0b', color: '#f59e0b' }}>{formatCurrency(total)}</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: 24, fontSize: 11, color: '#64748b' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>Terms</div>
                        <p>1. Delivery must be made by the expected date.</p>
                        <p>2. Payment terms: Net 30 from receipt of goods.</p>
                        <p>3. All goods must meet quality specifications.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
