import { v4 as uuidv4 } from 'uuid';

// Immutable audit logging middleware
// Captures: user, action, module, resource, old/new values, IP, user agent, session, duration

export function auditLog(module, action, options = {}) {
    return (req, res, next) => {
        const startTime = Date.now();
        const originalJson = res.json.bind(res);

        res.json = function (body) {
            const duration = Date.now() - startTime;

            // Only log successful mutations or explicit audit events
            if (res.statusCode < 400 || options.logErrors) {
                try {
                    const db = req.app.get('db');
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
            INSERT INTO audit_logs (id, user_id, user_email, action, module, resource_type, resource_id, 
              old_values, new_values, ip_address, user_agent, session_id, status, error_message, duration_ms, created_at)
            VALUES (@id, @user_id, @user_email, @action, @module, @resource_type, @resource_id, 
              @old_values, @new_values, @ip_address, @user_agent, @session_id, @status, @error_message, @duration_ms, datetime('now'))
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

// Capture old values before update/delete for audit trail
export function captureOldValues(tableName, idParam = 'id') {
    return (req, res, next) => {
        try {
            const db = req.app.get('db');
            const id = req.params[idParam] || req.params.id;
            if (id) {
                const oldRecord = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
                if (oldRecord) {
                    req._auditOldValues = oldRecord;
                }
            }
        } catch (err) {
            // Don't block the request if audit capture fails
            console.error('Audit capture error:', err.message);
        }
        next();
    };
}

// Set new values for audit trail
export function setAuditNewValues(data) {
    return function (req) {
        req._auditNewValues = data || req.body;
    };
}

// Direct audit log function (for non-middleware usage)
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
