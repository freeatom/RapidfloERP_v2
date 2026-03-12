import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './db/schema.js';
import { authMiddleware } from './middleware/auth.js';
import { checkPermission } from './middleware/rbac.js';
import { auditLog } from './middleware/audit.js';
import { checkModuleEnabled } from './middleware/checkModule.js';
import { tenantMiddleware } from './middleware/tenant.js';

// Route imports
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import crmRoutes from './routes/crm.js';
import salesRoutes from './routes/sales.js';
import financeRoutes from './routes/finance.js';
import inventoryRoutes from './routes/inventory.js';
import procurementRoutes from './routes/procurement.js';
import hrmsRoutes from './routes/hrms.js';
import projectRoutes from './routes/projects.js';
import supportRoutes from './routes/support.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import workflowRoutes from './routes/workflows.js';
import searchRoutes from './routes/search.js';
import documentsRoutes from './routes/documents.js';
import profileRoutes from './routes/profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// SECURITY MIDDLEWARE
// =============================================
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for dev
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id', 'X-Request-Id', 'X-Company-Id']
}));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many login attempts, please try again later', code: 'AUTH_RATE_LIMITED' }
});

// =============================================
// GENERAL MIDDLEWARE
// =============================================
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', apiLimiter);

// Serve static uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Request ID and timing
app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.startTime = Date.now();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

// Request logging
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        const cleanup = () => {
            const duration = Date.now() - req.startTime;
            console.log(`${new Date().toISOString()} | ${req.method} ${req.path} | ${res.statusCode} | ${duration}ms`);
        };
        res.on('finish', cleanup);
    }
    next();
});

// =============================================
// DATABASE
// =============================================
let db;
try {
    db = initializeDatabase();
    app.set('db', db);
    console.log('✅ Database initialized successfully');
} catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
}

// =============================================
// API ROUTES
// =============================================
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', authMiddleware, tenantMiddleware, adminRoutes);
app.use('/api/dashboard', authMiddleware, tenantMiddleware, dashboardRoutes);
app.use('/api/crm', authMiddleware, tenantMiddleware, checkModuleEnabled('crm'), crmRoutes);
app.use('/api/sales', authMiddleware, tenantMiddleware, checkModuleEnabled('sales'), salesRoutes);
app.use('/api/finance', authMiddleware, tenantMiddleware, checkModuleEnabled('finance'), financeRoutes);
app.use('/api/inventory', authMiddleware, tenantMiddleware, checkModuleEnabled('inventory'), inventoryRoutes);
app.use('/api/procurement', authMiddleware, tenantMiddleware, checkModuleEnabled('procurement'), procurementRoutes);
app.use('/api/hrms', authMiddleware, tenantMiddleware, checkModuleEnabled('hrms'), hrmsRoutes);
app.use('/api/projects', authMiddleware, tenantMiddleware, checkModuleEnabled('projects'), projectRoutes);
app.use('/api/support', authMiddleware, tenantMiddleware, checkModuleEnabled('support'), supportRoutes);
app.use('/api/reports', authMiddleware, tenantMiddleware, checkModuleEnabled('reports'), reportRoutes);
app.use('/api/workflows', authMiddleware, tenantMiddleware, workflowRoutes);
app.use('/api/search', authMiddleware, tenantMiddleware, searchRoutes);
app.use('/api/documents', authMiddleware, tenantMiddleware, documentsRoutes);
app.use('/api/profile', authMiddleware, tenantMiddleware, profileRoutes);

// Modules enabled (from company DB)
app.get('/api/modules/enabled', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const cdb = req.companyDb;
        if (!cdb) return res.json({ modules: [] });
        const modules = cdb.prepare("SELECT module FROM module_config WHERE is_enabled = 1").all().map(m => m.module);
        res.json({ modules });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load modules' });
    }
});

// Notifications (from company DB)
app.get('/api/notifications', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const cdb = req.companyDb;
        if (!cdb) return res.json({ notifications: [], unreadCount: 0 });
        const notifications = cdb.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
        const unreadCount = cdb.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
        res.json({ notifications, unreadCount: unreadCount.count });
    } catch { res.json({ notifications: [], unreadCount: 0 }); }
});

app.put('/api/notifications/:id/read', authMiddleware, tenantMiddleware, (req, res) => {
    const cdb = req.companyDb;
    if (!cdb) return res.json({ success: true });
    cdb.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
});

app.put('/api/notifications/read-all', authMiddleware, tenantMiddleware, (req, res) => {
    const cdb = req.companyDb;
    if (!cdb) return res.json({ success: true });
    cdb.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
});

// Global search (company DB)
app.get('/api/search', authMiddleware, tenantMiddleware, (req, res) => {
    const cdb = req.companyDb;
    if (!cdb) return res.json({ results: [] });
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ results: [] });
    const s = `%${q}%`;
    const results = [];
    try { results.push(...cdb.prepare("SELECT id, first_name || ' ' || last_name as name, email, 'lead' as type, 'crm' as module FROM leads WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? LIMIT 5").all(s, s, s)); } catch { }
    try { results.push(...cdb.prepare("SELECT id, first_name || ' ' || last_name as name, email, 'contact' as type, 'crm' as module FROM contacts WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? LIMIT 5").all(s, s, s)); } catch { }
    try { results.push(...cdb.prepare("SELECT id, name, email, 'account' as type, 'crm' as module FROM accounts WHERE name LIKE ? OR email LIKE ? LIMIT 5").all(s, s)); } catch { }
    try { results.push(...cdb.prepare("SELECT id, name, sku as email, 'product' as type, 'sales' as module FROM products WHERE name LIKE ? OR sku LIKE ? LIMIT 5").all(s, s)); } catch { }
    try { results.push(...cdb.prepare("SELECT id, first_name || ' ' || last_name as name, email, 'employee' as type, 'hrms' as module FROM employees WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? LIMIT 5").all(s, s, s)); } catch { }
    try { results.push(...cdb.prepare("SELECT id, subject as name, ticket_number as email, 'ticket' as type, 'support' as module FROM tickets WHERE subject LIKE ? OR ticket_number LIKE ? LIMIT 5").all(s, s)); } catch { }
    try { results.push(...cdb.prepare("SELECT id, name, code as email, 'project' as type, 'projects' as module FROM projects WHERE name LIKE ? OR code LIKE ? LIMIT 5").all(s, s)); } catch { }
    res.json({ results });
});

// Health check
app.get('/api/health', (req, res) => {
    const dbCheck = db.prepare('SELECT 1 as ok').get();
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbCheck?.ok === 1 ? 'connected' : 'error',
        memory: process.memoryUsage(),
        version: '2.0.0'
    });
});

// =============================================
// ERROR HANDLING
// =============================================
app.use((err, req, res, next) => {
    console.error(`${new Date().toISOString()} | ERROR | ${err.message}`);
    console.error(err.stack);

    // Log error to platform audit
    try {
        db.prepare(`
      INSERT INTO platform_audit_logs (id, user_id, user_email, action, module, status, error_message, ip_address, created_at)
      VALUES (?, ?, ?, 'ERROR', 'system', 'error', ?, ?, datetime('now'))
    `).run(
            `err_${Date.now()}`,
            req.user?.id,
            req.user?.email || 'anonymous',
            err.message,
            req.ip
        );
    } catch (logErr) {
        console.error('Failed to log error:', logErr.message);
    }

    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        code: 'INTERNAL_ERROR',
        requestId: req.requestId
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not found', code:     'NOT_FOUND', path: req.path });
});

// =============================================
// SERVE FRONTEND (PRODUCTION / RAILWAY)
// =============================================
// In production (like Railway), the Express server also serves the React built files
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// For any other route, send the React index.html so React Router takes over
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

// =============================================
// GRACEFUL SHUTDOWN
// =============================================
function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    if (db) {
        db.close();
        console.log('Database connection closed');
    }
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// =============================================
// START SERVER
// =============================================
const server = app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║        Rapidflo v2 — Enterprise Server        ║
  ║──────────────────────────────────────────────║
  ║  Port:     ${PORT}                              ║
  ║  API:      http://localhost:${PORT}/api          ║
  ║  Health:   http://localhost:${PORT}/api/health   ║
  ║  Mode:     ${process.env.NODE_ENV || 'development'}                      ║
  ╚══════════════════════════════════════════════╝
  `);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n⚠️  Port ${PORT} is already in use.`);
        console.error(`   Run this to free it:  npx kill-port ${PORT}`);
        console.error(`   Or:  Get-NetTCPConnection -LocalPort ${PORT} | Stop-Process -Force\n`);
        process.exit(1);
    }
    throw err;
});

export default app;
