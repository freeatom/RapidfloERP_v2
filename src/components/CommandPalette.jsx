import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Command, BarChart3, Users, ShoppingCart, DollarSign, Package, Truck, FolderKanban, Headphones, Settings, FileText, Activity, Moon, Sun, Zap, Calculator } from 'lucide-react';

const COMMANDS = [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboard', desc: 'Main overview', icon: BarChart3, category: 'Navigate', action: nav => nav('/') },
    { id: 'nav-crm', label: 'Go to CRM', desc: 'Leads, accounts, pipeline', icon: Users, category: 'Navigate', action: nav => nav('/crm') },
    { id: 'nav-sales', label: 'Go to Sales', desc: 'Products, quotes, orders', icon: ShoppingCart, category: 'Navigate', action: nav => nav('/sales') },
    { id: 'nav-finance', label: 'Go to Finance', desc: 'Invoices, payments, GL', icon: DollarSign, category: 'Navigate', action: nav => nav('/finance') },
    { id: 'nav-inventory', label: 'Go to Inventory', desc: 'Stock, warehouses', icon: Package, category: 'Navigate', action: nav => nav('/inventory') },
    { id: 'nav-procurement', label: 'Go to Procurement', desc: 'Vendors, purchase requests', icon: Truck, category: 'Navigate', action: nav => nav('/procurement') },
    { id: 'nav-projects', label: 'Go to Projects', desc: 'Tasks, milestones, time', icon: FolderKanban, category: 'Navigate', action: nav => nav('/projects') },
    { id: 'nav-support', label: 'Go to Support', desc: 'Tickets, knowledge base', icon: Headphones, category: 'Navigate', action: nav => nav('/support') },
    { id: 'nav-admin', label: 'Go to Admin', desc: 'Users, roles, settings', icon: Settings, category: 'Navigate', action: nav => nav('/admin') },
    { id: 'nav-hrms', label: 'Go to HRMS', desc: 'Employees, payroll', icon: Users, category: 'Navigate', action: nav => nav('/hrms') },
    { id: 'nav-workflows', label: 'Go to Workflows', desc: 'Automation builder', icon: Zap, category: 'Navigate', action: nav => nav('/workflows') },
    { id: 'nav-reports', label: 'Go to Reports', desc: 'Analytics & reporting', icon: FileText, category: 'Navigate', action: nav => nav('/reports') },

    // Actions
    { id: 'act-new-lead', label: 'Create New Lead', desc: 'Add a CRM lead', icon: Users, category: 'Create', action: nav => nav('/crm?action=new') },
    { id: 'act-new-ticket', label: 'Create New Ticket', desc: 'Support ticket', icon: Headphones, category: 'Create', action: nav => nav('/support?action=new') },
    { id: 'act-new-invoice', label: 'Create New Invoice', desc: 'Finance invoice', icon: FileText, category: 'Create', action: nav => nav('/finance?action=new') },
    { id: 'act-new-project', label: 'Create New Project', desc: 'Project management', icon: FolderKanban, category: 'Create', action: nav => nav('/projects?action=new') },

    // Theme
    { id: 'theme-dark', label: 'Switch to Dark Mode', icon: Moon, category: 'Preferences', action: () => { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); } },
    { id: 'theme-light', label: 'Switch to Light Mode', icon: Sun, category: 'Preferences', action: () => { document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light'); } },
    { id: 'theme-auto', label: 'Auto Theme (System)', icon: Settings, category: 'Preferences', action: () => { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('theme'); } },
];

export default function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const navigate = useNavigate();

    // Open/close with Ctrl+K
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
                setQuery('');
                setSelectedIdx(0);
            }
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => { if (isOpen && inputRef.current) inputRef.current.focus(); }, [isOpen]);

    const filtered = query.trim()
        ? COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase()) || (c.desc || '').toLowerCase().includes(query.toLowerCase()))
        : COMMANDS;

    const grouped = filtered.reduce((acc, cmd) => {
        (acc[cmd.category] = acc[cmd.category] || []).push(cmd);
        return acc;
    }, {});

    const flatList = Object.values(grouped).flat();

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, flatList.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (flatList[selectedIdx]) { flatList[selectedIdx].action(navigate); setIsOpen(false); }
        }
    };

    useEffect(() => { setSelectedIdx(0); }, [query]);

    useEffect(() => {
        const el = listRef.current?.children?.[selectedIdx];
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [selectedIdx]);

    if (!isOpen) return null;

    let flatIdx = -1;

    return (
        <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
            <div className="command-palette" onClick={e => e.stopPropagation()}>
                <div className="command-palette-input-row">
                    <Search size={18} color="var(--text-secondary)" />
                    <input
                        ref={inputRef}
                        className="command-palette-input"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <kbd className="command-palette-kbd">ESC</kbd>
                </div>
                <div className="command-palette-list" ref={listRef}>
                    {flatList.length === 0 && <div className="command-palette-empty">No commands match "{query}"</div>}
                    {Object.entries(grouped).map(([category, cmds]) => (
                        <React.Fragment key={category}>
                            <div className="command-palette-category">{category}</div>
                            {cmds.map(cmd => {
                                flatIdx++;
                                const idx = flatIdx;
                                return (
                                    <div
                                        key={cmd.id}
                                        className={`command-palette-item ${idx === selectedIdx ? 'active' : ''}`}
                                        onClick={() => { cmd.action(navigate); setIsOpen(false); }}
                                        onMouseEnter={() => setSelectedIdx(idx)}
                                    >
                                        <cmd.icon size={16} style={{ flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="command-palette-item-label">{cmd.label}</div>
                                            {cmd.desc && <div className="command-palette-item-desc">{cmd.desc}</div>}
                                        </div>
                                        <ArrowRight size={14} color="var(--text-disabled)" />
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
                <div className="command-palette-footer">
                    <span><Command size={12} /> <kbd>K</kbd> to toggle</span>
                    <span><kbd>↑↓</kbd> navigate</span>
                    <span><kbd>↵</kbd> select</span>
                </div>
            </div>
        </div>
    );
}
