# Guía de Prisma

> [README](../README.md) · [English guide](en/guide.md) · [Arquitectura](arquitectura.md)

Observatorio 3D de directorios y del sistema. Cada directorio es un cubo de una sola gema, y dentro de él cada subcarpeta y cada archivo es otro cubo. Sus datos se agregan en 27 celdas (tipo × profundidad × antigüedad), en la pestaña «Celdas». Alrededor se ven los archivos, los procesos, la red y lo que hacen las sesiones de IA.

**Solo lectura**: es un monitor. Nunca crea, modifica ni borra nada en lo que observa y no actúa sobre procesos ni sobre el sistema. Solo escribe en su propia carpeta `~/.prisma` (índices, escenas y el token para el MCP).

Efectos que provoca el propio sistema al leer: Windows actualiza la hora de último acceso de los archivos leídos y descarga los archivos de OneDrive que solo estaban en la nube.

Funciona sin conexión y sin dependencias de npm: todas las librerías van incluidas en `public/vendor`.

## Requisitos
- Node.js 18.15 o superior.
- Windows (completo), Linux (probado en Ubuntu/WSL) o macOS (no probado).
- Opcional: GPU NVIDIA (telemetría vía `nvidia-smi`) y `ffmpeg` (fotogramas de vídeos que el navegador no reproduce).

## Arranque en Windows (recomendado)
Doble clic en **prisma.vbs**. Arranca el servidor **sin ninguna ventana de consola** y sin pedir permisos de administrador, con su registro en `%LOCALAPPDATA%\prisma\servidor.log`, y abre prisma en una ventana de Chrome propia, sin barras y con un perfil separado (`%LOCALAPPDATA%\prisma\chrome`). La primera vez, una bienvenida explica lo básico y pregunta si quieres ver imágenes en vivo de tus ventanas (desactivadas si no dices que sí; se cambia en Ajustes).

**Más datos con administrador**: un clic en la insignia «SOLO LECTURA» reinicia el servidor con permisos de administrador (Windows pide confirmación) para ver también la caché DNS y los archivos abiertos por cada proceso. Sigue siendo solo lectura; la insignia pasa a «SOLO LECTURA · ADMIN».

Al cerrar la ventana de Prisma se cierra todo en unos 10 s: el servidor, su ayudante de PowerShell y el Chrome de su perfil (`--with-window`; el margen permite recargar la página). Si el código cambia mientras está abierto, la página avisa de que hay que cerrar y volver a abrir. Para depurar con consola: `node server.js` en la carpeta del proyecto.

## Varios cubos a la vez
- **+ → Varios cubos…**: selector de carpetas de Windows con selección múltiple (Ctrl/Mayús). Crea un espacio nuevo y los cubos llegan uno a uno y se van colocando en el corro; al terminar se encuadra todo.
- **Buscador** (barra superior): escribe un nombre y salen las carpetas que lo contienen (de los índices, al instante), o empieza una ruta y la completa. Flechas para elegir, Intro abre como cubo, Mayús+Intro con subcarpetas; en la vista Árbol abre esa raíz. Varias rutas separadas por `;` se abren a la vez.
- **Arrastrar y soltar** desde el Explorador sobre el Espacio: carpetas → cubos (en el espacio actual; desde «En vivo», en uno nuevo), archivos → objetos. El navegador no entrega rutas, así que Prisma busca cada elemento por su nombre y su contenido: lo seleccionado en las ventanas abiertas del Explorador, las carpetas que muestran, las habituales, las unidades, lo ya abierto, los recientes y los índices. Si no lo encuentra, lo dice en la cinta.

## Tipos de cubo
Cada cubo lleva en la tapa un emblema y en la etiqueta una línea del color de su tipo: ◉ unidad · ✦ trabajado con IA · `</>` proyecto de código · ▶ medios · ⚙ sistema · ▣ datos de programas · ◷ temporal o caché · ↓ descargas · ★ carpeta personal. Ningún cubo entra en otro, ni siquiera con uno explotado: el más ligero se aparta y, cuando hay hueco, todo vuelve a su sitio.

## Vista Árbol (como `tree`)
Botón **Árbol** (tecla **A**), clic derecho en un cubo o en una carpeta del explorador → «Ver en árbol», o escribe una ruta con la vista Árbol abierta. Cada carpeta y todas sus subcarpetas, cada una con su cubo ligero: tamaño por peso y color por antigüedad (turquesa = cambiada hoy, azul = este mes, gris = antes, ámbar = pesadas como `node_modules` o `.git`, que no se abren solas).
- **Un clic** (o Intro, o el triángulo de la lista) selecciona, despliega o contrae y centra; clic derecho: desplegar todo debajo (3 o 6 niveles), contraer todo debajo, ver como raíz, subir, abrir como cubo, indexar.
- Barra superior: **Niveles 1–6** (como `tree -L N`), **Todo**, **Contraer**, **Subir**, **Plano / Radial**, **Encuadrar**. La lista de la izquierda es el árbol en texto (`├─ └─`).
- Hasta 8000 carpetas a la vez sin perder fluidez (un solo dibujo para todas, sin celdas de archivos ni escaneo por cubo). Con índice los datos son instantáneos y completos; sin índice se leen del disco con tiempo máximo y los tamaños son parciales (marcados con «+»).
- Los cubos completos del Espacio tienen un tope de 256 por espacio («En vivo» se queda en 64 para que se lea; con 250 cubos se mantiene a ~150-180 fps): cada uno tiene 27 celdas, hasta 432 ventanas de archivos, su escaneo, su vigilancia en vivo y su etiqueta.

## Uso
```
node server.js [directorio ...] [--expand] [--port 4828] [--no-open]
```
- Sin directorio abre el actual. `--expand` despliega también sus subcarpetas como cubos.
- Para instalarlo como comando: `npm install -g .` dentro de esta carpeta, y después `prisma C:\ruta\proyecto --expand`.
- Solo escucha en `127.0.0.1`. Toda consulta exige un token que recibe la propia página. Las rutas de red (`\\servidor\...`) están bloqueadas.

## Para una IA (MCP)
```
claude mcp add prisma -- node "<ruta>/mcp.js"
```
Herramientas: `prisma_open`, `prisma_close`, `prisma_observe`, `prisma_cube`, `prisma_references`, `prisma_pulse`, `prisma_ls`, `prisma_file`, `prisma_system`, `prisma_tasks`, `prisma_meta`, `prisma_index`, `prisma_layout` y `prisma_focus`. El MCP lee el token de `~/.prisma/token` y arranca prisma si no está en marcha.

## Espacios
- **En vivo** (por defecto al abrir prisma): solo lo que se está usando **ahora** en el equipo, no lo que pasó. Una carpeta entra cuando algo la toca (disco de todas las unidades, lo que tocan las IAs, las rutas de los programas abiertos, descargas de los últimos 2 min) y se apaga a los 8 s sin actividad, con la cuenta atrás «se apaga · N s». Se agrupa por raíz de proyecto o por programa (hasta 24 focos; la carpeta de usuario y la raíz de una unidad no cuentan como proyecto). Lo que tienes seleccionado no se apaga mientras lo miras.
  - **programas**: flotan en una capa por encima, cada uno como una caja de cristal con un cubo por proceso dentro: el tamaño es su memoria y los procesos brillan con la CPU, y lleva su icono real encima. Halo ámbar: el programa que tienes delante, con su pantalla en vivo encima; halo turquesa: el que está bajo tu cursor.
  - **barra «ahora»** (arriba): el programa en primer plano, el título de su ventana y lo que hay bajo el cursor.
  - Sin suelo: carpetas y programas flotan. La cámara nunca se mueve sola salvo para seguir lo que has seleccionado.
- **+**: crea un espacio propio, vacío o con una foto fija de «En vivo». Abrir una carpeta concreta desde «En vivo» crea su propio espacio.
- **Niveles**: cada carpeta se ve como un único cubo. Un clic lo selecciona y lo centra. **Doble clic** entra en él: el cubo se vuelve una caja de cristal de su color y dentro aparece todo lo que contiene, cada cosa como un cubo (las subcarpetas abajo y los archivos encima, los más recientes primero, del tamaño de lo que pesan). Un doble clic en una subcarpeta baja otro nivel; en un archivo, lo abre en el visor. `Esc` sube un nivel cada vez hasta el principal, y ahí ya no retrocede más. Dentro, todo se agrupa en bloques con su rótulo: carpetas, código, datos, documentos y medios, ejecutables. Lo que se crea nace con un destello esmeralda, lo que se borra se vuelve rubí, cae y se desvanece, y lo que cambia late; lo borrado deja su contorno rubí cinco minutos y  muestra solo las novedades de hoy. Una carpeta vacía no se abre: lo avisa. El clic y el doble clic no se solapan: el clic espera un instante por si llega el segundo.
- **Colores**: cada cubo es de una sola gema según lo que contiene: zafiro código, esmeralda datos, oro documentos y medios, plata carpetas (o vacío), rubí ejecutables. Las ventanas, la actividad y el destello recorren el cubo en su mismo color.
- **Disposiciones** (`1–4`): sala o clúster, pila (subcarpetas en torres sobre su cubo, lo más pesado abajo), cuadrícula y órbita.

## Qué se ve
- **Ventanas**: cada archivo reciente es una ventana en la superficie de su celda; su brillo indica la recencia.
- **Sondas de IA** (ámbar): recorren los archivos que la IA lee, busca o escribe, según las sesiones de Claude Code de todas las cuentas `~/.claude*`.
- **FOCO IA**: matriz de atención (softmax por fila) sobre los archivos del cubo. Se propaga por referencias y carpetas y se muestra flotando junto al cubo, con hilos hasta los archivos.
- **Partículas**: cada una es un archivo tocado en ese momento. Sale del programa que lo tocó (o cae desde arriba si no se sabe) y llega al archivo. Color según quién: ámbar Claude, turquesa tú (el programa que tienes delante o bajo el ratón), gris azulado otro programa. Una escritura son tres puntos; una lectura, uno tenue.
- **Líneas**: «este programa usa esta carpeta». Solo se dibujan las del programa que tienes delante, el que señalas y el seleccionado.
- **Vista previa al pasar el cursor**: sobre un cubo de carpeta aparecen, en pequeño, las ventanas en vivo de los programas que la usan, las imágenes, vídeos y textos que se están tocando y los archivos que algún programa tiene abiertos ahora. Sobre un cubo de programa, su ventana en vivo y lo último que ha tocado. Al quitar el cursor, desaparece. Las miniaturas de ventana se hacen en local (PrintWindow, solo lectura) y no salen del equipo.
- **Foco**: al seleccionar algo, lo que no tiene relación con ello se apaga y pierde su etiqueta.
- **Plantillas**: cada carpeta se reconoce por su contenido (proyecto Node, Python, Rust o Go, repositorio git, trabajado con IA, medios, unidad). Según el tipo, se pueden abrir sus archivos clave o una galería de medios.
- **Galería de medios** (tecla **G** con un cubo seleccionado, «Abrir galería» en la ficha o el menú contextual): todas las imágenes, vídeos y audios de la carpeta y sus subcarpetas. A la izquierda, el árbol de carpetas con sus totales; arriba, filtro por nombre (`/`), tipo, orden, secciones por carpeta (`G`), recorte cuadrado (`C`) y tamaño de miniaturas (`+`/`−`). Flechas para moverse, Intro para abrir.
  - **Visor**: rueda para acercar hacia el cursor, arrastrar para desplazar, doble clic alterna entre ajustar y ampliar, `1` tamaño real, `0` ajustar, `R` girar (solo la vista), `B` fondo (oscuro, claro, damero), `I` información, `P` pase de diapositivas, `F` pantalla completa, `←`/`→` anterior y siguiente. En imágenes grandes aparece un mapa para saltar a cualquier zona; por encima de 250 % se ven los píxeles tal cual.
  - Las miniaturas se hacen en el navegador y se guardan en su caché local; los archivos solo se leen.
- **Escenas**: guardan lo abierto (cubos, objetos, cámara y espacio) con un nombre, para volver a ello.

## Cubo seleccionado
Se centra y lo que no tiene relación se apaga. A la derecha, la pestaña **Ficha** con secciones desplegables (las vacías no se muestran): contenido, actividad, tamaño, estado (git, índice) dependencias declaradas (npm, pip, pyproject, Cargo, go), historial de git (últimos commits), red de los procesos que la usan, archivos abiertos ahora y quién los tiene, e IA y enlaces (sesiones, referencias internas).

## Explorador, objetos y sistema
- **Explorador**: unidades, carpetas y archivos con el icono del sistema y el tamaño real de las carpetas (si hay índice). Clic derecho en una carpeta: abrirla como cubo, con 1–4 niveles de subcarpetas, o verla en árbol.
- **Objetos**: cada archivo se ve según su tipo:
  - código, con colores de sintaxis;
  - imagen, vídeo y audio (con forma de onda);
  - PDF (primera página con pdf.js);
  - modelos 3D (`.glb`, `.gltf`, `.obj`, `.stl`, `.fbx`), que giran en el espacio;
  - CSV, JSON, fuentes tipográficas y binarios (con su firma).

  Sus propiedades indican qué proceso lo tiene abierto en ese momento.
- **Vista Sistema** (tecla V):
  - aplicaciones con su icono real, terminales y procesos por capas;
  - sesiones de Claude Code con su cuenta, su modelo y sus peticiones web;
  - conexiones TCP con el dominio cuando se conoce.

  De cada proceso se ve la memoria, los hilos y los módulos cargados (en Linux también los archivos abiertos).
- **Vista Tareas** (tecla T): el administrador de tareas en 3D, de solo lectura. Once apartados, entre ellos tareas programadas y fallos de los últimos 7 días, además de: aplicaciones, segundo plano y procesos de Windows (agrupados por programa, con su icono), rendimiento por núcleo, red por equipo remoto, archivos en uso, servicios, programas de inicio y usuarios.
- **Cinta en vivo**: distingue escrito, creado, borrado y **acceso** (lectura). Atribuye cada cambio a la **IA**, a **prisma** (sus propias lecturas) o al proceso que tenía el archivo abierto.
- **Índice**: para árboles enormes como `C:\` completo (unos 6 M de archivos en unos 3,5 min). Se guarda en `~/.prisma/index`, se corrige con cada cambio y se rehace en segundo plano cuando aparecen carpetas nuevas o pasan 12 h.

## Controles
- **Ratón** (estándar 3D): el botón izquierdo arrastrando orbita, el derecho arrastrando desplaza y la rueda acerca y aleja hacia el centro (en Ajustes se puede hacer que vaya hacia el cursor). Un clic selecciona y centra; el doble clic en un cubo entra en él y `Esc` sube. Ctrl + clic compara varios cubos y el clic derecho abre el menú. Pasar el cursor por un cubo muestra lo que se está usando en él.
- **Teclado**: `H` encuadrar todo (llena el hueco libre entre paneles) · `F` encuadrar el cubo seleccionado · flechas desplazar (Mayús: más rápido) · `+`/`−` acercar y alejar · `V` espacio ↔ sistema · `T` tareas · `A` árbol · `Tab` siguiente cubo · `1–4` disposición · `Espacio` seguir · `Esc` salir · `?` ayuda.
- **Visor**: un archivo se abre dentro del espacio. La cámara se acerca hasta él y el resto se atenúa. Tiene páginas (PDF), líneas (código y tablas), reproducción (vídeo y audio) y órbita libre (modelos 3D). `Esc` vuelve al espacio.
- **Seguir**: con la IA, la cámara va al punto exacto (la casilla del archivo que toca) o encuadra todas las sesiones activas; la carpeta que contiene lo que edita se abre como cubo propio y se cierra sola tras 20 s sin uso. Un panel muestra qué hace ahora, sus últimas acciones y lo abierto para seguirla. Acompaña en vivo a la IA o al proceso seleccionado y anota en una línea de tiempo qué lanza, carga, abre y con quién conecta. Solo observa.

## Límites conocidos
- **Contenido de las peticiones de red**: no se ve, porque va cifrado. Verlo exigiría un proxy que descifre TLS, y prisma no lo instala.
- **En Windows sin administrador**:
  - la caché DNS y la lista de archivos abiertos por un proceso no son accesibles;
  - sí se puede saber qué proceso tiene abierto un archivo concreto.
- **Autor de un cambio en disco hecho por otro programa**: es una estimación. Se basa en quién tenía el archivo abierto o en quién escribía en esa carpeta. La atribución exacta exige el rastreo de eventos del sistema, con administrador.
- **macOS**: el código lo contempla (ps, lsof, señales), pero no se ha probado. Allí no hay iconos del sistema.

