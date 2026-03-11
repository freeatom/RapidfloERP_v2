import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireRole } from '../middleware/rbac.js';
import { auditLog } from '../middleware/audit.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Setup upload directory
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.txt', '.zip'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// Upload document
router.post('/upload', upload.single('file'), auditLog('documents', 'UPLOAD'), (req, res) => {
    const db = req.app.get('db');
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or file type not allowed' });
    const { resource_type, resource_id, description } = req.body;
    if (!resource_type || !resource_id) return res.status(400).json({ error: 'resource_type and resource_id required' });
    const id = uuidv4();
    db.prepare(`INSERT INTO documents (id, resource_type, resource_id, filename, original_name, mime_type, size, description, uploaded_by, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
        .run(id, resource_type, resource_id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, description || '', req.user.id);
    res.status(201).json({ id, filename: req.file.originalname, size: req.file.size });
});

// List documents for a resource
router.get('/', (req, res) => {
    const db = req.app.get('db');
    const { resource_type, resource_id } = req.query;
    if (!resource_type || !resource_id) return res.status(400).json({ error: 'resource_type and resource_id required' });
    const docs = db.prepare(`SELECT d.*, u.first_name || ' ' || u.last_name as uploaded_by_name
                             FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by
                             WHERE d.resource_type=? AND d.resource_id=? AND d.is_deleted=0
                             ORDER BY d.created_at DESC`).all(resource_type, resource_id);
    res.json({ documents: docs });
});

// Download document
router.get('/:id/download', (req, res) => {
    const db = req.app.get('db');
    const doc = db.prepare('SELECT * FROM documents WHERE id=? AND is_deleted=0').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.join(uploadDir, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from disk' });
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
});

// Delete document (soft delete)
router.delete('/:id', auditLog('documents', 'DELETE'), (req, res) => {
    const db = req.app.get('db');
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    db.prepare("UPDATE documents SET is_deleted=1, updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ success: true });
});

export default router;
