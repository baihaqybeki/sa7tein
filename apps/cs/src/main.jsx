// ============================================================
//  Sa7tein CS — entry point aplikasi web
//  Memuat App.jsx ke dalam #root dengan React StrictMode.
//  (Portal CS = monitoring & manajemen transaksi lintas merchant)
// ============================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
