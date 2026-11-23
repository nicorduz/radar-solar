// Rutas regulatorias para conectar autogeneración y proyectos solares en Colombia.
// Revisado el 23 de noviembre de 2026 contra los textos de la CREG (gestor normativo) y la UPME.
// Los puntos tomados de fuentes secundarias van marcados con `verificar: true`.
// No es asesoría legal: el operador de red y la regulación vigente mandan.

export const REVISADO = '23 de noviembre de 2026';

// Documentos que pide el artículo 14 de la CREG 174 de 2021 (letras A a G)
export const DOCS_174 = {
  A: 'Estudio de conexión simplificado',
  B: 'Formulario de conexión simplificado',
  C: 'Certificado de formación o experiencia de quien instala',
  D: 'Manual del inversor o del control que limita la inyección',
  E: 'Archivo de la consulta de disponibilidad en la web del operador de red',
  F: 'Certificado de producto de los inversores (anti-isla y protecciones)',
  G: 'Diagrama unifilar, esquema de puesta a tierra, distancias de seguridad y cuadro de cargas',
};

const N = {
  c174: { t: 'CREG 174 de 2021 (AGPE, GD y conexión)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_creg_0174_2021.htm' },
  c072: { t: 'CREG 101 072 de 2025 (autogeneración y GD colectiva)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_creg_101-72_2025.htm' },
  c087: { t: 'CREG 101 087 de 2025 (excedentes a precio de bolsa mientras se fija el Mcm)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_creg_101-87_2025.htm' },
  c099: { t: 'CREG 101 099 de 2026 (autogeneración remota y productor marginal remoto)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_creg_101-99_2026.htm' },
  c075: { t: 'CREG 075 de 2021 (asignación de capacidad de transporte)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_creg_0075_2021.htm' },
  c094: { t: 'CREG 101 094 de 2025 (régimen transitorio de capacidad)', u: 'https://www.minenergia.gov.co/documents/14927/Resolucion_CREG_101_094_2025.pdf' },
  c106: { t: 'CREG 101 106 de 2026 (aceptación de capacidad con obra requerida)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_creg_101-106_2026.htm' },
  u358: { t: 'UPME 358 de 2026 (procedimiento de asignación OCS y TAC)', u: 'https://docs.upme.gov.co/Normatividad/358_2026.pdf' },
  u563: { t: 'UPME 563 de 2026 (certificados para beneficios tributarios)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_upme_0563_2026.htm' },
  u501: { t: 'UPME 501 de 2024 (límites de comunidades energéticas)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_upme_0501_2024.htm' },
  m40509: { t: 'MinEnergía 40509 de 2024 (Registro de Comunidades Energéticas)', u: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_minminas_40509_2024.htm' },
  cno2031: { t: 'CNO Acuerdo 2031 de 2025, reemplazado por el 2184 de 2026 (modelos de plantas solares y eólicas en el SDL ≥ 5 MW)', u: 'https://www.cno.org.co/content/acuerdo-2031-por-el-cual-se-actualizan-los-requerimientos-para-la-obtencion-y-validacion-de' },
  cno1359: { t: 'CNO Acuerdo 1359 (modelos de plantas solares y eólicas en STN y STR)', u: 'https://www.cno.org.co/content/acuerdo-1359-por-el-cual-se-establecen-los-requerimientos-para-la-obtencion-y-validacion-de' },
};

// Paso: [título, quién, plazo, detalle]
const pasoDisponibilidad = ['Consultar la disponibilidad de la red', 'Tú, en la web del operador de red', 'El mismo día',
  'Cada operador publica un mapa por circuito y transformador, actualizado entre el día 1 y el 5 de cada mes: verde hasta 30 %, amarillo 30 a 40 %, naranja 40 a 50 % y rojo más de 50 % de la capacidad ya ocupada por autogeneración. Guarda el archivo de la consulta: es el documento E.'];
const pasoIncentivos = ['Pedir el certificado de beneficios tributarios', 'UPME, en su plataforma', 'Hasta 30 días hábiles',
  'Deducción del 50 % en renta, exclusión de IVA, exención de aranceles y depreciación acelerada (Ley 1715 de 2014 y Ley 2099 de 2021). Se radica entre el 1 de febrero y el 15 de diciembre; la UPME puede pedir información una vez (un mes para responder). Para la exclusión de IVA conviene tenerlo antes de comprar los equipos: confírmalo con tu contador.'];
const pasoVisita = ['Pedir la entrada en operación', 'Operador de red', 'Visita en máximo 5 días hábiles',
  'Se pide en el sistema en línea. El operador avisa la fecha con 2 días hábiles y la primera visita no tiene costo. Si no puede conectar, debe subir un informe que explique por qué.'];

export const FIGURAS = {
  agpe_peq: {
    nombre: 'Autogeneración hasta 100 kW', corto: 'AGPE ≤ 100 kW',
    para: 'Hogares, comercios y empresas que consumen la energía en el mismo predio.',
    limites: [
      'Hasta 100 kW de potencia máxima declarada en la frontera.',
      'La suma de autogeneradores y generadores distribuidos en el mismo circuito, transformador o subestación no puede superar el 50 % de su capacidad nominal.',
      'La energía horaria que entregan no puede superar el 50 % del promedio de las horas de demanda mínima del año anterior en ese circuito (hay una regla propia para solar sin baterías entre 6 a. m. y 6 p. m.).',
      'Con excedentes: medidor bidireccional que cumpla el Código de Medida.',
      'No necesita estudio de conexión.',
    ],
    valor: [
      'Lo que exportas en el mes hasta lo que importas se descuenta kWh por kWh (crédito de energía) y solo pagas la comercialización de esos kWh.',
      'Lo que exportes por encima de lo que importas se paga a precio de bolsa hora a hora, mientras la CREG fija la metodología del Mcm.',
    ],
    entidades: ['or', 'comercializador', 'upme', 'retie', 'quejas'],
    pasos: (exc) => [
      ...(exc ? [pasoDisponibilidad] : []),
      pasoIncentivos,
      ['Radicar la solicitud', 'Tú, en el sistema en línea del operador de red', 'Sin costo', `Sube los documentos B, C, D si aplica${exc ? ', E' : ''}, F y G. El trámite también puede llegar por la ventanilla única.`],
      ['Revisión de completitud', 'Operador de red', '2 días hábiles', 'Si falta algo te lo pide una sola vez: tienes 5 días hábiles para completar y el operador 2 para revisar de nuevo. Si no completas, se entiende que desististe.'],
      ['Verificación técnica', 'Operador de red', exc ? '5 días hábiles en nivel 1 · 10 en niveles 2 y 3' : 'De 3 a 10 días hábiles según el tamaño',
        exc ? 'Revisa normas del inversor, certificación de quien instala, protecciones y los límites del circuito. Si hay observaciones: 5 (o 10) días hábiles para corregir y 5 para la nueva revisión.' : 'Menos de 10 kW: 3 días hábiles; de 10 a 100 kW: 5. Revisa además el control que impide inyectar a la red.'],
      ['Aprobación de la conexión', 'Operador de red', 'Vigencia de 6 meses', 'Se puede prorrogar una vez por 3 meses, pidiéndolo al menos un mes antes de que venza.'],
      ['Firmar el contrato de conexión', 'Tú y el operador de red', '15 días hábiles', ''],
      ['Construir e instalar', 'Instalador', 'Según la obra', 'Con el RETIE (Resolución MinEnergía 40117 de 2024): diseño, materiales certificados y declaración de cumplimiento; el dictamen de inspección cuando el RETIE lo exige para ese tamaño.'],
      pasoVisita,
      ...(exc ? [['Medidor y facturación', 'Comercializador', 'Cada mes', 'Instala o valida el medidor bidireccional y liquida el crédito de energía en la factura.']] : []),
    ],
    total: (exc) => (exc ? 'Del operador: de 12 días hábiles con todo completo a unos 30 si hay correcciones, más la obra.' : 'Del operador: de 5 a 12 días hábiles con todo completo, más la obra.'),
    docs: (exc) => ['B', 'C', 'D', ...(exc ? ['E'] : []), 'F', 'G'],
    extra: ['Diseño eléctrico según el RETIE (memoria de cálculo, planos y especificaciones)', 'Ficha técnica de paneles e inversores', 'Factura o cuenta del cliente (NIU de la frontera)', 'Autorización del dueño del techo si no es el cliente'],
    normas: ['c174', 'c087', 'u563'],
  },
  agpe_med: {
    nombre: 'Autogeneración de 100 kW a 1 MW', corto: 'AGPE ≤ 1 MW',
    para: 'Empresas, industrias, centros comerciales y edificios con consumo alto de día.',
    limites: [
      'Más de 100 kW y hasta 1 MW por frontera (límite de la UPME, Resolución 281 de 2015).',
      'Con excedentes necesita un estudio de conexión simplificado.',
      'Mismos límites del circuito: 50 % de la capacidad nominal y 50 % de la demanda mínima horaria.',
      'Pruebas de puesta en servicio coordinadas con el operador.',
    ],
    valor: [
      'Lo exportado hasta lo importado también se descuenta, pero pagas transmisión, distribución, comercialización, pérdidas y restricciones de esos kWh: en la práctica solo ahorras la componente de generación.',
      'Por eso conviene dimensionar para autoconsumo y exportar poco.',
      'Lo que supere lo importado se paga a precio de bolsa por ahora.',
    ],
    entidades: ['or', 'comercializador', 'upme', 'retie', 'quejas'],
    pasos: (exc) => (exc ? [
      pasoDisponibilidad, pasoIncentivos,
      ['Radicar la solicitud', 'Tú, en el sistema en línea del operador de red', 'Sin costo', 'Primero solo el formulario simplificado (B).'],
      ['Revisión de completitud', 'Operador de red', '5 días hábiles', '5 para completar y 5 para la nueva revisión.'],
      ['Información para el estudio', 'Operador de red', '5 días hábiles', 'Te entrega los datos de la red que necesitas.'],
      ['Hacer el estudio de conexión simplificado', 'Tu ingeniero', 'Hasta 5 meses', 'El operador responde dudas en 3 días hábiles (ese tiempo no cuenta). Se sube con D y G.'],
      ['Revisión del estudio', 'Operador de red', '20 días hábiles', 'Revisa estudio, protecciones y control de inyección. Si no lo aprueba, te pide aclarar una sola vez.'],
      ['Aprobación de la conexión', 'Operador de red', 'Vigencia de 6 meses', 'Antes de construir sube C y F para una segunda verificación.'],
      ['Firmar el contrato de conexión', 'Tú y el operador de red', '15 días hábiles', ''],
      ['Construir e instalar', 'Instalador', 'Según la obra', 'RETIE con dictamen de inspección cuando aplica.'],
      ['Pruebas y entrada en operación', 'Operador de red', 'Visita en máximo 5 días hábiles', 'El operador coordina el plan de pruebas y avisa con al menos 48 horas. No energiza hasta corregir lo que encuentre.'],
      ['Medidor y facturación', 'Comercializador', 'Cada mes', ''],
    ] : FIGURAS.agpe_peq.pasos(false).map((p) => (p[0] === 'Verificación técnica' ? [p[0], p[1], '10 días hábiles', '10 para corregir y 5 para la nueva revisión. Revisa el control que impide inyectar.'] : p))),
    total: (exc) => (exc ? 'Del operador: unos 40 días hábiles con todo completo, más el tiempo del estudio y la obra.' : 'Del operador: unos 12 días hábiles con todo completo, más la obra.'),
    docs: (exc) => (exc ? ['A', 'B', 'C', 'D', 'E', 'F', 'G'] : ['B', 'C', 'D', 'F', 'G']),
    extra: ['Diseño eléctrico según el RETIE (memoria de cálculo, planos y especificaciones)', 'Estudio de coordinación de protecciones', 'Ficha técnica de paneles e inversores', 'Factura del cliente (NIU de la frontera)', 'Autorización del dueño del techo si no es el cliente'],
    normas: ['c174', 'c087', 'u563'],
  },
  colectiva: {
    nombre: 'Autogeneración colectiva', corto: 'Comunidad energética',
    para: 'Un techo o una planta que reparte su energía entre varios usuarios: locales de un centro comercial, un conjunto, un parque empresarial.',
    limites: [
      'La hace una comunidad energética registrada ante el Ministerio de Minas.',
      'Menos de 5 MW en total, en el mismo mercado de comercialización y el mismo sistema de distribución.',
      'Al menos dos fronteras; todas con el mismo comercializador.',
      'La energía se reparte con un porcentaje por usuario (PDE) que fija el representante según el acuerdo. Cambiarlo exige avisar 10 días hábiles antes del ciclo de facturación.',
      'Cada frontera necesita medición bidireccional, salvo que ningún miembro tenga excedentes.',
    ],
    valor: [
      'Caso 1: comunidad de hasta 1 MW, solo renovables, cada usuario con 100 kW o menos y cada PDE por debajo de 10 % (en la práctica 11 miembros o más): cada kWh asignado se valora como el AGPE de 100 kW, pagando solo comercialización.',
      'Caso 2: si algún usuario pasa de 100 kW o tiene un PDE de 10 % o más: se valora como el AGPE de más de 100 kW (solo se ahorra la generación).',
      'Caso 3: de 1 a 5 MW: los excedentes se venden con las reglas de generadores (CREG 024 de 2015 y 096 de 2019).',
      'Caso 4: si algún miembro usa fuentes no renovables.',
    ],
    entidades: ['or', 'comercializador', 'minminas', 'upme', 'retie', 'quejas'],
    pasos: () => [
      ['Constituir la comunidad energética', 'Los miembros', 'Según el acuerdo', 'Contrato o acuerdo asociativo con representante, suplente y el PDE de cada usuario.'],
      ['Inscribirla en el Registro de Comunidades Energéticas', 'Ministerio de Minas y Energía', 'Hasta 12 meses como comunidad inicial', 'Se puede inscribir como inicial y completar requisitos en ese plazo; si no, se entiende desistido.', true],
      pasoDisponibilidad,
      ['Radicar la conexión', 'El representante, en el sistema del operador o la ventanilla única', 'Según el tamaño', 'Sigue la ruta del AGPE (hasta 1 MW) o la de un autogenerador de menos de 5 MW, con los documentos del artículo 14 de la CREG 174 más los de la comunidad.'],
      ['Medidores', 'Comercializador', '3 + 15 días hábiles', 'Confirma en 3 días hábiles si tiene los equipos y en 15 los suministra, calibra e instala (15 si los pone el usuario).'],
      ['Construir, probar y entrar en operación', 'Instalador y operador de red', 'Como en el AGPE', ''],
      ['Facturación por PDE', 'Comercializador', 'Cada mes', 'La factura de cada miembro muestra el nombre de la comunidad, el número de miembros, su PDE y la energía asignada.'],
    ],
    total: () => 'Depende del registro de la comunidad y del tamaño; la conexión sigue los plazos del AGPE.',
    docs: () => ['B', 'C', 'D', 'E', 'F', 'G'],
    extra: ['Carta con el NIU de todos los miembros y el código ASIC de cada frontera (marcando las que entregan energía)', 'Acuerdo de la comunidad con representante, suplente y PDE de cada NIU', 'Constancia de inscripción en el Registro de Comunidades Energéticas', 'Estudio de conexión simplificado si pasa de 100 kW con excedentes'],
    normas: ['c072', 'c087', 'u501', 'm40509', 'c174'],
  },
  remota: {
    nombre: 'Autogeneración remota', corto: 'Remota',
    para: 'Generar en un predio (una bodega, un lote) y consumir esa energía en otro.',
    limites: [
      'Sin límite de capacidad en la definición.',
      'El usuario que recibe la energía se atiende como no regulado, sin los límites de potencia o energía mensuales; nunca como regulado.',
      'Si son varios sitios de consumo, deben tener la misma actividad económica principal (código CIIU).',
      'Medición individual con telemetría en la generación y en cada consumo.',
      'El productor marginal remoto puede venderle a socios, filiales o empresas de su mismo grupo.',
    ],
    valor: [
      'Se registra ante el ASIC un contrato "pague lo contratado" entre el comercializador del consumo y el generador.',
      'El consumo paga todos los cargos tarifarios que le apliquen: en la práctica se ahorra la componente de generación.',
      'El crédito de energía es del AGPE en su propio predio; la resolución no lo extiende a la remota (confírmalo con tu asesor).',
    ],
    entidades: ['or', 'comercializador', 'xm', 'upme', 'retie'],
    pasos: () => [
      ['Definir la figura', 'Tú', '', 'Autogenerador remoto o productor marginal remoto; potencia, si entrega excedentes y en qué nivel de tensión se conecta cada punto.'],
      ['Conexión de la planta', 'Operador de red o UPME', 'Según el tamaño', 'Menos de 5 MW en distribución: procedimiento de la CREG 174. 5 MW o más, o en STR y STN: procedimiento de generadores y asignación de capacidad.'],
      ['Nombrar un agente que lo represente ante el ASIC', 'Un generador o comercializador', '', ''],
      ['Registrar las fronteras de generación y de consumo', 'Los agentes, ante XM', 'Según CREG 157 de 2011', ''],
      ['Registrar el contrato', 'Comercializador del consumo', '', 'Contrato "pague lo contratado" entre la frontera de consumo y la de generación.'],
      ['Contratar respaldo de red', 'Tú y el operador de red', '', 'Desde 100 kW conectados al SDL o al STR, según el análisis legal consultado.', true],
      pasoIncentivos,
    ],
    total: () => 'Depende de la conexión de la planta y del registro ante el ASIC.',
    docs: () => ['B', 'C', 'D', 'F', 'G'],
    extra: ['Certificado de existencia que muestre el vínculo económico (si es productor marginal remoto)', 'Código CIIU de cada sitio de consumo', 'Contrato con el agente representante', 'Contrato de respaldo'],
    normas: ['c099', 'c174', 'c075'],
  },
  gd: {
    nombre: 'Generación distribuida', corto: 'GD < 1 MW',
    para: 'Una planta pequeña que no consume: vende toda su energía.',
    limites: [
      'Menos de 1 MW, conectada al sistema de distribución.',
      'Quien la opera debe ser una empresa de servicios públicos (ESP).',
      'Mismos límites del circuito que el AGPE.',
      'Hasta 100 kW sin estudio; de 100 kW a 1 MW con estudio de conexión simplificado.',
    ],
    valor: [
      'El comercializador integrado con el operador de red está obligado a comprarle la energía.',
      'El precio parte del Mcm más un componente de pérdidas y un beneficio por estar cerca de la demanda; mientras la CREG fija el Mcm, se usa el precio de bolsa.',
      'También puede vender en contratos a generadores o comercializadores.',
    ],
    entidades: ['or', 'comercializador', 'xm', 'upme', 'retie'],
    pasos: () => FIGURAS.agpe_med.pasos(true),
    total: () => 'Como el AGPE del mismo tamaño, más la constitución de la ESP si no existe.',
    docs: () => ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    extra: ['Certificado de existencia de la ESP', 'Contrato de venta de energía'],
    normas: ['c174', 'c087'],
  },
  proyecto: {
    nombre: 'Proyecto de más de 1 MW', corto: 'Inversionista',
    para: 'Parques solares, autogeneradores grandes y plantas para vender energía.',
    limites: [
      'Hoy solo pueden pedir capacidad de transporte (clase 1) los proyectos con obligaciones con el sistema (cargo por confiabilidad o subastas de contratos de largo plazo) o con trámite ambiental cumplido (licencia en firme). Ningún otro proyecto puede radicar mientras rija el régimen transitorio (CREG 101 094 de 2025, desde el 27 de noviembre de 2025).',
      'Menos de 10 MW en distribución los evalúa el operador de red; 10 MW o más, o en STR y STN, la UPME.',
      'Garantía inicial de 5 dólares por kW al radicar, vigente al menos un año.',
      'Al aceptar la capacidad, garantía de reserva de 10 dólares por kW (hasta 100 dólares por kW).',
    ],
    valor: ['Venta en contratos bilaterales (PPA), en bolsa o mediante subastas; los autogeneradores grandes se rigen además por la CREG 024 de 2015.'],
    entidades: ['upme', 'or', 'transportador', 'xm', 'cno', 'ambiental', 'retie'],
    pasos: () => [
      ['Registrar el proyecto ante la UPME', 'UPME', 'Fases 1, 2 y 3', 'Registro de proyectos de generación (Resolución UPME 749 de 2025).'],
      ['Licencia ambiental y consulta previa', 'ANLA o la corporación autónoma regional; Ministerio del Interior', 'Meses', 'La licencia en firme es requisito para entrar al ciclo TAC.'],
      ['Estudio de conexión', 'Tu consultor', 'Antes de radicar', 'Estudio de conexión, estudio de disponibilidad de espacio físico y al menos una alternativa en una subestación existente. Formato de la UPME para la ventanilla única.'],
      ['Radicar en la ventanilla única', 'Tú', 'OCS: 5 días hábiles desde el inicio del ciclo · TAC: 10', 'OCS abre el día siguiente a los resultados de la subasta o mecanismo. TAC abre cuando la UPME publica el cumplimiento de condiciones. Información complementaria en 15 días hábiles.'],
      ['Comentarios de los transportadores y evaluación', 'Transportadores y UPME', 'OCS: 20 + 30 + 15 días hábiles · TAC: 15 + 10', 'Evaluación eléctrica individual y conjunta, con prueba de robustez: al menos 95 % de escenarios satisfactorios.'],
      ['Concepto de conexión', 'UPME u operador de red', '10 días hábiles tras la evaluación', 'OCS: máximo 5 meses desde la radicación.'],
      ['Aceptar la capacidad', 'Tú', '2 meses', 'Garantía de reserva aprobada por el ASIC, curva S y, si depende de una obra requerida, compromiso de ejecutarla.'],
      ['Contrato de conexión', 'Tú y el transportador', '4 meses desde el concepto', ''],
      ['Modelos y pruebas', 'Tú, ante el CND (XM)', 'Preliminares 6 meses antes de operar · detallados 30 días hábiles después', 'Modelos validados, sin encriptar y parametrizables en la herramienta que publica el CND, con pruebas al mínimo técnico, a un nivel intermedio y a 80 % o más de la potencia. Es lo que pedía el Acuerdo CNO 2031 para plantas de 5 MW o más en distribución; el Acuerdo 2184 de julio de 2026 lo reemplazó.', true],
      ['Construir según la curva S y entrar en operación', 'Tú', 'Hasta la FPO', 'Informes cada hito y cada 6 meses. La FPO se puede mover hasta 24 meses aumentando la garantía; se ejecuta si incumples la curva S tres veces o conectas menos del 90 %.'],
    ],
    total: () => 'Con licencia en firme y la ventana abierta, unos 3 meses hasta el concepto (TAC) y hasta 5 meses (OCS). Sin obligaciones ni licencia, hoy no hay ventana: depende de que la CREG levante el régimen transitorio.',
    docs: () => [],
    extra: ['Registro UPME del proyecto', 'Licencia ambiental en firme y comunicación de vigencia de máximo 60 días', 'Resultados de adjudicación de la obligación (si es OCS)', 'Estudio de conexión y de espacio físico', 'Formato UPME de información básica y complementaria', 'Garantía inicial (5 USD/kW) aprobada por el ASIC', 'Curva S', 'Modelos dinámicos de la planta e inversores', 'Certificado de beneficios tributarios UPME'],
    normas: ['c094', 'u358', 'c106', 'c075', 'cno2031', 'cno1359', 'u563'],
  },
};

export const ENTIDADES = {
  or: (z) => [`Operador de red${z?.or ? `: ${z.or}` : ''}`, 'Aprueba la conexión, publica la disponibilidad del circuito y hace la visita.'],
  comercializador: () => ['Comercializador', 'La empresa que factura la energía del cliente: medidor bidireccional y liquidación del crédito.'],
  upme: () => ['UPME', 'Certificado de beneficios tributarios, registro de proyectos y conceptos de conexión de los proyectos grandes.'],
  retie: () => ['Organismo de inspección RETIE', 'Dictamen de inspección de la instalación cuando el RETIE lo exige.'],
  quejas: () => ['Superservicios y SIC', 'Si el operador incumple plazos o niega sin el informe que exige la norma: Superservicios. Si obstaculiza la conexión: Superintendencia de Industria y Comercio.'],
  minminas: () => ['Ministerio de Minas y Energía', 'Registro de Comunidades Energéticas.'],
  xm: () => ['XM (ASIC y CND)', 'Registro de fronteras y contratos, liquidación y, en plantas grandes, modelos y pruebas.'],
  transportador: () => ['Transportador (STN o STR)', 'Comenta la solicitud, firma el contrato de conexión y ejecuta las obras requeridas.'],
  cno: () => ['CNO', 'Define los requisitos de modelos y pruebas de las plantas.'],
  ambiental: () => ['ANLA o la corporación autónoma regional', 'Licencia ambiental según el tamaño del proyecto; Ministerio del Interior para la consulta previa.'],
};

export const NORMAS = N;

// Figura sugerida según el tamaño y el tipo de cliente
export function figuraSugerida(kwAc) {
  if (!kwAc) return 'agpe_peq';
  if (kwAc <= 100) return 'agpe_peq';
  if (kwAc <= 1000) return 'agpe_med';
  return 'proyecto';
}

// Quién puede ser dueño del sistema: modelos de negocio comunes
export const MODELOS_NEGOCIO = [
  ['Compra directa', 'El cliente paga el sistema y es el autogenerador.'],
  ['Arriendo o servicio (SPV)', 'Un tercero pone el sistema y cobra un canon o un fee; el cliente sigue siendo el autogenerador. La SPV no vende kWh, así que no necesita ser comercializador.', true],
  ['PPA físico', 'Venta de energía por contrato: exige que quien vende sea una ESP o un generador y que el comprador pueda contratar (usuario no regulado).', true],
];
