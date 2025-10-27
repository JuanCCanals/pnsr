// backend/middlewares/uploadExcel.js
const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ok =
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    (file.originalname && file.originalname.toLowerCase().endsWith('.xlsx'));
  if (!ok) return cb(new Error('Tipo de archivo no permitido. Sube un .xlsx'));
  cb(null, true);
};

// ⚠️ El frontend envía el campo "archivo" (FormData.append('archivo', file))
const uploadExcel = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter,
}).single('archivo');

function uploadExcelGate(req, res, next) {
  uploadExcel(req, res, function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ ok: false, message: 'El archivo supera 20 MB.' });
      }
      return res.status(400).json({ ok: false, message: err.message || 'Error al subir archivo.' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Adjunta un archivo .xlsx en el campo "archivo".' });
    }
    next();
  });
}

module.exports = { uploadExcelGate };
