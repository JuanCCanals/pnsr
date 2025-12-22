// frontend/src/pages/Comprobantes.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const Comprobantes = () => {
  const [comprobantes, setComprobantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tipoFiltro, setTipoFiltro] = useState('todos'); // todos | caja | servicio
  const [search, setSearch] = useState('');
  const [dias, setDias] = useState(90);

  const [printing, setPrinting] = useState(false);
  const [ticketSeleccionado, setTicketSeleccionado] = useState(null);

  useEffect(() => {
    fetchComprobantes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const fetchComprobantes = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const res = await axios.get(`${API_URL}/comprobantes`, {
        headers,
        params: { dias },
      });

      setComprobantes(res.data.data || []);
    } catch (err) {
      console.error('Error al cargar comprobantes:', err);
      setError(
        'Error al cargar comprobantes: ' +
          (err.response?.data?.error || err.message)
      );
    } finally {
      setLoading(false);
    }
  };

  const formatFecha = (fecha) => {
    if (!fecha) return '';
    try {
      const d = new Date(fecha);
      return d.toLocaleString('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return fecha;
    }
  };

  const formatMoneda = (monto) => {
    const n = Number(monto) || 0;
    return n.toLocaleString('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2,
    });
  };

  const filtrarComprobantes = () => {
    return comprobantes.filter((c) => {
      if (tipoFiltro !== 'todos' && c.tipo !== tipoFiltro) return false;

      const texto =
        `${c.concepto || ''} ${c.beneficiario || ''} ${
          c.comprobante_id || ''
        }`.toLowerCase();
      if (search && !texto.includes(search.toLowerCase())) return false;

      return true;
    });
  };

  const handlePrint = (ticket) => {
    if (!ticket) return;
    setTicketSeleccionado(ticket);
    setPrinting(true);

    // Abrir nueva ventana con el ticket para imprimir
    const printWindow = window.open('', '_blank', 'width=600,height=800');

    const fechaStr = formatFecha(ticket.fecha);
    const montoStr = formatMoneda(ticket.monto);

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Comprobante #${ticket.comprobante_id}</title>
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 16px;
          }
          .ticket {
            border: 1px dashed #333;
            padding: 16px;
            max-width: 360px;
            margin: 0 auto;
          }
          .titulo {
            text-align: center;
            font-weight: bold;
            margin-bottom: 8px;
          }
          .linea {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            margin: 4px 0;
          }
          .resaltado {
            font-weight: bold;
          }
          .separador {
            margin: 8px 0;
            border-top: 1px dashed #aaa;
          }
          .pie {
            text-align: center;
            margin-top: 12px;
            font-size: 12px;
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="titulo">PNSR - Comprobante de ${ticket.tipo === 'caja' ? 'Caja del Amor' : 'Servicio'}</div>
          <div class="linea">
            <span>ID:</span>
            <span class="resaltado">#${ticket.comprobante_id}</span>
          </div>
          <div class="linea">
            <span>Fecha:</span>
            <span>${fechaStr}</span>
          </div>
          <div class="linea">
            <span>Monto:</span>
            <span class="resaltado">${montoStr}</span>
          </div>
          <div class="linea">
            <span>Concepto:</span>
            <span>${ticket.concepto || '-'}</span>
          </div>
          ${
            ticket.beneficiario
              ? `<div class="linea">
                  <span>Benefactor:</span>
                  <span>${ticket.beneficiario}</span>
                </div>`
              : ''
          }
          <div class="separador"></div>
          <div class="pie">
            Gracias por su apoyo.<br/>
            Dios le bendiga abundantemente.
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    // No cerramos automáticamente, dejamos que el usuario lo cierre
    setTimeout(() => setPrinting(false), 500);
  };

  const filtrados = filtrarComprobantes();

  // ===== Exportar a Excel los comprobantes filtrados =====
  const handleExportExcel = async () => {
    try {
      if (!filtrados.length) {
        alert('No hay comprobantes para exportar.');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Comprobantes');

      sheet.columns = [
        { header: 'ID Comprobante', key: 'id', width: 18 },
        { header: 'Fecha', key: 'fecha', width: 22 },
        { header: 'Tipo', key: 'tipo', width: 18 },
        { header: 'Concepto', key: 'concepto', width: 40 },
        { header: 'Benefactor / Solicitante', key: 'beneficiario', width: 30 },
        { header: 'Monto', key: 'monto', width: 14 },
      ];

      filtrados.forEach((c) => {
        sheet.addRow({
          id: c.comprobante_id,
          fecha: formatFecha(c.fecha),
          tipo: c.tipo === 'caja' ? 'Caja del Amor' : 'Servicio',
          concepto: c.concepto || '',
          beneficiario: c.beneficiario || '',
          monto: Number(c.monto || 0),
        });
      });

      // Estilo de cabecera
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      // Bordes para todas las filas
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobantes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exportando comprobantes a Excel:', e);
      alert('No se pudo exportar los comprobantes.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Cargando comprobantes...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Comprobantes
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Reimpresión de comprobantes de gestión de cajas y servicios parroquiales.
        </p>
      </div>

      {/* Errores */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Tipo:
          </label>
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos</option>
            <option value="caja">Cajas del Amor</option>
            <option value="servicio">Servicios</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Últimos días:
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={dias}
            onChange={(e) => setDias(Number(e.target.value) || 1)}
            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por concepto, benefactor o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchComprobantes}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            Refrescar
          </button>
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                  Concepto
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                  Benefactor / Solicitante
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                  Monto
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtrados.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                  >
                    No hay comprobantes para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtrados.map((c) => (
                  <tr
                    key={`${c.tipo}-${c.comprobante_id}-${c.fecha}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-4 py-3 text-gray-900 dark:text.white">
                      {formatFecha(c.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          c.tipo === 'caja'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}
                      >
                        {c.tipo === 'caja' ? 'Caja del Amor' : 'Servicio'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                      {c.concepto || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                      {c.beneficiario || '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                      {formatMoneda(c.monto)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handlePrint(c)}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        disabled={printing}
                      >
                        Imprimir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Comprobantes;
