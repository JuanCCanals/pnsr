// backend/routes/benefactores.js
// backend/routes/ventas.js
const express = require('express');
const router = express.Router();

const pool = require('../config/db');
const authenticateToken = require('../middlewares/auth');

/**
 * Helper: busca una caja por su código alfanumérico.
 * Devuelve info útil para validar disponibilidad y enlazar familia/zona.
 */
async function getCajaByCodigo(conn, codigo) {
  const [rows] = await conn.query(
    `SELECT 
        c.id            AS caja_id,
        c.codigo        AS codigo,
        c.estado        AS estado,
        c.benefactor_id AS benefactor_id,
        c.familia_id    AS familia_id,
        f.zona_id       AS zona_id,
        f.codigo_unico  AS familia_codigo,
        f.nombre_padre, f.nombre_madre, f.direccion
        FROM cajas c
        LEFT JOIN familias f ON f.id = c.familia_id
        WHERE c.codigo = ?
        LIMIT 1`,
    [codigo]
  );
  return rows[0];
}

/**
 * GET /api/ventas/box/:codigo
 * Valida un código de caja antes de agregarlo al carrito del popup.
 */
router.get('/box/:codigo', authenticateToken, async (req, res) => {
  const codigo = decodeURIComponent(req.params.codigo || '').trim();
  if (!codigo) return res.status(400).json({ success: false, error: 'Código requerido' });
  const conn = await pool.getConnection();
  try {
    const caja = await getCajaByCodigo(conn, codigo);
    if (!caja) return res.json({ success: false, error: 'No existe la caja' });

    // Si manejas estados en "cajas", valida disponibilidad:
    if (caja.estado && caja.estado.toLowerCase() !== 'disponible' && caja.estado.toLowerCase() !== 'libre') {
      return res.json({ success: false, error: `Caja en estado: ${caja.estado}` });
    }

    return res.json({ success: true, data: caja });
  } catch (e) {
    console.error('GET /ventas/box/:codigo', e);
    return res.status(500).json({ success: false, error: 'Error buscando caja' });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/ventas
 * Crea una venta (cabecera) y N filas en ventas_cajas (detalle).
 * Payload esperado:
 * {
 *   "recibo": "02418",
 *   "fecha": "2025-09-24",
 *   "punto_venta_id": 1,            // opcional
 *   "forma_pago": "Efectivo",       // opcional
 *   "estado": "Entregada a Benefactor", // opcional (default)
 *   "monto": 40.00,                 // total del recibo
 *   "moneda": "PEN",                // default PEN
 *   "benefactor": {
 *     "id": 123,                    // opcional (si existe)
 *     "nombre": "JUAN PÉREZ",
 *     "dni": "12345678",            // opcional si tu tabla lo exige
 *     "telefono": "999999999",
 *     "email": "a@b.com",
 *     "direccion": "AV. X 123",
 *     "observaciones": null
 *   },
 *   "codigos": ["STA001","LIM072"]  // códigos alfanuméricos de caja
 * }
 */
router.post('/', authenticateToken, async (req, res) => {
  const {
    recibo, fecha, punto_venta_id,
    forma_pago, estado = 'Entregada a Benefactor',
    monto, moneda = 'PEN',
    benefactor, codigos
  } = req.body || {};

  // Validaciones rápidas
  if (!recibo?.trim()) return res.status(400).json({ success: false, error: 'No. de recibo es requerido' });
  if (!fecha) return res.status(400).json({ success: false, error: 'Fecha es requerida' });
  if (!benefactor || !benefactor.nombre?.trim())
    return res.status(400).json({ success: false, error: 'Nombre de benefactor es requerido' });
  if (!Array.isArray(codigos) || codigos.length === 0)
    return res.status(400).json({ success: false, error: 'Agrega al menos una caja' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 0) Recibo único (cabecera "ventas")
    const [dup] = await conn.query('SELECT id FROM ventas WHERE recibo = ? LIMIT 1', [recibo.trim()]);
    if (dup.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Recibo ya registrado' });
    }

    // 1) Upsert de benefactor (ajustado a tus columnas)
    let benefactorId = benefactor.id || null;

    if (benefactorId) {
      await conn.query(
        `UPDATE benefactores
        SET nombre = ?, dni = ?, telefono = ?, email = ?, direccion = ?, observaciones = ?
        WHERE id = ?`,
        [
          benefactor.nombre.trim(),
          benefactor.dni?.trim() || null,
          benefactor.telefono?.trim() || null,
          benefactor.email?.trim() || null,
          (benefactor.direccion?.trim() || null),
          benefactor.observaciones?.trim() || null,
          Number(benefactorId),
        ]
      );
    } else {
      // Si tu tabla exige DNI único y no lo envían, podrías permitir NULL (ver ALTER sugerido).
      const [insB] = await conn.query(
        `INSERT INTO benefactores (nombre, dni, telefono, email, direccion, observaciones, activo)
        VALUES (?,?,?,?,?,?,1)`,
        [
          benefactor.nombre.trim(),
          benefactor.dni?.trim() || null,
          benefactor.telefono?.trim() || null,
          benefactor.email?.trim() || null,
          (benefactor.direccion?.trim() || null),
          benefactor.observaciones?.trim() || null
        ]
      );
      benefactorId = insB.insertId;
    }

    // 2) Insert cabecera "ventas"
    const [insV] = await conn.query(
      `INSERT INTO ventas
        (recibo, fecha, benefactor_id, punto_venta_id, forma_pago, estado, monto, moneda)
        VALUES (?,?,?,?,?,?,?,?)`,
      [
        recibo.trim(),
        fecha,
        benefactorId,
        punto_venta_id || null,
        forma_pago || null,
        estado || 'Entregada a Benefactor',
        Number(monto || 0),
        moneda || 'PEN'
      ]
    );
    const ventaId = insV.insertId;

    // 3) Itera códigos y crea detalle + marca cajas
    for (const raw of codigos) {
      const codigo = String(raw || '').trim();
      if (!codigo) continue;

      const caja = await getCajaByCodigo(conn, codigo);
      if (!caja) throw new Error(`Caja ${codigo} no existe`);

      // Si tienes estado en "cajas", valida:
      if (caja.estado && caja.estado.toLowerCase() !== 'disponible' && caja.estado.toLowerCase() !== 'libre') {
        throw new Error(`Caja ${codigo} en estado ${caja.estado}`);
      }

      // Insert en ventas_cajas (detalle)
      await conn.query(
        `INSERT INTO ventas_cajas
          (venta_id, caja_id, benefactor_id, punto_venta_id, forma_pago, estado, monto, moneda, fecha)
          VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          ventaId,
          caja.caja_id,
          benefactorId,
          punto_venta_id || null,
          forma_pago || null,
          estado || 'Entregada a Benefactor',
          Number(monto || 0),     // si prefieres monto unitario por caja, cámbialo aquí
          moneda || 'PEN',
          fecha
        ]
      );

      // Marca la caja como asignada
      await conn.query(
        `UPDATE cajas
            SET estado = 'asignada',
                benefactor_id = ?
          WHERE id = ?`,
        [benefactorId, caja.caja_id]
      );
    }

    await conn.commit();
    return res.json({ success: true, data: { id: ventaId }, message: 'Venta registrada' });
  } catch (e) {
    await conn.rollback();
    console.error('POST /ventas', e);
    const msg = e.message?.includes('Duplicate entry') ? 'Recibo ya registrado' : (e.message || 'Error registrando venta');
    return res.status(500).json({ success: false, error: msg });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/ventas/:id
 * Devuelve cabecera + detalle (ventas_cajas).
 */
router.get('/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
  const conn = await pool.getConnection();
  try {
    const [[cab]] = await conn.query(
      `SELECT v.*, b.nombre AS benefactor_nombre, b.dni, b.telefono, b.email
          FROM ventas v
          INNER JOIN benefactores b ON b.id = v.benefactor_id
        WHERE v.id = ?`,
      [id]
    );
    if (!cab) return res.status(404).json({ success: false, error: 'Venta no encontrada' });

    const [det] = await conn.query(
      `SELECT
          d.*, c.codigo AS caja_codigo,
          f.codigo_unico AS familia_codigo, f.nombre_padre, f.nombre_madre, f.direccion,
          z.nombre AS zona_nombre, z.abreviatura AS zona_abreviatura
          FROM ventas_cajas d
          INNER JOIN cajas c     ON c.id = d.caja_id
          LEFT  JOIN familias f  ON f.id = c.familia_id
          LEFT  JOIN zonas z     ON z.id = f.zona_id
        WHERE d.venta_id = ?
        ORDER BY d.id`,
      [id]
    );

    return res.json({ success: true, data: { cabecera: cab, detalle: det } });
  } catch (e) {
    console.error('GET /ventas/:id', e);
    return res.status(500).json({ success: false, error: 'Error obteniendo venta' });
  } finally {
    conn.release();
  }
});

module.exports = router;
