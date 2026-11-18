# Registro de cambios

Todos los cambios importantes del proyecto. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/) y las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased] — Prisma

### Added
- Prompt bar to talk to Claude through the installed Claude Code (CLI or Claude Desktop), with every logged-in account, observe and work modes, transcript replay and draft persistence.
- Cube inside cube: every folder is one solid cube (no longer 27 cells). A double click turns it into a glass case of its gem with each subfolder and each file inside as a cube of its own (files coloured by kind and sized by weight); a double click on a subfolder goes deeper, on a file opens the viewer, and Esc climbs back one level at a time, stopping at the top. Contents rise out of the cube and sink back into it.
- Programs in «En vivo» are glass cases holding one small cube per process (edge: memory; the processes brighten and breathe with the CPU). In the System view each process is one cube.
- Deleted files leave a ruby outline in their place for five minutes; **N** inside a folder shows only what was created or changed today.
- Tasks view: programs are cubes (edge: memory) and each service is a glass cube holding its process when it runs.
- Inside a case the contents are grouped in labelled clusters: subfolders, code, data, documents and media, executables, biggest first.
- Live changes: what is created is born with an emerald flash, what is deleted turns ruby, drops and fades, what changes pulses, both inside the case and on the whole body of a closed cube.
- Finish: every cube has thin lit edges in its own colour, files are more polished than folders, heavier folders are bigger, and top-level cubes sit next to others of the same gem.
- Click and double click never overlap: the click waits for the double-click interval.
- Empty folders are not entered (a notice says so); the gem is named on each label; the help legend lists the five gems.
- One gem per cube: the whole cube takes the colour of what fills it (sapphire code, emerald data, gold documents and media, silver folders, ruby executables), and its windows, activity glow and shimmer follow it.
- Work mode permissions: «Preguntar» shows each edit as a diff and waits for Permitir / Denegar, «Aceptar ediciones» applies them, «Planificar» only reads and plans.
- `prisma_space` MCP tool so Claude can create, switch, rename and close spaces.
- Hot reload (`npm run dev`): styles swap in place, the page reloads on client changes, the server restarts only when no assistant turn is running and every server file parses.
- Prisma mark (triangular prism) and gem colour language: sapphire code, emerald data, gold documents and media, silver folders, ruby executables and errors, matte onyx surfaces, pearl text.

### Changed
- Slices (X/Y/Z), exploding (E) and the per-cell figures are gone with the 27-cell body; the cell breakdown stays in the «Celdas» tab.
- Renamed from vxtop to Prisma: data in `~/.prisma`, `PRISMA_PORT`, header `X-Prisma`, MCP tools `prisma_*`, default port 4828.
- The app opens on an empty space; «En vivo» is one tab away.
- Servers launched by the app never spawn a second server, stop their Claude turns on exit and exit with the development runner.

### Removed
- The vxtop website (`site/`) and the English README duplicate.

## [Sin publicar] (vxtop)

### Añadido
- Galería de medios de un cubo (**G**, la ficha o el menú contextual): todas las imágenes, vídeos y audios de la carpeta y sus subcarpetas, con su árbol de carpetas, filtros por tipo y nombre, orden, secciones por carpeta, miniaturas de tamaño ajustable y navegación con teclado. Las miniaturas se hacen en el navegador y se guardan en su caché local (IndexedDB).
- Visor: zoom hacia el cursor (rueda, pellizco, doble clic), arrastrar para desplazar, tamaño real 1:1, mapa para imágenes grandes, giro solo de la vista, fondo oscuro, claro o damero, tira de miniaturas, pase de diapositivas, pantalla completa y datos del archivo. Las imágenes vecinas se cargan por adelantado.
- `GET /api/media?path=` lista los archivos de medios de una carpeta (solo nombres y datos, nunca el contenido).

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
