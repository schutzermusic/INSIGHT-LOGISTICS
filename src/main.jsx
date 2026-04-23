import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { loadGoogleMaps } from './services/GoogleMapsLoader';

// Load Google Maps JS API (frontend key only — Maps + Places)
loadGoogleMaps().catch(() => {
  console.warn('[Insight Logistics] Google Maps not loaded. Using local city fallback.');
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
