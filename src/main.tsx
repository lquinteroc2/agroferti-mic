import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { iniciarSincronizacionAutomatica } from './lib/cuentaNube';
import './styles.css';

// Sin sesión en la nube no hace nada; con sesión, sincroniza al abrir, al volver internet y tras cada cambio.
iniciarSincronizacionAutomatica();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
