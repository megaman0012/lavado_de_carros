/**
 * Configuración de subida de archivos (multer)
 * Evidencias fotográficas: uploads/evidencias/reserva-{id}/
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, 'evidencias', `reserva-${req.params.id}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const tipo = req.body.tipo === 'despues' ? 'despues' : 'antes';
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${tipo}-${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'));
  }
});

module.exports = { upload, UPLOAD_ROOT };
