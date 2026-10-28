# Radar Solar

Aplicación web (funciona en celular y computador) de inteligencia de mercado solar en Colombia para tres tipos de cliente: **instaladores**, **proveedores de equipos** y **desarrolladores o inversionistas**. Cruza tarifas 2026 del SUI, obra nueva licenciada, radiación, cortes de energía, turismo, red de transmisión, autogeneradores conectados y empresas del sector por municipio, y los convierte en un ranking distinto para cada perfil.

## Qué trae

- **Tres perfiles con su propio puntaje, ranking, columnas y menú.**
  - *Instalador:* tarifa residencial estratos 4-6, obra nueva del segmento (campestre, conjuntos o comercial y hotelero), consumo de hogares de estrato alto, sol, calor, cortes de energía de la subárea (XM), turismo y poca competencia solar.
  - *Proveedor de equipos:* instaladores en la zona, autogeneradores conectados, contratistas con contratos solares, obra nueva, tarifa y pocos mayoristas por instalador.
  - *Desarrollador o inversionista:* radiación, cercanía y tensión de subestaciones, tarifa comercial, contingencias y saturación de plantas solares cercanas.
  El administrador asigna a cada usuario un perfil o "todos" (entonces puede cambiar de perfil en el menú).
- **Mapa 3D (inicio)** con capas: líneas de transmisión y subestaciones (XM), plantas solares, proyectos registrados en la UPME, red de media tensión estimada (gridfinder) y zonas no interconectadas (IPSE).
- **Ficha por municipio:** tarifas, vivienda por mes y estrato, retorno de un sistema, cortes por mes, subestación más cercana, plantas solares a 30 km, autogeneradores del mercado, instaladores de la zona con contacto y contratos ganados, hoteles y viviendas turísticas, licitaciones y proyectos.
- **Hoteles y turismo:** 27.000 establecimientos del Registro Nacional de Turismo como clientes potenciales, con filtros y CSV.
- **Instaladores y empresas:** 52.000 empresas con municipio, teléfono, correo y contratos solares ganados en SECOP (solo personas jurídicas).
- **Mercado y red:** autogeneradores por mercado, precio de bolsa, cortes por subárea, 370 plantas solares y los proyectos del registro de la UPME.
- **Licitaciones:** 6.700+ procesos de SECOP II sobre energía solar.
- **Asistente IA** que responde según el perfil con los datos de la plataforma y los documentos que subas.
- **Dos tipos de usuario:** *prueba* (mapa por departamento, primera fila de cada lista, capas básicas y 3 consultas de IA al día; el resto borroso con botón para comprar) y *pago* (todo). El recorte se hace en el servidor.
- **Administración:** usuarios con perfil y fecha de pago, pesos por defecto de cada perfil, documentos para la IA, carga del reporte de precios del SUI, ELIC, población, proyectos y tarifas, y actualización automática de fuentes con un botón.

## Probarla en tu computador

Necesitas Node.js 22 o superior (https://nodejs.org).

```bash
cd radar-solar
npm install
npm run build
cp .env.example .env        # en Windows: copy .env.example .env
# edita .env: ADMIN_USER, ADMIN_PASSWORD y GEMINI_API_KEY
npm start
```

Abre http://localhost:3000 e inicia sesión con el administrador que pusiste en `.env`. Desde *Administración → Usuarios* creas los demás.

## Demo gratis: GitHub privado + Render Free

Para mostrar la app al equipo y a los primeros clientes sin pagar hosting.

1. Sube esta carpeta a un repositorio **privado** de GitHub (GitHub Desktop → Publish repository → "Keep this code private").
2. En render.com: New → Web Service → conecta GitHub dando acceso solo a este repositorio → Language **Docker** → Instance type **Free**.
3. Variables: `ADMIN_USER`, `ADMIN_PASSWORD`, `GEMINI_API_KEY`, `CONTACT_WHATSAPP`, `PORT=3000` y `SEED_USERS` con los usuarios de la demo (formato `usuario:clave:rol:perfil:empresa;…`, rol `trial|paid|admin`, perfil `todos|instalador|proveedor|desarrollador|servicios|respaldo`; la empresa es opcional y agrupa a los usuarios de un equipo) y `SESSION_SECRET` con un texto largo inventado (mantiene válidos los enlaces compartidos aunque el servidor se reinicie).

Límites del plan gratis: se duerme tras 15 minutos sin visitas (el primer ingreso tarda cerca de un minuto) y no tiene disco, así que lo que se cree desde el panel (usuarios, documentos, cargas) se borra al reiniciar. Por eso los usuarios de la demo van en `SEED_USERS`. Los datos del mapa vienen dentro de la app y no se pierden. Para producción, pasa a un plan pago con disco en `/data` (sección siguiente).

## Ponerla en internet con GitHub privado + Railway (recomendado)

El código queda en un repositorio **privado** de GitHub (solo tú lo ves) y Railway publica la app desde ahí. Cada cambio que subas al repositorio se publica solo. Los usuarios de la app no ven el código: solo entran con el usuario y la contraseña que tú les creas.

1. **GitHub:** crea el repositorio vacío marcando **Private** y sube esta carpeta con GitHub Desktop (los archivos `.env`, `storage/`, `node_modules/` y `web/dist/` quedan fuera gracias a `.gitignore`).
2. **Railway:** New Project → Deploy from GitHub repo → autoriza la app de Railway **solo para ese repositorio** → elige el repo. Railway usa el `Dockerfile`.
3. **Volume** montado en `/data` (usuarios, documentos y datos actualizados; sin volumen se pierden en cada despliegue).
4. **Variables:** `ADMIN_USER`, `ADMIN_PASSWORD`, `GEMINI_API_KEY`, `CONTACT_WHATSAPP`. Nunca escribas claves en el código ni en el repositorio.
5. **Networking → Generate Domain** para la URL pública (HTTPS).

Para actualizar: cambia los archivos, en GitHub Desktop haz *Commit* y *Push*, y Railway vuelve a publicar en 2 a 4 minutos.

**Sin GitHub (alternativa):** `npm install -g @railway/cli`, `railway login`, `railway init`, `railway up` desde la carpeta, y los mismos pasos 3 a 5.

**Otras opciones.** Cualquier servidor con Docker (`docker build -t radar-solar . && docker run -p 3000:3000 -v radar-data:/data --env-file .env radar-solar`). La imagen marca las cookies como seguras (solo HTTPS); si la pruebas en tu computador por `http://localhost`, agrega `-e SECURE_COOKIES=0`. Render.com también funciona con el Dockerfile y un *disk* en `/data`, pero exige conectar un repositorio de GitHub.

## Inteligencia artificial gratuita

- **Gemini (recomendado):** crea la clave en https://aistudio.google.com/apikey y ponla en `GEMINI_API_KEY`. La capa gratuita cubre los modelos Flash. Si el modelo configurado deja de existir, la app consulta la lista de modelos y elige sola el Flash vigente.
- **Groq:** clave gratuita en https://console.groq.com/keys → `GROQ_API_KEY`.
- **Cualquier API compatible con OpenAI** (OpenRouter, DeepSeek, OpenAI): `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`.

Los límites diarios por usuario se controlan con `AI_DAILY_TRIAL` y `AI_DAILY_PAID`.

## Usuarios desde la terminal (opcional)

```bash
npm run admin -- crear juan clave-segura paid instalador
npm run admin -- perfil juan proveedor     # todos | instalador | proveedor | desarrollador
npm run admin -- clave juan otra-clave
npm run admin -- rol juan trial
npm run admin -- listar
```

## Datos

Todo viene incluido y procesado en `data/`. El detalle de cada fuente, su corte y cómo se actualiza está en [FUENTES.md](FUENTES.md). Resumen:

- **Automáticas** (botón *Actualizar ahora* en Administración → Datos; tarda 5 a 15 minutos): XM (autogeneradores, cortes, precio de bolsa, mapa de red y plantas), registro de proyectos de la UPME, IPSE, Registro Nacional de Turismo, SECOP II (licitaciones y contactos), licencias por curaduría, tarifas publicadas, Registro Mercantil.
- **Manuales** (se suben en el mismo panel): el reporte de precios del SUI (cada 3 meses), el Excel mensual del DANE ELIC, las proyecciones de población del DANE y proyectos o avisos de curadurías.

Para reconstruir la base desde la terminal: `npm run etl`.

## Estructura

```
server/          API (Express), usuarios y sesiones (SQLite integrado en Node), IA, cargas
server/etl/      construcción de la base por municipio (build.js) y catálogos de operadores
web/src/         interfaz (React, MapLibre, deck.gl)
data/raw/        fuentes descargadas
data/built/      base consolidada que usa la app
storage/         (se crea solo) base de datos de usuarios, documentos y datos actualizados
```

## Propiedad y licencia

La plataforma es propiedad de Talera Colombia Consulting S.A.S. (ver `LICENSE`). Los usuarios aceptan los términos de la licencia de uso al ingresar (pantalla de ingreso y página *Términos de licencia*); la app guarda la fecha y versión aceptada de cada usuario.

## Seguridad

Contraseñas con scrypt, sesiones en cookie `httpOnly` de 30 días, límite de intentos de inicio de sesión, protección de origen en peticiones que cambian datos, y recorte de datos para usuarios de prueba hecho en el servidor. Cambia la contraseña del administrador inicial al primer ingreso (Cuenta → Cambiar contraseña).
