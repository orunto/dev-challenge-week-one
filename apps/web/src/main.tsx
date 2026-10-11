import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/barlow-semi-condensed/800.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/martian-mono';
import { App } from './App.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('The application root is missing.');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      if (registration.waiting) {
        window.dispatchEvent(new CustomEvent('hobbymaxx-update', { detail: registration }));
      }
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', () => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('hobbymaxx-update', { detail: registration }));
          }
        });
      });
      return navigator.serviceWorker.ready;
    }).then(() => window.dispatchEvent(new Event('hobbymaxx-offline-ready'))).catch(() => {
      window.dispatchEvent(new Event('hobbymaxx-offline-failed'));
    });
  });
}
