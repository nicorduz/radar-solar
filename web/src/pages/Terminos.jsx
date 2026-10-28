import React from 'react';

export const OWNER = 'Talera Colombia Consulting S.A.S.';
export const TERMS_VERSION = '2026-11';

// Términos de la licencia de uso. Se muestran en el ingreso y dentro de la plataforma.
export function TerminosTexto({ appName = 'Radar Solar' }) {
  return (
    <div className="legal">
      <p><b>Versión {TERMS_VERSION}.</b> Al ingresar a {appName} con un usuario y contraseña, la persona o empresa titular de la cuenta (el "licenciatario") acepta estos términos.</p>

      <h2>1. Propiedad</h2>
      <p>{appName} es propiedad exclusiva de {OWNER} ("Talera"). Son de Talera el software y su código fuente, el diseño, la interfaz, las bases de datos compiladas, los índices y modelos de puntaje, los textos, las marcas y los logotipos. Están protegidos por las normas de derecho de autor y propiedad industrial (entre ellas la Ley 23 de 1982 y la Decisión Andina 351 de 1993).</p>

      <h2>2. Qué permite la licencia</h2>
      <p>Talera otorga al licenciatario una licencia de uso <b>limitada, personal, no exclusiva e intransferible</b> que permite únicamente <b>acceder a la plataforma</b> con las credenciales asignadas y consultar su información para la actividad comercial propia del licenciatario.</p>

      <h2>3. La licencia no transfiere propiedad</h2>
      <p>La licencia no convierte al licenciatario en dueño, copropietario ni titular de ningún derecho sobre la plataforma, su código, sus datos, sus índices o sus resultados. Todo derecho no otorgado de forma expresa en estos términos queda reservado a Talera.</p>

      <h2>4. Lo que no está permitido</h2>
      <ul>
        <li>Copiar, reproducir, imprimir o capturar de forma sistemática la plataforma o sus bases de datos, total o parcialmente. Se exceptúan las propuestas, informes y enlaces de solo lectura que genera la propia plataforma, que el licenciatario puede entregar a sus clientes o aliados para su gestión comercial.</li>
        <li>Extraer información con programas automáticos (robots, scraping, consultas masivas a la API).</li>
        <li>Vender, sublicenciar, publicar, distribuir o entregar a terceros la información o los archivos descargados. Las descargas que ofrece la plataforma (por ejemplo, CSV) son solo para uso interno del licenciatario.</li>
        <li>Compartir usuario y contraseña o permitir el acceso de personas distintas al titular de la cuenta. Las licencias de equipo asignan un usuario a cada persona.</li>
        <li>Hacer ingeniería inversa, modificar o crear productos derivados o competidores a partir de la plataforma.</li>
        <li>Usar la marca o el logotipo de Talera sin autorización escrita.</li>
      </ul>
      <p>El incumplimiento permite a Talera suspender o cancelar la cuenta, sin perjuicio de las acciones legales que correspondan.</p>

      <h2>5. Fuentes de información</h2>
      <p>La plataforma integra datos públicos de entidades del Estado colombiano y de fuentes abiertas, que conservan la titularidad sobre sus datos. Talera es titular de la compilación, organización, análisis e índices construidos con ellos.</p>
      <p>La información es de referencia y puede contener errores o rezagos de las fuentes. No reemplaza estudios técnicos, la factibilidad de conexión que expide el operador de red ni asesoría legal, financiera o técnica. Talera no responde por decisiones tomadas con base en ella.</p>

      <h2>6. Datos de contacto de empresas</h2>
      <p>Solo se muestran datos de contacto de personas jurídicas publicados en registros públicos. El licenciatario es responsable de usarlos de acuerdo con la Ley 1581 de 2012 y de atender las solicitudes de quienes no deseen ser contactados.</p>

      <h2>7. Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República de Colombia.</p>

      <p className="small muted">© {new Date().getFullYear()} {OWNER} Todos los derechos reservados.</p>
    </div>
  );
}

export function LegalLine({ go }) {
  return (
    <span>© {new Date().getFullYear()} {OWNER} Todos los derechos reservados. Licencia de uso solo para acceso; no se permite su copia ni reproducción. <a href="#/terminos" onClick={(e) => { if (go) { e.preventDefault(); go('terminos'); } }}>Términos de licencia</a> · <a href="https://www.talera.co/" target="_blank" rel="noreferrer">talera.co</a></span>
  );
}

export default function Terminos({ appName }) {
  return (
    <div className="page">
      <h1>Términos de la licencia de uso</h1>
      <TerminosTexto appName={appName} />
    </div>
  );
}
