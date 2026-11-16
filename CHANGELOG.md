# Registro de cambios

Todos los cambios importantes del proyecto. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/) y las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

## [0.6.0] — 2026-11-15

Primera versión lista para el público, ya con el nombre **vxtop** (antes SIMULA).

### Añadido
- Vista previa al pasar el cursor: ventanas en vivo de los programas que usan una carpeta, imágenes, vídeos y textos que se están tocando, y archivos abiertos en ese momento.
- Bienvenida en el primer arranque, con la opción de permitir las imágenes en vivo de tus ventanas.
- Al hacer clic en la insignia de solo lectura, el servidor se reinicia con permisos de administrador.
- Pruebas rápidas y de extremo a extremo (`npm test`, `npm run test:e2e`) e integración continua en Windows y Linux.
- Licencia Apache-2.0, NOTICE, guías de contribución y seguridad, y documentación en español e inglés.

### Cambiado
- Las carpetas con nombre genérico muestran su carpeta padre (`AppData › Local`); las carpetas de proyectos de Claude Code muestran solo el proyecto.
- Vista Sistema: las líneas de red se quedan tenues hasta que señalas un proceso o una dirección.
- Eliminadas unas 350 líneas de código muerto del cliente.
- Arranca sin permisos de administrador.
- El cliente se divide en módulos ordenados que se sirven como un solo paquete con *source map*.
- La vista en vivo muestra solo lo que se usa ahora (8 s), con un máximo de 24 grupos de actividad.
- Un clic selecciona, centra y abre; el foco atenúa todo lo que no tiene relación.
- Los programas son cubos de 27 celdas que flotan sobre las carpetas; sin suelo.
- Código y comentarios en inglés.

### Corregido
- El ayudante nativo de Windows ya no supera el límite de longitud de la línea de comandos.
- Un doble clic por costumbre ya no cancela el encuadre de la cámara.

### Eliminado
- Partículas decorativas, tarjetas de la barra de procesos, etiquetas de tipo, corchetes de selección y la pestaña Canales.
