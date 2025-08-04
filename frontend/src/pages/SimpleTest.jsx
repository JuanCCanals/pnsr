import React from 'react';

function SimpleTest() {
  return (
    <div style={{ padding: '20px', backgroundColor: 'red', color: 'white', fontSize: '24px' }}>
      <h1>PÁGINA DE PRUEBA FUNCIONANDO</h1>
      <p>Si puedes ver esto, React está funcionando correctamente.</p>
      <button onClick={() => alert('¡Funciona!')}>Hacer clic aquí</button>
    </div>
  );
}

export default SimpleTest;

