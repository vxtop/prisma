# Arquitectura

> [README](../README.md) · [Guía](guia.md) · [Architecture (EN)](architecture.md)

vxtop es una aplicación web local: un servidor Node.js que **lee** el equipo y un cliente three.js que lo dibuja. Sin dependencias de npm y sin paso de compilación.

```
┌─────────── navegador (127.0.0.1) ───────────┐        ┌──────────────── server.js ────────────────┐
│ public/index.html   marcado                 │  GET   │ HTTP + SSE en 127.0.0.1, con token         │
│ public/css/app.css  estilos                 │ ─────► │ /app.js   cliente concatenado + source map │
│ /app.js  ← public/js/00-…19-*.js            │  SSE   │ /api/*    cubos, archivos, árbol, procesos │
│   un módulo ES, un solo ámbito compartido   │ ◄───── │ /api/events  flujo en vivo (fs, procs, IA) │
│ three.js desde public/vendor (import map)   │        │                                            │
└─────────────────────────────────────────────┘        │  indexer.js   worker: índices de unidades  │
                                                       │  pshost.ps1   ayudante de Windows fijo     │
            mcp.js (stdio) ── HTTP + token ──────────► │               (Win32 vía C#, líneas JSON)  │
                                                       └────────────────────────────────────────────┘
```

## Servidor (`server.js`)

| Área | Qué hace |
|---|---|
| CLI y HTTP | Opciones, servidor solo en bucle local, comprobación de token y origen, ficheros estáticos y el paquete del cliente |
| Escaneo | Una carpeta se convierte en cubo: 27 celdas = tipo de archivo (código · datos · documentos) × profundidad (raíz · 1–2 · 3+) × antigüedad (< 1 h · < 24 h · más), con un límite de tiempo y de entradas |
| Índices | `indexer.js` corre en un hilo *worker* y escribe índices JSON comprimidos con gzip en `~/.vxtop/index`; los vigilantes los mantienen al día |
| En vivo | Los vigilantes de las unidades, las sesiones de IA (`~/.claude*`), los programas abiertos y sus rutas se agrupan en el espacio *En vivo*; las carpetas se desvanecen 8 s después de su último evento |
| Sistema | Procesos, conexiones de red, GPU (`nvidia-smi`), tareas, servicios y programas de inicio, todo de solo lectura |
| Ayudante nativo | `pshost.ps1` se queda en marcha y responde en líneas JSON: quién tiene un archivo abierto (Restart Manager), ventana en primer plano y cursor, miniaturas de ventanas (`PrintWindow`), iconos, datos de GPU y de tareas |

Los eventos llegan al cliente con *Server-Sent Events* (`/api/events`); todo lo demás es JSON por `GET`/`POST`.

## Cliente (`public/js`)

El cliente es **un único módulo ES** repartido en ficheros ordenados que comparten un solo ámbito. El servidor los concatena al pedirlo (`/app.js`) y genera un *source map* por líneas (`/app.js.map`), para que las herramientas de desarrollo del navegador muestren los ficheros originales.

| Fichero | Área |
|---|---|
| `00-core` | Importaciones, estado `S`, pequeñas utilidades y llamadas a la API |
| `01-scene` | Renderizador, cámara, controles y posprocesado |
| `02-cubes` | Geometría de los cubos (celdas instanciadas) y distribuciones |
| `03-data` | Aplicar los datos del servidor, eventos en vivo y sondas de IA |
| `04-ui` | Panel izquierdo y barra superior |
| `05-input` | Selección con el puntero, selección de un clic y *hover* |
| `06-loop` | Bucle de fotogramas: encuadre de cámara, seguimiento y animación |
| `07-io-views-explorer` | Menús, ajustes, cambio de vista y explorador |
| `08-objects` | Archivos como objetos en el espacio |
| `09-system-view` | Vista Sistema (procesos y red) |
| `10-panel` | Panel derecho, ayuda, *tooltips* y escenas |
| `11-viewer-follow` | Visor de archivos y modo seguimiento |
| `12-spaces-live` | Espacios y vista en vivo: programas como cubos, ventana en primer plano |
| `13-hud` | Etiquetas y capa de datos en pantalla |
| `14-tasks-card` | Vista Tareas y la ficha del cubo |
| `15-history-boot` | Historial del navegador y arranque |
| `16-tree` | Vista Árbol |
| `17-peek` | Vista previa al pasar el cursor |
| `18-welcome` | Bienvenida del primer arranque y reinicio como administrador |
| `19-gallery` | Galería de medios de un cubo y su visor (zoom, desplazamiento, mapa, tira de miniaturas) |

El renderizado usa `InstancedMesh`: todas las celdas de todos los cubos se dibujan en unas pocas llamadas, lo que mantiene 256 cubos (6 900 celdas) por encima de 150 fps en una GPU de gama media.

## Datos en disco

Solo `~/.vxtop`: `index/` (índices de unidades), `scenes/` y `token` (puerto → token, con permisos `0600`). En Windows el lanzador usa además `%LOCALAPPDATA%\vxtop` para su log y un perfil de Chrome aparte.

## Pruebas

`test/smoke.js` arranca el servidor en un puerto libre con una carpeta personal y un árbol de prueba temporales, y comprueba el token, la garantía de solo lectura y el paquete. `test/e2e.js` maneja Chrome sin interfaz con el protocolo DevTools (sin Puppeteer) y comprueba la interacción: un clic, foco, carreras, zoom, vistas, árbol, búsqueda y recarga.
