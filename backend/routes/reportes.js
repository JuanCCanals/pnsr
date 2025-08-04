const express = require('express');
const router = express.Router();
//const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Función para obtener el pool de conexiones
const getPool = () => {
  const mysql = require('mysql2/promise');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pnsr_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
  return mysql.createPool(dbConfig);
};

const pool = getPool();

// Middleware de autenticación simplificado
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token de acceso requerido'
      });
    }

    req.user = { id: 1, rol: 'admin' };
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Token inválido'
    });
  }
};

// Función para generar archivo Excel
const generarExcel = (data, nombreHoja = 'Datos') => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, nombreHoja);
  return workbook;
};

// Función para guardar archivo temporal
const guardarArchivoTemporal = (workbook, nombreArchivo) => {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const filePath = path.join(uploadsDir, nombreArchivo);
  XLSX.writeFile(workbook, filePath);
  return filePath;
};

// ==================== RUTAS DE REPORTES ====================

// Obtener lista de reportes disponibles
router.get('/', authenticateToken, async (req, res) => {
  try {
    const reportes = [
      {
        id: 'familias-general',
        nombre: 'Reporte General de Familias',
        descripcion: 'Lista completa de familias con sus datos básicos',
        categoria: 'familias'
      },
      {
        id: 'familias-por-zona',
        nombre: 'Familias por Zona',
        descripcion: 'Familias agrupadas por zona geográfica',
        categoria: 'familias'
      },
      {
        id: 'familias-con-integrantes',
        nombre: 'Familias con Integrantes',
        descripcion: 'Familias con detalle de todos sus integrantes',
        categoria: 'familias'
      },
      {
        id: 'cajas-general',
        nombre: 'Reporte General de Cajas',
        descripcion: 'Estado actual de todas las cajas del amor',
        categoria: 'cajas'
      },
      {
        id: 'cajas-por-estado',
        nombre: 'Cajas por Estado',
        descripcion: 'Cajas agrupadas por su estado actual',
        categoria: 'cajas'
      },
      {
        id: 'cajas-benefactores',
        nombre: 'Cajas y Benefactores',
        descripcion: 'Relación entre cajas y benefactores asignados',
        categoria: 'cajas'
      },
      {
        id: 'servicios-general',
        nombre: 'Reporte General de Servicios',
        descripcion: 'Lista de todos los servicios registrados',
        categoria: 'servicios'
      },
      {
        id: 'servicios-ingresos',
        nombre: 'Reporte de Ingresos por Servicios',
        descripcion: 'Ingresos generados por servicios eclesiásticos',
        categoria: 'servicios'
      },
      {
        id: 'servicios-por-tipo',
        nombre: 'Servicios por Tipo',
        descripcion: 'Servicios agrupados por tipo de ceremonia',
        categoria: 'servicios'
      },
      {
        id: 'benefactores-general',
        nombre: 'Reporte General de Benefactores',
        descripcion: 'Lista completa de benefactores registrados',
        categoria: 'benefactores'
      },
      {
        id: 'dashboard-resumen',
        nombre: 'Resumen Ejecutivo',
        descripcion: 'Estadísticas generales del sistema',
        categoria: 'dashboard'
      }
    ];

    res.json({
      success: true,
      data: reportes
    });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Generar reporte de familias general
router.get('/familias-general', authenticateToken, async (req, res) => {
  try {
    const { formato = 'json', zona_id, activo } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (zona_id) {
      whereConditions.push('f.zona_id = ?');
      queryParams.push(zona_id);
    }
    
    if (activo !== undefined) {
      whereConditions.push('f.activo = ?');
      queryParams.push(activo === 'true' ? 1 : 0);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(`
      SELECT 
        f.codigo_unico as 'Código Familia',
        z.nombre as 'Zona',
        f.nombre_padre as 'Nombre Padre',
        f.nombre_madre as 'Nombre Madre',
        f.direccion as 'Dirección',
        f.telefono as 'Teléfono',
        CASE WHEN f.activo = 1 THEN 'Activa' ELSE 'Inactiva' END as 'Estado',
        COUNT(if.id) as 'Total Integrantes',
        COUNT(c.id) as 'Cajas Asignadas',
        DATE_FORMAT(f.created_at, '%d/%m/%Y') as 'Fecha Registro'
      FROM familias f
      LEFT JOIN zonas z ON f.zona_id = z.id
      LEFT JOIN integrantes_familia if ON f.id = if.familia_id
      LEFT JOIN cajas c ON f.id = c.familia_id
      ${whereClause}
      GROUP BY f.id, f.codigo_unico, z.nombre, f.nombre_padre, f.nombre_madre, 
               f.direccion, f.telefono, f.activo, f.created_at
      ORDER BY f.codigo_unico
    `, queryParams);

    if (formato === 'excel') {
      const workbook = generarExcel(rows, 'Familias General');
      const nombreArchivo = `familias-general-${Date.now()}.xlsx`;
      const filePath = guardarArchivoTemporal(workbook, nombreArchivo);
      
      res.download(filePath, nombreArchivo, (err) => {
        if (!err) {
          // Eliminar archivo temporal después de la descarga
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        }
      });
    } else {
      res.json({
        success: true,
        data: rows,
        total: rows.length
      });
    }
  } catch (error) {
    console.error('Error al generar reporte de familias:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Generar reporte de familias por zona
router.get('/familias-por-zona', authenticateToken, async (req, res) => {
  try {
    const { formato = 'json' } = req.query;

    const [rows] = await pool.execute(`
      SELECT 
        z.nombre as 'Zona',
        z.abreviatura as 'Abreviatura',
        COUNT(f.id) as 'Total Familias',
        COUNT(CASE WHEN f.activo = 1 THEN 1 END) as 'Familias Activas',
        COUNT(CASE WHEN f.activo = 0 THEN 1 END) as 'Familias Inactivas',
        COUNT(if.id) as 'Total Integrantes',
        COUNT(c.id) as 'Total Cajas',
        ROUND(COUNT(if.id) / NULLIF(COUNT(f.id), 0), 2) as 'Promedio Integrantes'
      FROM zonas z
      LEFT JOIN familias f ON z.id = f.zona_id
      LEFT JOIN integrantes_familia if ON f.id = if.familia_id
      LEFT JOIN cajas c ON f.id = c.familia_id
      WHERE z.activo = 1
      GROUP BY z.id, z.nombre, z.abreviatura
      ORDER BY z.nombre
    `);

    if (formato === 'excel') {
      const workbook = generarExcel(rows, 'Familias por Zona');
      const nombreArchivo = `familias-por-zona-${Date.now()}.xlsx`;
      const filePath = guardarArchivoTemporal(workbook, nombreArchivo);
      
      res.download(filePath, nombreArchivo, (err) => {
        if (!err) {
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        }
      });
    } else {
      res.json({
        success: true,
        data: rows,
        total: rows.length
      });
    }
  } catch (error) {
    console.error('Error al generar reporte por zona:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Generar reporte de familias con integrantes
router.get('/familias-con-integrantes', authenticateToken, async (req, res) => {
  try {
    const { formato = 'json', zona_id } = req.query;
    
    let whereConditions = ['f.activo = 1'];
    let queryParams = [];
    
    if (zona_id) {
      whereConditions.push('f.zona_id = ?');
      queryParams.push(zona_id);
    }
    
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const [rows] = await pool.execute(`
      SELECT 
        f.codigo_unico as 'Código Familia',
        z.nombre as 'Zona',
        f.nombre_padre as 'Nombre Padre',
        f.nombre_madre as 'Nombre Madre',
        f.direccion as 'Dirección',
        COALESCE(if.nombre, 'Sin integrantes') as 'Nombre Integrante',
        COALESCE(if.relacion, '') as 'Relación',
        CASE 
          WHEN if.fecha_nacimiento IS NOT NULL 
          THEN YEAR(CURDATE()) - YEAR(if.fecha_nacimiento)
          ELSE NULL 
        END as 'Edad',
        DATE_FORMAT(if.fecha_nacimiento, '%d/%m/%Y') as 'Fecha Nacimiento'
      FROM familias f
      LEFT JOIN zonas z ON f.zona_id = z.id
      LEFT JOIN integrantes_familia if ON f.id = if.familia_id
      ${whereClause}
      ORDER BY f.codigo_unico, 
        CASE if.relacion 
          WHEN 'padre' THEN 1 
          WHEN 'madre' THEN 2 
          ELSE 3 
        END,
        if.fecha_nacimiento DESC
    `, queryParams);

    if (formato === 'excel') {
      const workbook = generarExcel(rows, 'Familias con Integrantes');
      const nombreArchivo = `familias-integrantes-${Date.now()}.xlsx`;
      const filePath = guardarArchivoTemporal(workbook, nombreArchivo);
      
      res.download(filePath, nombreArchivo, (err) => {
        if (!err) {
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        }
      });
    } else {
      res.json({
        success: true,
        data: rows,
        total: rows.length
      });
    }
  } catch (error) {
    console.error('Error al generar reporte de integrantes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Generar reporte general de cajas
router.get('/cajas-general', authenticateToken, async (req, res) => {
  try {
    const { formato = 'json', estado, zona_id } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (estado) {
      whereConditions.push('c.estado = ?');
      queryParams.push(estado);
    }
    
    if (zona_id) {
      whereConditions.push('f.zona_id = ?');
      queryParams.push(zona_id);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(`
      SELECT 
        c.codigo as 'Código Caja',
        f.codigo_unico as 'Código Familia',
        z.nombre as 'Zona',
        f.nombre_padre as 'Nombre Padre',
        f.nombre_madre as 'Nombre Madre',
        f.direccion as 'Dirección Familia',
        CASE c.estado
          WHEN 'disponible' THEN 'Disponible'
          WHEN 'asignada' THEN 'Asignada'
          WHEN 'entregada' THEN 'Entregada'
          WHEN 'devuelta' THEN 'Devuelta'
        END as 'Estado',
        COALESCE(b.nombre, 'Sin asignar') as 'Benefactor',
        COALESCE(b.telefono, '') as 'Teléfono Benefactor',
        DATE_FORMAT(c.fecha_asignacion, '%d/%m/%Y') as 'Fecha Asignación',
        DATE_FORMAT(c.fecha_entrega, '%d/%m/%Y') as 'Fecha Entrega',
        DATE_FORMAT(c.fecha_devolucion, '%d/%m/%Y') as 'Fecha Devolución',
        c.observaciones as 'Observaciones'
      FROM cajas c
      INNER JOIN familias f ON c.familia_id = f.id
      INNER JOIN zonas z ON f.zona_id = z.id
      LEFT JOIN benefactores b ON c.benefactor_id = b.id
      ${whereClause}
      ORDER BY c.codigo
    `, queryParams);

    if (formato === 'excel') {
      const workbook = generarExcel(rows, 'Cajas General');
      const nombreArchivo = `cajas-general-${Date.now()}.xlsx`;
      const filePath = guardarArchivoTemporal(workbook, nombreArchivo);
      
      res.download(filePath, nombreArchivo, (err) => {
        if (!err) {
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        }
      });
    } else {
      res.json({
        success: true,
        data: rows,
        total: rows.length
      });
    }
  } catch (error) {
    console.error('Error al generar reporte de cajas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Generar reporte de servicios e ingresos
router.get('/servicios-ingresos', authenticateToken, async (req, res) => {
  try {
    const { formato = 'json', fecha_desde, fecha_hasta, tipo_servicio } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (fecha_desde) {
      whereConditions.push('DATE(s.fecha_servicio) >= ?');
      queryParams.push(fecha_desde);
    }
    
    if (fecha_hasta) {
      whereConditions.push('DATE(s.fecha_servicio) <= ?');
      queryParams.push(fecha_hasta);
    }
    
    if (tipo_servicio) {
      whereConditions.push('s.tipo_servicio = ?');
      queryParams.push(tipo_servicio);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(`
      SELECT 
        s.numero_comprobante as 'Número Comprobante',
        CASE s.tipo_servicio
          WHEN 'misa' THEN 'Misa'
          WHEN 'bautizo' THEN 'Bautizo'
          WHEN 'matrimonio' THEN 'Matrimonio'
          WHEN 'confirmacion' THEN 'Confirmación'
          WHEN 'primera_comunion' THEN 'Primera Comunión'
          WHEN 'funeral' THEN 'Funeral'
          WHEN 'bendicion' THEN 'Bendición'
          WHEN 'quinceañero' THEN 'Quinceañero'
          ELSE 'Otros'
        END as 'Tipo Servicio',
        DATE_FORMAT(s.fecha_servicio, '%d/%m/%Y') as 'Fecha Servicio',
        s.hora_servicio as 'Hora',
        s.nombre_solicitante as 'Solicitante',
        s.telefono_solicitante as 'Teléfono',
        s.descripcion as 'Descripción',
        COALESCE(s.monto_soles, 0) as 'Monto Soles',
        COALESCE(s.monto_dolares, 0) as 'Monto Dólares',
        CASE s.estado_pago
          WHEN 'pendiente' THEN 'Pendiente'
          WHEN 'pagado' THEN 'Pagado'
          WHEN 'cancelado' THEN 'Cancelado'
        END as 'Estado Pago',
        CASE s.forma_pago
          WHEN 'efectivo' THEN 'Efectivo'
          WHEN 'transferencia' THEN 'Transferencia'
          WHEN 'deposito' THEN 'Depósito'
          WHEN 'yape' THEN 'Yape'
          WHEN 'plin' THEN 'Plin'
          WHEN 'tarjeta' THEN 'Tarjeta'
          ELSE ''
        END as 'Forma Pago',
        s.observaciones as 'Observaciones'
      FROM servicios s
      ${whereClause}
      ORDER BY s.fecha_servicio DESC, s.hora_servicio DESC
    `, queryParams);

    if (formato === 'excel') {
      // Agregar hoja de resumen
      const [resumenRows] = await pool.execute(`
        SELECT 
          COUNT(*) as total_servicios,
          SUM(CASE WHEN estado_pago = 'pagado' THEN monto_soles ELSE 0 END) as total_soles,
          SUM(CASE WHEN estado_pago = 'pagado' THEN monto_dolares ELSE 0 END) as total_dolares,
          COUNT(CASE WHEN estado_pago = 'pagado' THEN 1 END) as servicios_pagados,
          COUNT(CASE WHEN estado_pago = 'pendiente' THEN 1 END) as servicios_pendientes
        FROM servicios s
        ${whereClause}
      `, queryParams);

      const workbook = XLSX.utils.book_new();
      
      // Hoja de datos detallados
      const worksheetDatos = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheetDatos, 'Servicios Detalle');
      
      // Hoja de resumen
      const resumen = [
        { 'Concepto': 'Total Servicios', 'Valor': resumenRows[0].total_servicios },
        { 'Concepto': 'Servicios Pagados', 'Valor': resumenRows[0].servicios_pagados },
        { 'Concepto': 'Servicios Pendientes', 'Valor': resumenRows[0].servicios_pendientes },
        { 'Concepto': 'Total Ingresos Soles', 'Valor': resumenRows[0].total_soles },
        { 'Concepto': 'Total Ingresos Dólares', 'Valor': resumenRows[0].total_dolares }
      ];
      const worksheetResumen = XLSX.utils.json_to_sheet(resumen);
      XLSX.utils.book_append_sheet(workbook, worksheetResumen, 'Resumen');
      
      const nombreArchivo = `servicios-ingresos-${Date.now()}.xlsx`;
      const filePath = guardarArchivoTemporal(workbook, nombreArchivo);
      
      res.download(filePath, nombreArchivo, (err) => {
        if (!err) {
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        }
      });
    } else {
      res.json({
        success: true,
        data: rows,
        total: rows.length
      });
    }
  } catch (error) {
    console.error('Error al generar reporte de servicios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Generar reporte de benefactores
router.get('/benefactores-general', authenticateToken, async (req, res) => {
  try {
    const { formato = 'json', activo } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    
    if (activo !== undefined) {
      whereConditions.push('b.activo = ?');
      queryParams.push(activo === 'true' ? 1 : 0);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(`
      SELECT 
        b.nombre as 'Nombre',
        b.dni as 'DNI',
        b.telefono as 'Teléfono',
        b.email as 'Email',
        b.direccion as 'Dirección',
        CASE WHEN b.activo = 1 THEN 'Activo' ELSE 'Inactivo' END as 'Estado',
        COUNT(c.id) as 'Total Cajas Asignadas',
        COUNT(CASE WHEN c.estado = 'asignada' THEN 1 END) as 'Cajas Asignadas',
        COUNT(CASE WHEN c.estado = 'entregada' THEN 1 END) as 'Cajas Entregadas',
        COUNT(CASE WHEN c.estado = 'devuelta' THEN 1 END) as 'Cajas Devueltas',
        DATE_FORMAT(b.created_at, '%d/%m/%Y') as 'Fecha Registro'
      FROM benefactores b
      LEFT JOIN cajas c ON b.id = c.benefactor_id
      ${whereClause}
      GROUP BY b.id, b.nombre, b.dni, b.telefono, b.email, b.direccion, b.activo, b.created_at
      ORDER BY b.nombre
    `, queryParams);

    if (formato === 'excel') {
      const workbook = generarExcel(rows, 'Benefactores');
      const nombreArchivo = `benefactores-general-${Date.now()}.xlsx`;
      const filePath = guardarArchivoTemporal(workbook, nombreArchivo);
      
      res.download(filePath, nombreArchivo, (err) => {
        if (!err) {
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        }
      });
    } else {
      res.json({
        success: true,
        data: rows,
        total: rows.length
      });
    }
  } catch (error) {
    console.error('Error al generar reporte de benefactores:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Generar resumen ejecutivo (dashboard)
router.get('/dashboard-resumen', authenticateToken, async (req, res) => {
  try {
    const { formato = 'json' } = req.query;

    // Obtener estadísticas generales
    const [familias] = await pool.execute(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN activo = 1 THEN 1 END) as activas
      FROM familias
    `);

    const [integrantes] = await pool.execute(`
      SELECT COUNT(*) as total FROM integrantes_familia
    `);

    const [cajas] = await pool.execute(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN estado = 'disponible' THEN 1 END) as disponibles,
        COUNT(CASE WHEN estado = 'asignada' THEN 1 END) as asignadas,
        COUNT(CASE WHEN estado = 'entregada' THEN 1 END) as entregadas,
        COUNT(CASE WHEN estado = 'devuelta' THEN 1 END) as devueltas
      FROM cajas
    `);

    const [servicios] = await pool.execute(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN estado_pago = 'pagado' THEN 1 END) as pagados,
        SUM(CASE WHEN estado_pago = 'pagado' THEN monto_soles ELSE 0 END) as ingresos_soles,
        SUM(CASE WHEN estado_pago = 'pagado' THEN monto_dolares ELSE 0 END) as ingresos_dolares
      FROM servicios
    `);

    const [benefactores] = await pool.execute(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN activo = 1 THEN 1 END) as activos
      FROM benefactores
    `);

    const resumen = [
      { 'Módulo': 'Familias', 'Total': familias[0].total, 'Activos': familias[0].activas, 'Observaciones': 'Familias registradas en el sistema' },
      { 'Módulo': 'Integrantes', 'Total': integrantes[0].total, 'Activos': integrantes[0].total, 'Observaciones': 'Miembros de familias registrados' },
      { 'Módulo': 'Cajas del Amor', 'Total': cajas[0].total, 'Activos': cajas[0].total - cajas[0].disponibles, 'Observaciones': `Disponibles: ${cajas[0].disponibles}, Asignadas: ${cajas[0].asignadas}` },
      { 'Módulo': 'Servicios', 'Total': servicios[0].total, 'Activos': servicios[0].pagados, 'Observaciones': `Ingresos: S/${servicios[0].ingresos_soles} - $${servicios[0].ingresos_dolares}` },
      { 'Módulo': 'Benefactores', 'Total': benefactores[0].total, 'Activos': benefactores[0].activos, 'Observaciones': 'Personas que apoyan con cajas' }
    ];

    if (formato === 'excel') {
      const workbook = generarExcel(resumen, 'Resumen Ejecutivo');
      const nombreArchivo = `dashboard-resumen-${Date.now()}.xlsx`;
      const filePath = guardarArchivoTemporal(workbook, nombreArchivo);
      
      res.download(filePath, nombreArchivo, (err) => {
        if (!err) {
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          resumen: resumen,
          estadisticas: {
            familias: familias[0],
            integrantes: integrantes[0],
            cajas: cajas[0],
            servicios: servicios[0],
            benefactores: benefactores[0]
          }
        }
      });
    }
  } catch (error) {
    console.error('Error al generar resumen ejecutivo:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;

