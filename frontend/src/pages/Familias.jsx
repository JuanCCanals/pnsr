import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { familiasService, zonasService } from "../services/api";
import ImportarFamilias from "./ImportarFamilias.jsx";
import Barcode from "react-barcode";
import Code128 from "../components/labels/Code128.jsx"; // <-- ajusta la ruta si difiere
//import BarcodeImg from "../components/labels/BarcodeImg.jsx";
import BarcodeDataUrl from "../components/labels/BarcodeDataUrl.jsx";
import JsBarcode from "jsbarcode";
import ExcelJS from "exceljs";

// Función helper para mostrar edad
const mostrarEdad = (integrante) => {
  // Priorizar edad_texto si existe
  if (integrante.edad_texto) {
    return integrante.edad_texto;
  }
  
  // Si no, calcular desde fecha_nacimiento
  if (integrante.fecha_nacimiento) {
    const anioNac = new Date(integrante.fecha_nacimiento).getFullYear();
    const edad = new Date().getFullYear() - anioNac;
    return `${edad}`;
  }
  
  return '';
};

// === Helpers de Familias (export + titular) ===
function pickTitular(f) {
  const p = (f?.nombre_padre || '').trim();
  const m = (f?.nombre_madre || '').trim();
  return p || m || '';
}

// Mapea fila → columnas del Excel
function mapFamiliaRow(f) {
  return {
    Codigo: f.codigo_unico ?? f.codigo ?? "",
    Zona: f.zona_nombre ?? f.zona ?? "",
    Titular: pickTitular(f),
    Integrantes: Number(f.total_integrantes ?? f.integrantes ?? 0),
    Estado: f.estado_caja ?? f.estado ?? "",
  };
}

// Genera y descarga un XLSX en el browser
async function downloadExcel(filename, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Familias");

  // Definir columnas y anchos
  ws.columns = [
    { header: "Código", key: "Codigo", width: 16 },
    { header: "Zona", key: "Zona", width: 24 },
    { header: "Titular", key: "Titular", width: 28 },
    { header: "Integrantes", key: "Integrantes", width: 14 },
    { header: "Estado", key: "Estado", width: 14 },
  ];

  // Estilo de cabecera
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }; // gris claro
    cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  });

  // Agregar filas
  rows.forEach((r) => ws.addRow(r));

  // Bordes finos al cuerpo
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}


function toCSV(rows) {
  const head = ['Codigo','Zona','Titular','Integrantes','Estado'];
  const body = rows.map(r => [
    r.codigo_unico ?? r.codigo ?? '',
    r.zona_nombre ?? r.zona ?? '',
    pickTitular(r),
    String(r.integrantes ?? r.total_integrantes ?? ''),
    r.estado ?? ''
  ]);
  const all = [head, ...body];
  return all.map(row =>
    row.map(cell => {
      const s = (cell ?? '').toString();
      // scape comas, comillas y saltos
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
      return s;
    }).join(',')
  ).join('\n');
}

function downloadCSV(filename, csv) {
  // BOM para que Excel reconozca UTF-8
  const blob = new Blob(["\uFEFF"+csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

// === Helpers de edad (meses) ===
const _norm = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ");

const _isAgeText = (s) => {
  const t = _norm(s);
  if (!t) return false;
  if (/(^| )RN($| )|RECIEN NACID/.test(t)) return true;
  if (/\b\d+\s*A(N|Ñ)O(S)?(\s+\d+\s+MES(ES)?)?\b/.test(t)) return true;
  if (/\b\d+\s+MES(ES)?\b/.test(t)) return true;
  if (/\b\d+\s+DIA(S)?\b/.test(t)) return true;
  return false;
};

const _monthsFromDate = (fecha) => {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d)) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  // Ajuste por día del mes
  if (now.getDate() < d.getDate()) months -= 1;
  return months < 0 ? 0 : months;
};

// ¿Obs habla de meses o RN?
const _isMesesOrRN = (s) => {
  const t = _norm(s);
  if (!t) return false;
  if (/(^| )RN($| )|RECIEN NACID/.test(t)) return true;
  if (/\b\d+\s*MES(ES)?\b/.test(t)) return true;
  if (/\b\d+\s*DIA(S)?\b/.test(t)) return true; // lo tratamos como 0 meses
  return false;
};

// Meses solo desde texto de meses/RN
const _monthsFromText = (s) => {
  const t = _norm(s);
  if (!t) return null;
  if (/(^| )RN($| )|RECIEN NACID/.test(t)) return 0;
  const m = t.match(/(\d+)\s*MES(ES)?/);
  const d = t.match(/(\d+)\s*DIA(S)?/);
  if (m) return Math.max(0, parseInt(m[1], 10) || 0);
  if (d) return 0; // “X días” => 0m
  return null;
};

// Años desde fecha
const _yearsFromDate = (fecha) => {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d)) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
  return e < 0 ? 0 : e;
};

/** Devuelve string para la etiqueta:
 * - "Xm" si no hay fecha y obs = nMESES/RN
 * - "Y" (años) si hay fecha
 * - "" en cualquier otro caso
 */
const getEdadParaEtiqueta = (fecha_nacimiento, edad_texto, observaciones) => {
  // ✅ PRIORIDAD 1: Si existe edad_texto, usarlo directamente
  if (edad_texto && String(edad_texto).trim()) {
    return String(edad_texto).trim();
  }
  
  // PRIORIDAD 2: Calcular desde fecha_nacimiento
  const years = _yearsFromDate(fecha_nacimiento);
  if (years !== null) return String(years);

  // PRIORIDAD 3: Extraer de observaciones si es formato meses/RN
  if (_isMesesOrRN(observaciones)) {
    const mm = _monthsFromText(observaciones);
    if (mm !== null) return `${mm} m`;
  }
  
  return "";
};

/** Devuelve meses (int) o null si no se puede calcular */
const getEdadEnMeses = (fecha_nacimiento, observaciones) => {
  // Prioriza texto si lo hay
  if (_isAgeText(observaciones)) {
    const mm = _monthsFromText(observaciones);
    if (mm !== null) return mm;
  }
  // Si no hay texto válido, intenta por fecha_nacimiento
  const byDate = _monthsFromDate(fecha_nacimiento);
  return byDate;
};


// Subcomponente estable (fuera de Label80)
function TablaIntegrantes({ data, maxRowsPerCol = 5 }) {
  const fill = Math.max(0, maxRowsPerCol - data.length);
  return (
    <table
      className="table-fixed border border-gray-400 leading-tight w-full"
      style={{ fontSize: '12px' }}
    >
      <thead>
        <tr className="bg-gray-100">
          <th className="border border-gray-400 px-1 py-[2px] text-left w-[18mm]" style={{ fontSize: '10px' }}>
            RELACION
          </th>
          <th className="border border-gray-400 px-1 py-[2px] text-left w-[8mm]" style={{ fontSize: '10px' }}>
            SEXO
          </th>
          <th className="border border-gray-400 px-1 py-[2px] text-left w-[8mm]" style={{ fontSize: '10px' }}>
            EDAD
          </th>
        </tr>
      </thead>
      <tbody style={{ fontSize: '12px' }}>
        {data.map((r, i) => (
          <tr key={i}>
            <td className="border border-gray-400 px-1 py-[2px]">{r.relacion}</td>
            <td className="border border-gray-400 px-1 py-[2px]">{r.sexo}</td>
            <td className="border border-gray-400 px-1 py-[2px]">{r.edad}</td>
          </tr>
        ))}
        {Array.from({ length: fill }).map((_, i) => (
          <tr key={`vacio-${i}`}>
            <td className="border border-gray-400 px-1 py-[2px] h-[13px]"></td>
            <td className="border border-gray-400 px-1 py-[2px]"></td>
            <td className="border border-gray-400 px-1 py-[2px]"></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// === Etiqueta 101 x 101 mm ===
const Label80 = React.forwardRef(function Label80({ familia, integrantes }, ref) {
  if (!familia) return null;

  // const calcEdad = (fn) => {
  //   if (!fn) return "";
  //   const d = new Date(fn);
  //   if (isNaN(d)) return "";
  //   const hoy = new Date();
  //   let e = hoy.getFullYear() - d.getFullYear();
  //   const m = hoy.getMonth() - d.getMonth();
  //   if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
  //   return e < 0 ? "" : e;
  // };

  // --- Marcadores de observaciones (¹ ² ³ …) por integrante ---
  // Filtra textos que sean "NINGUNA"/"NINGUNO" (con o sin punto/guiones/espacios)
  const isNone = (s) => {
    const raw = s || "";
    if (/^\s*ningun[oa][\.\-–—]*\s*$/i.test(raw)) return true;
    return _isMesesOrRN(raw); // ← solo meses/RN se consideran “no observación” (edad)
  };

  const sup = ["¹","²","³","⁴","⁵","⁶","⁷","⁸","⁹"];
  const obsItems = [];
  (integrantes || []).forEach((i) => {
    const raw = (i.observaciones || "").trim();
    // ❌ Ignorar "NINGUNA" y también EDAD textual (nMESES / RN)
    if (!raw) return;
    if (/^\s*ningun[oa][\.\-–—]*\s*$/i.test(raw)) return;
    if (_isMesesOrRN(raw)) return;  // <- clave: no mostrar "5MESES", "RN" en Observaciones
  
    const mark = sup[obsItems.length] || `[${obsItems.length + 1}]`;
    obsItems.push({ mark, text: raw });
    i.__obsMark = mark; // sólo marcamos si SÍ es observación real
  });

  const obsRender = obsItems.length
    ? obsItems.map(o => `${o.mark} ${o.text}`).join("; ")
    : "";

  const familiaCode = familia.codigo_unico || "";
  const zonaNombre  = familia.zona_nombre || "";

  const padreFull = [familia.nombre_padre, familia.apellidos_padre].filter(Boolean).join(" ");
  const madreFull = [familia.nombre_madre, familia.apellidos_madre].filter(Boolean).join(" ");

  const obsConcat = [...new Set(
    (integrantes || [])
      .map(i => (i.observaciones || "").trim())
      .filter(t =>
        t &&
        !/^\s*ningun[oa][\.\-–—]*\s*$/i.test(t) &&
        !_isMesesOrRN(t)           // <- clave: no “5MESES”, no “RN”
      )
  )].join("; ");

  // ← Aquí fijamos EDAD en MESES
  const filas = (integrantes || []).map((i) => {
    const baseRel = (i.relacion || "").toUpperCase();
    const mark = i.__obsMark ? i.__obsMark : "";
    const edadStr = getEdadParaEtiqueta(i.fecha_nacimiento, i.edad_texto, i.observaciones);
    return {
      relacion: mark ? `${baseRel}${mark}` : baseRel,
      sexo: (i.sexo || "").toString().trim().toUpperCase().slice(0,1),
      edad: edadStr, // ← “Y” si hay fecha; “Xm” si no hay fecha y obs=meses/RN; sino vacío
    };
  });

  const totalMiembros =
    (padreFull ? 1 : 0) + (madreFull ? 1 : 0) + filas.length;

  const maxRowsPerCol = 5;
  const col1 = filas.slice(0, maxRowsPerCol);
  const col2 = filas.slice(maxRowsPerCol, maxRowsPerCol * 2);
  const gridColsClass = col2.length > 0 ? "grid-cols-2" : "grid-cols-1"; // ← solo 2 tablas si supera 5

  return (
    <div
      ref={ref}
      className="etiqueta relative w-[101mm] h-[101mm] p-3 border border-gray-300 rounded print:break-inside-avoid mb-3 text-[14px] leading-tight"
    >

      {/* CABECERA: barcode centrado arriba */}
      <div
        style={{
          position: 'absolute',
          transform: 'translateX(-50%)',
          top: '5mm',
          right: '5mm',        // ← respiro de 5mm
          textAlign: 'right',  // ← alinear a la derecha
        }}
      >

        {/* CABECERA: BarcodeDataUrl (img basado en dataURL) + texto pegado */}
        <BarcodeDataUrl value={familiaCode} barWidth={1.2} barHeight={34} />
        <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '0.30mm', lineHeight: 1 }}>
          {familiaCode}
        </div>

      </div>

      {/* Dejo ~15mm de aire bajo la cabecera */}
      <div style={{ height: '15mm' }} />

      {/* Zona + totales + observaciones + padres */}
      <div className="flex items-start justify-between">
        <div className="pr-2">
          <div className="font-semibold text-[12px]">{zonaNombre}</div>
          <div><span className="font-medium">total miembros:</span> {totalMiembros}</div>
          <div><span className="font-medium text-[14px]">Observaciones:</span> {obsConcat || "—"}</div>

          {/* ↓ padres 1 punto más pequeño */}
          <div style={{ marginTop: '4mm', fontSize: '12px', lineHeight: 1.1 }}>
            <div><span className="font-medium">PAPA:</span> {padreFull || "—"}</div>
            <div><span className="font-medium">MAMA:</span> {madreFull || "—"}</div>
          </div>
        </div>
        <div className="shrink-0 w-[40mm]" />
      </div>

      {/* Tablas: siempre dos columnas; si no hay col2, dejamos un placeholder sin cabecera */}
      <div
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: '1fr 1fr' }}
      >
        <div>
          <TablaIntegrantes data={col1} maxRowsPerCol={maxRowsPerCol} />
        </div>
        <div>
          {col2.length > 0 ? (
            <TablaIntegrantes data={col2} maxRowsPerCol={maxRowsPerCol} />
          ) : (
            <div style={{border: '0', height: '100%'}} />
          )}
        </div>
      </div>


      {/* Espacio para no chocar con el footer */}
      <div className="h-[16mm]" />

      {/* FOOTER: barcode centrado al pie */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: '5mm',
          textAlign: 'center',
        }}
      >
        
        {/* FOOTER: BarcodeDataUrl (img basado en dataURL) + texto pegado */}
        <BarcodeDataUrl value={familiaCode} barWidth={1.25} barHeight={38} />
        <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '0.25mm', lineHeight: 1 }}>
          {familiaCode}
        </div>

      </div>
    </div>
  );
});






// === Modal Genérico ===
const Modal = ({ title, onClose, children, footer }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-5xl max-h-[92vh] overflow-y-auto">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold dark:text-white">{title}</h2>
        <button onClick={onClose} className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 dark:text-gray-200">✕</button>
      </div>
      <div className="p-5">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700">{footer}</div>}
    </div>
  </div>
);

const Familias = () => {
  const { user } = useAuth();

  // list / filtros
  const [familias, setFamilias] = useState([]);
  const [importZonaId, setImportZonaId] = useState('');
  const [zonas, setZonas] = useState([]);
  const [loading, setLoading] = useState(false);
  //const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState("");
  const [zonaId, setZonaId] = useState("");
  const [activo, setActivo] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasPrev: false, hasNext: false });

  // sort
  const [sortBy, setSortBy] = useState({ field: "codigo_unico", dir: "asc" });

  // detalle
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [integrantes, setIntegrantes] = useState([]);

  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  // etiquetas
  const [showEtiquetas, setShowEtiquetas] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [labelsData, setLabelsData] = useState([]); // familia(s) + integrantes agrupados
  //const labelPrintRef = useRef(null);

  const [isPrinting, setIsPrinting] = useState(false);

  const [rangoDesde, setRangoDesde] = useState('');
  const [rangoHasta, setRangoHasta] = useState('');

  const handleImprimirRango = async () => {
    // Validar que haya zona seleccionada
    if (!zonaId) {
      alert('Por favor, seleccione una zona primero');
      return;
    }
    
    // Validar que se hayan ingresado ambos rangos
    if (!rangoDesde || !rangoHasta) {
      alert('Por favor, ingrese el rango completo (desde y hasta)');
      return;
    }
    
    // Validar formato (opcional, pero recomendado)
    if (rangoDesde > rangoHasta) {
      alert('El código inicial debe ser menor o igual al código final');
      return;
    }
    
    try {
      setLoading(true);
      
      // Llamar al endpoint de rango
      const response = await familiasService.getAll({
        zona_id: zonaId,
        codigo_desde: rangoDesde,
        codigo_hasta: rangoHasta,
        limit: 10000 // Sin paginación para etiquetas
      });
      
      if (response?.success && response.data?.length > 0) {
        // Preparar datos para impresión usando la estructura existente
        const familiasParaImprimir = response.data.map(fam => ({
          familia: {
            id: fam.id,
            codigo_unico: fam.codigo_unico,
            nombre_padre: fam.nombre_padre || '',
            nombre_madre: fam.nombre_madre || '',
            direccion: fam.direccion || '',
            zona_nombre: fam.zona_nombre || '',
            zona_abreviatura: fam.zona_abreviatura || ''
          },
          integrantes: []
        }));
        
        // Usar la función de impresión existente
        setLabelsData(familiasParaImprimir);
        setShowEtiquetas(true);
        setBulkMode(true);
        
      } else {
        alert(`No se encontraron familias en el rango ${rangoDesde} - ${rangoHasta}`);
      }
      
    } catch (error) {
      console.error('Error al obtener familias por rango:', error);
      alert('Error al obtener las familias del rango especificado');
    } finally {
      setLoading(false);
    }
  };



  const handlePrint = async () => {
    if (!labelsData?.length) {
      alert('No hay etiquetas para imprimir.');
      return;
    }
  
    // === Helpers locales (síncronos) ===
    const mkBarcodeDataUrl = (value, barWidth, barHeight) => {
      try {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, String(value || ""), {
          format: "CODE128",
          displayValue: false,
          width: barWidth,
          height: barHeight,
          margin: 0,
        });
        const xml = new XMLSerializer().serializeToString(svg);
        const svg64 = btoa(unescape(encodeURIComponent(xml)));
        return `data:image/svg+xml;base64,${svg64}`;
      } catch {
        return "";
      }
    };
  
    const calcEdad = (fn) => {
      if (!fn) return "";
      const d = new Date(fn);
      if (isNaN(d)) return "";
      const hoy = new Date();
      let e = hoy.getFullYear() - d.getFullYear();
      const m = hoy.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
      return e < 0 ? "" : e;
    };
  
    const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  
    // === Genera el HTML de todas las etiquetas ===
    const etiquetasHtml = labelsData.map(({ familia, integrantes }) => {
      const familiaCode = familia?.codigo_unico || "";
      const zonaNombre  = familia?.zona_nombre  || "";
  
      const padreFull = [familia?.nombre_padre, familia?.apellidos_padre].filter(Boolean).join(" ");
      const madreFull = [familia?.nombre_madre, familia?.apellidos_madre].filter(Boolean).join(" ");
  
      // 4.b.1 Marcadores ¹ ² ³ … por integrante con observación
      const isNone = (s) => {
        const raw = s || "";
        if (/^\s*ningun[oa][\.\-–—]*\s*$/i.test(raw)) return true;
        return _isMesesOrRN(raw); // ← solo meses/RN
      };

      const sup = ["¹","²","³","⁴","⁵","⁶","⁷","⁸","⁹"];

      const obsPairs = [];
      (integrantes || []).forEach((i) => {
        const raw = (i.observaciones || "").trim();
        if (!raw) return;
        if (/^\s*ningun[oa][\.\-–—]*\s*$/i.test(raw)) return;
        if (_isMesesOrRN(raw)) return;  // <- no meter edades a Observaciones
      
        const mark = sup[obsPairs.length] || `[${obsPairs.length + 1}]`;
        obsPairs.push({ mark, text: raw });
        i.__obsMark = mark;
      });

      
      
      const obsRender = obsPairs.length
        ? obsPairs.map(o => `${o.mark} ${escapeHtml(o.text)}`).join("; ")
        : "";
  
      // 4.b.2 RELACION con superíndice si aplica
      const filas = (integrantes || []).map((i) => {
        const baseRel = (i.relacion || "").toUpperCase();
        const mark = i.__obsMark ? i.__obsMark : "";
        const edadStr = getEdadParaEtiqueta(i.fecha_nacimiento, i.edad_texto, i.observaciones);
        return {
          relacion: mark ? `${baseRel}${mark}` : baseRel,
          sexo: (i.sexo || "").toString().trim().toUpperCase().slice(0,1),
          edad: edadStr,
        };
      });


      
  
      const totalMiembros = (padreFull ? 1 : 0) + (madreFull ? 1 : 0) + filas.length;
  
      const maxRowsPerCol = 5;
      const col1 = filas.slice(0, maxRowsPerCol);
      const col2 = filas.slice(maxRowsPerCol, maxRowsPerCol * 2);
  
      const tablaHtml = (rows) => {
        const fill = Math.max(0, maxRowsPerCol - rows.length);
        return `
          <table class="tabla">
            <thead>
              <tr>
                <th class="rel">RELACION</th>
                <th class="sex">SEXO</th>
                <th class="eda">EDAD</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="rel">${escapeHtml(r.relacion)}</td>
                  <td class="sex">${escapeHtml(r.sexo)}</td>
                  <td class="eda">${escapeHtml(r.edad ?? "")}</td>
                </tr>
              `).join("")}
              ${Array.from({ length: fill }).map(() => `
                <tr><td class="rel"></td><td class="sex"></td><td class="eda"></td></tr>
              `).join("")}
            </tbody>
          </table>
        `;
      };
  
      // SIEMPRE dos columnas; si no hay col2, placeholder
      const gridHtml = `
        <div class="grid two">
          <div>${tablaHtml(col1)}</div>
          <div>${col2.length > 0 ? tablaHtml(col2) : '<div class="tabla-placeholder"></div>'}</div>
        </div>
      `;
  
      // Barcodes (data URLs) — listos ya
      const topSrc = mkBarcodeDataUrl(familiaCode, 1.2, 34);
      const botSrc = mkBarcodeDataUrl(familiaCode, 1.25, 38);
  
      return `
        <div class="etiqueta">
          <!-- CABECERA -->
          <div class="hdr">
            ${topSrc ? `<img src="${topSrc}" alt="" class="bar" />` : ""}
            <div class="code">${escapeHtml(familiaCode)}</div>
          </div>
  
          <!-- subir 10mm: de 20mm a 10mm -->
          <div style="height:10mm"></div>
  
          <!-- Zona + totales + observaciones + padres -->
          <div class="row">
            <div class="colL">
              <div class="zona">${escapeHtml(zonaNombre)}</div>
              <div><span class="b">total miembros:</span> ${escapeHtml(totalMiembros)}</div>
  
              <!-- 4.b.3 Observaciones a 9px con marcadores -->
              <div style="font-size:12x; line-height:1.1;">
                <span class="b">Observaciones:</span> ${obsRender || "—"}
              </div>
  
              <div class="padres">
                <div><span class="b">PAPA:</span> ${escapeHtml(padreFull || "—")}</div>
                <div><span class="b">MAMA:</span> ${escapeHtml(madreFull || "—")}</div>
              </div>
            </div>
            <div class="colR"></div>
          </div>
  
          <!-- TABLAS -->
          ${gridHtml}
  
          <div style="height:10mm"></div>
  
          <!-- FOOTER -->
          <div class="ftr">
            ${botSrc ? `<img src="${botSrc}" alt="" class="bar" />` : ""}
            <div class="code">${escapeHtml(familiaCode)}</div>
          </div>
        </div>
      `;
    }).join("");
  
    // === Crea iframe oculto ===
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
    });
    document.body.appendChild(iframe);
  
    const doc = iframe.contentDocument || iframe.contentWindow.document;
  
    // === CSS crítico (incluye 2 columnas y bordes nítidos) ===
    const criticalCSS = `
    @page { size: 101mm 101mm; margin: 0; }
    html, body {
      margin: 0 !important; padding: 0 !important; background: #fff !important;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    * { box-shadow: none !important; }
    img { max-width: none !important; }
  
    /* +1px: base de la etiqueta */
    .etiqueta {
      position: relative; width: 101mm; height: 101mm; page-break-after: always; break-inside: avoid;
      padding: 3mm; border: 0.4mm solid #000; border-radius: 2mm;
      font-family: Arial, sans-serif; font-size: 12px; line-height: 1.25; /* antes 11px */
    }
    .etiqueta:last-child { page-break-after: auto; }
  
    .hdr { position: absolute; top: 3mm; right: 5mm; text-align: right; }
    .ftr { position: absolute; left: 50%; transform: translateX(-50%); bottom: 3mm; text-align: center; }
    .bar { display: block; }
  
    /* +1px: texto bajo el código */
    .code { font-size: 12px; font-weight: 600; margin-top: 0.25mm; line-height: 1; } /* antes 11px */
  
    .row { display: flex; align-items: flex-start; justify-content: space-between; }
    .colL { padding-right: 2mm; }
    .colR { width: 40mm; flex: 0 0 40mm; }
  
    /* +1px: zona y padres */
    .zona { font-weight: 600; font-size: 13px; }            /* antes 12px */
    .padres { margin-top: 3mm; font-size: 12px; line-height: 1.15; } /* antes 11px */
    .b { font-weight: 600; }
  
    .grid { margin-top: 2mm; display: grid; gap: 1mm; }
    .grid.two { grid-template-columns: 1fr 1fr; }
    .grid > div { min-width: 0; }
  
    /* base de tabla se mantiene neutral; el cuerpo sube +1px más abajo */
    table.tabla {
      width: 100%; border-collapse: collapse; table-layout: fixed;
      border: 0.35mm solid #000;
    }
    table.tabla thead tr { background: #eee; }
    table.tabla th, table.tabla td {
      border: 0.35mm solid #000;
      padding: 0.6mm 1mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
  
    /* ⛔ encabezado SIN cambio */
    table.tabla th.rel, table.tabla th.sex, table.tabla th.eda { font-size: 10px; } /* igual que antes */
  
    /* ✅ +1px solo en el cuerpo */
    table.tabla tbody { font-size: 13px; } /* si antes era 12px */
  
    /* anchos */
    table.tabla th.rel, table.tabla td.rel { width: 60%; text-align: left; }
    table.tabla th.sex, table.tabla td.sex { width: 20%; text-align: left; }
    table.tabla th.eda, table.tabla td.eda { width: 20%; text-align: left; }
  
    .tabla-placeholder { width: 100%; height: 100%; }
  `;

    

  
  
    // === Escribe documento ===
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${criticalCSS}</style></head><body>${etiquetasHtml}</body></html>`);
    doc.close();
  
    // === Espera imágenes y dispara impresión ===
    const waitImages = async () => {
      const imgs = Array.from(doc.images || []);
      if (imgs.length === 0) return;
      await Promise.all(imgs.map((im) => {
        if (im.complete && im.naturalWidth > 0) return Promise.resolve();
        return new Promise((res) => {
          const done = () => res();
          im.addEventListener("load", done, { once: true });
          im.addEventListener("error", done, { once: true });
        });
      }));
    };
  
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await waitImages();
    await new Promise(r => requestAnimationFrame(r));
  
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 500);
  };
  

  // load zonas + primer fetch
  useEffect(() => {
    (async () => {
      const z = await zonasService.getAll();
      if (z?.success) setZonas(z.data || []);
      await fetchFamilias();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cambio de filtros/paginación/sort => refetch
  useEffect(() => {
    fetchFamilias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, zonaId, activo, sortBy]);

  const fetchFamilias = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        search: search || undefined,
        zona_id: zonaId || undefined,
        activo: activo || undefined,
        sort_by: sortBy.field,
        sort_dir: sortBy.dir,
      };
      const r = await familiasService.getAll(params);
      if (r?.success) {
        setFamilias(r.data || []);
        setPagination(r.pagination || { total: 0, totalPages: 1, hasPrev: false, hasNext: false });
      }
    } finally {
      setLoading(false);
    }
  };


  // Exporta TODO lo filtrado (sin paginar) desde el frontend
  const handleExportXlsxAll = async () => {
    try {
      // intentamos con un límite grande
      const baseParams = {
        search: search || undefined,
        zona_id: zonaId || undefined,
        activo: activo || undefined,
        sort_by: sortBy.field,
        sort_dir: sortBy.dir,
      };

      let allRows = [];
      let pageNum = 1;
      const pageLimit = 100000; // tu preferencia

      // 1) primer intento: una sola llamada grande
      const r1 = await familiasService.getAll({ ...baseParams, page: 1, limit: pageLimit });
      if (!r1?.success) {
        alert(r1?.error || "No se pudo obtener datos para exportar.");
        return;
      }
      allRows = r1.data || [];

      // 2) si el backend impone paginación, recolectamos el resto en bloques de 1000
      const pag = r1.pagination || {};
      if (pag?.totalPages && pag.totalPages > 1) {
        // recolecta por páginas pequeñas para no saturar
        const chunkLimit = 1000;
        allRows = [...allRows]; // ya tenemos la página 1
        for (let p = 2; p <= pag.totalPages; p++) {
          const rp = await familiasService.getAll({ ...baseParams, page: p, limit: chunkLimit });
          if (rp?.success && Array.isArray(rp.data)) {
            allRows.push(...rp.data);
          } else {
            break; // si falla alguna, salimos con lo ya reunido
          }
        }
      }

      if (!allRows.length) {
        alert("No hay datos para exportar.");
        return;
      }

      const rows = allRows.map(mapFamiliaRow);
      await downloadExcel(`familias_filtrado_${new Date().toISOString().slice(0,10)}.xlsx`, rows);
    } catch (e) {
      console.error(e);
      alert("No se pudo exportar el filtrado completo.");
    }
  };


  // ===== Tabla (ordenamiento) =====
  const onSort = (field) => {
    setSortBy((prev) => {
      if (prev.field === field) return { field, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { field, dir: "asc" };
    });
  };
  const sortIcon = (f) => (sortBy.field === f ? (sortBy.dir === "asc" ? "▲" : "▼") : "↕");

  // ===== Detalle =====
  const openDetalle = async (fila) => {
    const d = await familiasService.getById(fila.id);
    let fam = d?.success ? d.data : fila; // fallback
    const ints = await familiasService.getIntegrantes(fila.id);
    setDetalle(fam);
    setIntegrantes(ints?.success ? ints.data : []);
    setShowDetalle(true);
  };

  // ===== Etiquetas =====
  const imprimirEtiqueta = async (fila) => {
    // individual
    const d = await familiasService.getById(fila.id);
    const ints = await familiasService.getIntegrantes(fila.id);
    const fam = d?.success ? d.data : fila;
    setBulkMode(false);
    setLabelsData([{ familia: fam, integrantes: ints?.success ? ints.data : [] }]);
    setShowEtiquetas(true);
  };

  const imprimirEtiquetasPorZona = async () => {
    if (!zonaId) return;
    try {
      // 1) Preferido: endpoint dedicado de etiquetas por zona
      const r = await familiasService.getLabelsByZona(zonaId);
      if (r?.success && Array.isArray(r.data)) {
        // Carga integrantes si no vinieron en la respuesta
        const items = await Promise.all(
          r.data.map(async (f) => {
            let ints = Array.isArray(f.integrantes) ? f.integrantes : null;
            if (!ints || ints.length === 0) {
              const res = await familiasService.getIntegrantes(f.id);
              ints = res?.success ? (res.data || []) : [];
            }
            return { familia: f, integrantes: ints };
          })
        );
        setBulkMode(true);
        setLabelsData(items);
        setShowEtiquetas(true);
        return;
      }
    } catch (err) {
      // Si el backend no tiene /labels/bulk (404), seguimos al fallback
      if (err?.response?.status !== 404) {
        console.error(err);
        return;
      }
    }
  
    // 2) Fallback: listado normal filtrado por zona
    try {
      const list = await familiasService.getAll({ zona_id: zonaId, limit: 1000 });
      if (!list?.success) return;
  
      const items = await Promise.all(
        (list.data || []).map(async (f) => {
          const res = await familiasService.getIntegrantes(f.id);
          const ints = res?.success ? (res.data || []) : [];
          return { familia: f, integrantes: ints };
        })
      );
  
      setBulkMode(true);
      setLabelsData(items);
      setShowEtiquetas(true);
    } catch (e) {
      console.error(e);
    }
  };

  const doPrint = () => window.print();

  // ===== Render =====
  return (
    <div className="p-6">
      {/* Título */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Familias</h1>
        <p className="text-gray-600 dark:text-gray-400">Listado, detalle y etiquetas.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar (código, nombres, dirección)..."
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        />
        <select
          value={zonaId}
          onChange={(e) => { setZonaId(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        >
          <option value="">Todas las zonas</option>
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>{z.nombre}</option>
          ))}
        </select>
        <select
          value={activo}
          onChange={(e) => { setActivo(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
        >
          <option value="">Todos</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </select>

        <div className="flex-1" />

          <div className="flex gap-2">
            {/* PRE IMPORTACIÓN */}
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              PRE IMPORTACIÓN
            </button>

            {/* Importar Excel (abre el mismo modal) */}
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Importar Excel
            </button>

            {/* Imprimir etiquetas por zona */}
            <button
              onClick={imprimirEtiquetasPorZona}
              disabled={!zonaId}
              title={zonaId ? "Imprimir etiquetas por zona" : "Selecciona una zona primero"}
              className={`px-4 py-2 rounded-lg text-white ${zonaId ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-400 cursor-not-allowed"}`}
            >
              Imprimir etiquetas por zona
            </button>


          {/* ✅ AGREGAR ESTA SECCIÓN COMPLETA */}
          {/* Filtro de Rango para Impresión */}
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-300 dark:border-gray-600">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Rango:
            </label>
            <input
              type="text"
              placeholder="Desde: CTE014"
              value={rangoDesde}
              onChange={(e) => setRangoDesde(e.target.value.toUpperCase())}
              className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={!zonaId}
            />
            <span className="text-sm text-gray-500">→</span>
            <input
              type="text"
              placeholder="Hasta: CTE035"
              value={rangoHasta}
              onChange={(e) => setRangoHasta(e.target.value.toUpperCase())}
              className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={!zonaId}
            />
            <button
              onClick={handleImprimirRango}
              disabled={!zonaId || !rangoDesde || !rangoHasta || loading}
              className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-md transition-colors disabled:cursor-not-allowed flex items-center gap-1"
              title="Imprimir etiquetas del rango especificado"
            >
              📄 Rango
            </button>
            {!zonaId && (
              <span className="text-xs text-gray-500 italic">
                (Seleccione una zona)
              </span>
            )}
          </div>            


            <button
              className="px-3 py-2 rounded bg-emerald-600 text-white"
              onClick={handleExportXlsxAll}
            >
              Exportar Excel
            </button>

          </div>
        </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
              <tr>
                {[
                  ["codigo_unico", "Código"],
                  ["zona_nombre", "Zona"],
                  ["titular", "Titular"],
                  ["total_integrantes", "Integrantes"],
                  ["estado_caja", "Estado Caja"],
                ].map(([f, label]) => (
                  <th key={f} className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300 cursor-pointer"
                      onClick={() => onSort(f)}>
                    {label} <span className="ml-1 opacity-60">{sortIcon(f)}</span>
                  </th>
                ))}
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading && (
                <tr><td colSpan={6} className="px-5 py-6 text-center">Cargando…</td></tr>
              )}
              {!loading && familias.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-500">Sin resultados</td></tr>
              )}
              {!loading && familias.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-5 py-3 whitespace-nowrap font-semibold">{f.codigo_unico}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{f.zona_nombre}</td>
                  <td className="px-5 py-3">{pickTitular(f)}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{f.total_integrantes || 0}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-900 dark:text-gray-200">
                      {f.estado_caja || "SIN VENDER"}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-right">
                    <div className="inline-flex gap-3">
                      <button onClick={() => openDetalle(f)} className="text-blue-600 hover:underline">Detalles</button>
                      <button onClick={() => imprimirEtiqueta(f)} className="text-indigo-600 hover:underline">Etiqueta</button>
                    </div>
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
              ? <>Mostrando {(page - 1) * limit + 1} – {Math.min(page * limit, pagination.total)} de {pagination.total}</>
              : "—"}
          </div>
          <div className="flex gap-2">
            <button
              disabled={!pagination.hasPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-2 border rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="px-3 py-2 rounded bg-blue-600 text-white">{page}</span>
            <button
              disabled={!pagination.hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-2 border rounded disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* ===== Modal Detalle ===== */}
      {showDetalle && detalle && (
        <Modal
          title="Detalle de Familia"
          onClose={() => setShowDetalle(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDetalle(false)} className="px-4 py-2 rounded bg-gray-200">Cerrar</button>
              <button onClick={() => imprimirEtiqueta(detalle)} className="px-4 py-2 rounded bg-green-600 text-white">
                Imprimir Etiqueta
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600">Nombre padre</label>
              <input className="w-full border rounded px-2 py-1" value={detalle.nombre_padre || ""} readOnly />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Observación</label>
              <textarea className="w-full border rounded px-2 py-1" rows={3} value={detalle.observaciones || ""} readOnly />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Nombre madre</label>
              <input className="w-full border rounded px-2 py-1" value={detalle.nombre_madre || ""} readOnly />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Estado (caja)</label>
              <input className="w-full border rounded px-2 py-1" value={detalle.estado_caja || "SIN VENDER"} readOnly />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Benefactor</label>
              <input className="w-full border rounded px-2 py-1" value={detalle.benefactor || ""} readOnly />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Teléfono</label>
              <input className="w-full border rounded px-2 py-1" value={detalle.telefono || ""} readOnly />
            </div>
          </div>

          {/* Integrantes */}
          <div className="mt-5">
            <div className="text-sm font-semibold mb-2">Integrantes</div>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Alfanumérico</th>
                    <th className="px-3 py-2 text-left">Relación</th>
                    <th className="px-3 py-2 text-left">Nombres</th>
                    <th className="px-3 py-2 text-left">Sexo</th>
                    <th className="px-3 py-2 text-left">Edad</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {integrantes.map((i, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">{detalle.codigo_unico}</td>
                      <td className="px-3 py-2">{i.relacion}</td>
                      <td className="px-3 py-2">{i.nombre || i.nombres}</td>
                      <td className="px-3 py-2">{i.sexo}</td>
                      <td className="px-3 py-2">{i.edad}</td>
                    </tr>
                  ))}
                  {integrantes.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-gray-500" colSpan={5}>Sin integrantes registrados</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}


      {/* ===== Modal Etiquetas (individual / por zona) ===== */}
      {showEtiquetas && (
        <>
          {/* Overlay & preview (NO se imprime) */}
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 no-print">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-5xl max-h-[92vh] overflow-y-auto">
              {/* Header con botones */}
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold dark:text-white">
                  {bulkMode ? "Etiquetas por zona" : "Etiqueta de familia"}
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEtiquetas(false)}
                    className="px-4 py-2 rounded bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="px-4 py-2 rounded bg-indigo-600 text-white"
                  >
                    Imprimir
                  </button>
                </div>
              </div>

              {/* Vista previa en pantalla (lo que clonaremos para imprimir) */}
              <div className="p-4">
                <div id="preview-root">
                  {labelsData.map(({ familia, integrantes }, idx) => (
                    <Label80 key={familia.id || idx} familia={familia} integrantes={integrantes} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SOLO PARA IMPRESIÓN: fuera del overlay, sin sombras ni scrolls */}
          <div id="print-root" className={isPrinting ? "print-only" : "hidden"}>
            {labelsData.map(({ familia, integrantes }, idx) => (
              <Label80
                key={`print-${familia.id || idx}`}
                familia={familia}
                integrantes={integrantes}
              />
            ))}
          </div>
        </>
      )}




      {/* ===== Modal Importar / PRE IMPORTACIÓN ===== */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-white">
                Importar Familias (PRE IMPORTACIÓN + Importación)
              </h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              {/* Aquí vive toda la lógica nueva de PRE IMPORTACIÓN / IMPORTAR EXCEL */}
              <ImportarFamilias />
            </div>
          </div>
        </div>
      )}




    </div>
  );
};

export default Familias;
