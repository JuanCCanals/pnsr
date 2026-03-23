// backend/routes/zonas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // ✅ Usar pool centralizado
const authenticateToken = require('../middlewares/auth'); // ✅ Usar middleware centralizado
const authorizePermission = require('../middlewares/authorizePermission');

// ==================== RUTAS DE ZONAS ====================

// Obtener todas las zonas
router.get('/', authenticateToken, authorizePermission('zonas'), async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        z.id,
        z.nombre,
        z.descripcion,
        z.abreviatura,
        z.activo,
        z.numero_familias,
        z.created_at,
        z.updated_at,
        COUNT(f.id) as familias_registradas
      FROM zonas z
      LEFT JOIN familias f ON z.id = f.zona_id AND f.activo = 1
      GROUP BY z.id, z.nombre, z.descripcion, z.abreviatura, z.activo, z.numero_familias, z.created_at, z.updated_at
      ORDER BY z.nombre
    `);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener zonas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener estadísticas de zonas
router.get('/stats', authenticateToken, authorizePermission('zonas'), async (req, res) => {
  try {
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM zonas');
    const [activasRows] = await pool.execute('SELECT COUNT(*) as activas FROM zonas WHERE activo = 1');
    const [conFamiliasRows] = await pool.execute(`
      SELECT COUNT(DISTINCT z.id) as con_familias 
      FROM zonas z 
      INNER JOIN familias f ON z.id = f.zona_id 
      WHERE z.activo = 1 AND f.activo = 1
    `);
    const [totalFamiliasRows] = await pool.execute(`
      SELECT COUNT(*) as total_familias 
      FROM familias f 
      INNER JOIN zonas z ON f.zona_id = z.id 
      WHERE f.activo = 1 AND z.activo = 1
    `);

    res.json({
      success: true,
      data: {
        total: totalRows[0].total,
        activas: activasRows[0].activas,
        con_familias: conFamiliasRows[0].con_familias,
        total_familias: totalFamiliasRows[0].total_familias
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ==================== IMPORTAR ZONAS DESDE EXCEL ====================
// POST /api/zonas/import-excel
// Body: { zonas: [{ nombre, abreviatura, descripcion, numero_familias, activo }] }
router.post('/import-excel', authenticateToken, authorizePermission('zonas.crear'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { zonas } = req.body;

    if (!zonas || !Array.isArray(zonas) || zonas.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibieron zonas para importar' });
    }

    await conn.beginTransaction();

    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < zonas.length; i++) {
      const z = zonas[i];
      const nombre = (z.nombre || '').trim();
      const abreviatura = (z.abreviatura || '').trim().toUpperCase();
      const descripcion = (z.descripcion || '').trim();
      const numero_familias = parseInt(z.numero_familias) || 0;
      const activo = z.activo !== undefined ? (z.activo ? 1 : 0) : 1;

      if (!nombre) {
        errors.push(`Fila ${i + 2}: nombre vacío, se omitió`);
        continue;
      }

      // Buscar si ya existe por abreviatura (si tiene) o por nombre exacto
      let existing = null;
      if (abreviatura) {
        const [rows] = await conn.execute(
          'SELECT id FROM zonas WHERE abreviatura = ? LIMIT 1',
          [abreviatura]
        );
        if (rows.length > 0) existing = rows[0];
      }

      if (!existing) {
        const [rows] = await conn.execute(
          'SELECT id FROM zonas WHERE LOWER(nombre) = LOWER(?) LIMIT 1',
          [nombre]
        );
        if (rows.length > 0) existing = rows[0];
      }

      if (existing) {
        await conn.execute(
          `UPDATE zonas SET nombre = ?, abreviatura = ?, descripcion = ?, numero_familias = ?, activo = ? WHERE id = ?`,
          [nombre, abreviatura, descripcion, numero_familias, activo, existing.id]
        );
        updated++;
      } else {
        await conn.execute(
          `INSERT INTO zonas (nombre, abreviatura, descripcion, numero_familias, activo) VALUES (?, ?, ?, ?, ?)`,
          [nombre, abreviatura, descripcion, numero_familias, activo]
        );
        created++;
      }
    }

    await conn.commit();

    res.json({
      success: true,
      message: `Importación completada: ${created} creada(s), ${updated} actualizada(s)${errors.length ? `. ${errors.length} omitida(s)` : ''}`,
      created,
      updated,
      errors,
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error importando zonas:', error);
    res.status(500).json({ success: false, error: 'Error al importar zonas: ' + error.message });
  } finally {
    conn.release();
  }
});

// Obtener una zona por ID
router.get('/:id', authenticateToken, authorizePermission('zonas'), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT 
        z.*,
        COUNT(f.id) as familias_registradas
      FROM zonas z
      LEFT JOIN familias f ON z.id = f.zona_id AND f.activo = 1
      WHERE z.id = ?
      GROUP BY z.id
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Zona no encontrada'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error al obtener zona:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Crear nueva zona
router.post('/', authenticateToken, authorizePermission('zonas.crear'), async (req, res) => {
  try {
    const { nombre, descripcion, abreviatura, activo } = req.body;

    // Validaciones básicas
    const errors = [];
    if (!nombre || nombre.trim().length < 2) {
      errors.push({ field: 'nombre', message: 'El nombre debe tener al menos 2 caracteres' });
    }
    if (!abreviatura || abreviatura.trim().length < 2 || abreviatura.trim().length > 10) {
      errors.push({ field: 'abreviatura', message: 'La abreviatura debe tener entre 2 y 10 caracteres' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Verificar si la abreviatura ya existe
    const [existingZona] = await pool.execute(
      'SELECT id FROM zonas WHERE abreviatura = ?',
      [abreviatura.trim().toUpperCase()]
    );

    if (existingZona.length > 0) {
      return res.status(400).json({
        success: false,
        errors: [{ field: 'abreviatura', message: 'La abreviatura ya está en uso' }],
        message: 'La abreviatura ya está registrada'
      });
    }

    // Insertar zona
    const [result] = await pool.execute(
      'INSERT INTO zonas (nombre, descripcion, abreviatura, activo) VALUES (?, ?, ?, ?)',
      [nombre.trim(), descripcion?.trim() || null, abreviatura.trim().toUpperCase(), activo !== false]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        abreviatura: abreviatura.trim().toUpperCase(),
        activo: activo !== false
      },
      message: 'Zona creada exitosamente'
    });

  } catch (error) {
    console.error('Error al crear zona:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Actualizar zona
router.put('/:id', authenticateToken, authorizePermission('zonas.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, abreviatura, activo } = req.body;

    // Verificar si la zona existe
    const [existingZona] = await pool.execute(
      'SELECT id FROM zonas WHERE id = ?',
      [id]
    );

    if (existingZona.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Zona no encontrada'
      });
    }

    // Validaciones básicas
    const errors = [];
    if (nombre && nombre.trim().length < 2) {
      errors.push({ field: 'nombre', message: 'El nombre debe tener al menos 2 caracteres' });
    }
    if (abreviatura && (abreviatura.trim().length < 2 || abreviatura.trim().length > 10)) {
      errors.push({ field: 'abreviatura', message: 'La abreviatura debe tener entre 2 y 10 caracteres' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Datos de entrada inválidos'
      });
    }

    // Verificar si la abreviatura ya está en uso por otra zona
    if (abreviatura) {
      const [abreviaturaCheck] = await pool.execute(
        'SELECT id FROM zonas WHERE abreviatura = ? AND id != ?',
        [abreviatura.trim().toUpperCase(), id]
      );

      if (abreviaturaCheck.length > 0) {
        return res.status(400).json({
          success: false,
          errors: [{ field: 'abreviatura', message: 'La abreviatura ya está en uso' }],
          message: 'La abreviatura ya está registrada'
        });
      }
    }

    // Preparar campos para actualizar
    let updateFields = [];
    let updateValues = [];

    if (nombre) {
      updateFields.push('nombre = ?');
      updateValues.push(nombre.trim());
    }
    if (descripcion !== undefined) {
      updateFields.push('descripcion = ?');
      updateValues.push(descripcion?.trim() || null);
    }
    if (abreviatura) {
      updateFields.push('abreviatura = ?');
      updateValues.push(abreviatura.trim().toUpperCase());
    }
    if (activo !== undefined) {
      updateFields.push('activo = ?');
      updateValues.push(activo);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await pool.execute(
        `UPDATE zonas SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    res.json({
      success: true,
      message: 'Zona actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error al actualizar zona:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Cambiar estado de zona (activar/desactivar)
router.patch('/:id/toggle-status', authenticateToken, authorizePermission('zonas.actualizar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener estado actual
    const [zonaRows] = await pool.execute(
      'SELECT activo FROM zonas WHERE id = ?',
      [id]
    );

    if (zonaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Zona no encontrada'
      });
    }

    const nuevoEstado = !zonaRows[0].activo;

    // Actualizar estado
    await pool.execute(
      'UPDATE zonas SET activo = ? WHERE id = ?',
      [nuevoEstado, id]
    );

    res.json({
      success: true,
      message: `Zona ${nuevoEstado ? 'activada' : 'desactivada'} exitosamente`
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Eliminar zona
router.delete('/:id', authenticateToken, authorizePermission('zonas.eliminar'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si la zona existe
    const [existingZona] = await pool.execute(
      'SELECT id FROM zonas WHERE id = ?',
      [id]
    );

    if (existingZona.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Zona no encontrada'
      });
    }

    // Verificar si hay familias asociadas
    const [familiasAsociadas] = await pool.execute(
      'SELECT COUNT(*) as total FROM familias WHERE zona_id = ?',
      [id]
    );

    if (familiasAsociadas[0].total > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar la zona porque tiene familias asociadas'
      });
    }

    // Eliminar zona
    await pool.execute(
      'DELETE FROM zonas WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Zona eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar zona:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener familias de una zona
router.get('/:id/familias', authenticateToken, authorizePermission('zonas'), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT 
        f.id,
        f.codigo_unico,
        f.nombre_padre,
        f.nombre_madre,
        f.direccion,
        f.telefono,
        f.observaciones,
        f.activo,
        f.created_at,
        COUNT(if.id) as total_integrantes
      FROM familias f
      LEFT JOIN integrantes_familia if ON f.id = if.familia_id
      WHERE f.zona_id = ?
      GROUP BY f.id
      ORDER BY f.codigo_unico
    `, [id]);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener familias de la zona:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;
