# Fuentes de datos

Descargadas el 27 de octubre de 2026. Todas son públicas. "Automática" significa que el botón **Administración → Datos y fuentes → Actualizar ahora** la vuelve a descargar.

## Mercado, vivienda y población

| Dato | Fuente | Corte | Cómo se actualiza |
|---|---|---|---|
| Municipios y coordenadas | DANE DIVIPOLA (datos.gov.co `gdxc-w37w`) | dic. 2024 | Estable |
| Población 2026 | DANE, proyecciones municipales PPED 2018-2042 | jul. 2025 | Subir el .xlsx del DANE en Administración |
| Vivienda y área licenciada por municipio, mes, estrato, VIS/No VIS, casas/apartamentos | DANE ELIC, "Series históricas por municipios" | ago. 2026 | Mensual, manual: `anex-ELIC-SerieTipoBaseMun-*.xlsx` |
| Actos de curaduría por municipio | Superintendencia de Notariado y Registro (`psyr-i7bp`) | ago. 2026 | Automática |
| Proyectos individuales con detalle | Alcaldías de Fusagasugá (`7fsy-xzzb`) y Chía (`n686-d6yb`) | 2023-2024 | Automática; otros municipios por carga manual o extracción con IA |

## Tarifas y consumo

| Dato | Fuente | Corte | Cómo se actualiza |
|---|---|---|---|
| **Valor facturado por kWh** por operador, departamento, estrato y tipo de usuario; consumo promedio por suscriptor | Superservicios SUI, reporte comercial de energía (archivo `SUI_Precios.xlsx` entregado por el cliente) | 2026, 9 meses | Manual cada 3 meses: tipo "SUI: reporte de precios" |
| Tarifa estrato 4 nivel 1 (respaldo) | SUI, Tarifas publicadas (`4is2-3nif`) | 2023 | Automática |
| Costo unitario reciente de algunos operadores | `ytme-6qnu` (publicado por EPM: Enel, Celsia, Emcali), CHEC (`c698-wqig`) | 2025-2026 | Automática |

La tarifa residencial de la app es la mediana del valor facturado por kWh de estratos 4, 5 y 6 del mercado regulado en el departamento con más suscriptores de cada operador. Se descartan valores fuera de 400 a 1.600 $/kWh (por ejemplo, un dato de 116 $/kWh de Celsia Tolima, estrato medio).

## Autogeneración, red y contingencias

| Dato | Fuente | Corte | Cómo se actualiza |
|---|---|---|---|
| Autogeneradores a pequeña escala (AGPE) vigentes: mercado, comercializador, nivel de tensión, fuente, kW | XM, API pública `servapibi.xm.com.co` (lista `ListadoAGPE`) | 27 oct. 2026 (31.577 sistemas, 26 mercados) | Automática |
| Autogeneradores por municipio (histórico) | Superservicios, Caracterización TC1 (`endg-udcv`) | 2021-S2 | Estable; se usa para repartir el total de XM por municipio |
| Demanda no atendida programada y no programada por subárea (cortes) | XM, métricas `DemaNoAtenProg` y `DemaNoAtenNoProg` | 12 meses a 25 oct. 2026 | Automática |
| Precio de bolsa nacional | XM, `PPPrecBolsNaci` | 24 meses a oct. 2026 | Automática |
| Líneas de transmisión (STN/STR), subestaciones con tensión y operador, plantas de generación con MW y estado | XM, mapa Paratec (`paratecbackend.xm.com.co/mapas/api`) | oct. 2026 (811 líneas, 443 subestaciones, 503 plantas) | Automática |
| Red de media tensión estimada | gridfinder (Arderne et al., 2020, Zenodo 3628142): líneas de OpenStreetMap y líneas predichas por un modelo con luces nocturnas | 2020 | Estable. **Es una estimación**, no la red oficial |
| Localidades no interconectadas: horas de servicio y energía | IPSE, telemetría ZNI (`3ebi-d83g`) | 2025-2026 | Automática |
| Proyectos de generación registrados (nombre, MW, fase, municipio, fechas previstas) | UPME, "Informe de registros activos de proyectos de generación eléctrica" (Excel mensual en upme.gov.co → SIMEC) | 30 sep. 2026 (52 proyectos, 4.878 MW) | Automática (prueba los últimos 8 meses); también se puede subir a mano |
| Coordenadas de centros poblados | DANE (`xaxy-8nri`) | 2024 | Estable |
| Interrupciones ITAD por operador | Superservicios (`as4w-pgry`) | 2020-2022 | Automática |

## Turismo, empresas y licitaciones

| Dato | Fuente | Corte | Cómo se actualiza |
|---|---|---|---|
| Hoteles, viviendas turísticas, parques: habitaciones, camas, empleados, contacto | MinCIT, Registro Nacional de Turismo (`thwd-ivmp`), prestadores activos | ago. 2026 | Automática |
| Empresas del sector | Confecámaras, Registro Mercantil (`c82u-588k`), personas jurídicas activas con CIIU 4321, 3511, 3514, 4659, 4669, 2790, 2710 | oct. 2026 | Automática |
| Teléfono, correo, web y municipio de las empresas | SECOP II, proveedores registrados (`qmzu-gj57`) | oct. 2026 | Automática |
| Licitaciones y contratos solares (y quién los ganó) | SECOP II Procesos (`p6dx-8zbt`), texto con "solar" o "fotovoltaic" | oct. 2026 | Automática |
| Radiación | NASA POWER, climatología 2001-2020 | — | Estable |
| Altitud (para estimar temperatura) | Open-Meteo Elevation API | — | Estable |

## Privacidad

Solo se muestran teléfono y correo de **personas jurídicas** (NIT de 9 dígitos que empieza por 8 o 9). Los prestadores turísticos y contratistas que son personas naturales aparecen sin datos de contacto. Son datos publicados por el Estado; su uso comercial debe respetar la Ley 1581 de 2012 (atender solicitudes de no contacto).

## Supuestos y limitaciones

- **Autogeneradores por municipio:** XM los publica por mercado de comercialización. La app reparte el total de cada mercado entre sus municipios según los registros del SUI de 2021 y la población. Es una estimación.
- **Contingencias:** la demanda no atendida es de toda la subárea eléctrica (19 subáreas); todos los municipios de la subárea reciben el mismo valor por cada 1.000 habitantes.
- **Subestaciones:** XM ubica varias subestaciones en el centro de su municipio; "en el municipio" significa distancia menor a 0,5 km de ese punto.
- **Ubicación de empresas:** municipio de SECOP cuando existe; si no, la sede de la cámara de comercio (aproximado para cámaras regionales como Aburrá Sur o Huila).
- **Habitaciones del RNT:** se corrigen registros imposibles (más habitaciones que camas, o cientos de habitaciones con 1 empleado).
- **Operador de red por municipio:** del SUI donde hay autogeneradores; en el resto, por departamento (`server/etl/catalogs.js`).
- **Temperatura:** estimada con la altitud. **Radiación:** celdas de ~50 km.
- **Retorno de la inversión:** costo por kWp editable, rendimiento 78 % y autoconsumo total a la tarifa.

## Pendientes que requieren gestión manual

1. **Red de distribución oficial y disponibilidad por transformador.** La Resolución CREG 174 de 2021 (art. 7) obliga a cada operador de red a publicar gratis, en un enlace de su página de inicio titulado "Usuarios Autogeneradores y Generadores Distribuidos - Resolución CREG 174 de 2021", un sistema georreferenciado con todos sus transformadores, su capacidad, la potencia ya conectada y la disponible (semáforo verde/amarillo/naranja/rojo), actualizado del día 1 al 5 de cada mes. Puede pedir correo y contraseña, pero no código de cliente. No hay una base nacional consolidada ni API: se consulta operador por operador (la ficha de cada municipio tiene un botón que lleva al portal de su operador). Para tener la base completa de un operador se le puede pedir por derecho de petición el listado de transformadores con capacidad y disponibilidad.
2. **Proyectos de generación de la UPME:** ya integrado (ver tabla).
3. **Autogeneradores por municipio exactos.** XM no los publica por municipio; se pueden pedir a la UPME o al SUI por derecho de petición.
4. **Proyectos de vivienda con dirección.** Avisos de curadurías (PDF) en Documentos → *Extraer proyectos*, o Camacol Coordenada Urbana (pago).
5. **Archivos manuales periódicos:** DANE ELIC (mensual) y reporte de precios del SUI (trimestral).
