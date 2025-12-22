// frontend/src/pages/Dashboard.jsx
/**
 * Dashboard principal con dos vistas:
 * 1. Dashboard de Cajas del Amor
 * 2. Dashboard de Servicios Parroquiales
 * 
 * Fase 3: Dashboards para Cajas y Servicios
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Componente de tarjeta KPI
const KPICard = ({ title, value, icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
    indigo: 'bg-indigo-500'
  };

  return (
    <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`${colorClasses[color]} w-8 h-8 rounded-md flex items-center justify-center`}>
              <span className="text-white text-lg">{icon}</span>
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                {title}
              </dt>
              <dd className="text-lg font-medium text-gray-900 dark:text-white">
                {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente de gráfico simple (barras)
const SimpleChart = ({ title, data, dataKey = 'cantidad' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400">Sin datos disponibles</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(item => item[dataKey] || 0));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      <div className="space-y-4">
        {data.map((item, idx) => (
          <div key={idx}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                {item.nombre || item.fecha || item.title}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                {item[dataKey]?.toLocaleString('es-PE') || 0}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${maxValue > 0 ? (item[dataKey] / maxValue) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('cajas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    cajas: null,
    servicios: null
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Intentar cargar ambos dashboards
      const results = await Promise.allSettled([
        axios.get(`${API_URL}/dashboard/cajas`, { headers }),
        axios.get(`${API_URL}/dashboard/servicios`, { headers })
      ]);

      const newData = { cajas: null, servicios: null };

      if (results[0].status === 'fulfilled') {
        newData.cajas = results[0].value.data.data;
      }
      if (results[1].status === 'fulfilled') {
        newData.servicios = results[1].value.data.data;
      }

      setDashboardData(newData);
      setError(null);

      // Si no hay datos de cajas pero sí de servicios, cambiar a servicios
      if (!newData.cajas && newData.servicios) {
        setActiveTab('servicios');
      }
    } catch (err) {
      setError('Error al cargar datos del dashboard');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Bienvenido, {user?.nombre}. Aquí tienes un resumen del sistema.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200 dark:border-gray-700">
          {dashboardData.cajas && (
            <button
              onClick={() => setActiveTab('cajas')}
              className={`px-4 py-2 font-medium transition-colors duration-200 ${
                activeTab === 'cajas'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
            >
              📦 Cajas del Amor
            </button>
          )}
          {dashboardData.servicios && (
            <button
              onClick={() => setActiveTab('servicios')}
              className={`px-4 py-2 font-medium transition-colors duration-200 ${
                activeTab === 'servicios'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
            >
              ⛪ Servicios Parroquiales
            </button>
          )}
        </div>

        {/* Dashboard Cajas del Amor */}
        {activeTab === 'cajas' && dashboardData.cajas && (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <KPICard
                title="Cajas de S/ 40"
                value={dashboardData.cajas.kpis.cajas_40}
                icon="📦"
                color="blue"
              />
              <KPICard
                title="Cajas de S/ 160"
                value={dashboardData.cajas.kpis.cajas_160}
                icon="📦"
                color="green"
              />
              <KPICard
                title="Total de Cajas"
                value={dashboardData.cajas.kpis.total_cajas}
                icon="📊"
                color="purple"
              />
              <KPICard
                title="Cajas Vendidas"
                value={dashboardData.cajas.kpis.cajas_vendidas}
                icon="✅"
                color="green"
              />
              <KPICard
                title="Cajas No Vendidas"
                value={dashboardData.cajas.kpis.cajas_no_vendidas}
                icon="⏳"
                color="yellow"
              />
              <KPICard
                title="Total Recaudado"
                value={`S/ ${dashboardData.cajas.kpis.total_recaudado.toLocaleString('es-PE')}`}
                icon="💰"
                color="indigo"
              />
              <KPICard
                title="Familias Beneficiadas"
                value={dashboardData.cajas.kpis.familias_beneficiadas}
                icon="👥"
                color="blue"
              />
              <KPICard
                title="Cajas Entregadas"
                value={dashboardData.cajas.kpis.cajas_entregadas}
                icon="🎁"
                color="purple"
              />
              <KPICard
                title="Cajas Devueltas Llenas"
                value={dashboardData.cajas.kpis.cajas_devueltas}
                icon="📦"
                color="red"
              />
            </div>

            {/* Meta de campaña */}
            {dashboardData.cajas.kpis.meta_monto > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Avance de Meta
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-700 dark:text-gray-300">Meta Monetaria</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        S/ {dashboardData.cajas.kpis.total_recaudado.toLocaleString('es-PE')} / S/ {dashboardData.cajas.kpis.meta_monto.toLocaleString('es-PE')}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div
                        className="bg-green-600 h-3 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(dashboardData.cajas.kpis.porcentaje_avance, 100)}%`
                        }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {dashboardData.cajas.kpis.porcentaje_avance}% completado
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {dashboardData.cajas.graficos.ventas_por_dia && dashboardData.cajas.graficos.ventas_por_dia.length > 0 && (
                <SimpleChart
                  title="Ventas por Día (Últimos 7 días)"
                  data={dashboardData.cajas.graficos.ventas_por_dia}
                  dataKey="cantidad"
                />
              )}
              {dashboardData.cajas.graficos.top_benefactores && dashboardData.cajas.graficos.top_benefactores.length > 0 && (
                <SimpleChart
                  title="Top Benefactores"
                  data={dashboardData.cajas.graficos.top_benefactores}
                  dataKey="cantidad_cajas"
                />
              )}
              {dashboardData.cajas.graficos.ventas_por_punto_venta && dashboardData.cajas.graficos.ventas_por_punto_venta.length > 0 && (
                <SimpleChart
                  title="Ventas por Punto de Venta"
                  data={dashboardData.cajas.graficos.ventas_por_punto_venta}
                  dataKey="cantidad"
                />
              )}
            </div>
          </div>
        )}

        {/* Dashboard Servicios Parroquiales */}
        {activeTab === 'servicios' && dashboardData.servicios && (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <KPICard
                title="Total de Servicios"
                value={dashboardData.servicios.kpis.total_servicios}
                icon="⛪"
                color="blue"
              />
              <KPICard
                title="Bautismos"
                value={dashboardData.servicios.kpis.bautismos}
                icon="👶"
                color="green"
              />
              <KPICard
                title="Matrimonios"
                value={dashboardData.servicios.kpis.matrimonios}
                icon="💍"
                color="purple"
              />
              <KPICard
                title="Otros Servicios"
                value={dashboardData.servicios.kpis.otros_servicios}
                icon="✨"
                color="yellow"
              />
              <KPICard
                title="Total Recaudado"
                value={`S/ ${dashboardData.servicios.kpis.total_recaudado.toLocaleString('es-PE')}`}
                icon="💰"
                color="indigo"
              />
            </div>

            {/* Estado de servicios */}
            {Object.keys(dashboardData.servicios.kpis.servicios_estado).length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Estado de Servicios
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(dashboardData.servicios.kpis.servicios_estado).map(([estado, cantidad]) => (
                    <div key={estado} className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{cantidad}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 capitalize mt-1">{estado}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {dashboardData.servicios.graficos.servicios_por_tipo && dashboardData.servicios.graficos.servicios_por_tipo.length > 0 && (
                <SimpleChart
                  title="Servicios por Tipo"
                  data={dashboardData.servicios.graficos.servicios_por_tipo}
                  dataKey="cantidad"
                />
              )}
              {dashboardData.servicios.graficos.top_servicios && dashboardData.servicios.graficos.top_servicios.length > 0 && (
                <SimpleChart
                  title="Top Servicios (Últimos 30 días)"
                  data={dashboardData.servicios.graficos.top_servicios}
                  dataKey="cantidad"
                />
              )}
              {dashboardData.servicios.graficos.servicios_por_mes && dashboardData.servicios.graficos.servicios_por_mes.length > 0 && (
                <SimpleChart
                  title="Servicios por Mes (Últimos 6 meses)"
                  data={dashboardData.servicios.graficos.servicios_por_mes}
                  dataKey="cantidad"
                />
              )}
            </div>
          </div>
        )}

        {/* Sin datos */}
        {!dashboardData.cajas && !dashboardData.servicios && (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">
              No hay datos disponibles para mostrar. Verifica tus permisos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
