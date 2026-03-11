/**
 * Middleware: checkModuleEnabled
 * Blocks API requests to disabled modules based on module_config table.
 */
export function checkModuleEnabled(moduleName) {
    return (req, res, next) => {
        try {
            const db = req.app.get('db');
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
            next(); // Fail open on error to avoid blocking everything
        }
    };
}
