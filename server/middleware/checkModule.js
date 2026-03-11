/**
 * Middleware: checkModuleEnabled
 * Checks module_config in company DB (per-company module settings)
 */
export function checkModuleEnabled(moduleName) {
    return (req, res, next) => {
        try {
            // Use company DB for module config (each company has its own)
            const db = req.companyDb;
            if (!db) return next(); // No company context = allow (SuperAdmin at gate)

            const mod = db.prepare(
                'SELECT is_enabled FROM module_config WHERE module = ?'
            ).get(moduleName);

            // If module doesn't exist in config, allow access (unconfigured = enabled)
            if (!mod) return next();

            if (!mod.is_enabled) {
                return res.status(403).json({
                    error: `Module "${moduleName}" is currently disabled`,
                    code: 'MODULE_DISABLED'
                });
            }

            next();
        } catch (err) {
            console.error('Module check error:', err);
            next(); // Fail open on error
        }
    };
}
