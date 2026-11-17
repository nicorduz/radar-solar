version: 2026-11-17
titulo: Cookies y almacenamiento en tu navegador
---
{{APP}} **no usa cookies de publicidad, de analítica ni de seguimiento**, ni píxeles de redes sociales, ni grabación de sesiones. Por eso no mostramos un banner de cookies: no hay nada opcional que aceptar o rechazar. Si algún día agregamos una tecnología opcional, quedará desactivada hasta que la autorices y podrás cambiar tu elección aquí.

## Cookies necesarias

| Nombre | Para qué | Duración | Quién la pone |
|---|---|---|---|
| `__Host-rs` (`rs_session` en pruebas locales) | Mantener tu sesión iniciada. Es HttpOnly, Secure y SameSite=Strict: el código de la página no puede leerla y no se envía desde otros sitios | 14 días, o 7 días sin uso; 12 horas para administradores | {{APP}} |
| `__Host-rs_mfa` | Recordar durante el ingreso que ya escribiste la contraseña, mientras escribes el código de verificación (solo administradores) | 5 minutos | {{APP}} |

## Almacenamiento local del navegador

Estos datos se guardan en tu navegador para que la aplicación funcione y recuerde tu trabajo. **No se envían a nuestros servidores.** Los que son tuyos se separan por usuario: si otra persona entra con su cuenta en el mismo navegador, no los ve.

| Clave | Contenido | Duración |
|---|---|---|
| `rs_prospectos`, `rs_follows`, `rs_seen` | Tus prospectos, las zonas que sigues y las novedades que ya viste | Hasta que los borres |
| `rs_tableros`, `rs_shapes` | Tus tableros guardados y los dibujos del mapa | Hasta que los borres |
| `rs_disenos`, `rs_diseno_actual`, `rs_paneles`, `rs_baterias` | Tus diseños solares y los equipos que creaste | Hasta que los borres |
| `rs_zona_informe` | Datos temporales para armar un informe | Hasta que los borres |
| `rs_chat` (almacenamiento de sesión) | Historial del asistente en esta pestaña | Hasta cerrar la pestaña o la sesión |
| `rs_profile`, `rs_segment`, `rs_weights_*`, `rs_tour_v1` | Preferencias de visualización y si ya viste el recorrido inicial | Hasta que los borres |

Puedes borrar todo esto desde la configuración de tu navegador. En **Cuenta** también hay una opción para borrar tus datos locales de este navegador.

## Servicios externos que carga el mapa

Para dibujar el mapa, tu navegador descarga el mapa base de **CARTO** y las imágenes satelitales de **Esri**. Esos servidores reciben tu dirección IP y la zona que estás viendo, como ocurre con cualquier mapa en internet. Son necesarios para que el mapa funcione y no usamos cookies de esos servicios. Las búsquedas de direcciones pasan por nuestro servidor, que las consulta en OpenStreetMap sin enviar tu IP.

Las fuentes tipográficas se sirven desde nuestro propio servidor; no se cargan desde Google ni desde otros proveedores.
