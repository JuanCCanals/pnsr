const express = require('express');
const router = express.Router({ mergeParams: true }); // campania_id en params padre opcional
const db = require('../config/db');
const auth = require('../middlewares/auth');

// GET /api/modalidades?campania_id=1
router.get('/', auth, async (req, res) => {
  const { campania_id } = req.query;
  let sql = 'SELECT m.*, c.nombre AS campania FROM campania_modalidades m LEFT JOIN campanias c ON c.id = m.campania_id';
  const params = [];
  if (campania_id) {
    sql += ' WHERE m.campania_id = ?';
    params.push(campania_id);
  }
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

// POST { campania_id, nombre, costo, moneda }
router.post('/', auth, async (req, res) => {
  const { campania_id, nombre, costo, moneda } = req.body;
  await db.query(
    'INSERT INTO campania_modalidades (campania_id, nombre, costo, moneda) VALUES (?,?,?,?)',
    [campania_id, nombre, costo, moneda]
  );
  res.json({ message: 'Modalidad creada' });
});

// PUT /api/modalidades/:id
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { nombre, costo, estado, moneda } = req.body;
  await db.query(
    'UPDATE campania_modalidades SET nombre=?, costo=?, estado=?, moneda=? WHERE id=?',
    [nombre, costo, estado, moneda, id]
  );
  res.json({ message: 'Modalidad actualizada' });
});

module.exports = router;