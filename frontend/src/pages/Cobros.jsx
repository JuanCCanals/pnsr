// frontend/src/pages/Cobros.jsx
import React, { useState, useEffect } from 'react';
import { cobrosService, metodoPagoService, catalogosService, ventasService } from '../services/api';
import { consultarDNI } from '../services/dniService'; // â† AGREGAR ESTA LÃNEA
import { useAuth } from '../contexts/AuthContext';

// ========== HELPERS HTTP (solo fetch + JWT) ==========

function printTicket80(cobro) {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Ticket</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { font-family: Arial, sans-serif; }
  .t { width: 100%; font-size: 11px; }
  .hdr { text-align:center; font-weight:700; font-size:12px; margin-bottom:6px; }
  .sep { border-top:1px solid #000; margin:6px 0; }
  .row { display:flex; justify-content:space-between; }
  .right { text-align:right; }
  .mt4 { margin-top:4px; }
</style>
</head>
<body>
  <div class="t">
    <div class="hdr">PARROQUIA N.S. DE LA RECONCILIACIÓN</div>
    <div style="text-align:center; font-size:10px;">RUC: 20387535684</div>
    <div style="text-align:center; font-size:10px;">Jr. Los Pinos 291, Urb. Camacho, La Molina</div>
    <div class="sep"></div>
    <div style="text-align:center">N° TICKET: ${cobro.numero_comprobante}</div>
    <div style="text-align:center">
      FECHA: ${new Date(cobro.fecha_cobro || Date.now()).toLocaleDateString('es-PE')}
      &nbsp;&nbsp;HORA: ${new Date(cobro.fecha_cobro || Date.now()).toLocaleTimeString('es-PE')}
    </div>
    <div class="sep"></div>

    <div><b>FELIGRÉS:</b> ${cobro.cliente_nombre || '—'}</div>
    <div><b>DNI:</b> ${cobro.cliente_dni || '—'}</div>

    <div class="mt4"><b>ITEM</b></div>
    <div class="row"><div>${cobro.concepto || 'Servicio'}</div><div class="right">S/ ${(Number(cobro.monto)||0).toFixed(2)}</div></div>
    <div class="sep"></div>
    <div class="row"><div><b>TOTAL</b></div><div class="right"><b>S/ ${(Number(cobro.monto)||0).toFixed(2)}</b></div></div>
    <div class="mt4">PAGO: ${cobro.metodo_pago || ''}</div>
  </div>
  <script>window.onload = () => { window.print(); setTimeout(()=>window.close(), 300); };</script>
</body>
</html>`;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
}


// Crea o devuelve el cliente por nombre y opcional DNI
async function ensureCliente(nombre, dni = '', telefono = '', email = '') {
  const data = await cobrosService.ensureCliente(nombre, dni, telefono, email);
  if (!data?.success) throw new Error(data?.error || 'No se pudo asegurar cliente');
  return data.data.id; // cliente_id
}



async function httpGet(url) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function httpJSON(url, method, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return res.json();
}

// Listado con filtros/paginación
async function listarServicios({ search='', tipo_servicio_id='', estado='', desde='', hasta='', page=1, limit=20 }) {
  const params = new URLSearchParams({
    search, tipo_servicio_id, estado, desde, hasta, page, limit
  });
  return httpGet(`/api/servicios?${params.toString()}`);
}

// Crear / Actualizar / Eliminar
async function crearServicio(payload) {
  return httpJSON('/api/servicios', 'POST', payload);
}

async function actualizarServicio(id, cambios) {
  return httpJSON(`/api/servicios/${id}`, 'PUT', cambios);
}

async function eliminarServicio(id) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/servicios/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

// Construye el payload que espera el backend (mapea campos viejos → nuevos)
function buildServicioPayload(formData, tiposServicio) {
  const tipoId = Number(formData.tipo_servicio_id || formData.tipo_servicio || '');
  const precio =
    formData.precio === '' || formData.precio == null
      ? (tiposServicio.find(t => String(t.value) === String(tipoId))?.precio_base ?? null)
      : Number(formData.precio);

  return {
    tipo_servicio_id: tipoId,
    cliente_id: Number(formData.cliente_id),   // 👈 viene resuelto por ensureCliente()
    fecha_servicio: formData.fecha_servicio,
    hora_servicio: formData.hora_servicio || null,
    precio,
    estado: formData.estado || 'programado',
    observaciones: formData.observaciones || null,
    forma_pago: formData.forma_pago || null,
    fecha_operacion: formData.forma_pago && formData.forma_pago !== 'efectivo' ? (formData.fecha_operacion || null) : null,
    hora_operacion: formData.forma_pago && formData.forma_pago !== 'efectivo' ? (formData.hora_operacion || null) : null,
    nro_operacion: formData.forma_pago && formData.forma_pago !== 'efectivo' ? (formData.nro_operacion || null) : null,
    obs_operacion: formData.forma_pago && formData.forma_pago !== 'efectivo' ? (formData.obs_operacion || null) : null
  };
}



// Acciones: marcar pagado / cancelar
async function marcarRealizado(id) {
  return httpJSON(`/api/servicios/${id}/marcar-realizado`, 'POST', {});
}

async function cancelarServicio(id, { observaciones } = {}) {
  return httpJSON(`/api/servicios/${id}/cancelar`, 'POST', { observaciones });
}

// Config + Stats
async function getTiposServicio() {
  return httpGet('/api/servicios/config/tipos');
}
async function getFormasPagoConfig() {
  return httpGet('/api/servicios/config/formas-pago');
}
async function getStatsServicios() {
  return httpGet('/api/servicios/stats');
}

// Cobros (ticket 80mm) opcional desde esta pantalla
async function cobrarServicio({ servicio, metodo_pago_id, conceptoPersonalizado }) {
  const resp = await cobrosService.crear({
    servicio_id: servicio.id,
    cliente_id: servicio.cliente_id || 1,
    concepto: conceptoPersonalizado || `Servicio: ${getTipoLabel(servicio.tipo_servicio_id)}`,
    monto: Number(servicio.precio || 0),
    metodo_pago_id
  });
  if (!resp?.success) throw new Error(resp?.error || 'No se pudo registrar el cobro');
  return resp; // resp.data.id = cobro_id
}



function resolveMetodoPagoId(formasPago, forma_pago) {
  const found = formasPago.find(fp => fp.value === forma_pago && fp.id);
  if (found?.id) return found.id;
  // Ajusta a tus IDs reales en DB:
  const MAP = { efectivo:1, yape:2, plin:3, transferencia:4, interbancario:5 };
  return MAP[String(forma_pago).toLowerCase()] || 1;
}

// 
async function abrirTicketCobroHtml(cobroId) {
  const json = await cobrosService.getById(cobroId);
  if (!json?.success) throw new Error(json?.error || 'No se pudo obtener el cobro');
  printTicket80(json.data); // tu función que genera el iframe e imprime
}



// ========== COMPONENTE ==========

const Servicios = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('registrar_servicios', 'crear');
  const canUpdate = hasPermission('registrar_servicios', 'actualizar');
  const canDelete = hasPermission('registrar_servicios', 'eliminar');

  // const { user } = useAuth(); // si no lo usas, puedes quitarlo
  const [servicios, setServicios] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [formasPago, setFormasPago] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingServicio, setEditingServicio] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTipo, setSelectedTipo] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1, hasPrev: false, hasNext: false });

  const [formData, setFormData] = useState({
    tipo_servicio_id: '',   // ← ahora guardamos el ID del tipo
    cliente_id: '',         // si no tienes selector aún, puedes dejarlo vacío y el payload pondrá 1
    cliente_nombre: '',   // 👈 nuevo
    cliente_dni: '',      // 👈 opcional
    cliente_telefono: '', // celular del cliente
    cliente_email: '',    // correo del cliente
    fecha_servicio: '',
    hora_servicio: '',
    precio: '',             // se autocompleta al elegir el tipo (precio_base)
    estado: 'programado',   // programado | realizado | cancelado
    forma_pago: '',         // efectivo | yape | plin | transferencia | interbancario
    fecha_operacion: '',
    hora_operacion: '',
    nro_operacion: '',
    obs_operacion: '',
    observaciones: ''       // único campo de texto libre (quitamos descripcion)
  });

  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  // ========== NUEVOS ESTADOS ==========
const [buscandoDNI, setBuscandoDNI] = useState(false);
const [dniApi, setDniApi] = useState('apisperu'); // 'apisperu' o 'apisnetpe'
const [metodosPago, setMetodosPago] = useState([]);
const [pagos, setPagos] = useState([
  { metodo_pago_id: '', monto: '', fecha_operacion: '', hora_operacion: '', nro_operacion: '', obs_operacion: '' }
]);
const [mostrarTicketAuto, setMostrarTicketAuto] = useState(false);

// ========== ITEMS (multi-servicio) ==========
// Nota: fecha y hora se comparten desde formData (una sola para todos los items).
// Si hay servicios en fechas/horas distintas, el usuario las anota en Observaciones.
const [items, setItems] = useState([
  { tipo_servicio_id: '', precio: '' }
]);

const agregarItem = () => {
  setItems([...items, { tipo_servicio_id: '', precio: '' }]);
};

const eliminarItem = (index) => {
  if (items.length > 1) {
    setItems(items.filter((_, i) => i !== index));
  }
};

const handleItemChange = (index, field, value) => {
  const newItems = [...items];
  newItems[index] = { ...newItems[index], [field]: value };
  // Auto-popular precio si cambia tipo_servicio_id
  if (field === 'tipo_servicio_id') {
    const tipo = tiposServicio.find(t => String(t.value) === String(value));
    if (tipo && tipo.precio_base != null) {
      newItems[index].precio = String(tipo.precio_base);
    }
  }
  setItems(newItems);
};

const calcularTotalItems = () => {
  return items.reduce((sum, item) => sum + (parseFloat(item.precio) || 0), 0);
};

// ========== MODO CAJA DEL AMOR ==========
const CAJA_AMOR_VALUE = 'CAJA_DEL_AMOR'; // valor especial en el select
const [modoCaja, setModoCaja] = useState(false);
const [modalidades, setModalidades] = useState([]);
const [puntosVenta, setPuntosVenta] = useState([]);
const [cajaFormData, setCajaFormData] = useState({
  modalidad_id: '',
  punto_venta_id: '',
  codigo_caja: '',
  fecha_devolucion: '',
});
const [cajaInfo, setCajaInfo] = useState(null); // info de la caja buscada
const [buscandoCaja, setBuscandoCaja] = useState(false);

  const estadosServicios = [
    { value: 'programado', label: 'Programado', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'realizado',  label: 'Realizado',  color: 'bg-green-100 text-green-800' },
    { value: 'cancelado',  label: 'Cancelado',  color: 'bg-red-100 text-red-800' }
  ];

  // Cargar datos iniciales / con filtros
  useEffect(() => {
    loadServicios();
    loadTiposServicio();
    loadFormasPago();
    loadStats();
    loadMetodosPago();
    loadCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm, selectedTipo, selectedEstado, fechaDesde, fechaHasta]);

  const loadServicios = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: 20,
        search: searchTerm || '',
        tipo_servicio_id: selectedTipo || '',
        estado: selectedEstado || '',
        desde: fechaDesde || '',
        hasta: fechaHasta || ''
      };
      const resp = await listarServicios(params);
      if (resp.success) {
        setServicios(resp.data || []);
        setPagination(resp.pagination || { page: 1, limit: 20, total: 0, totalPages: 1, hasPrev: false, hasNext: false });
      } else {
        setErrors({ general: resp.error || 'Error al cargar servicios' });
      }
    } catch (error) {
      console.error('Error al cargar servicios:', error);
      setErrors({ general: 'Error de conexión al cargar servicios' });
    } finally {
      setLoading(false);
    }
  };
  
  const handleTipoChange = (id) => {
    setFormData(f => ({ ...f, tipo_servicio_id: id }));
    const t = tiposServicio.find(x => String(x.value) === String(id));
    if (t) setFormData(f => ({ ...f, precio: t.precio_base ?? '' }));
  };

  const loadTiposServicio = async () => {
    try {
      const resp = await getTiposServicio();
      if (resp.success) setTiposServicio(resp.data || []);
    } catch (e) {
      console.error('Error al cargar tipos de servicio:', e);
    }
  };

  const loadFormasPago = async () => {
    try {
      const resp = await getFormasPagoConfig();
      if (resp.success) setFormasPago(resp.data || []);
    } catch (e) {
      console.error('Error al cargar formas de pago:', e);
    }
  };

  const loadStats = async () => {
    try {
      const resp = await getStatsServicios();
      if (resp.success) setStats(resp.data || {});
    } catch (e) {
      console.error('Error al cargar estadísticas:', e);
    }
  };

  const loadMetodosPago = async () => {
    try {
      const response = await metodoPagoService.getAll();
      if (response.success) {
        setMetodosPago(response.data);
      }
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
    }
  };

  const loadCatalogos = async () => {
    try {
      const [modRes, pvRes] = await Promise.all([
        catalogosService.getModalidades(),
        catalogosService.getPuntosVenta(),
      ]);
      if (modRes.success) setModalidades(modRes.data || []);
      if (pvRes.success) setPuntosVenta(pvRes.data || []);
    } catch (error) {
      console.error('Error cargando catálogos:', error);
    }
  };

  // ========== CAJA DEL AMOR: buscar caja por código ==========
  const handleBuscarCaja = async () => {
    const codigo = cajaFormData.codigo_caja?.trim();
    if (!codigo) return alert('Ingrese un código de caja');
    setBuscandoCaja(true);
    setCajaInfo(null);
    try {
      const resp = await ventasService.buscarCaja(codigo);
      if (resp.success && resp.data) {
        setCajaInfo(resp.data);
      } else {
        alert(resp.error || 'Caja no encontrada o no disponible');
      }
    } catch (err) {
      console.error('Error buscando caja:', err);
      alert('Error al buscar la caja');
    } finally {
      setBuscandoCaja(false);
    }
  };

  // ========== CAMBIO TIPO SERVICIO: detectar modo Caja del Amor ==========
  const handleTipoChangeWrapper = (val) => {
    if (val === CAJA_AMOR_VALUE) {
      setModoCaja(true);
      // Auto-seleccionar modalidad S/40 (id=1) y precio
      const mod40 = modalidades.find(m => Number(m.id) === 1);
      setFormData(prev => ({
        ...prev,
        tipo_servicio_id: val,
        precio: mod40 ? String(mod40.costo) : '40.00',
        hora_servicio: '08:00', // default, no requerido en modo caja
        estado: 'programado',
      }));
      setCajaFormData(prev => ({
        ...prev,
        modalidad_id: '1',
      }));
    } else {
      setModoCaja(false);
      setCajaFormData({ modalidad_id: '', punto_venta_id: '', codigo_caja: '', fecha_devolucion: '' });
      setCajaInfo(null);
      handleTipoChange(val); // función original
    }
  };


  // ========== BÃšSQUEDA DNI ==========
  const handleBuscarDNI = async () => {
    const dni = formData.cliente_dni?.trim();
    
    if (!dni || dni.length !== 8) {
      alert('Ingrese un DNI válido de 8 dígitos');
      return;
    }

    setBuscandoDNI(true);
    try {
      const resultado = await consultarDNI(dni, dniApi);
      setFormData(prev => ({
        ...prev,
        cliente_nombre: resultado.nombreCompleto
      }));
      alert(`✓ Datos encontrados:\n${resultado.nombreCompleto}`);
    } catch (error) {
      console.error('Error buscando DNI:', error);
      alert(error.message || 'No se pudo consultar el DNI.\nIngrese el nombre manualmente.');
    } finally {
      setBuscandoDNI(false);
    }
  };

  // ========== GESTIÓN PAGOS MÚLTIPLES ==========
  const agregarPago = () => {
    if (pagos.length < 2) {
      setPagos([...pagos, { metodo_pago_id: '', monto: '', fecha_operacion: '', hora_operacion: '', nro_operacion: '', obs_operacion: '' }]);
    }
  };

  const eliminarPago = (index) => {
    if (pagos.length > 1) {
      setPagos(pagos.filter((_, i) => i !== index));
    }
  };

  const handlePagoChange = (index, field, value) => {
    const newPagos = [...pagos];
    newPagos[index][field] = value;
    setPagos(newPagos);
  };

  const calcularTotalPagos = () => {
    return pagos.reduce((sum, pago) => sum + (parseFloat(pago.monto) || 0), 0);
  };

  const validarPagos = () => {
    // En modo servicio, el total es la suma de items; en modo caja, es formData.precio
    const total = modoCaja ? (parseFloat(formData.precio) || 0) : calcularTotalItems();
    const sumaPagos = calcularTotalPagos();
    
    if (Math.abs(total - sumaPagos) > 0.01) {
      setErrors({ general: `La suma de los pagos (S/ ${sumaPagos.toFixed(2)}) no coincide con el total (S/ ${total.toFixed(2)})` });
      return false;
    }
    
    for (let i = 0; i < pagos.length; i++) {
      if (!pagos[i].metodo_pago_id || !pagos[i].monto || parseFloat(pagos[i].monto) <= 0) {
        setErrors({ general: `Complete correctamente el pago ${i + 1}` });
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');
    
    try {
      // Validación común
      if (!formData.cliente_nombre || !formData.cliente_nombre.trim()) {
        return setErrors({ general: 'Ingrese el nombre del cliente.' });
      }

      const dniVal = (formData.cliente_dni || '').trim();
      if (dniVal && !/^\d{8}$/.test(dniVal)) {
        return setErrors({ general: 'El DNI debe tener exactamente 8 dígitos numéricos.' });
      }

      // Validación de items (modo servicio) o tipo_servicio_id (modo caja)
      if (!modoCaja) {
        // Fecha y hora compartidas
        if (!formData.fecha_servicio) {
          return setErrors({ general: 'Seleccione la fecha del servicio.' });
        }
        if (!formData.hora_servicio) {
          return setErrors({ general: 'Seleccione la hora del servicio.' });
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.tipo_servicio_id) {
            return setErrors({ general: `Seleccione el tipo de servicio en el item ${i + 1}.` });
          }
          if (!item.precio || parseFloat(item.precio) <= 0) {
            return setErrors({ general: `El precio del item ${i + 1} debe ser mayor a 0.` });
          }
        }
      } else {
        if (!formData.tipo_servicio_id) {
          return setErrors({ general: 'Seleccione el tipo de servicio.' });
        }
        if (!formData.fecha_servicio) {
          return setErrors({ general: 'Seleccione la fecha.' });
        }
        if (!formData.precio || parseFloat(formData.precio) <= 0) {
          return setErrors({ general: 'El precio debe ser mayor a 0.' });
        }
      }

      if (!validarPagos()) return;

      const token = localStorage.getItem('token');
      if (!token) {
        return setErrors({ general: 'Sesión expirada. Por favor, inicie sesión nuevamente.' });
      }

      setLoading(true);

      // ============================================================
      // MODO CAJA DEL AMOR
      // ============================================================
      if (modoCaja) {
        if (editingServicio) {
          setLoading(false);
          return setErrors({ general: 'La edición de ventas de Caja del Amor no está soportada desde este módulo. Use el módulo Gestión.' });
        }
        // Validaciones específicas de caja
        if (!cajaFormData.modalidad_id) {
          return setErrors({ general: 'Seleccione la modalidad de caja.' });
        }
        if (!cajaFormData.punto_venta_id) {
          return setErrors({ general: 'Seleccione el punto de venta.' });
        }
        if (!cajaInfo) {
          return setErrors({ general: 'Busque y seleccione un código de caja válido.' });
        }
        // Para modalidad S/40, fecha de devolución es obligatoria
        if (Number(cajaFormData.modalidad_id) === 1 && !cajaFormData.fecha_devolucion) {
          return setErrors({ general: 'Ingrese la fecha de devolución de la caja.' });
        }

        // Nombre dividido para benefactor
        const nombreCompleto = formData.cliente_nombre.trim();
        const partes = nombreCompleto.split(' ');
        const nombres = partes.slice(0, Math.ceil(partes.length / 2)).join(' ');
        const apellidos = partes.slice(Math.ceil(partes.length / 2)).join(' ');

        // 1) Registrar venta via ventasService (tabla ventas + ventas_cajas + cajas)
        const metodoPagoObj = metodosPago.find(m => String(m.id) === String(pagos[0]?.metodo_pago_id));
        const formaPagoNombre = metodoPagoObj?.nombre || 'Efectivo';

        const ventaPayload = {
          recibo: `SRV-${Date.now()}`,
          fecha: formData.fecha_servicio,
          modalidad_id: Number(cajaFormData.modalidad_id),
          punto_venta_id: Number(cajaFormData.punto_venta_id),
          forma_pago: formaPagoNombre,
          monto: parseFloat(formData.precio),
          moneda: 'PEN',
          fecha_devolucion: cajaFormData.fecha_devolucion || null,
          observaciones: formData.observaciones || null,
          benefactor: {
            nombres,
            apellidos,
            telefono: formData.cliente_telefono?.trim() || '',
            correo: formData.cliente_email?.trim() || '',
          },
          codigos: [cajaInfo.caja_codigo || cajaInfo.familia_codigo],
          pagos: pagos.map(p => {
            const metodoNombre = metodosPago.find(m => String(m.id) === String(p.metodo_pago_id))?.nombre || 'Efectivo';
            const esEfectivo = metodoNombre.toLowerCase() === 'efectivo';
            return {
              forma_pago: metodoNombre,
              monto: parseFloat(p.monto),
              fecha_operacion: !esEfectivo ? (p.fecha_operacion || null) : null,
              hora_operacion: !esEfectivo ? (p.hora_operacion || null) : null,
              nro_operacion: !esEfectivo ? (p.nro_operacion || null) : null,
              obs_operacion: !esEfectivo ? (p.obs_operacion || null) : null,
            };
          }),
        };

        const ventaResp = await ventasService.registrar(ventaPayload);
        if (!ventaResp.success) {
          throw new Error(ventaResp.error || 'Error al registrar venta de caja');
        }

        // 2) Crear cobro para generar comprobante/ticket
        const modLabel = modalidades.find(m => String(m.id) === String(cajaFormData.modalidad_id))?.nombre || 'Caja del Amor';

        const cobroPayload = {
          servicio_id: null,
          caja_id: cajaInfo.caja_id,
          cliente_nombre: formData.cliente_nombre.trim(),
          cliente_dni: formData.cliente_dni?.trim() || '',
          cliente_telefono: formData.cliente_telefono?.trim() || '',
          cliente_email: formData.cliente_email?.trim() || '',
          concepto: `Caja del Amor: ${modLabel}`,
          monto: parseFloat(formData.precio),
          pagos: pagos.map(p => {
            const metodoNombre = metodosPago.find(m => String(m.id) === String(p.metodo_pago_id))?.nombre || '';
            const esEfectivo = metodoNombre.toLowerCase() === 'efectivo';
            return {
              metodo_pago_id: parseInt(p.metodo_pago_id),
              monto: parseFloat(p.monto),
              fecha_operacion: !esEfectivo ? (p.fecha_operacion || null) : null,
              hora_operacion: !esEfectivo ? (p.hora_operacion || null) : null,
              nro_operacion: !esEfectivo ? (p.nro_operacion || null) : null,
              obs_operacion: !esEfectivo ? (p.obs_operacion || null) : null,
            };
          }),
          observaciones: formData.observaciones || null
        };

        const cobroData = await cobrosService.crear(cobroPayload);
        if (!cobroData.success) {
          throw new Error(cobroData.error || 'Error al crear cobro');
        }

        setSuccessMessage('Venta de Caja del Amor registrada exitosamente');

        if (mostrarTicketAuto && cobroData.data.cobro_id) {
          setTimeout(() => abrirTicketPDF(cobroData.data.cobro_id), 500);
        }

      // ============================================================
      // MODO SERVICIO ECLESIÁSTICO
      // ============================================================
      } else {
        // Asegurar / actualizar cliente (upsert por DNI)
        const clienteId = await ensureCliente(
          formData.cliente_nombre.trim(),
          (formData.cliente_dni || '').trim(),
          (formData.cliente_telefono || '').trim(),
          (formData.cliente_email || '').trim()
        );

        const tipoLabel = tiposServicio.find(t => t.value === Number(formData.tipo_servicio_id))?.label || 'Servicio';

        // Construir pagos normalizados para enviar
        const pagosPayload = pagos.map(p => {
          const metodoNombre = metodosPago.find(m => String(m.id) === String(p.metodo_pago_id))?.nombre || '';
          const esEfectivo = metodoNombre.toLowerCase() === 'efectivo';
          return {
            metodo_pago_id: parseInt(p.metodo_pago_id),
            monto: parseFloat(p.monto),
            fecha_operacion: !esEfectivo ? (p.fecha_operacion || null) : null,
            hora_operacion: !esEfectivo ? (p.hora_operacion || null) : null,
            nro_operacion: !esEfectivo ? (p.nro_operacion || null) : null,
            obs_operacion: !esEfectivo ? (p.obs_operacion || null) : null,
          };
        });

        // Construir items para el backend (fecha/hora compartidas desde formData)
        const itemsPayload = items.map(item => ({
          tipo_servicio_id: Number(item.tipo_servicio_id),
          fecha_servicio: formData.fecha_servicio,
          hora_servicio: formData.hora_servicio,
          precio: parseFloat(item.precio),
          observaciones: formData.observaciones || null
        }));

        const totalMonto = itemsPayload.reduce((s, it) => s + it.precio, 0);

        if (editingServicio) {
          // -------- UPDATE: actualizar cobro con items[] --------
          if (editingServicio.cobro_id) {
            const cobroPayload = {
              cliente_nombre: formData.cliente_nombre.trim(),
              cliente_dni: formData.cliente_dni?.trim() || '',
              cliente_telefono: formData.cliente_telefono?.trim() || '',
              cliente_email: formData.cliente_email?.trim() || '',
              items: itemsPayload,
              monto: totalMonto,
              pagos: pagosPayload,
              observaciones: formData.observaciones || null,
              estado: formData.estado || 'programado'
            };

            const cobroResp = await cobrosService.actualizar(editingServicio.cobro_id, cobroPayload);
            if (!cobroResp.success) {
              throw new Error(cobroResp.error || 'Error al actualizar cobro');
            }
          }

          setSuccessMessage('Servicio actualizado exitosamente');

          if (mostrarTicketAuto && editingServicio.cobro_id) {
            setTimeout(() => abrirTicketPDF(editingServicio.cobro_id), 500);
          }
        } else {
          // -------- CREATE: crear cobro con items[] (backend crea los servicios) --------
          const cobroPayload = {
            caja_id: null,
            cliente_nombre: formData.cliente_nombre.trim(),
            cliente_dni: formData.cliente_dni?.trim() || '',
            cliente_telefono: formData.cliente_telefono?.trim() || '',
            cliente_email: formData.cliente_email?.trim() || '',
            items: itemsPayload,
            monto: totalMonto,
            pagos: pagosPayload,
            observaciones: formData.observaciones || null,
            estado: formData.estado || 'programado'
          };

          const cobroData = await cobrosService.crear(cobroPayload);
          if (!cobroData.success) {
            throw new Error(cobroData.error || 'Error al crear cobro');
          }

          setSuccessMessage(items.length > 1
            ? `${items.length} servicios y cobro registrados exitosamente`
            : 'Servicio y cobro registrados exitosamente');

          if (mostrarTicketAuto && cobroData.data.cobro_id) {
            setTimeout(() => abrirTicketPDF(cobroData.data.cobro_id), 500);
          }
        }
      }

      // Limpiar y cerrar
      resetForm();
      setShowModal(false);
      loadServicios();
      loadStats();

    } catch (error) {
      console.error('Error al enviar formulario:', error);
      // Extraer el mensaje real del backend si es un error Axios
      let msg = '';
      if (error.response?.data?.error) {
        msg = error.response.data.error;
      } else if (error.response?.data?.errors) {
        msg = error.response.data.errors.map(e => e.message || e).join('. ');
      } else if (error.response?.data?.message) {
        msg = error.response.data.message;
      } else {
        msg = error.message || 'Error desconocido';
      }
      // Mensajes amigables para códigos de estado
      const status = error.response?.status;
      if (status === 500 && !msg.includes('suma')) msg = 'Error del servidor. Verifique los datos ingresados e intente nuevamente.';
      else if (status === 401) msg = 'Sesión expirada. Por favor, inicie sesión nuevamente.';
      else if (status === 403) msg = 'No tiene permisos para realizar esta acción.';
      else if (!status && (msg.includes('Network') || msg.includes('fetch'))) msg = 'Error de conexión. Verifique su conexión a internet.';
      setErrors({ general: msg });
    } finally {
      setLoading(false);
    }
  };

  const abrirTicketPDF = async (cobroId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setErrors({ general: 'Sesión expirada. Por favor, inicie sesión nuevamente.' });
        return;
      }
      const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');
      const url = `${base}/api/cobros/${cobroId}/ticket`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Error ${response.status} al generar ticket`);
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 5000);
    } catch (error) {
      console.error('Error al imprimir ticket:', error);
      setErrors({ general: error.message || 'Error al generar el ticket.' });
    }
  };


  const handleEdit = async (servicio) => {
    setEditingServicio(servicio);

    // Fecha/hora compartidas: tomadas del servicio que se está editando
    const fechaCompartida = servicio.fecha_servicio ? String(servicio.fecha_servicio).slice(0, 10) : '';
    const horaCompartida = servicio.hora_servicio ? String(servicio.hora_servicio).slice(0, 5) : '';

    setFormData({
      tipo_servicio_id: servicio.tipo_servicio_id || '',
      cliente_id: servicio.cliente_id || '',
      cliente_nombre: servicio.cliente_nombre || '',
      cliente_dni: servicio.cliente_dni || '',
      cliente_telefono: servicio.cliente_telefono || '',
      cliente_email: servicio.cliente_email || '',
      fecha_servicio: fechaCompartida,
      hora_servicio: horaCompartida,
      precio: '',
      estado: servicio.estado || 'programado',
      forma_pago: '',
      fecha_operacion: '',
      hora_operacion: '',
      nro_operacion: '',
      obs_operacion: '',
      observaciones: servicio.observaciones || ''
    });
    setShowModal(true);

    // Cargar items y pagos del cobro asociado
    const defaultPago = [{ metodo_pago_id: '', monto: '', fecha_operacion: '', hora_operacion: '', nro_operacion: '', obs_operacion: '' }];
    const defaultItem = [{ tipo_servicio_id: '', precio: '' }];

    if (servicio.cobro_id) {
      try {
        const resp = await cobrosService.getById(servicio.cobro_id);
        if (resp.success) {
          // Cargar items (solo tipo_servicio_id y precio, la fecha/hora es compartida)
          if (Array.isArray(resp.data?.items) && resp.data.items.length) {
            const itemsCargados = resp.data.items.map(it => ({
              tipo_servicio_id: it.tipo_servicio_id ? String(it.tipo_servicio_id) : '',
              precio: it.precio_unitario != null ? String(it.precio_unitario) : '',
            }));
            setItems(itemsCargados);

            // Si la fecha/hora compartida del form aún no está seteada, tomarla del primer item
            const primerItem = resp.data.items[0];
            if (!fechaCompartida && primerItem?.fecha_servicio) {
              setFormData(prev => ({
                ...prev,
                fecha_servicio: String(primerItem.fecha_servicio).slice(0, 10),
                hora_servicio: primerItem.hora_servicio ? String(primerItem.hora_servicio).slice(0, 5) : '',
              }));
            }
          } else {
            // Fallback: usar datos del servicio como item unico
            setItems([{
              tipo_servicio_id: servicio.tipo_servicio_id ? String(servicio.tipo_servicio_id) : '',
              precio: servicio.precio != null ? String(servicio.precio) : '',
            }]);
          }

          // Cargar pagos
          if (Array.isArray(resp.data?.pagos) && resp.data.pagos.length) {
            const pagosCargados = resp.data.pagos.map(p => ({
              metodo_pago_id: p.metodo_pago_id ? String(p.metodo_pago_id) : '',
              monto: p.monto != null ? String(p.monto) : '',
              fecha_operacion: p.fecha_operacion ? String(p.fecha_operacion).slice(0, 10) : '',
              hora_operacion: p.hora_operacion ? String(p.hora_operacion).slice(0, 5) : '',
              nro_operacion: p.nro_operacion || '',
              obs_operacion: p.obs_operacion || '',
            }));
            setPagos(pagosCargados);
          } else {
            setPagos(defaultPago);
          }
        }
      } catch (err) {
        console.error('Error cargando cobro:', err);
        setItems(defaultItem);
        setPagos(defaultPago);
      }
    } else {
      // Sin cobro: cargar item del servicio directamente
      setItems([{
        tipo_servicio_id: servicio.tipo_servicio_id ? String(servicio.tipo_servicio_id) : '',
        precio: servicio.precio != null ? String(servicio.precio) : '',
      }]);
      setPagos(defaultPago);
    }
  };
  

  const handleMarcarRealizado = async (id) => {
    try {
      const resp = await marcarRealizado(id);
      if (resp.success) {
        setSuccessMessage(resp.message || 'Marcado como realizado');
        loadServicios();
        loadStats();
      } else {
        setErrors({ general: resp.message || resp.error || 'No se pudo marcar' });
      }
    } catch (error) {
      console.error('Error al marcar como realizado:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };
  

  const handleCancelar = async (id) => {
    const observaciones = prompt('Motivo de cancelación (opcional):') || '';
    try {
      const resp = await cancelarServicio(id, { observaciones });
      if (resp.success) {
        setSuccessMessage(resp.message || 'Cancelado');
        loadServicios();
        loadStats();
      } else {
        setErrors({ general: resp.message || resp.error || 'No se pudo cancelar' });
      }
    } catch (error) {
      console.error('Error al cancelar servicio:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este servicio?')) return;
    try {
      const resp = await eliminarServicio(id);
      if (resp.success) {
        setSuccessMessage('Servicio eliminado exitosamente');
        loadServicios();
        loadStats();
      } else {
        setErrors({ general: resp.message || resp.error || 'No se pudo eliminar' });
      }
    } catch (error) {
      console.error('Error al eliminar servicio:', error);
      setErrors({ general: 'Error de conexión' });
    }
  };

  const resetForm = () => {
    setFormData({
      tipo_servicio_id: '',
      cliente_id: '',
      cliente_nombre: '',
      cliente_dni: '',
      cliente_telefono: '',
      cliente_email: '',
      fecha_servicio: '',
      hora_servicio: '',
      precio: '',
      estado: 'programado',
      forma_pago: '',
      fecha_operacion: '',
      hora_operacion: '',
      nro_operacion: '',
      obs_operacion: '',
      observaciones: ''
    });
    setEditingServicio(null);
    setErrors({});
    setItems([{ tipo_servicio_id: '', precio: '' }]);
    setPagos([{ metodo_pago_id: '', monto: '', fecha_operacion: '', hora_operacion: '', nro_operacion: '', obs_operacion: '' }]);
    setMostrarTicketAuto(false);
    setModoCaja(false);
    setCajaFormData({ modalidad_id: "", punto_venta_id: "", codigo_caja: "", fecha_devolucion: "" });
    setCajaInfo(null);
  };
  

  const handleSearch = (e) => { setSearchTerm(e.target.value); setCurrentPage(1); };

  // Para filtros de cabecera:
  const handleFilterChange = (type, value) => {
    if (type === 'tipo') setSelectedTipo(value);               // se usará como tipo_servicio_id
    else if (type === 'estado') setSelectedEstado(value);      // programado|realizado|cancelado
    else if (type === 'fecha_desde') setFechaDesde(value);     // desde
    else if (type === 'fecha_hasta') setFechaHasta(value);     // hasta
    setCurrentPage(1);
  };

  const getEstadoStyle = (estado) => {
    const e = estadosServicios.find(x => x.value === estado);
    return e ? e.color : 'bg-gray-100 text-gray-800';
  };
  const getEstadoLabel = (estado) => {
    const e = estadosServicios.find(x => x.value === estado);
    return e ? e.label : estado;
  };
  const getTipoLabel = (tipoId) => {
    const t = tiposServicio.find(x => String(x.value) === String(tipoId));
    return t ? t.label : tipoId;
  };

  if (loading && servicios.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Registrar Servicios</h1>
        <p className="text-gray-600 dark:text-gray-400">Registra servicios (Bautismo, Matrimonio, etc.) y su estado</p>
      </div>

      {canCreate && <button
        onClick={() => { resetForm(); setShowModal(true); }}
        className="mb-6 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium"
      >
        Nuevo
      </button>}


      {/* Mensajes (solo cuando NO hay modal abierto) */}
      {successMessage && <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">{successMessage}</div>}
      {errors.general && !showModal && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{errors.general}</div>}

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Servicios</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Programados</h3>
          <p className="text-2xl font-bold text-yellow-600">{stats.programados || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Realizados</h3>
          <p className="text-2xl font-bold text-green-600">{stats.realizados || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Ingresos (S/)</h3>
          <p className="text-2xl font-bold text-blue-600">{Number(stats.ingresos || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <input
            type="text"
            placeholder="Buscar servicios..."
            value={searchTerm}
            onChange={handleSearch}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <select
            value={selectedTipo}
            onChange={(e) => handleFilterChange('tipo', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todos los tipos</option>
            {tiposServicio.map(tipo => (
              <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
            ))}
          </select>
          <select
            value={selectedEstado}
            onChange={(e) => handleFilterChange('estado', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Todos los estados</option>
            {estadosServicios.map(estado => (
              <option key={estado.value} value={estado.value}>{estado.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => handleFilterChange('fecha_desde', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Desde"
          />
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => handleFilterChange('fecha_hasta', e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Hasta"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tipo / Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Precio (S/)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {servicios.map((servicio) => (
              <tr key={servicio.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {getTipoLabel(servicio.tipo_servicio_id)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {(() => {
                      // Formatear DATE sin timezone (viene como '2026-04-20' del backend)
                      const s = String(servicio.fecha_servicio || '').slice(0, 10);
                      const p = s.split('-');
                      return p.length === 3 ? `${parseInt(p[2])}/${parseInt(p[1])}/${p[0]}` : s;
                    })()}
                    {servicio.hora_servicio && ` - ${String(servicio.hora_servicio).slice(0, 5)}`}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {servicio.cliente_nombre || servicio.cliente_id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {Number(servicio.precio || 0).toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEstadoStyle(servicio.estado)}`}>
                    {getEstadoLabel(servicio.estado)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    {canUpdate && <button
                      onClick={() => handleEdit(servicio)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Editar
                    </button>}

                    {/* Imprimir ticket del cobro asociado al servicio */}
                    <button
                      onClick={() => {
                        if (!servicio.cobro_id) {
                          setErrors({ general: 'Este servicio no tiene un cobro asociado. No es posible imprimir el ticket.' });
                          return;
                        }
                        abrirTicketPDF(servicio.cobro_id);
                      }}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                      title="Imprimir ticket 80mm"
                    >
                      Imprimir ticket
                    </button>

                    {servicio.estado === 'programado' && canUpdate && (
                      <>
                        <button
                          onClick={() => handleMarcarRealizado(servicio.id)}
                          className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                        >
                          Marcar realizado
                        </button>
                        <button
                          onClick={() => handleCancelar(servicio.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Cancelar
                        </button>
                      </>
                    )}

                    {servicio.estado !== 'realizado' && canDelete && (
                      <button
                        onClick={() => handleDelete(servicio.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>

        {servicios.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || selectedTipo || selectedEstado || fechaDesde || fechaHasta
                ? 'No se encontraron servicios que coincidan con los filtros.'
                : 'No hay servicios registrados.'}
            </p>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Mostrando {((pagination.page - 1) * pagination.limit) + 1} a {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} resultados
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Anterior
            </button>
            <span className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md">
              {pagination.page}
            </span>
            <button
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal Nuevo/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingServicio ? 'Editar Servicio' : modoCaja ? '🎁 Nueva Venta — Caja del Amor' : 'Nuevo Servicio'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Error dentro del popup */}
              {errors.general && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                  {errors.general}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

  {/* === ITEMS DE SERVICIO (repetibles) o campos Caja del Amor === */}
  {!modoCaja ? (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Servicios <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={agregarItem}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
        >
          + Agregar servicio
        </button>
      </div>
      {/* Fecha y Hora compartidas para todos los servicios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/40">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            Fecha del Servicio <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.fecha_servicio}
            onChange={(e) => setFormData(prev => ({ ...prev, fecha_servicio: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
            Hora del Servicio <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.hora_servicio}
            onChange={(e) => setFormData(prev => ({ ...prev, hora_servicio: e.target.value }))}
            required
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          >
            <option value="">Seleccionar</option>
            {Array.from({ length: 15 }, (_, i) => 7 + i).flatMap(hora => [
              <option key={`sh-${hora}:00`} value={`${hora.toString().padStart(2, '0')}:00`}>
                {`${hora.toString().padStart(2, '0')}:00 ${hora < 12 ? 'AM' : 'PM'}`}
              </option>,
              <option key={`sh-${hora}:30`} value={`${hora.toString().padStart(2, '0')}:30`}>
                {`${hora.toString().padStart(2, '0')}:30 ${hora < 12 ? 'AM' : 'PM'}`}
              </option>
            ])}
          </select>
        </div>
      </div>

      {/* Items de servicio (solo Tipo + Precio) */}
      {items.map((item, idx) => (
        <div key={idx} className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Tipo */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Tipo <span className="text-red-500">*</span></label>
              <select
                value={item.tipo_servicio_id}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === CAJA_AMOR_VALUE) {
                    handleTipoChangeWrapper(val);
                  } else {
                    handleItemChange(idx, 'tipo_servicio_id', val);
                  }
                }}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">Seleccionar</option>
                {tiposServicio.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
                {idx === 0 && <option value={CAJA_AMOR_VALUE}>🎁 Caja del Amor</option>}
              </select>
            </div>
            {/* Precio + eliminar */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Precio <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.precio}
                  onChange={(e) => handleItemChange(idx, 'precio', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => eliminarItem(idx)}
                  className="self-end px-2 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                  title="Eliminar servicio"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
        Total servicios: S/ {calcularTotalItems().toFixed(2)}
      </div>
    </div>
  ) : (
    /* Modo Caja del Amor: campos tipo + fecha + modalidad + precio */
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

    {/* Tipo de Servicio (Caja del Amor) */}
    <div className="sm:col-span-2 lg:col-span-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Tipo de Servicio <span className="text-red-500">*</span>
      </label>
      <select
        value={formData.tipo_servicio_id}
        onChange={(e) => handleTipoChangeWrapper(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        required
      >
        <option value="">Seleccionar tipo</option>
        <option value={CAJA_AMOR_VALUE} className="font-bold text-orange-600">🎁 Caja del Amor</option>
        <option disabled>──────────────</option>
        {tiposServicio.map(tipo => (
          <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
        ))}
      </select>
    </div>

    {/* Fecha */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Fecha <span className="text-red-500">*</span>
      </label>
      <input
        type="date"
        value={formData.fecha_servicio}
        onChange={(e) => setFormData(prev => ({ ...prev, fecha_servicio: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        required
      />
    </div>

    {/* Modalidad — solo en modo Caja del Amor */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Modalidad <span className="text-red-500">*</span>
      </label>
      <select
        value={cajaFormData.modalidad_id}
        onChange={(e) => {
          const modId = e.target.value;
          const mod = modalidades.find(m => String(m.id) === modId);
          setCajaFormData(prev => ({ ...prev, modalidad_id: modId }));
          if (mod) setFormData(prev => ({ ...prev, precio: String(mod.costo) }));
        }}
        required
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
      >
        <option value="">Seleccionar</option>
        {modalidades.map(m => (
          <option key={m.id} value={m.id}>{m.nombre} (S/ {Number(m.costo).toFixed(2)})</option>
        ))}
      </select>
    </div>

    {/* Precio */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio (S/) <span className="text-red-500">*</span></label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={formData.precio}
        onChange={(e) => setFormData(prev => ({ ...prev, precio: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        placeholder="0.00"
      />
    </div>
    </div>
  )}

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* === FILA 2: Cliente | DNI+botón+radio === */}
    {/* Cliente */}
    <div className="lg:col-span-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {modoCaja ? 'Benefactor' : 'Cliente'} <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        name="cliente_nombre"
        value={formData.cliente_nombre}
        onChange={(e) => setFormData({...formData, cliente_nombre: e.target.value})}
        required
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        placeholder="Nombre completo"
      />
    </div>

    {/* DNI + botón + radio API */}
    <div className="lg:col-span-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DNI</label>
      <div className="flex gap-1">
        <input
          type="text"
          name="cliente_dni"
          value={formData.cliente_dni}
          onChange={(e) => setFormData({...formData, cliente_dni: e.target.value.replace(/\D/g, '')})}
          maxLength="8"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm"
          placeholder="8 dígitos"
        />
        <button
          type="button"
          onClick={handleBuscarDNI}
          disabled={buscandoDNI || !formData.cliente_dni || formData.cliente_dni.length !== 8}
          className="shrink-0 px-2 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          title="Buscar DNI"
        >
          {buscandoDNI ? '🔄' : '🔍'}
        </button>
        <div className="flex flex-col justify-center text-[10px] leading-tight text-gray-500 dark:text-gray-400 shrink-0">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="dniApi" value="apisperu" checked={dniApi === 'apisperu'} onChange={(e) => setDniApi(e.target.value)} className="w-3 h-3" />
            APISPeru
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="dniApi" value="apisnetpe" checked={dniApi === 'apisnetpe'} onChange={(e) => setDniApi(e.target.value)} className="w-3 h-3" />
            Optimize
          </label>
        </div>
      </div>
    </div>

    {/* === FILA 3: Celular | Correo === */}
    {/* Celular */}
    <div className="lg:col-span-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Celular</label>
      <input
        type="text"
        value={formData.cliente_telefono}
        onChange={(e) => setFormData({...formData, cliente_telefono: e.target.value.replace(/\D/g, '')})}
        maxLength="15"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        placeholder="N° celular"
      />
    </div>

    {/* Correo */}
    <div className="lg:col-span-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo</label>
      <input
        type="email"
        value={formData.cliente_email}
        onChange={(e) => setFormData({...formData, cliente_email: e.target.value})}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        placeholder="correo@ejemplo.com"
      />
    </div>

    {/* === CAMPOS CAJA DEL AMOR (solo en modo caja) === */}
    {modoCaja && (
    <>
      {/* Punto de Venta */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Punto de Venta <span className="text-red-500">*</span>
        </label>
        <select
          value={cajaFormData.punto_venta_id}
          onChange={(e) => setCajaFormData(prev => ({ ...prev, punto_venta_id: e.target.value }))}
          required
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        >
          <option value="">Seleccionar</option>
          {puntosVenta.map(pv => (
            <option key={pv.id} value={pv.id}>{pv.nombre}</option>
          ))}
        </select>
      </div>

      {/* Código de Caja */}
      <div className="lg:col-span-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Código de Caja <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={cajaFormData.codigo_caja}
            onChange={(e) => { setCajaFormData(prev => ({ ...prev, codigo_caja: e.target.value.toUpperCase() })); setCajaInfo(null); }}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="Ej: CTE014"
          />
          <button
            type="button"
            onClick={handleBuscarCaja}
            disabled={buscandoCaja || !cajaFormData.codigo_caja}
            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
          >
            {buscandoCaja ? '🔄' : '🔍 Buscar'}
          </button>
        </div>
        {cajaInfo && (
          <p className="mt-1 text-xs text-green-600 dark:text-green-400">
            ✅ Caja: {cajaInfo.caja_codigo} | Familia: {cajaInfo.familia_codigo || '—'} | {cajaInfo.nombre_padre || cajaInfo.nombre_madre || 'Sin titular'}
          </p>
        )}
      </div>

      {/* Fecha de Devolución */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha devolución <span className="text-red-500">*</span></label>
        <input
          type="date"
          value={cajaFormData.fecha_devolucion}
          onChange={(e) => setCajaFormData(prev => ({ ...prev, fecha_devolucion: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        />
      </div>
    </>
    )}

    {/* === FILA: Estado (solo servicio) + Formas de Pago === */}
    {/* Estado — solo en modo servicio */}
    {!modoCaja && (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
      <select
        value={formData.estado}
        onChange={(e) => setFormData(prev => ({ ...prev, estado: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      >
        {estadosServicios.map(estado => (
          <option key={estado.value} value={estado.value}>{estado.label}</option>
        ))}
      </select>
    </div>
    )}

    {/* Formas de Pago — ocupa 3 cols (servicio) o 4 cols (caja) */}
    <div className={`sm:col-span-2 ${modoCaja ? 'lg:col-span-4' : 'lg:col-span-3'}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Formas de Pago <span className="text-red-500">*</span>
      </label>
      
      {pagos.map((pago, index) => {
        const metodoSel = metodosPago.find(m => String(m.id) === String(pago.metodo_pago_id));
        const esNoEfectivo = metodoSel && metodoSel.nombre.toLowerCase() !== 'efectivo';
        return (
          <div key={index} className="mb-3 p-3 border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800/40">
            <div className="flex gap-2">
              <select
                value={pago.metodo_pago_id}
                onChange={(e) => handlePagoChange(index, 'metodo_pago_id', e.target.value)}
                required
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Seleccionar método</option>
                {metodosPago.map(metodo => (
                  <option key={metodo.id} value={metodo.id}>
                    {metodo.nombre}
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                min="0"
                value={pago.monto}
                onChange={(e) => handlePagoChange(index, 'monto', e.target.value)}
                placeholder="Monto"
                required
                className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />

              {pagos.length > 1 && (
                <button
                  type="button"
                  onClick={() => eliminarPago(index)}
                  className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                  title="Eliminar forma de pago"
                >
                  🗑️
                </button>
              )}
            </div>

            {/* Datos de operación por pago — solo si el método NO es efectivo */}
            {esNoEfectivo && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Fecha operación</label>
                  <input
                    type="date"
                    value={pago.fecha_operacion || ''}
                    onChange={(e) => handlePagoChange(index, 'fecha_operacion', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Hora operación</label>
                  <input
                    type="time"
                    value={pago.hora_operacion || ''}
                    onChange={(e) => handlePagoChange(index, 'hora_operacion', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">N° operación</label>
                  <input
                    type="text"
                    value={pago.nro_operacion || ''}
                    onChange={(e) => handlePagoChange(index, 'nro_operacion', e.target.value)}
                    placeholder="Código / referencia"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Obs. operación</label>
                  <input
                    type="text"
                    value={pago.obs_operacion || ''}
                    onChange={(e) => handlePagoChange(index, 'obs_operacion', e.target.value)}
                    placeholder="Notas del pago"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        <div className="text-sm">
          {pagos.length < 2 && (
            <button
              type="button"
              onClick={agregarPago}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
            >
              + Agregar forma de pago
            </button>
          )}
        </div>
        <div className="text-sm">
          <span className="font-semibold">Total pagos: S/ {calcularTotalPagos().toFixed(2)}</span>
          {(() => {
            const totalEsperado = modoCaja ? (parseFloat(formData.precio) || 0) : calcularTotalItems();
            if (!totalEsperado) return null;
            return (
            <span className={`ml-2 ${Math.abs(calcularTotalPagos() - totalEsperado) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {Math.abs(calcularTotalPagos() - totalEsperado) < 0.01 ? '✓ Coincide' : '⚠️ No coincide'}
            </span>
          );
          })()}
        </div>
      </div>
    </div>

    {/* Checkbox imprimir ticket — full width */}
    <div className="sm:col-span-2 lg:col-span-4">
      <label className="flex items-center space-x-2 cursor-pointer">
        <input
          type="checkbox"
          checked={mostrarTicketAuto}
          onChange={(e) => setMostrarTicketAuto(e.target.checked)}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Imprimir ticket automáticamente
        </span>
      </label>
    </div>

  </div>

  {/* Observaciones */}
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
    <textarea
      value={formData.observaciones}
      onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
      rows={3}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      placeholder="Observaciones adicionales"
    />
  </div>

  {/* Botones */}
  <div className="flex justify-end space-x-3 pt-4">
    <button
      type="button"
      onClick={() => setShowModal(false)}
      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
    >
      Cancelar
    </button>
    <button
      type="submit"
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {editingServicio ? 'Actualizar' : 'Crear'}
    </button>


  </div>
</form>



            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Servicios;
