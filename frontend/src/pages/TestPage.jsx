import React from 'react';

const TestPage = () => {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-600">Página de Prueba</h1>
      <p className="mt-4 text-gray-600">
        Esta es una página de prueba para verificar que React Router funciona correctamente.
      </p>
      <div className="mt-6 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
        ✅ React Router está funcionando correctamente
      </div>
    </div>
  );
};

export default TestPage;

