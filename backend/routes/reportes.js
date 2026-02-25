/**
 * Reportes unificados — CAJAS DEL AMOR + SERVICIOS PARROQUIALES
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const authenticateToken   = require('../middlewares/auth');
const authorizePermission = require('../middlewares/authorizePermission');

const mapEstado = (e) => {
  const M = { disponible:'Disponible', asignada:'Asignada', entregada:'Entregada a Benefactor', devuelta:'Devuelta por Benefactor', entregada_familia:'Entregada a Familia' };
  return M[String(e).toLowerCase()] || e || 'Disponible';
};

// ══════════════ 1. SEGUIMIENTO DE CAJAS ══════════════
router.get('/seguimiento-cajas', authenticateToken, authorizePermission('reportes'), async (req, res) => {
  try {
    const codigo = (req.query.codigo || '').trim();
    const zona_id = (req.query.zona_id || '').trim();
    const estado = (req.query.estado || '').trim();
    const w = []; const a = [];
    if (codigo)  { w.push(`(c.codigo LIKE ? OR f.codigo_unico LIKE ?)`); a.push(`%${codigo}%`,`%${codigo}%`); }
    if (zona_id) { w.push(`f.zona_id = ?`); a.push(zona_id); }
    if (estado)  { w.push(`c.estado = ?`);  a.push(estado); }
    const wSQL = w.length ? `WHERE ${w.join(' AND ')}` : '';
    const [rows] = await pool.query(`
      SELECT c.codigo AS codigo_caja, f.codigo_unico AS familia, c.estado,
        z.nombre AS zona, c.fecha_devolucion,
        b.nombre AS benefactor_nombre, b.telefono AS benefactor_telefono, b.email AS benefactor_email
      FROM cajas c
      LEFT JOIN familias f ON f.id=c.familia_id LEFT JOIN zonas z ON z.id=f.zona_id
      LEFT JOIN benefactores b ON b.id=c.benefactor_id ${wSQL} ORDER BY c.codigo`, a);
    rows.forEach(r => { r.estado_texto = mapEstado(r.estado); });
    const [zonas] = await pool.query(`SELECT id, nombre FROM zonas ORDER BY nombre`);
    res.json({ success:true, data:rows, zonas });
  } catch(e) { console.error(e); res.status(500).json({success:false,error:'Error interno'}); }
});

// ══════════════ 2. BENEFICIADOS ══════════════
router.get('/beneficiados', authenticateToken, authorizePermission('reportes'), async (req, res) => {
  try {
    const [famData] = await pool.query(`
      SELECT f.id, f.codigo_unico, f.nombre_padre, f.nombre_madre, z.nombre AS zona,
        COUNT(i.id) AS total_integrantes,
        MAX(CASE WHEN c.estado IN ('entregada','devuelta','entregada_familia','asignada') THEN 1 ELSE 0 END) AS asignada
      FROM familias f LEFT JOIN integrantes_familia i ON i.familia_id=f.id
      LEFT JOIN cajas c ON c.familia_id=f.id LEFT JOIN zonas z ON z.id=f.zona_id
      WHERE f.activo=1 GROUP BY f.id,f.codigo_unico,f.nombre_padre,f.nombre_madre,z.nombre`);
    let c5t=0,c5a=0,cm5t=0,cm5a=0;
    const famRows = famData.map(f => {
      const g = f.total_integrantes>=5?'5+ miembros':'Menos de 5';
      if(f.total_integrantes>=5){c5t++;if(f.asignada)c5a++;}else{cm5t++;if(f.asignada)cm5a++;}
      return {codigo:f.codigo_unico,titular:f.nombre_padre||f.nombre_madre||'',zona:f.zona||'',integrantes:f.total_integrantes,grupo:g,asignada:f.asignada?'Sí':'No'};
    });
    const [[{familias_sin_dependientes}]] = await pool.query(`
      SELECT COUNT(*) AS familias_sin_dependientes FROM familias f WHERE f.activo=1
      AND f.id NOT IN (SELECT DISTINCT i.familia_id FROM integrantes_familia i
        WHERE i.relacion NOT IN ('padre','madre') AND (
          (i.fecha_nacimiento IS NOT NULL AND TIMESTAMPDIFF(MONTH,i.fecha_nacimiento,CURDATE()) BETWEEN 1 AND 156)
          OR (i.edad_texto IS NOT NULL AND i.edad_texto!='')))`);
    const [childRows] = await pool.query(`
      SELECT i.id,i.nombre,i.sexo,i.fecha_nacimiento,i.edad_texto,f.codigo_unico AS familia,z.nombre AS zona,
        MAX(CASE WHEN c.estado IN ('entregada','devuelta','entregada_familia','asignada') THEN 'Asignado' ELSE 'Disponible' END) AS estado_caja
      FROM integrantes_familia i JOIN familias f ON f.id=i.familia_id AND f.activo=1
      LEFT JOIN cajas c ON c.familia_id=f.id LEFT JOIN zonas z ON z.id=f.zona_id
      WHERE i.relacion NOT IN ('padre','madre')
      GROUP BY i.id,i.nombre,i.sexo,i.fecha_nacimiento,i.edad_texto,f.codigo_unico,z.nombre`);
    const getEdad = (r) => {
      if(r.edad_texto&&String(r.edad_texto).trim()){
        const t=String(r.edad_texto).trim().toLowerCase();
        const m=t.match(/^(\d+)\s*m/i); if(m) return parseInt(m[1])/12;
        const n=t.match(/^(\d+)$/); if(n) return parseInt(n[1]);
        if(t==='rn') return 0; return null;
      }
      if(r.fecha_nacimiento){const b=new Date(r.fecha_nacimiento),n=new Date();let a=n.getFullYear()-b.getFullYear();const md=n.getMonth()-b.getMonth();if(md<0||(md===0&&n.getDate()<b.getDate()))a--;return Math.max(0,a);}
      return null;
    };
    const rangos=[{label:'0-3 años',min:0,max:3},{label:'4-6 años',min:4,max:6},{label:'7-9 años',min:7,max:9},{label:'10-13 años',min:10,max:13}];
    const ninos=rangos.map(r=>({rango:r.label,total:0,asignados:0,disponibles:0}));
    const ninas=rangos.map(r=>({rango:r.label,total:0,asignados:0,disponibles:0}));
    const childDetail=[];
    childRows.forEach(row=>{const edad=getEdad(row);if(edad===null||edad>13)return;const sx=String(row.sexo).toUpperCase();const arr=sx==='F'?ninas:ninos;let rl='';
      rangos.forEach((r,i)=>{if(edad>=r.min&&edad<=r.max){arr[i].total++;if(row.estado_caja==='Asignado')arr[i].asignados++;else arr[i].disponibles++;rl=r.label;}});
      if(rl)childDetail.push({nombre:row.nombre,sexo:sx==='F'?'Femenino':'Masculino',edad:row.edad_texto||(row.fecha_nacimiento?Math.floor(edad):''),rango:rl,familia:row.familia,zona:row.zona||'',estado:row.estado_caja});
    });
    res.json({success:true,data:{cards:{cinco_o_mas:{total:c5t,asignadas:c5a},menos_de_cinco:{total:cm5t,asignadas:cm5a},sin_dependientes_1m_13a:familias_sin_dependientes},ninos,ninas,familias_rows:famRows,ninos_detalle:childDetail}});
  } catch(e){console.error(e);res.status(500).json({success:false,error:'Error interno'});}
});

// ══════════════ 3. REPORTE GENERAL ══════════════
router.get('/general', authenticateToken, authorizePermission('reportes'), async (req, res) => {
  try {
    const [[{total_familias}]]=await pool.query(`SELECT COUNT(*) AS total_familias FROM familias WHERE activo=1`);
    const [[{total_personas}]]=await pool.query(`SELECT COUNT(*) AS total_personas FROM integrantes_familia i JOIN familias f ON f.id=i.familia_id AND f.activo=1`);
    const [[{familias_asignadas}]]=await pool.query(`SELECT COUNT(DISTINCT f.id) AS familias_asignadas FROM familias f JOIN cajas c ON c.familia_id=f.id WHERE f.activo=1 AND c.estado IN ('entregada','devuelta','entregada_familia','asignada')`);
    const [[{total_cajas}]]=await pool.query(`SELECT COUNT(*) AS total_cajas FROM cajas`);
    const [[{cajas_vendidas}]]=await pool.query(`SELECT COUNT(*) AS cajas_vendidas FROM cajas WHERE estado IN ('entregada','devuelta','entregada_familia','asignada')`);
    const [[{cajas_devueltas}]]=await pool.query(`SELECT COUNT(*) AS cajas_devueltas FROM cajas WHERE estado IN ('devuelta','entregada_familia')`);
    const [[{dinero_ingresado}]]=await pool.query(`SELECT COALESCE(SUM(v.monto),0) AS dinero_ingresado FROM ventas v`);
    const pv=total_cajas>0?((cajas_vendidas/total_cajas)*100).toFixed(1):'0.0';
    const pd=cajas_vendidas>0?((cajas_devueltas/cajas_vendidas)*100).toFixed(1):'0.0';
    const [famRows]=await pool.query(`
      SELECT f.codigo_unico AS codigo, COALESCE(NULLIF(f.nombre_padre,''),f.nombre_madre) AS titular,
        z.nombre AS zona, COUNT(DISTINCT i.id) AS integrantes,
        COALESCE(c.estado,'sin_caja') AS estado_caja, b.nombre AS benefactor
      FROM familias f LEFT JOIN zonas z ON z.id=f.zona_id LEFT JOIN integrantes_familia i ON i.familia_id=f.id
      LEFT JOIN cajas c ON c.familia_id=f.id LEFT JOIN benefactores b ON b.id=c.benefactor_id
      WHERE f.activo=1 GROUP BY f.id,f.codigo_unico,f.nombre_padre,f.nombre_madre,z.nombre,c.estado,b.nombre ORDER BY f.codigo_unico`);
    famRows.forEach(r=>{r.estado_texto=r.estado_caja==='sin_caja'?'Sin caja':mapEstado(r.estado_caja);});
    res.json({success:true,data:{cards:{total_familias,total_personas,familias_asignadas,total_cajas,cajas_vendidas,pct_vendidas:Number(pv),cajas_devueltas,pct_devueltas:Number(pd),dinero_ingresado:Number(dinero_ingresado)},familias:famRows}});
  } catch(e){console.error(e);res.status(500).json({success:false,error:'Error interno'});}
});

// ══════════════ 4. SERVICIOS PARROQUIALES ══════════════
router.get('/servicios', authenticateToken, authorizePermission('reportes'), async (req, res) => {
  try {
    const tipo=(req.query.tipo_servicio_id||'').trim(), estado=(req.query.estado||'').trim();
    const desde=(req.query.desde||'').trim(), hasta=(req.query.hasta||'').trim();
    const w=[],a=[];
    if(tipo){w.push(`s.tipo_servicio_id=?`);a.push(tipo);}
    if(estado){w.push(`s.estado=?`);a.push(estado);}
    if(desde){w.push(`s.fecha_servicio>=?`);a.push(desde);}
    if(hasta){w.push(`s.fecha_servicio<=?`);a.push(hasta);}
    const wSQL=w.length?`WHERE ${w.join(' AND ')}`:'';
    const [rows]=await pool.query(`
      SELECT s.id, ts.nombre AS tipo_servicio, s.fecha_servicio, s.hora_servicio,
        s.descripcion, s.precio, s.estado, s.observaciones,
        cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono
      FROM servicios s LEFT JOIN tipos_servicio ts ON ts.id=s.tipo_servicio_id
      LEFT JOIN benefactores cl ON cl.id=s.cliente_id ${wSQL}
      ORDER BY s.fecha_servicio DESC, s.id DESC`, a);
    const [tipos]=await pool.query(`SELECT id,nombre FROM tipos_servicio WHERE activo=1 ORDER BY nombre`);
    res.json({success:true,data:rows,tipos});
  } catch(e){console.error(e);res.status(500).json({success:false,error:'Error interno'});}
});

// ══════════════ 5. COBROS / INGRESOS ══════════════
router.get('/cobros', authenticateToken, authorizePermission('reportes'), async (req, res) => {
  try {
    const desde=(req.query.desde||'').trim(), hasta=(req.query.hasta||'').trim();
    const metodo=(req.query.metodo_pago_id||'').trim();
    const w=[],a=[];
    if(desde){w.push(`co.fecha_cobro>=?`);a.push(desde);}
    if(hasta){w.push(`co.fecha_cobro<=?`);a.push(hasta);}
    if(metodo){w.push(`co.metodo_pago_id=?`);a.push(metodo);}
    const wSQL=w.length?`WHERE ${w.join(' AND ')}`:'';
    const [rows]=await pool.query(`
      SELECT co.id, co.concepto, co.monto, co.fecha_cobro, co.numero_comprobante, co.observaciones,
        mp.nombre AS metodo_pago, ts.nombre AS tipo_servicio, s.fecha_servicio, s.hora_servicio,
        s.descripcion AS descripcion_servicio, cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono,
        co.servicio_nombre_temp
      FROM cobros co LEFT JOIN servicios s ON s.id=co.servicio_id
      LEFT JOIN tipos_servicio ts ON ts.id=s.tipo_servicio_id
      LEFT JOIN benefactores cl ON cl.id=co.cliente_id
      LEFT JOIN metodos_pago mp ON mp.id=co.metodo_pago_id ${wSQL}
      ORDER BY co.fecha_cobro DESC, co.id DESC`, a);
    const total=rows.reduce((s,r)=>s+Number(r.monto||0),0);
    const [metodos]=await pool.query(`SELECT id,nombre FROM metodos_pago ORDER BY nombre`);
    res.json({success:true,data:rows,total,metodos});
  } catch(e){console.error(e);res.status(500).json({success:false,error:'Error interno'});}
});

module.exports = router;
