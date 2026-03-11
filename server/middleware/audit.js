import { v4 as uuidv4 } from 'uuid';

// Immutable audit logging middleware
// Logs to the company DB's audit_logs table (per-company audit trail)

export function auditLog(module, action, options = {}) {
    return (req, res, next) => {
        const startTime = Date.now();
        const originalJson = res.json.bind(res);

        res.json = function (body) {
            const duration = Date.now() - startTime;

            if (res.statusCode < 400 || options.logErrors) {
                try {
                    // Use company DB for audit, fall back to main DB
                    const db = req.companyDb || req.app.get('db');
                    const tableName = req.companyDb ? 'audit_logs' : 'platform_audit_logs';

                    const logEntry = {
                        id: uuidv4(),
                        user_id: req.user?.id || null,
                        user_email: req.user?.email || 'system',
                        action: action || req.method,
                        module: module,
                        resource_type: options.resourceType || module,
                        resource_id: req.params?.id || body?.id || null,
                        old_values: req._auditOldValues ? JSON.stringify(req._auditOldValues) : null,
                        new_values: req._auditNewValues ? JSON.stringify(req._auditNewValues) : null,
                        ip_address: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
                        user_agent: req.headers['user-agent'] || null,
                        session_id: req.headers['x-session-id'] || null,
                        status: res.statusCode < 400 ? 'success' : 'error',
                        error_message: res.statusCode >= 400 ? (body?.error || null) : null,
                        duration_ms: duration
                    };

                    db.prepare(`
                        INSERT INTO ${tableName} (id, user_id, user_email, action, module, resource_type, resource_id, 
                          old_values, new_values, ip_address, user_agent, ${req.companyDb ? 'session_id,' : ''} status, error_message, duration_ms, created_at)
                        VALUES (@id, @user_id, @user_email, @action, @module, @resource_type, @resource_id, 
                          @old_values, @new_values, @ip_address, @user_agent, ${req.companyDb ? '@session_id,' : ''} @status, @error_message, @duration_ms, datetime('now'))
                    `).run(logEntry);
                } catch (err) {
                    console.error('Audit log error:', err.message);
                }
            }

            return originalJson(body);
        };

        next();
    };
}

// Capture old values before update/delete
export function captureOldValues(tableName, idParam = 'id') {
    return (req, res, next) => {
        try {
            const db = req.companyDb || req.app.get('db');
            const id = req.params[idParam] || req.params.id;
            if (id) {
                const oldRecord = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
                if (oldRecord) req._auditOldValues = oldRecord;
            }
        } catch (err) {
            console.error('Audit capture error:', err.message);
        }
        next();
    };
}

export function setAuditNewValues(data) {
    return function (req) {
        req._auditNewValues = data || req.body;
    };
}

export function logAuditEvent(db, { userId, userEmail, action, module, resourceType, resourceId, oldValues, newValues, ipAddress, userAgent }) {
    try {
        db.prepare(`
            INSERT INTO audit_logs (id, user_id, user_email, action, module, resource_type, resource_id, 
              old_values, new_values, ip_address, user_agent, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', datetime('now'))
        `).run(
            uuidv4(), userId, userEmail, action, module, resourceType, resourceId,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            ipAddress, userAgent
        );
    } catch (err) {
        console.error('Direct audit log error:', err.message);
    }
}
