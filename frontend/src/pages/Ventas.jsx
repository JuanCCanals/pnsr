// /frontend/src/pages/Ventas.jsx
import React, { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { ventasService, catalogosService } from "../services/api";

// Normaliza cualquier fecha (Date/ISO/string) a yyyy-MM-dd
const toYMD = (v) => {
  if (!v) return "";
  // si ya viene como yyyy-MM-dd, la devolvemos tal cual
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d)) {
    // como fallback, recortar si es ISO: "2025-11-20T05:00:00.000Z" -> "2025-11-20"
    if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
    return "";
  }
  // Ajuste para evitar desfase de zona horaria al sacar YYYY-MM-DD
  const off = d.getTimezoneOffset();
  const d2 = new Date(d.getTime() - off * 60000);
  return d2.toISOString().slice(0, 10);
};

export default function Ventas() {
  // ---------- listado / filtros ----------
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [pagination, setPagination] = useState({
    total: 0, totalPages: 1, hasPrev: false, hasNext: false,
  });

  const [search, setSearch] = useState("");
  const [formaFilter, setFormaFilter] = useState("");
  const [modalidadFilter, setModalidadFilter] = useState("");
  const [fechaIni, setFechaIni] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  // catálogos
  const [modalidades, setModalidades] = useState([]);
  const [puntos, setPuntos] = useState([]);

  // ---------- modal (create/edit) ----------
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState("create"); // 'create' | 'edit'
  const [editId, setEditId] = useState(null);
  const [propagarEstado, setPropagarEstado] = useState(false);
  const [toast, setToast] = useState(null); // {text, type}

  const showToast = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 1800);
  };

  // campos compartidos
  const [recibo, setRecibo] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [modalidadId, setModalidadId] = useState(null);
  const [monto, setMonto] = useState("40.00");
  const [puntoVentaId, setPuntoVentaId] = useState(null);

  const [formaPago, setFormaPago] = useState("Efectivo");
  const [devolucion, setDevolucion] = useState("");
  const [obsVenta, setObsVenta] = useState("");
  const [estadoVenta, setEstadoVenta] = useState("Entregada a Benefactor");

  const [saldoExcedente, setSaldoExcedente] = useState(0);

  // pagos múltiples por gestión (solo en create se editan)
  const [pagos, setPagos] = useState([
    { monto: "", opFecha: "", opHora: "", opNumero: "", opObs: "" }
  ]);

  // benefactor (solo S/40 al crear)
  const [bf, setBf] = useState({ nombres: "", apellidos: "", telefono: "", correo: "" });

  // cajas (solo S/40 al crear)
  const [codigo, setCodigo] = useState("");
  const [items, setItems] = useState([]); // [{codigo, ok, error?}]

  const [msg, setMsg] = useState({ type: "", text: "" });

  // ---------- load catálogos + primer fetch ----------
  useEffect(() => {
    (async () => {
      const [mRes, pRes] = await Promise.all([
        catalogosService.getModalidades(),
        catalogosService.getPuntosVenta(),
      ]);

      if (mRes?.success) {
        setModalidades(mRes.data || []);
        if (mRes.data?.length) {
          setModalidadId(mRes.data[0].id);
          setMonto(String(Number(mRes.data[0].costo || 0).toFixed(2)));
        }
      }
      if (pRes?.success) {
        setPuntos(pRes.data || []);
        if (pRes.data?.length) setPuntoVentaId(pRes.data[0].id);
      }

      fetchRows(1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // set monto when modalidad changes
  useEffect(() => {
    const mod = modalidades.find((m) => m.id === modalidadId);
    if (mod) setMonto(String(Number(mod.costo || 0).toFixed(2)));
  }, [modalidadId, modalidades]);

  // Ajusta estado por defecto según modalidad (solo al CREAR)
  useEffect(() => {
    const mod = modalidades.find((m) => m.id === modalidadId);
    const costo = Number(mod?.costo || 0);

    if (mode !== "create") return; // 👈 no tocar cuando editas

    if (costo === 160) {
      setEstadoVenta("Asignada");
      setDevolucion("");           // 👈 limpiamos por si quedó algo escrito
    } else {
      setEstadoVenta("Entregada a Benefactor");
    }
  }, [modalidadId, modalidades, mode]);

  const selMod = modalidades.find((m) => m.id === modalidadId);
  const costoSel = Number(selMod?.costo || 0);
  const is40 = costoSel === 40;
  const is160 = costoSel === 160;

  // ---------- listado ----------
  async function fetchRows(goToPage = page) {
    try {
      setLoading(true);
      const params = {
        page: goToPage,
        limit,
        search:        search || undefined,
        forma_pago:    formaFilter || undefined,
        modalidad_id:  modalidadFilter || undefined,
        fecha_desde:   fechaIni || undefined,
        fecha_hasta:   fechaFin || undefined,
      };
      const r = await ventasService.getAll(params);
      if (r?.success) {
        setRows(r.data || []);
        setPagination(r.pagination || { total: 0, totalPages: 1, hasPrev: false, hasNext: false });
        setPage(goToPage);
      } else {
        setRows([]);
        setPagination({ total: 0, totalPages: 1, hasPrev: false, hasNext: false });
      }
    } finally {
      setLoading(false);
    }
  }

    // Consultar excedente cuando cambia el teléfono del benefactor
    useEffect(() => {
      if (!is160 || mode !== "create") {
        setSaldoExcedente(0);
        return;
      }
    
      (async () => {
        try {
          const r = await ventasService.getSaldoExcedentes();
          if (r?.success) setSaldoExcedente(Number(r.saldo || 0));
          else setSaldoExcedente(0);
        } catch {
          setSaldoExcedente(0);
        }
      })();
    }, [is160, mode]);

  // ---------- export ----------
  async function downloadExcel(filename, rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ventas");

    ws.columns = [
      { header: "Recibo", key: "Recibo", width: 14 },
      { header: "Fecha", key: "Fecha", width: 12 },
      { header: "Modalidad", key: "Modalidad", width: 20 },
      { header: "Monto", key: "Monto", width: 10 },
      { header: "Moneda", key: "Moneda", width: 8 },
      { header: "FormaPago", key: "FormaPago", width: 16 },
      { header: "PuntoVenta", key: "PuntoVenta", width: 18 },
      { header: "Benefactor", key: "Benefactor", width: 28 },
      { header: "Códigos", key: "Codigos", width: 40 },
      { header: "FecDevolución", key: "FecDevolucion", width: 14 },
      { header: "Estado", key: "Estado", width: 18 },
    ];

    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle", horizontal: "center" };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    });

    rows.forEach(r => ws.addRow(r));
    ws.eachRow((row, n) => {
      if (n === 1) return;
      row.eachCell((cell) => {
        cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  async function handleExportXlsxAll() {
    try {
      const params = {
        page: 1,
        limit: 100000,
        search:        search || undefined,
        forma_pago:    formaFilter || undefined,
        modalidad_id:  modalidadFilter || undefined,
        fecha_desde:   fechaIni || undefined,
        fecha_hasta:   fechaFin || undefined,
        sort_by: "v.fecha",
        sort_dir: "desc",
      };
      const r = await ventasService.exportAll(params);
      if (!r?.success || !Array.isArray(r.data) || r.data.length === 0) {
        alert("No hay datos para exportar.");
        return;
      }

      const rows = r.data.map(v => ({
        Recibo:        v.recibo,
        Fecha:         toYMD(v.fecha),
        Modalidad:     v.modalidad_nombre || "",
        Monto:         Number(v.monto || 0),
        Moneda:        v.moneda || "PEN",
        FormaPago:     v.forma_pago || "",
        PuntoVenta:    v.punto_venta_nombre || "",
        Benefactor:    v.benefactor_nombre || "",
        Codigos:       v.codigos || "",
        FecDevolucion: toYMD(v.fecha_devolucion),
        Estado:        v.estado || "",
      }));

      await downloadExcel(
        `ventas_filtrado_${new Date().toISOString().slice(0,10)}.xlsx`,
        rows
      );
    } catch (e) {
      console.error(e);
      alert("No se pudo exportar el filtrado completo.");
    }
  }

  // ---------- helpers modal ----------
  const resetModal = () => {
    setMsg({ type: "", text: "" });
    setPropagarEstado(false);
    setRecibo("");
    setFecha(new Date().toISOString().slice(0, 10));
    setModalidadId(modalidades[0]?.id || null);
    setPuntoVentaId(puntos[0]?.id || null);
    setFormaPago("Efectivo");
    setDevolucion("");
    setObsVenta("");
    setEstadoVenta("Entregada a Benefactor");
    setBf({ nombres: "", apellidos: "", telefono: "", correo: "" });
    setCodigo("");
    setItems([]);
    setPagos([{ monto: "", opFecha: "", opHora: "", opNumero: "", opObs: "" }]);
  };

  const openCreateModal = () => {
    setMode("create");
    setEditId(null);
    resetModal();
    setShowModal(true);
  };

  const openEditModal = (r) => {
    setMode("edit");
    setEditId(r.id);
    setMsg({ type: "", text: "" });

    setRecibo(r.recibo || "");
    setFecha(toYMD(r.fecha) || new Date().toISOString().slice(0, 10));
    setModalidadId(r.modalidad_id || modalidades[0]?.id || null);
    setPuntoVentaId(r.punto_venta_id || puntos[0]?.id || null);
    setFormaPago(r.forma_pago || "Efectivo");
    setDevolucion(toYMD(r.fecha_devolucion) || "");
    setObsVenta(r.observaciones || "");
    setEstadoVenta(r.estado || "Entregada a Benefactor");

    // edición: no tocamos benefactor ni códigos ni pagos
    setBf({ nombres: "", apellidos: "", telefono: "", correo: "" });
    setItems([]);
    setPropagarEstado(false);

    setShowModal(true);
  };

  // ---------- popup: manejo de cajas (create only) ----------
  const addCodigo = async () => {
    const cod = (codigo || "").trim();
    if (!cod) return;
    setCodigo("");
    if (is160) return; // en S/160 no se asigna caja

    const resp = await ventasService.buscarCaja(cod);
    if (resp?.success) {
      setItems((prev) => [...prev, { codigo: cod, ok: true }]);
    } else {
      setItems((prev) => [...prev, { codigo: cod, ok: false, error: resp?.error || "No válida" }]);
    }
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // --- pagos múltiples ---
  const totalPagos = pagos.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);

  const addPagoRow = () => {
    setPagos(prev => [...prev, { monto: "", opFecha: "", opHora: "", opNumero: "", opObs: "" }]);
  };

  const removePagoRow = (idx) => {
    setPagos(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePago = (idx, field, value) => {
    setPagos(prev =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  // ---------- guardar (create/edit) ----------
  const handleGrabar = async () => {
    setMsg({ type: "", text: "" });

    if (mode === "create") {
          // Si paga con excedente, solo aplica a modalidad S/160 y debe haber saldo suficiente
          if (formaPago === "Con excedente") {
            if (!is160) {
              return setMsg({
                type: "error",
                text: "El pago con excedente solo aplica a cajas de S/ 160.",
              });
            }

            if (saldoExcedente < 160) {
              return setMsg({
                type: "error",
                text: `El saldo de excedentes (S/ ${saldoExcedente.toFixed(2)}) no alcanza para pagar una caja de S/ 160.`,
              });
            }
          }

      // Validaciones CREATE
      if (!recibo.trim())
        return setMsg({ type: "error", text: "Coloca el No. de recibo" });

      const codigos = items.filter(i => i.ok).map(i => i.codigo);
      if (is40 && codigos.length === 0)
        return setMsg({ type: "error", text: "Agrega al menos una caja válida" });

      if (is40) {
        if (!bf.nombres.trim())
          return setMsg({ type: "error", text: "Ingresa el nombre del benefactor" });
        if (!devolucion)
          return setMsg({ type: "error", text: "Ingresa la fecha de devolución" });
      }

      //////////////////
      // --- pagos múltiples ---
      let pagosLimpios = pagos
        .map(p => ({
          ...p,
          monto: Number(p.monto || 0),
        }))
        .filter(p => p.monto > 0);

      if (formaPago === "Con excedente") {
        // Con excedente: no se envían pagos al backend
        pagosLimpios = [];
      } else {
        if (pagosLimpios.length === 0) {
          return setMsg({ type: "error", text: "Ingresa al menos un pago con monto > 0" });
        }

        if (formaPago !== "Efectivo") {
          const fp = (formaPago || "").toLowerCase();
          const requiereHora = !["yape", "transferencia", "interbancario"].includes(fp);
          const requiereNumero = !["plin"].includes(fp);

          for (const [idx, p] of pagosLimpios.entries()) {
            if (!p.opFecha) {
              return setMsg({
                type: "error",
                text: `Ingresa la fecha de operación del pago ${idx + 1}`,
              });
            }
            if (requiereHora && !p.opHora) {
              return setMsg({
                type: "error",
                text: `Ingresa la hora de operación del pago ${idx + 1}`,
              });
            }
            if (requiereNumero && !String(p.opNumero || "").trim()) {
              return setMsg({
                type: "error",
                text: `Ingresa el Nº de operación del pago ${idx + 1}`,
              });
            }
          }
        }
      }

      const pagosPayload = pagosLimpios.map(p => ({
        forma_pago: formaPago,
        monto: p.monto,
        fecha, // usamos la fecha de la venta como fecha del pago
        fecha_operacion: formaPago !== "Efectivo" ? p.opFecha || null : null,
        hora_operacion:  formaPago !== "Efectivo" ? p.opHora || null : null,
        nro_operacion:   formaPago !== "Efectivo"
          ? (p.opNumero || "").slice(0, 32) || null
          : null,
        obs_operacion:   formaPago !== "Efectivo"
          ? (p.opObs || "").slice(0, 100) || null
          : null,
      }));
      ///////////


      const payload = {
        recibo: recibo.trim(),
        fecha,
        modalidad_id: modalidadId,
        punto_venta_id: puntoVentaId,
        forma_pago: formaPago || null,
        estado: estadoVenta || "Entregada a Benefactor",
        monto: Number(monto || 0),     // monto "de referencia": costo de la(s) caja(s)
        moneda: "PEN",
        benefactor: is40 ? bf : null,
        codigos: is40 ? codigos : [],
        fecha_devolucion: is40 ? devolucion : null,
        obs: obsVenta?.slice(0, 62) || null,
        pagos: pagosPayload,           // 👈 AQUÍ mandamos los pagos múltiples
      };

      try {
        const resp = await ventasService.registrar(payload);
      
        if (resp?.success) {
          showToast("Registro guardado", "success");
          setShowModal(false);
          // resets mínimos
          setItems([]);
          setRecibo("");
          setBf({ nombres: "", apellidos: "", telefono: "", correo: "" });
          setDevolucion("");
          setObsVenta("");
          setPagos([{ monto: "", opFecha: "", opHora: "", opNumero: "", opObs: "" }]);
          fetchRows(page || 1);
        } else {
          const errorTxt = resp?.error || "Ocurrió un error al registrar la venta";
          const finalTxt = errorTxt.includes("Recibo ya registrado")
            ? "Recibo ya registrado"
            : errorTxt;
      
          // ⬇️ mensaje en el modal
          setMsg({ type: "error", text: finalTxt });
          // ⬇️ toast global
          showToast(finalTxt, "error");
        }
      } catch (err) {
        const apiError =
          err?.response?.data?.error ||
          err?.message ||
          "Ocurrió un error al registrar la venta";
      
        const finalTxt = apiError.includes("Recibo ya registrado")
          ? "Recibo ya registrado"
          : `Ocurrió un error al registrar la venta: ${apiError}`;
      
        // ⬇️ mensaje en el modal
        setMsg({ type: "error", text: finalTxt });
        // ⬇️ toast global
        showToast(finalTxt, "error");
      }
      

    } else {
      // EDIT (esta parte la puedes dejar como ya la tienes)
      const payload = {
        fecha,
        modalidad_id: modalidadId,
        punto_venta_id: puntoVentaId,
        forma_pago: formaPago || null,
        estado: estadoVenta || null,
        fecha_devolucion: devolucion || null,
        observaciones: obsVenta?.slice(0, 62) || null,
        propagar_estado_cajas: !!propagarEstado,
      };

      const resp = await ventasService.update(editId, payload);

      if (resp?.success) {
        showToast("Gestión actualizada", "success");
        setShowModal(false);
        setMode("create");
        setEditId(null);
        fetchRows(page || 1);
      } else {
        setMsg({ type: "error", text: resp?.error || "No se pudo actualizar" });
      }
    }
  };

  const prettyEstado = (estado) => {
    if (!estado) return "—";
    switch (estado) {
      case "Devuelta":
        return "Devuelta por Benefactor";
      case "Asignada":
        return "Asignada (caja S/160)";
      default:
        return estado;
    }
  };


  // ---------- Render ----------
  return (
    <div className="p-6">
      {/* Toast simple */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-2 rounded shadow
          ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.text}
        </div>
      )}
      {/* Encabezado */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Asignación de cajas, registro de pagos y devoluciones.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Asignar caja
          </button>
          <button
            type="button"
            onClick={handleExportXlsxAll}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar (recibo, beneficiario, código)…"
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        />
        <select
          value={modalidadFilter}
          onChange={(e) => {
            setModalidadFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        >
          <option value="">Todas las modalidades</option>
          {modalidades.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} (S/ {Number(m.costo || 0).toFixed(2)})
            </option>
          ))}
        </select>
        <select
          value={formaFilter}
          onChange={(e) => {
            setFormaFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        >
          <option value="">Todas las formas</option>
          <option>Efectivo</option>
          <option>Yape</option>
          <option>Plin</option>
          <option>Transferencia</option>
          <option>Interbancario</option>
          <option>Con excedente</option>
        </select>

        <input
          type="date"
          value={fechaIni}
          onChange={(e) => setFechaIni(e.target.value)}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        />
        <input
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        />
        <div className="flex gap-2">
          <button onClick={() => fetchRows(1)} className="px-3 py-2 rounded bg-blue-600 text-white">
            Aplicar
          </button>
          <button
            onClick={() => {
              setSearch("");
              setModalidadFilter("");
              setFormaFilter("");
              setFechaIni("");
              setFechaFin("");
              fetchRows(1);
            }}
            className="px-3 py-2 rounded border"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Tabla: columnas reducidas */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {[
                  "Fecha",
                  "Recibo",
                  "Benefactor",
                  "Códigos",
                  "Fec. Devol.",
                  "Estado",
                  "Acciones"
                ].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-gray-500">
                    Sin resultados
                  </td>
                </tr>
              )}
              
              {!loading &&
                rows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 whitespace-nowrap">{toYMD(r.fecha)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{r.recibo}</td>
                    <td className="px-5 py-3">{r.benefactor_nombre || ""}</td>
                    <td className="px-5 py-3">{r.codigos || ""}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{toYMD(r.fecha_devolucion) || "—"}</td>

                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-900 dark:text-gray-200">
                        {prettyEstado(r.estado)}
                      </span>
                    </td>

                    <td className="px-5 py-3 whitespace-nowrap">
                      <button
                        className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() => openEditModal(r)}
                      >
                        Modificar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Paginación simple */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {pagination.total
              ? (
                <>
                  Mostrando {(page - 1) * limit + 1} – {Math.min(page * limit, pagination.total)} de {pagination.total}
                </>
                )
              : "—"}
          </div>
          <div className="flex gap-2">
            <button
              disabled={!pagination.hasPrev}
              onClick={() => fetchRows(Math.max(1, page - 1))}
              className="px-3 py-2 border rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="px-3 py-2 rounded bg-blue-600 text-white">{page}</span>
            <button
              disabled={!pagination.hasNext}
              onClick={() => fetchRows(page + 1)}
              className="px-3 py-2 border rounded disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* ===== Modal Asignar/Modificar (compacto + scroll interno) ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 w-[980px] max-w-[95vw] max-h-[92vh] overflow-auto rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="text-xl font-bold">
                {mode === "create" ? "Asignar Caja / Registrar Venta" : `Modificar Venta #${editId}`}
              </h2>
              <button onClick={() => setShowModal(false)} className="px-2 py-1 rounded bg-gray-200">
                ✕
              </button>
            </div>

            {msg.text && (
              <div
                className={`mb-3 px-3 py-2 rounded ${
                  msg.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                {msg.text}
              </div>
            )}

            {/* Cabecera compacta en 3 columnas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm block mb-1">No. Recibo</label>
                <input
                  className={`w-full border rounded px-2 py-1 ${mode==='edit' ? 'bg-gray-100' : ''}`}
                  value={recibo}
                  onChange={(e) => setRecibo(e.target.value)}
                  readOnly={mode === "edit"}
                />
              </div>
              <div>
                <label className="text-sm block mb-1">Fecha</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm block mb-1">Estado</label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={estadoVenta}
                  onChange={(e) => setEstadoVenta(e.target.value)}
                  disabled={mode === "create" && is160}   // 👈 sigue bloqueando S/160 al crear
                  title={mode === "create" && is160
                    ? "Estado fijado en 'Asignada' para modalidad S/160"
                    : undefined}
                >
                  {/* Entregada a benefactor (venta S/40 normal) */}
                  <option value="Entregada a Benefactor">
                    Entregada a Benefactor
                  </option>

                  {/* Devuelta por benefactor (seguimos usando 'Devuelta' internamente) */}
                  <option value="Devuelta">
                    Devuelta por Benefactor
                  </option>

                  {/* Nuevo estado: Entregada a familia */}
                  <option value="Entregada a Familia">
                    Entregada a Familia
                  </option>

                  {/* Asignada (cajas de S/160, sin caja física) */}
                  <option value="Asignada">
                    Asignada (caja S/160)
                  </option>
                </select>
              </div>


              <div>
                <label className="text-sm block mb-1">Modalidad</label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={modalidadId || ""}
                  onChange={(e) => setModalidadId(Number(e.target.value))}
                >
                  {modalidades.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} (S/ {Number(m.costo || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm block mb-1">Monto</label>
                <input className="w-full border rounded px-2 py-1 bg-gray-100" value={monto} readOnly />
              </div>
              <div>
                <label className="text-sm block mb-1">Pto. Venta</label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={puntoVentaId || ""}
                  onChange={(e) => setPuntoVentaId(Number(e.target.value))}
                >
                  {puntos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm block mb-1">Forma pago</label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={formaPago}
                  onChange={(e) => setFormaPago(e.target.value)}
                >
                  <option>Efectivo</option>
                  <option>Yape</option>
                  <option>Plin</option>
                  <option>Transferencia</option>
                  <option>Interbancario</option>

                  {/* Solo mostrar cuando modalidad sea S/160 */}
                  {is160 && <option>Con excedente</option>}
                </select>

              </div>

              {/* Pagos (uno o varios) */}
              {mode === "create" && formaPago !== "Con excedente" && (
                <div className="md:col-span-3 mt-2 border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">
                      Pagos registrados
                    </span>
                    <span className="text-xs text-gray-600">
                      Total pagos: S/ {totalPagos.toFixed(2)} | Monto referencia: S/ {Number(monto || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left">Monto</th>
                          {formaPago !== "Efectivo" && formaPago !== "Con excedente" && (
                            <>
                              <th className="px-2 py-1 text-left">Fec. operación</th>
                              <th className="px-2 py-1 text-left">Hora</th>
                              <th className="px-2 py-1 text-left">Nº operación</th>
                              <th className="px-2 py-1 text-left">Obs.</th>
                            </>
                          )}
                          <th className="px-2 py-1 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pagos.map((p, idx) => (
                          <tr key={idx}>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                step="0.01"
                                className="w-full border rounded px-1 py-0.5"
                                value={p.monto}
                                onChange={(e) => updatePago(idx, "monto", e.target.value)}
                              />
                            </td>
                            
                            {formaPago !== "Efectivo" && formaPago !== "Con excedente" &&(
                              <>
                                <td className="px-2 py-1">
                                  <input
                                    type="date"
                                    className="w-full border rounded px-1 py-0.5"
                                    value={p.opFecha}
                                    onChange={(e) => updatePago(idx, "opFecha", e.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    type="time"
                                    className="w-full border rounded px-1 py-0.5"
                                    value={p.opHora}
                                    onChange={(e) => updatePago(idx, "opHora", e.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    maxLength={32}
                                    className="w-full border rounded px-1 py-0.5"
                                    value={p.opNumero}
                                    onChange={(e) => updatePago(idx, "opNumero", e.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    maxLength={100}
                                    className="w-full border rounded px-1 py-0.5"
                                    value={p.opObs}
                                    onChange={(e) => updatePago(idx, "opObs", e.target.value)}
                                  />
                                </td>
                              </>
                            )}
                            
                            <td className="px-2 py-1 text-right">
                              <button
                                type="button"
                                className="text-xs text-red-600 hover:underline"
                                onClick={() => removePagoRow(idx)}
                                disabled={pagos.length === 1}
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-xs rounded bg-indigo-600 text-white"
                      onClick={addPagoRow}
                    >
                      + Agregar pago
                    </button>
                  </div>
                </div>
              )}



              {/* Fecha de devolución: solo S/40 */}
              {is40 && (
                <div>
                  <label className="text-sm block mb-1">Fecha de devolución</label>
                  <input
                    type="date"
                    className="w-full border rounded px-2 py-1"
                    value={devolucion}
                    onChange={(e) => setDevolucion(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="text-sm block mb-1">Observaciones (62)</label>
                <input
                  maxLength={62}
                  className="w-full border rounded px-2 py-1"
                  value={obsVenta}
                  onChange={(e) => setObsVenta(e.target.value)}
                />
              </div>

              {mode === "edit" && (
                <div className="md:col-span-3 flex items-center gap-2">
                  <input
                    id="propagar"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={propagarEstado}
                    onChange={(e) => setPropagarEstado(e.target.checked)}
                  />
                  <label htmlFor="propagar" className="text-sm">
                    Propagar estado a cajas vinculadas
                  </label>
                </div>
              )}
            </div>

            {/* Benefactor + Códigos (solo create + S/40) */}
            {mode === "create" && (
              <>

                {/* Mostrar saldo de excedente (solo S/160 + crear) */}
                {mode === "create" && is160 && saldoExcedente > -1 && (
                  <div className="md:col-span-3 mt-2 p-3 rounded bg-yellow-50 border text-sm text-gray-800">
                    <strong>Saldo excedente disponible:</strong> S/ {saldoExcedente.toFixed(2)}
                  </div>
                )}

                {is40 ? (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm block mb-1">Nombres</label>
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={bf.nombres}
                        onChange={(e) => setBf((v) => ({ ...v, nombres: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm block mb-1">Apellidos</label>
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={bf.apellidos}
                        onChange={(e) => setBf((v) => ({ ...v, apellidos: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm block mb-1">Teléfono</label>
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={bf.telefono}
                        onChange={(e) => setBf((v) => ({ ...v, telefono: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm block mb-1">Correo</label>
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={bf.correo}
                        onChange={(e) => setBf((v) => ({ ...v, correo: e.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-3 rounded border bg-gray-50 text-sm">
                    Modalidad S/160: no se asignan cajas ni se capturan datos de benefactor.
                  </div>
                )}

                {is40 && (
                  <div className="mt-4">
                    <div className="flex items-end gap-2 mb-2">
                      <div className="flex-1">
                        <label className="text-sm block mb-1">Código de caja</label>
                        <input
                          className="w-full border rounded px-2 py-1"
                          value={codigo}
                          onChange={(e) => setCodigo(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addCodigo()}
                        />
                      </div>
                      <button onClick={addCodigo} className="px-3 py-2 rounded bg-indigo-600 text-white">
                        Agregar
                      </button>
                    </div>

                    <div className="border rounded">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Código</th>
                            <th className="px-3 py-2 text-left">Estado</th>
                            <th className="px-3 py-2 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {items.map((i, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2">{i.codigo}</td>
                              <td className="px-3 py-2">
                                {i.ok ? (
                                  <span className="text-green-700">OK</span>
                                ) : (
                                  <span className="text-red-700">{i.error || "No válida"}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => removeItem(idx)}
                                  className="text-red-600 hover:underline"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                          {items.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                                Sin cajas agregadas
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 mt-6 sticky bottom-0 bg-white dark:bg-gray-800 py-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded bg-gray-200">
                Cancelar
              </button>
              <button onClick={handleGrabar} className="px-4 py-2 rounded bg-green-600 text-white">
                {mode === "create" ? "Guardar" : "Actualizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
