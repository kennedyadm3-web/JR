import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent benign Vite HMR WebSocket connection errors from bloating the browser console
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || '');
    if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('WebSocket closed')) {
      event.preventDefault();
      console.info('[HMR] Silenced expected developer environment WebSocket rejection.');
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('vite')) {
      event.preventDefault();
      console.info('[HMR] Silenced expected developer environment WebSocket error.');
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registrar o Service Worker para suporte offline completo (PWA) nos celulares/tablets
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service Worker registrado para suporte offline:', reg.scope);
      })
      .catch((err) => {
        console.error('Erro ao registrar Service Worker:', err);
      });
  });
}
