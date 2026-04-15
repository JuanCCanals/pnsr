// backend/routes/backup.js
// Compatible con: Docker (Windows/Linux) y mysqldump nativo (Linux VPS)
const express = require('express');
const router = express.Router();
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');
const pool = require('../config/db');

// Carpeta donde se guardan los backups
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ============================================================
// AUTO-DETECCIÓN DE ENTORNO (Docker vs nativo)
// ============================================================
// Prioridad:
//   1. Si .env tiene BACKUP_MODE=docker o BACKUP_MODE=native → usar eso
//   2. Si .env tiene DOCKER_DB_CONTAINER → usar Docker
//   3. Detectar si mysqldump nativo existe → usarlo
//   4. Detectar si Docker + contenedor existen → usarlo
//   5. Fallar con mensaje claro

function detectBackupStrategy() {
  const envMode = (process.env.BACKUP_MODE || '').toLowerCase();
  const envContainer = process.env.DOCKER_DB_CONTAINER || '';

  // 1. Modo forzado por .env
  if (envMode === 'native') {
    const bin = findNativeMysqldump();
    if (bin) {
      console.log(`📦 Backup: modo NATIVO forzado → ${bin}`);
      return { mode: 'native', bin };
    }
    console.warn('⚠️ BACKUP_MODE=native pero no se encontró mysqldump');
  }

  if (envMode === 'docker') {
    const container = envContainer || 'compipro-erp-mariadb-1';
    console.log(`📦 Backup: modo DOCKER forzado → contenedor ${container}`);
    return { mode: 'docker', container };
  }

  // 2. Si hay DOCKER_DB_CONTAINER definido, usar Docker
  if (envContainer) {
    console.log(`📦 Backup: modo DOCKER (DOCKER_DB_CONTAINER=${envContainer})`);
    return { mode: 'docker', container: envContainer };
  }

  // 3. Detectar mysqldump nativo
  const nativeBin = findNativeMysqldump();
  if (nativeBin) {
    console.log(`📦 Backup: modo NATIVO auto-detectado → ${nativeBin}`);
    return { mode: 'native', bin: nativeBin };
  }

  // 4. Detectar Docker + contenedor por defecto
  if (isDockerAvailable()) {
    const container = 'compipro-erp-mariadb-1';
    console.log(`📦 Backup: modo DOCKER auto-detectado → contenedor ${container}`);
    return { mode: 'docker', container };
  }

  // 5. Nada encontrado
  console.warn('⚠️ Backup: no se detectó mysqldump ni Docker. Configure BACKUP_MODE en .env');
  return { mode: 'none' };
}

function findNativeMysqldump() {
  try {
    // En Linux: which mysqldump
    // En Windows: where mysqldump
    const cmd = process.platform === 'win32' ? 'where mysqldump' : 'which mysqldump';
    const result = execSync(cmd, { timeout: 3000, encoding: 'utf-8' }).trim().split('\n')[0];
    if (result && fs.existsSync(result.trim())) return result.trim();
  } catch (e) { /* no encontrado */ }

  // Buscar en rutas comunes de Windows
  if (process.platform === 'win32') {
    const paths = [
      'C:\\xampp\\mysql\\bin\\mysqldump.exe',
      'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
      'C:\\Program Files\\MariaDB 12.1\\bin\\mysqldump.exe',
      'C:\\Archivos de programa\\MariaDB 12.1\\bin\\mysqldump.exe',
      'C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysqldump.exe',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

function isDockerAvailable() {
  try {
    execSync('docker info', { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

const STRATEGY = detectBackupStrategy();
console.log(`📁 Carpeta backups: ${BACKUP_DIR}`);

// ============================================================
// Función para ejecutar mysqldump según la estrategia detectada
// ============================================================
function runMysqldump(filePath) {
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'pnsr_db';
  const dbHost = process.env.DB_HOST || 'localhost';

  return new Promise((resolve, reject) => {
    if (STRATEGY.mode === 'none') {
      return reject(new Error(
        'No se encontró mysqldump ni Docker. Configure en .env:\n' +
        '  BACKUP_MODE=native (si mysqldump está instalado)\n' +
        '  BACKUP_MODE=docker + DOCKER_DB_CONTAINER=nombre (si usa Docker)'
      ));
    }

    let proc;

    if (STRATEGY.mode === 'docker') {
      // Docker: exec dentro del contenedor (host siempre es localhost dentro del container)
      proc = spawn('docker', [
        'exec', STRATEGY.container,
        'mysqldump',
        '-u', dbUser,
        `-p${dbPass}`,
        '--single-transaction',
        '--routines',
        '--triggers',
        '--add-drop-table',
        dbName
      ], { windowsHide: true });
    } else {
      // Nativo: ejecutar mysqldump directo
      const args = [
        '-h', dbHost,
        '-u', dbUser,
        '--single-transaction',
        '--routines',
        '--triggers',
        '--add-drop-table',
        dbName
      ];
      if (dbPass) args.splice(4, 0, `-p${dbPass}`);

      proc = spawn(STRATEGY.bin, args, { windowsHide: true });
    }

    const outStream = fs.createWriteStream(filePath);
    proc.stdout.pipe(outStream);

    let stderrData = '';
    proc.stderr.on('data', (chunk) => { stderrData += chunk.toString(); });

    proc.on('close', (code) => {
      outStream.end(() => {
        if (code === 0) {
          const size = fs.statSync(filePath).size;
          if (size === 0) {
            fs.unlinkSync(filePath);
            reject(new Error(`mysqldump generó archivo vacío. stderr: ${stderrData}`));
          } else {
            resolve();
          }
        } else {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          reject(new Error(`mysqldump falló (code ${code}): ${stderrData}`));
        }
      });
    });

    proc.on('error', (err) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (err.code === 'ENOENT') {
        const hint = STRATEGY.mode === 'docker'
          ? 'No se encontró Docker. Verifique que Docker Desktop esté corriendo.'
          : `No se encontró mysqldump en: ${STRATEGY.bin}`;
        reject(new Error(hint));
      } else {
        reject(err);
      }
    });
  });
}

// ============================================================
// GET /api/backup/list — Listar backups existentes
// ============================================================
router.get('/list', authenticateToken, authorizePermission('configuracion.leer'), async (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          nombre: f,
          tamano: stats.size,
          fecha: stats.mtime,
        };
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json({ success: true, data: files });
  } catch (error) {
    console.error('Error listando backups:', error);
    res.status(500).json({ success: false, error: 'Error al listar backups' });
  }
});

// ============================================================
// POST /api/backup/create — Crear un backup nuevo
// ============================================================
router.post('/create', authenticateToken, authorizePermission('configuracion.actualizar'), async (req, res) => {
  try {
    const dbName = process.env.DB_NAME || 'pnsr_db';

    // Nombre con timestamp
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const fileName = `backup_${dbName}_${ts}.sql`;
    const filePath = path.join(BACKUP_DIR, fileName);

    await runMysqldump(filePath);

    const stats = fs.statSync(filePath);

    // Auto-limpieza
    autoCleanBackups();

    res.json({
      success: true,
      message: 'Backup creado exitosamente',
      data: {
        nombre: fileName,
        tamano: stats.size,
        fecha: stats.mtime,
      }
    });
  } catch (error) {
    console.error('Error creando backup:', error);
    res.status(500).json({ success: false, error: `Error al crear backup: ${error.message}` });
  }
});

// ============================================================
// GET /api/backup/download/:nombre — Descargar un backup
// ============================================================
router.get('/download/:nombre', authenticateToken, authorizePermission('configuracion.leer'), (req, res) => {
  try {
    const { nombre } = req.params;

    if (!/^backup_[\w-]+\.sql(\.gz)?$/.test(nombre)) {
      return res.status(400).json({ success: false, error: 'Nombre de archivo inválido' });
    }

    const filePath = path.join(BACKUP_DIR, nombre);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Backup no encontrado' });
    }

    res.download(filePath, nombre);
  } catch (error) {
    console.error('Error descargando backup:', error);
    res.status(500).json({ success: false, error: 'Error al descargar backup' });
  }
});

// ============================================================
// DELETE /api/backup/:nombre — Eliminar un backup
// ============================================================
router.delete('/:nombre', authenticateToken, authorizePermission('configuracion.actualizar'), (req, res) => {
  try {
    const { nombre } = req.params;

    if (!/^backup_[\w-]+\.sql(\.gz)?$/.test(nombre)) {
      return res.status(400).json({ success: false, error: 'Nombre de archivo inválido' });
    }

    const filePath = path.join(BACKUP_DIR, nombre);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Backup no encontrado' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Backup eliminado' });
  } catch (error) {
    console.error('Error eliminando backup:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar backup' });
  }
});

// ============================================================
// Función para restaurar un backup según la estrategia detectada
// ============================================================
function runMysqlRestore(filePath) {
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'pnsr_db';
  const dbHost = process.env.DB_HOST || 'localhost';

  return new Promise((resolve, reject) => {
    if (STRATEGY.mode === 'none') {
      return reject(new Error('No se encontró mysql ni Docker. Configure BACKUP_MODE en .env'));
    }

    let proc;

    if (STRATEGY.mode === 'docker') {
      // Docker: docker exec -i <container> mysql -u root -p... dbname < archivo
      proc = spawn('docker', [
        'exec', '-i', STRATEGY.container,
        'mysql',
        '-u', dbUser,
        `-p${dbPass}`,
        dbName
      ], { windowsHide: true });
    } else {
      // Nativo: mysql -h host -u user -p... dbname < archivo
      const mysqlBin = STRATEGY.bin.replace('mysqldump', 'mysql');
      const args = ['-h', dbHost, '-u', dbUser, dbName];
      if (dbPass) args.splice(4, 0, `-p${dbPass}`);
      proc = spawn(mysqlBin, args, { windowsHide: true });
    }

    // Pipe el archivo .sql al stdin de mysql
    const inStream = fs.createReadStream(filePath);
    inStream.pipe(proc.stdin);

    let stderrData = '';
    proc.stderr.on('data', (chunk) => { stderrData += chunk.toString(); });

    inStream.on('error', (err) => {
      reject(new Error(`Error leyendo archivo de backup: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mysql restore falló (code ${code}): ${stderrData}`));
      }
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        const hint = STRATEGY.mode === 'docker'
          ? 'No se encontró Docker. Verifique que Docker Desktop esté corriendo.'
          : 'No se encontró el cliente mysql.';
        reject(new Error(hint));
      } else {
        reject(err);
      }
    });
  });
}

// ============================================================
// POST /api/backup/restore/:nombre — Restaurar un backup
// ============================================================
router.post('/restore/:nombre', authenticateToken, authorizePermission('configuracion.actualizar'), async (req, res) => {
  try {
    const { nombre } = req.params;

    if (!/^backup_[\w-]+\.sql(\.gz)?$/.test(nombre)) {
      return res.status(400).json({ success: false, error: 'Nombre de archivo inválido' });
    }

    const filePath = path.join(BACKUP_DIR, nombre);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Backup no encontrado' });
    }

    // 1. Crear backup de seguridad antes de restaurar
    const dbName = process.env.DB_NAME || 'pnsr_db';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const safetyFileName = `backup_${dbName}_pre-restore_${ts}.sql`;
    const safetyFilePath = path.join(BACKUP_DIR, safetyFileName);

    console.log(`🔒 Creando backup de seguridad antes de restaurar: ${safetyFileName}`);
    await runMysqldump(safetyFilePath);
    console.log(`✅ Backup de seguridad creado (${fs.statSync(safetyFilePath).size} bytes)`);

    // 2. Restaurar el backup seleccionado
    console.log(`🔄 Restaurando backup: ${nombre}`);
    await runMysqlRestore(filePath);
    console.log(`✅ Backup restaurado exitosamente`);

    res.json({
      success: true,
      message: `Base de datos restaurada exitosamente desde "${nombre}"`,
      data: {
        backup_seguridad: safetyFileName,
      }
    });
  } catch (error) {
    console.error('Error restaurando backup:', error);
    res.status(500).json({ success: false, error: `Error al restaurar: ${error.message}` });
  }
});

// ============================================================
// Auto-limpieza: mantener solo los últimos N backups
// ============================================================
function autoCleanBackups(maxBackups = 10) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
      .map(f => ({
        nombre: f,
        fecha: fs.statSync(path.join(BACKUP_DIR, f)).mtime,
      }))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (files.length > maxBackups) {
      const toDelete = files.slice(maxBackups);
      toDelete.forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f.nombre));
        console.log(`🗑️ Backup antiguo eliminado: ${f.nombre}`);
      });
    }
  } catch (err) {
    console.error('Error en auto-limpieza de backups:', err);
  }
}

// ============================================================
// PURGAR TABLAS — Limpieza selectiva de datos transaccionales
// ============================================================

// Grupos de tablas permitidos para purga (solo transaccionales, nunca catálogos)
const PURGE_GROUPS = [
  // ─── CAJAS DEL AMOR ───
  {
    id: 'cajas_amor',
    label: '🎁 Cajas del Amor (ventas, cajas, pagos)',
    description: 'Elimina ventas, ventas_cajas, ventas_pagos y todas las cajas',
    tables: ['ventas_pagos', 'ventas_cajas', 'ventas', 'cajas'],
  },
  {
    id: 'familias',
    label: '🎁 Familias, Integrantes y Zonas',
    description: 'Limpia familias, integrantes_familia y zonas (Cajas del Amor)',
    tables: ['integrantes_familia', 'familias', 'zonas'],
  },
  {
    id: 'benefactores',
    label: '🎁 Benefactores',
    description: 'Limpia la tabla de benefactores (Cajas del Amor)',
    tables: ['benefactores'],
  },
  {
    id: 'excedentes',
    label: '🎁 Excedentes',
    description: 'Limpia la tabla de excedentes (Cajas del Amor)',
    tables: ['excedentes'],
  },
  {
    id: 'donaciones_fisicas',
    label: '🎁 Donaciones Físicas',
    description: 'Limpia la tabla de donaciones físicas (Cajas del Amor)',
    tables: ['donaciones_fisicas'],
  },
  // ─── SERVICIOS PARROQUIALES ───
  {
    id: 'servicios',
    label: '⛪ Servicios Parroquiales',
    description: 'Limpia servicios, cobros de servicios, cobro_servicios y comprobantes',
    tables: ['cobro_servicios', 'cobros_pagos', 'comprobantes', 'cobros', 'servicios'],
  },
  {
    id: 'clientes',
    label: '⛪ Clientes (feligreses)',
    description: 'Limpia la tabla de clientes / feligreses (Servicios)',
    tables: ['clientes'],
  },
];

// GET /api/backup/purge-groups — Listar grupos disponibles para purga
router.get('/purge-groups', authenticateToken, authorizePermission('configuracion.leer'), (req, res) => {
  const groups = PURGE_GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    description: g.description,
  }));
  res.json({ success: true, data: groups });
});

// POST /api/backup/purge — Purgar tablas seleccionadas
router.post('/purge', authenticateToken, authorizePermission('configuracion.actualizar'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { groups: selectedIds } = req.body;

    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Seleccione al menos un grupo de tablas' });
    }

    // Validar que los IDs sean válidos
    const validGroups = selectedIds
      .map(id => PURGE_GROUPS.find(g => g.id === id))
      .filter(Boolean);

    if (validGroups.length === 0) {
      return res.status(400).json({ success: false, error: 'Ningún grupo seleccionado es válido' });
    }

    // 1) Crear backup de seguridad antes de purgar
    const dbName = process.env.DB_NAME || 'pnsr_db';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const safetyFileName = `backup_${dbName}_pre-purge_${ts}.sql`;
    const safetyFilePath = path.join(BACKUP_DIR, safetyFileName);

    console.log(`🔒 Creando backup de seguridad antes de purgar: ${safetyFileName}`);
    await runMysqldump(safetyFilePath);
    console.log(`✅ Backup de seguridad creado`);

    // 2) Purgar tablas dentro de transacción
    await conn.beginTransaction();
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

    const purgedTables = [];
    const details = [];

    for (const group of validGroups) {
      // Truncar tablas del grupo
      for (const table of group.tables) {
        try {
          const [countResult] = await conn.execute(`SELECT COUNT(*) as total FROM ${table}`);
          const count = countResult[0]?.total || 0;
          await conn.execute(`TRUNCATE TABLE ${table}`);
          purgedTables.push(table);
          details.push(`${table}: ${count} registros eliminados`);
          console.log(`🗑️ Purgada: ${table} (${count} registros)`);
        } catch (err) {
          console.warn(`⚠️ Error purgando ${table}: ${err.message}`);
          details.push(`${table}: ERROR - ${err.message}`);
        }
      }
    }

    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();

    res.json({
      success: true,
      message: `Purga completada: ${purgedTables.length} tabla(s) limpiada(s)`,
      data: {
        backup_seguridad: safetyFileName,
        tables_purged: purgedTables,
        details,
      }
    });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('Error en purga:', error);
    res.status(500).json({ success: false, error: `Error al purgar: ${error.message}` });
  } finally {
    try { await conn.execute('SET FOREIGN_KEY_CHECKS = 1'); } catch(e) {}
    conn.release();
  }
});

module.exports = router;
