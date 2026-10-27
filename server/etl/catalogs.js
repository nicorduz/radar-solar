// Catálogos de operadores de red (OR), asignación por departamento y categorías CIIU.
// La asignación por departamento es una aproximación: donde el SUI muestra usuarios
// autogeneradores, el OR se toma de esos datos (más preciso). Editable aquí.

export const ORS = {
  ENEL: { name: 'Enel Colombia', patterns: ['ENEL COLOMBIA', 'CODENSA', 'ENERGIA DE CUNDINAMARCA', 'ENEL BOGOTA'] },
  EPM: { name: 'EPM', patterns: ['MEDELLIN'] },
  AIRE: { name: 'Air-e', patterns: ['AIR-E', 'AIR E ', 'ELECTRIFICADORA DEL CARIBE'] },
  AFINIA: { name: 'Afinia (Caribemar)', patterns: ['CARIBEMAR'] },
  CELSIA_TOL: { name: 'Celsia Tolima', patterns: ['CELSIA - TOLIMA', 'CELSIA COLOMBIA - TOLIMA', 'CELSIA TOLIMA'] },
  CELSIA_VAL: { name: 'Celsia Valle', patterns: ['CELSIA - VALLE', 'CELSIA COLOMBIA - VALLE'] },
  CELSIA: { name: 'Celsia', patterns: ['CELSIA'] },
  EMCALI: { name: 'Emcali', patterns: ['MUNICIPALES DE CALI', 'EMCALI'] },
  CETSA: { name: 'Cetsa (Tuluá)', patterns: ['TULU'] },
  EMCARTAGO: { name: 'Emcartago', patterns: ['MUNICIPALES DE CARTAGO'] },
  ESSA: { name: 'ESSA', patterns: ['ELECTRIFICADORA DE SANTANDER'] },
  RUITOQUE: { name: 'Ruitoque', patterns: ['RUITOQUE'] },
  CENS: { name: 'CENS', patterns: ['NORTE DE SANTANDER'] },
  CHEC: { name: 'CHEC', patterns: ['CALDAS', 'CHEC'] },
  EEP: { name: 'Energía de Pereira', patterns: ['PEREIRA'] },
  EDEQ: { name: 'EDEQ', patterns: ['QUINDIO'] },
  EBSA: { name: 'EBSA', patterns: ['BOYACA'] },
  ELECTROHUILA: { name: 'Electrohuila', patterns: ['HUILA'] },
  EMSA: { name: 'EMSA', patterns: ['ELECTRIFICADORA DEL META'] },
  CEDENAR: { name: 'Cedenar', patterns: ['NARI'] },
  CEO: { name: 'CEO', patterns: ['ENERGETICA DE OCCIDENTE'] },
  ENELAR: { name: 'Enelar', patterns: ['ARAUCA'] },
  ENERCA: { name: 'Enerca', patterns: ['CASANARE'] },
  ELECTROCAQUETA: { name: 'Electrocaquetá', patterns: ['CAQUETA'] },
  DISPAC: { name: 'Dispac', patterns: ['DISTRIBUIDORA DEL PACIFICO'] },
  PUTUMAYO: { name: 'Energía del Putumayo', patterns: ['PUTUMAYO'] },
  GUAVIARE: { name: 'Energía del Guaviare', patterns: ['ELECTRICA DEL DEPARTAMENTO'] },
};

const ORDER = Object.keys(ORS);
const strip = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/�/g, '').toUpperCase();

export function matchOrKey(name) {
  const n = strip(name).trim();
  if (!n) return null;
  // Acepta el código (EMSA, CEDENAR…) o el nombre corto que muestra la app (p. ej. "Celsia Tolima")
  for (const k of ORDER) if (n === k || n === strip(ORS[k].name)) return k;
  for (const k of ORDER) if (ORS[k].patterns.some((p) => n.includes(strip(p)))) return k;
  return null;
}

export const DEPT_DEFAULT_OR = {
  '05': 'EPM', '08': 'AIRE', '11': 'ENEL', '13': 'AFINIA', '15': 'EBSA', '17': 'CHEC', '18': 'ELECTROCAQUETA',
  '19': 'CEO', '20': 'AFINIA', '23': 'AFINIA', '25': 'ENEL', '27': 'DISPAC', '41': 'ELECTROHUILA', '44': 'AIRE',
  '47': 'AIRE', '50': 'EMSA', '52': 'CEDENAR', '54': 'CENS', '63': 'EDEQ', '66': 'CHEC', '68': 'ESSA', '70': 'AFINIA',
  '73': 'CELSIA_TOL', '76': 'CELSIA_VAL', '81': 'ENELAR', '85': 'ENERCA', '86': 'PUTUMAYO', '95': 'GUAVIARE',
  // 88 San Andrés, 91 Amazonas, 94 Guainía, 97 Vaupés, 99 Vichada: zonas no interconectadas (sin OR del SIN)
};

export const MUNI_OR_OVERRIDE = {
  '76001': 'EMCALI', '76834': 'CETSA', '76147': 'EMCARTAGO', '66001': 'EEP', '68276': 'ESSA',
};

export const CIIU_CATS = {
  '4321': 'Instaladores eléctricos',
  '4322': 'Instaladores eléctricos',
  '4330': 'Instaladores eléctricos',
  '3511': 'Generación y comercialización',
  '3514': 'Generación y comercialización',
  '4659': 'Proveedores mayoristas de equipo',
  '4669': 'Proveedores mayoristas de equipo',
  '2790': 'Fabricantes de equipo eléctrico',
  '2710': 'Fabricantes de equipo eléctrico',
  '7112': 'Ingeniería y consultoría',
  '4290': 'Obras de ingeniería civil',
};
