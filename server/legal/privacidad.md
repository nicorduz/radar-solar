version: 2026-11-17
titulo: Política de tratamiento de datos personales
---
Esta política explica qué datos personales trata {{APP}}, para qué, con quién se comparten, cuánto tiempo se conservan y cómo ejercer tus derechos. Se expide en cumplimiento de la Ley 1581 de 2012 y del Decreto 1074 de 2015 (capítulo 25, que incorporó el Decreto 1377 de 2013).

## 1. Responsable del tratamiento

- **Responsable:** {{RAZON_SOCIAL}}, NIT {{NIT}}.
- **Domicilio:** {{DOMICILIO}}. **Dirección:** {{DIRECCION}}.
- **Correo para asuntos de datos personales:** {{CORREO_DATOS}}. **Teléfono:** {{TELEFONO}}.
- **Canal en línea:** sección **Tus datos** de la plataforma, disponible sin iniciar sesión.

## 2. Qué datos tratamos, de dónde vienen y para qué

| Datos | Origen | Finalidad | Base |
|---|---|---|---|
| Usuario, contraseña (solo su huella cifrada con Argon2id), nombre, empresa, teléfono, perfil, plan y fechas de acceso | Los entregas al pedir tu cuenta | Crear y administrar tu cuenta, darte acceso según tu plan, atenderte y facturar | Autorización y relación contractual |
| Sesiones: fecha de inicio, último uso y tipo de navegador | Se generan al ingresar | Seguridad: mantener tu sesión, mostrarte tus sesiones abiertas y cerrarlas | Autorización |
| Evidencia de aceptación: versión del texto, fecha, navegador y dirección IP recortada | Se genera cuando aceptas | Probar la aceptación de términos y las autorizaciones | Obligación de conservar prueba de la autorización |
| Registros de seguridad: ingresos, intentos fallidos, cambios de permisos y exportaciones, con IP recortada | Se generan al usar la plataforma | Detectar abusos, investigar incidentes y auditar accesos administrativos | Autorización y deber de seguridad |
| Conteo diario de consultas al asistente | Se genera al usarlo | Aplicar los límites del plan | Autorización |
| Preguntas que escribes al asistente de IA | Las escribes tú | Responderte. No se guardan en el servidor; el historial queda solo en la pestaña de tu navegador | Autorización |
| "Mi marca": logo, empresa, asesor, cargo, teléfono, correo y condiciones comerciales | Los escribes tú | Generar tus propuestas y reportes | Actuamos como encargados de tu empresa |
| Solicitudes de titulares: nombre, correo, relación con el dato y detalle | Las escribes tú o la persona interesada | Tramitar consultas y reclamos | Obligación legal |
| Comunicaciones comerciales (solo si las autorizas) | Tu cuenta | Enviarte novedades y ofertas de {{APP}} | Autorización opcional, revocable |

**No pedimos** cédula, dirección de residencia, datos de salud, datos biométricos ni datos de niños, niñas o adolescentes.

## 3. Información pública que muestra la plataforma

La plataforma reúne registros públicos de empresas, prestadores de salud, sedes educativas, alojamientos turísticos y contratación estatal, entre otros. Sobre estos datos se aplican estas reglas:

- Solo se muestran datos de contacto de **personas jurídicas** (empresas e instituciones con NIT de persona jurídica).
- Se ocultan los correos de servicios gratuitos, porque suelen pertenecer a una persona y no a la empresa.
- No se incorporan datos de personas naturales comerciantes, profesionales independientes, pacientes ni estudiantes. De los colegios y centros de salud solo se usan datos institucionales: nombre, sector, tamaño y ubicación aproximada.
- La finalidad es la prospección comercial entre empresas del sector solar.
- Cualquier persona o empresa puede pedir que se retiren sus datos de contacto en **Tus datos**. El retiro se aplica en toda la plataforma, incluidos el asistente y las descargas.

## 4. Datos que guardas en tu navegador

Tus prospectos, zonas seguidas, tableros, dibujos y diseños se guardan en el almacenamiento local de tu navegador, separados por usuario. **No llegan a nuestros servidores.** Respecto de los datos personales de tus prospectos, tú eres el responsable del tratamiento.

## 5. Con quién compartimos datos (encargados y destinatarios)

| Proveedor | Qué recibe | Para qué | Dónde |
|---|---|---|---|
| Render Services, Inc. (hosting) | Todos los datos del servidor | Alojar la plataforma | Estados Unidos |
| Proveedor de IA configurado (por defecto Groq, Inc.; alternativas: Google Gemini, xAI, OpenAI u otro compatible) | Tus preguntas y datos públicos agregados de la plataforma; no recibe tu usuario, tus prospectos ni el nombre de tus clientes | Generar las respuestas del asistente | Estados Unidos |
| CARTO (mapa base) y Esri (imágenes satelitales) | Tu dirección IP y la zona del mapa que miras, desde tu navegador | Mostrar el mapa | Estados Unidos y otros |
| OpenStreetMap Foundation (Nominatim) | El texto que buscas en el mapa, enviado por nuestro servidor sin tu IP | Encontrar direcciones y lugares | Reino Unido |
| Comisión Europea, PVGIS, y NASA POWER | Coordenadas del techo que diseñas, enviadas por nuestro servidor sin datos tuyos | Calcular la radiación solar | Unión Europea y Estados Unidos |
| {{PROVEEDOR_RESPALDO}} | Copias de seguridad cifradas | Recuperar el servicio | {{PAIS_RESPALDO}} |

Estos envíos son **transmisiones** a encargados que tratan los datos por cuenta nuestra. Cuando el proveedor está fuera de Colombia, se trata de una transmisión internacional. Se ampara en tu autorización y en los términos contractuales de cada proveedor. {{ESTADO_CONTRATOS}}

No vendemos datos personales ni los cedemos a terceros para su propio uso.

## 6. Cuánto tiempo conservamos los datos

| Datos | Conservación |
|---|---|
| Cuenta y "Mi marca" | Mientras la cuenta esté activa. Se eliminan al cerrarla. |
| Sesiones | Hasta 14 días, o 7 días sin uso. Las de administradores, 12 horas. |
| Evidencia de aceptación | {{RETENCION_CONSENTIMIENTOS}} |
| Registros de seguridad | 1 año. Se purgan automáticamente. |
| Conteo de consultas al asistente | 1 año. |
| Solicitudes de titulares | {{RETENCION_SOLICITUDES}} |
| Copias de seguridad | {{RETENCION_RESPALDOS}} |

Si una copia de seguridad se restaura, se vuelven a aplicar las eliminaciones y retiros registrados después de la fecha de esa copia, para no reactivar datos suprimidos.

## 7. Seguridad

Aplicamos estas medidas, que se revisan periódicamente:

- conexión cifrada (HTTPS);
- contraseñas de al menos 15 caracteres, guardadas con Argon2id;
- verificación en dos pasos obligatoria para administradores;
- sesiones con cookies protegidas;
- límites de intentos;
- registros de auditoría;
- permisos verificados en el servidor en cada operación;
- copias de seguridad cifradas.

Ninguna medida elimina todo riesgo. Si ocurre un incidente que afecte datos personales, lo gestionamos según nuestro procedimiento y lo reportamos a la Superintendencia de Industria y Comercio cuando corresponda, dentro de los 15 días hábiles siguientes a su detección.

## 8. Tus derechos

Como titular puedes:

- conocer, actualizar y rectificar tus datos;
- pedir prueba de la autorización que nos diste;
- saber cómo se han usado tus datos;
- revocar la autorización o pedir la supresión, cuando no exista un deber legal o contractual de conservarlos;
- presentar quejas ante la Superintendencia de Industria y Comercio, una vez agotado el trámite ante nosotros;
- acceder gratis a tus datos.

## 9. Cómo ejercer tus derechos

- **Dónde:** en **Tus datos** (también sin iniciar sesión) o al correo {{CORREO_DATOS}}. Cada solicitud recibe un número de radicado con el que puedes consultar su estado.
- **Identificación:** no pedimos copia de tu documento de identidad. Para proteger tus datos, verificamos que la solicitud venga del correo o del usuario registrado. Si pides algo sobre datos de una empresa, verificamos que actúas en nombre de ella.
- **Consultas** (conocer tus datos o cómo se usan): las respondemos en máximo 10 días hábiles. Si no es posible, te avisamos antes del vencimiento y respondemos en máximo 5 días hábiles más.
- **Reclamos** (corregir, actualizar, suprimir o revocar, o un posible incumplimiento): los respondemos en máximo 15 días hábiles desde el día siguiente a su recibo. Si no es posible, te avisamos antes del vencimiento y respondemos en máximo 8 días hábiles más.
  - Si el reclamo está incompleto, te pedimos completarlo dentro de los 5 días siguientes. Si pasan 2 meses sin respuesta, se entiende que desististe.
  - Mientras se tramita, el dato se marca como "reclamo en trámite".

## 10. Comunicaciones comerciales

Solo te enviaremos publicidad si lo autorizas con una casilla separada, que viene sin marcar. Puedes retirar esa autorización en **Cuenta**, en cualquier momento. Tu acceso a la plataforma no depende de aceptarla.

## 11. Cambios a esta política

Publicaremos cualquier cambio con su fecha de vigencia. Si cambian las finalidades, te pediremos una nueva autorización antes de usar tus datos para la nueva finalidad.

**Vigencia:** desde la fecha de la versión indicada arriba.
