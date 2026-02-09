// frontend/src/pages/Cobros.jsx
import React, { useState, useEffect } from 'react';
import { cobrosService, metodoPagoService } from '../services/api'; // ✅ CORREGIDO
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
    <div class="hdr">${(window.ENTIDAD_NOMBRE || 'Parroquia N.S. de la Reconciliación')}</div>
    <div style="text-align:center">N° TICKET: ${cobro.numero_comprobante}</div>
    <div style="text-align:center">
      FECHA: ${new Date(cobro.fecha_cobro || Date.now()).toLocaleDateString('es-PE')}
      &nbsp;&nbsp;HORA: ${new Date(cobro.fecha_cobro || Date.now()).toLocaleTimeString('es-PE')}
    </div>
    <div class="sep"></div>

    ${cobro.cliente_nombre ? `<div><b>CLIENTE:</b> ${cobro.cliente_nombre}${cobro.cliente_dni ? ' (DNI ' + cobro.cliente_dni + ')' : ''}</div>` : ''}

    <div class="mt4"><b>ITEM</b></div>
    <div class="row"><div>${cobro.concepto || 'Servicio'}</div><div class="right">S/ ${(Number(cobro.monto)||0).toFixed(2)}</div></div>
    <div class="sep"></div>
    <div class="row"><div><b>TOTAL</b></div><div class="right"><b>S/ ${(Number(cobro.monto)||0).toFixed(2)}</b></div></div>
    <div class="mt4">PAGO: ${cobro.metodo_pago || ''}</div>

    <div class="sep"></div>
    <div style="font-size:9px; text-align:center;">
      ${'Documento sin efectos legales del sistema jurídico nacional (Canon 222 §1 CDC).'}
    </div>
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
async function ensureCliente(nombre, dni = '') {
  const data = await cobrosService.ensureCliente(nombre, dni);
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
const [metodosPago, setMetodosPago] = useState([]);
const [pagos, setPagos] = useState([
  { metodo_pago_id: '', monto: '' }
]);
const [mostrarTicketAuto, setMostrarTicketAuto] = useState(false);

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
    loadMetodosPago(); // â† AGREGAR ESTA LÃNEA
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
      // ✅ CORREGIDO: Usar metodoPagoService en lugar de fetch directo
      const response = await metodoPagoService.getAll();
      if (response.success) {
        setMetodosPago(response.data);
      }
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
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
      const resultado = await consultarDNI(dni);
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

  // ========== GESTIÃ“N PAGOS MÃšLTIPLES ==========
  const agregarPago = () => {
    if (pagos.length < 2) {
      setPagos([...pagos, { metodo_pago_id: '', monto: '' }]);
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
    const total = parseFloat(formData.precio) || 0;
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
      // ValidaciÃ³n mÃ­nima
      if (!formData.cliente_nombre || !formData.cliente_nombre.trim()) {
        return setErrors({ general: 'Ingrese el nombre del cliente.' });
      }

      if (!formData.tipo_servicio_id) {
        return setErrors({ general: 'Seleccione el tipo de servicio.' });
      }

      if (!formData.fecha_servicio) {
        return setErrors({ general: 'Seleccione la fecha del servicio.' });
      }

      if (!formData.hora_servicio) {
        return setErrors({ general: 'Seleccione la hora del servicio.' });
      }

      // Validar pagos
      if (!validarPagos()) {
        return;
      }

      setLoading(true);

      // Resolver cliente_id
      const clienteId = await ensureCliente(
        formData.cliente_nombre.trim(), 
        (formData.cliente_dni || '').trim()
      );

      // Crear servicio primero
      const servicioPayload = {
        tipo_servicio_id: Number(formData.tipo_servicio_id),
        cliente_id: clienteId,
        fecha_servicio: formData.fecha_servicio,
        hora_servicio: formData.hora_servicio,
        precio: parseFloat(formData.precio),
        estado: 'programado',
        observaciones: formData.observaciones || null
      };

      const servicioResp = await crearServicio(servicioPayload);

      if (!servicioResp.success) {
        throw new Error(servicioResp.message || 'Error al crear servicio');
      }

      const servicio_id = servicioResp.data.id;

      // Crear cobro con pagos mÃºltiples
      const tipoLabel = tiposServicio.find(t => t.value === Number(formData.tipo_servicio_id))?.label || 'Servicio';
      
      const cobroPayload = {
        servicio_id,
        caja_id: null,
        cliente_nombre: formData.cliente_nombre.trim(),
        cliente_dni: formData.cliente_dni?.trim() || '',
        concepto: `Servicio: ${tipoLabel}`,
        monto: parseFloat(formData.precio),
        pagos: pagos.map(p => ({
          metodo_pago_id: parseInt(p.metodo_pago_id),
          monto: parseFloat(p.monto)
        })),
        observaciones: formData.observaciones || null
      };

      // ✅ CORREGIDO: Usar cobrosService.crear en lugar de fetch directo
      const cobroData = await cobrosService.crear(cobroPayload);

      if (!cobroData.success) {
        throw new Error(cobroData.error || 'Error al crear cobro');
      }

      setSuccessMessage('Servicio y cobro registrados exitosamente');
      
      // Si se pidiÃ³ imprimir ticket automÃ¡ticamente
      if (mostrarTicketAuto && cobroData.data.cobro_id) {
        setTimeout(() => {
          abrirTicketPDF(cobroData.data.cobro_id);
        }, 500);
      }

      // Limpiar formulario
      resetForm();
      setShowModal(false);
      loadServicios();
      loadStats();

    } catch (error) {
      console.error('Error al enviar formulario:', error);
      setErrors({ general: error.message || 'Error de conexiÃ³n' });
    } finally {
      setLoading(false);
    }
  };

  const abrirTicketPDF = (cobroId) => {
    // ✅ CORREGIDO: Usar cobrosService.openTicketPdf
    cobrosService.openTicketPdf(cobroId, { hideCliente: 1 });
  };


  const handleEdit = (servicio) => {
    setEditingServicio(servicio);
    setFormData({
      tipo_servicio_id: servicio.tipo_servicio_id || '',
      cliente_id: servicio.cliente_id || '',
      cliente_nombre: servicio.cliente_nombre || '',
      cliente_dni: servicio.cliente_dni || '',
      fecha_servicio: servicio.fecha_servicio ? String(servicio.fecha_servicio).slice(0,10) : '',
      hora_servicio: servicio.hora_servicio || '',
      precio: servicio.precio ?? '',
      estado: servicio.estado || 'programado',
      forma_pago: servicio.forma_pago || '',
      fecha_operacion: servicio.fecha_operacion || '',
      hora_operacion: servicio.hora_operacion || '',
      nro_operacion: servicio.nro_operacion || '',
      obs_operacion: servicio.obs_operacion || '',
      observaciones: servicio.observaciones || ''
    });
    setShowModal(true);
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

  const handleImprimirTicket = async (servicio) => {
    try {
      if (!servicio.precio || Number(servicio.precio) <= 0) {
        return setErrors({ general: 'El servicio no tiene precio válido para emitir ticket.' });
      }
      // Exigir forma de pago definida
      const forma = servicio.forma_pago || formData.forma_pago || '';
      if (!forma) {
        return setErrors({ general: 'Seleccione la forma de pago antes de imprimir el ticket.' });
      }
  
      const metodo_pago_id = resolveMetodoPagoId(formasPago, forma);
  
      // Concepto del ticket (línea)
      const concepto = `Servicio: ${getTipoLabel(servicio.tipo_servicio_id)}`;
  
      await cobrarServicio({
        servicio,
        metodo_pago_id,
        conceptoPersonalizado: concepto
      });

      const r = await cobrarServicio({ servicio, metodo_pago_id, conceptoPersonalizado: concepto });
      await abrirTicketCobroHtml(r.data.id, { tpl: 'familias', hideCliente: 1 });
    } catch (e) {
      console.error(e);
      setErrors({ general: 'No se pudo generar el ticket.' });
    }
  };

  const resetForm = () => {
    setFormData({
      tipo_servicio_id: '',
      cliente_id: '',
      cliente_nombre: '',
      cliente_dni: '',
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
    setPagos([{ metodo_pago_id: '', monto: '' }]); // â† AGREGAR ESTA LÃNEA
    setMostrarTicketAuto(false); // â† AGREGAR ESTA LÃNEA
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Registrar Servicios</h1>
        <p className="text-gray-600 dark:text-gray-400">Registra servicios (Bautismo, Matrimonio, etc.) y su estado</p>
      </div>


      {/* Mensajes */}
      {successMessage && <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">{successMessage}</div>}
      {errors.general   && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{errors.general}</div>}

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
        <div className="flex gap-2">
          {canCreate && <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Nuevo
          </button>}
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
                    {new Date(servicio.fecha_servicio).toLocaleDateString()}
                    {servicio.hora_servicio && ` - ${servicio.hora_servicio}`}
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

                    {/* Imprimir ticket: permitido SIEMPRE */}
                    <button
                      onClick={async () => {
                        try {
                          if (!servicio.precio || Number(servicio.precio) <= 0)
                            return setErrors({ general: 'Defina un precio válido antes de imprimir.' });

                          // Tomamos forma de pago del registro o pedimos (prompt simple)
                          let fp = servicio.forma_pago || formData.forma_pago || '';
                          if (!fp) {
                            fp = prompt('Forma de pago (efectivo, yape, plin, transferencia, interbancario):') || '';
                            if (!fp) return;
                          }
                          const metodo_pago_id = resolveMetodoPagoId(formasPago, fp);
                          const concepto = `Servicio: ${getTipoLabel(servicio.tipo_servicio_id)}`;

                          // Registrar cobro y abrir ticket
                          const r = await cobrarServicio({ servicio, metodo_pago_id, conceptoPersonalizado: concepto });
                          await abrirTicketCobroHtml(r.data.id, { tpl: 'familias', hideCliente: 1 });
                        } catch (e) {
                          console.error(e);
                          setErrors({ general: 'No se pudo generar el ticket.' });
                        }
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

                    {/* Imprimir ticket: permitido cuando ya está realizado */}
                    {servicio.estado === 'realizado' && (
                      <button
                        onClick={() => handleImprimirTicket(servicio)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                        title="Imprimir ticket 80mm"
                      >
                        Imprimir ticket
                      </button>
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
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
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

              <form onSubmit={handleSubmit} className="space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Tipo */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Tipo de Servicio *
      </label>
      <select
        value={formData.tipo_servicio_id}
        onChange={(e) => handleTipoChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.tipo_servicio_id ? 'border-red-500' : 'border-gray-300'}`}
        required
      >
        <option value="">Seleccionar tipo</option>
        {tiposServicio.map(tipo => (
          <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
        ))}
      </select>
      {errors.tipo_servicio_id && <p className="mt-1 text-sm text-red-600">{errors.tipo_servicio_id}</p>}
    </div>

    {/* Fecha */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Fecha del Servicio *
      </label>
      <input
        type="date"
        value={formData.fecha_servicio}
        onChange={(e) => setFormData(prev => ({ ...prev, fecha_servicio: e.target.value }))}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.fecha_servicio ? 'border-red-500' : 'border-gray-300'}`}
        required
      />
      {errors.fecha_servicio && <p className="mt-1 text-sm text-red-600">{errors.fecha_servicio}</p>}
    </div>

    {/* Cliente (obligatorio) */}
<div>
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    Cliente (nombre completo) <span className="text-red-500">*</span>
  </label>
  <input
    type="text"
    name="cliente_nombre"
    value={formData.cliente_nombre}
    onChange={(e) => setFormData({...formData, cliente_nombre: e.target.value})}
    required
    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
    placeholder="Nombre completo del cliente"
  />
</div>

    {/* DNI (opcional) con botón de búsqueda */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        DNI (opcional)
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          name="cliente_dni"
          value={formData.cliente_dni}
          onChange={(e) => setFormData({...formData, cliente_dni: e.target.value.replace(/\D/g, '')})}
          maxLength="8"
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          placeholder="DNI (8 dígitos)"
        />
        <button
          type="button"
          onClick={handleBuscarDNI}
          disabled={buscandoDNI || !formData.cliente_dni || formData.cliente_dni.length !== 8}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Buscar DNI en RENIEC"
        >
          {buscandoDNI ? (
            <span className="animate-spin">🔄</span>
          ) : (
            '🔍'
          )}
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Ingrese el DNI y presione el botón para autocompletar el nombre
      </p>
    </div>


    {/* Hora del Servicio */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Hora del Servicio <span className="text-red-500">*</span>
      </label>
      <select
        name="hora_servicio"
        value={formData.hora_servicio}
        onChange={(e) => setFormData({...formData, hora_servicio: e.target.value})}
        required
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
      >
        <option value="">Seleccionar hora</option>
        {Array.from({ length: 15 }, (_, i) => 7 + i).flatMap(hora => [
          <option key={`${hora}:00`} value={`${hora.toString().padStart(2, '0')}:00`}>
            {`${hora.toString().padStart(2, '0')}:00 ${hora < 12 ? 'AM' : 'PM'}`}
          </option>,
          <option key={`${hora}:30`} value={`${hora.toString().padStart(2, '0')}:30`}>
            {`${hora.toString().padStart(2, '0')}:30 ${hora < 12 ? 'AM' : 'PM'}`}
          </option>
        ])}
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Horario disponible: 7:00 AM - 9:00 PM (solo en punto o media hora)
      </p>
    </div>

    {/* Precio (S/) */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio (S/)</label>
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

    {/* Estado */}
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

    {/* Forma de Pago */}
    <div className="col-span-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Formas de Pago <span className="text-red-500">*</span>
      </label>
      
      {pagos.map((pago, index) => (
        <div key={index} className="flex gap-2 mb-2">
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
      ))}
      
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
          {formData.precio && (
            <span className={`ml-2 ${Math.abs(calcularTotalPagos() - parseFloat(formData.precio)) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {Math.abs(calcularTotalPagos() - parseFloat(formData.precio)) < 0.01 ? '✓ Coincide' : '⚠️ No coincide'}
            </span>
          )}
        </div>
      </div>
    </div>

    {/* Checkbox imprimir ticket */}
    <div className="col-span-2">
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


    {/* Campos de operación si ≠ efectivo */}
    {pagos.some(p => {
    const m = metodosPago.find(mp => String(mp.id) === String(p.metodo_pago_id));
    return m && m.nombre.toLowerCase() !== 'efectivo';
    }) && (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de operación</label>
          <input
            type="date"
            value={formData.fecha_operacion || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, fecha_operacion: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora de operación</label>
          <input
            type="time"
            value={formData.hora_operacion || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, hora_operacion: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N° de operación</label>
          <input
            type="text"
            value={formData.nro_operacion || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, nro_operacion: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Código / referencia de la operación"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Obs. de la operación</label>
          <textarea
            rows={2}
            value={formData.obs_operacion || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, obs_operacion: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Notas adicionales del pago"
          />
        </div>
      </>
    )}
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
