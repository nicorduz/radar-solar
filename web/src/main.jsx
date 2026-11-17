import React from 'react';
import { createRoot } from 'react-dom/client';
// Tipografías autoalojadas: no se hace ninguna solicitud a Google Fonts
import '@fontsource-variable/ibm-plex-sans/index.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
