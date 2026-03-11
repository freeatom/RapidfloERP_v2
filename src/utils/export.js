/**
 * Utility: Export data to CSV or trigger browser PDF print
 */

/**
 * Export an array of objects to a downloadable CSV file.
 * @param {Object[]} data - Array of row objects
 * @param {string} filename - Name of the downloaded file (without extension)
 * @param {string[]} [columns] - Optional ordered list of column keys to include
 */
export function exportToCSV(data, filename, columns) {
    if (!data || data.length === 0) return;
    const cols = columns || Object.keys(data[0]);
    const header = cols.map(c => `"${c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}"`).join(',');
    const rows = data.map(row =>
        cols.map(c => {
            let val = row[c] ?? '';
            if (typeof val === 'object') val = JSON.stringify(val);
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Print the current page section as a PDF via the browser print dialog.
 * Creates a clean print-friendly version of a given container.
 * @param {string} title - Title shown at top of the printed page
 * @param {string} [containerId] - Optional container element ID to print. If omitted, prints the main content area.
 */
export function exportToPDF(title, containerId) {
    const container = containerId
        ? document.getElementById(containerId)
        : document.querySelector('.main-content') || document.querySelector('main') || document.body;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1a1a2e; font-size: 12px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .print-meta { color: #666; font-size: 11px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
        th { background: #f5f5f5; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
        .badge, .avatar, button, .btn, .search-box, .toolbar, .tabs, .pagination, .modal-overlay, svg { display: none !important; }
        .kpi-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .kpi-card { border: 1px solid #ddd; padding: 12px; border-radius: 6px; min-width: 120px; }
        @media print { body { padding: 0; } }
    </style></head><body>
    <h1>${title}</h1>
    <div class="print-meta">Exported on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} from Rapidflo</div>
    ${container.innerHTML}
    <script>window.onload = function() { window.print(); window.close(); }<\/script>
    </body></html>`);
    printWindow.document.close();
}
