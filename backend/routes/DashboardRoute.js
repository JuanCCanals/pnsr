const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middlewares/auth');

/* GET /api/dashboard/kpis?campania_id=1 */
router.get('/kpis', auth, async (req, res) => {
  const { campania_id } = req.query;
  try {
    const whereCamp = campania_id ? 'AND z.campania_id = ?' : '';
    const params = campania_id ? [campania_id] : [];

    const [totales] = await db.query(
      `SELECT 
         SUM(c.estado='disponible') AS disponibles,
         SUM(c.estado='asignada') AS asignadas,
         SUM(c.estado='entregada') AS entregadas,
         SUM(c.estado='devuelta')  AS devueltas
       FROM cajas c
       JOIN zonas z ON z.id = c.zona_id
       WHERE 1=1 ${whereCamp}`,
      params
    );

    res.json(totales[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error obteniendo KPIs' });
  }
});

module.exports = router;