// MapLibre 6 carga su worker como módulo aparte. Con Vite hay que indicarle dónde quedó el archivo
// (se sirve desde el mismo origen, así la política de seguridad no necesita permitir otros dominios).
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
export default maplibregl;
