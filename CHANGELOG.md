# Registro de cambios

Todos los cambios importantes del proyecto. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/) y las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

## [Sin publicar] — Prisma

### Añadido
- Barra para hablar con Claude mediante el Claude Code instalado (CLI o Claude Desktop), con todas las cuentas con sesión iniciada, modos observar y trabajo, recuperación de la conversación y borrador que se conserva.
- Cubo dentro de cubo: cada carpeta es un único cubo sólido (ya no 27 celdas). Un doble clic lo convierte en una vitrina de su gema, con cada subcarpeta y cada archivo como un cubo propio (los archivos, coloreados por tipo y con el tamaño según su peso); un doble clic en una subcarpeta baja un nivel, en un archivo abre el visor, y Esc sube de nivel en nivel hasta el primero. El contenido emerge del cubo y vuelve a hundirse en él.
- Los programas de «En vivo» son vitrinas con un cubo pequeño por proceso (arista: memoria; los procesos brillan y respiran con la CPU). En la vista Sistema cada proceso es un cubo.
- Archivos dentro de una vitrina: un clic abre la ficha del archivo en el panel con una vista previa (texto, imagen, vídeo, audio, tabla, JSON o hexadecimal); **O** ordena por tamaño, fecha o nombre; **/** busca y resalta las coincidencias; un grupo con más de 110 archivos reúne el resto en un cubo resumen que los abre todos con un doble clic. Las ráfagas de cambios se vuelven a listar para no perder ninguno.
- Dentro de un programa: un doble clic en un programa de «En vivo» abre su vitrina con sus procesos (PID, RAM, CPU), sus conexiones por equipo remoto, las carpetas que usa y sus módulos (archivos abiertos en macOS y Linux), que se actualizan cada 3 s con altas y bajas; un doble clic en una de sus carpetas entra en ella.
- Los archivos borrados dejan un contorno rubí en su sitio durante cinco minutos; **N** dentro de una carpeta muestra solo lo creado o cambiado hoy.
- Vista Tareas: los programas son cubos (arista: memoria) y cada servicio es un cubo de cristal que contiene su proceso cuando está en marcha.
- Dentro de una vitrina el contenido se agrupa en conjuntos con etiqueta: subcarpetas, código, datos, documentos y medios, y ejecutables, de mayor a menor.
- Cambios en vivo: lo que se crea nace con un destello esmeralda, lo que se borra se vuelve rubí, cae y se desvanece, y lo que cambia late, tanto dentro de la vitrina como en todo el cuerpo de un cubo cerrado.
- Acabado: cada cubo tiene aristas finas iluminadas de su color, los archivos están más pulidos que las carpetas, las carpetas más pesadas son más grandes y los cubos del primer nivel se colocan junto a los de su misma gema.
- El clic y el doble clic nunca se solapan: el clic espera el intervalo del doble clic.
- No se entra en las carpetas vacías (un aviso lo indica); cada etiqueta nombra su gema; la leyenda de la ayuda enumera las cinco gemas.
- Una gema por cubo: el cubo entero toma el color de lo que lo llena (zafiro, código; esmeralda, datos; oro, documentos y medios; plata, carpetas; rubí, ejecutables), y sus ventanas, su brillo de actividad y sus destellos lo siguen.
- Permisos del modo trabajo: «Preguntar» muestra cada edición como un diff y espera a Permitir / Denegar, «Aceptar ediciones» las aplica y «Planificar» solo lee y planifica.
- Herramienta MCP `prisma_space` para que Claude cree, cambie, renombre y cierre espacios.
- Recarga en caliente (`npm run dev`): los estilos se sustituyen al momento, la página se recarga con los cambios del cliente y el servidor se reinicia solo cuando no hay ningún turno del asistente en marcha y todos sus archivos se pueden interpretar.
- Marca de Prisma (prisma triangular) y lenguaje de color por gemas: zafiro para código, esmeralda para datos, oro para documentos y medios, plata para carpetas, rubí para ejecutables y errores, superficies de ónice mate y texto perla.

### Cambiado
- Los cortes (X/Y/Z), la vista explotada (E) y las cifras por celda desaparecen con el cuerpo de 27 celdas; el desglose por celdas sigue en la pestaña «Celdas».
- Renombrado de vxtop a Prisma: datos en `~/.prisma`, `PRISMA_PORT`, cabecera `X-Prisma`, herramientas MCP `prisma_*` y puerto 4828 por defecto.
- La aplicación se abre en un espacio vacío; «En vivo» está a una pestaña.
- Los servidores que lanza la aplicación nunca inician un segundo servidor, detienen sus turnos de Claude al salir y terminan con el modo de desarrollo.

### Eliminado
- La web de vxtop (`site/`) y el README duplicado en inglés.

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
