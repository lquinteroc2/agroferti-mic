import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DialogoConfirmacion } from './components/Confirmacion';
import { iniciarSincronizacionAutomatica } from './lib/cuentaNube';
import './styles.css';

// Sin sesión en la nube no hace nada; con sesión, sincroniza al abrir, al volver internet y tras cada cambio.
iniciarSincronizacionAutomatica();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /><DialogoConfirmacion /></React.StrictMode>
);
