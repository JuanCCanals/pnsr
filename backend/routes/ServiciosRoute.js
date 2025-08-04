// backend/routes/ServiciosRoute.js
// CRUD de servicios e integración RENIEC

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middlewares/auth');
const axios = require('axios');
const NodeCache = require('node-cache');

// Cache para datos RENIEC (1 día)
const reniecCache = new NodeCache({ stdTTL: 86400 });

// Variables de entorno para RENIEC
const RENIEC_URL = process.env.RENIEC_URL;       // e.g. 'https://api.reniec.gob.pe'
const RENIEC_TOKEN = process.env.RENIEC_TOKEN;   // token en .env

/**
 * GET /api/servicios
 * Listar todos los servicios
 */
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM servicios ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('Error listando servicios:', err);
    res.status(500).json({ message: 'Error interno' });
  }
});

/**
 * GET /api/servicios/:id
 * Obtener servicio por ID
 */
router.get('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM servicios WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching servicio:', err);
    res.status(500).json({ message: 'Error interno' });
  }
});

/**
 * POST /api/servicios
 * Crear nuevo servicio
 */
router.post('/', auth, async (req, res) => {
  const { nombre, descripcion, costo, estado } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO servicios (nombre, descripcion, costo, estado) VALUES (?,?,?,?)',
      [nombre, descripcion, costo, estado]
    );
    res.status(201).json({ id: result.insertId, nombre, descripcion, costo, estado });
  } catch (err) {
    console.error('Error creando servicio:', err);
    res.status(500).json({ message: 'Error interno' });
  }
});

/**
 * PUT /api/servicios/:id
 * Actualizar servicio
 */
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, costo, estado } = req.body;
  try {
    await db.query(
      'UPDATE servicios SET nombre=?, descripcion=?, costo=?, estado=? WHERE id=?',
      [nombre, descripcion, costo, estado, id]
    );
    res.json({ message: 'Servicio actualizado' });
  } catch (err) {
    console.error('Error actualizando servicio:', err);
    res.status(500).json({ message: 'Error interno' });
  }
});

/**
 * DELETE /api/servicios/:id
 * Eliminar servicio
 */
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM servicios WHERE id=?', [id]);
    res.json({ message: 'Servicio eliminado' });
  } catch (err) {
    console.error('Error eliminando servicio:', err);
    res.status(500).json({ message: 'Error interno' });
  }
});

/**
 * GET /api/servicios/reniec/:dni
 * Consultar datos de persona en RENIEC
 */
router.get('/reniec/:dni', auth, async (req, res) => {
  const { dni } = req.params;
  try {
    // Revisar cache
    const cacheKey = `reniec:${dni}`;
    const cached = reniecCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    // Llamada a RENIEC
    const response = await axios.get(`${RENIEC_URL}/dni/${dni}`, {
      headers: { Authorization: `Bearer ${RENIEC_TOKEN}` }
    });
    reniecCache.set(cacheKey, response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Error consultando RENIEC:', err);
    res.status(502).json({ message: 'Error al conectarse con RENIEC' });
  }
});

module.exports = router;
