<p align="center"><img src="docs/assets/logo.svg" alt="vxtop" width="236"></p>


**Un observatorio 3D de tu equipo, de solo lectura.** Cada carpeta es un cubo de 27 celdas, cada programa abierto otro cubo, y lo que se está usando *ahora mismo* se enciende y se mueve: lo que haces tú, lo que hacen otros programas o lo que hace un agente de IA como Claude Code.

[Read in English](README.md) · [Guía completa](docs/guia.md) · [Arquitectura](docs/architecture.md)

![vxtop](docs/assets/hero.png)

## Para qué

Un explorador de archivos enseña *dónde* están las cosas. vxtop enseña *qué está pasando*: qué carpetas se escriben, qué programa las toca, qué lee o edita un agente de IA, y cuánto pesa y qué antigüedad tiene todo, de un vistazo, en un espacio que se gira, se acerca y se pulsa.

Solo **observa**. Nunca crea, cambia ni borra nada de lo que mira y nunca actúa sobre procesos ni sobre el sistema.

## Lo principal

- **Carpetas como cubos de datos**: 27 celdas, tipo de archivo × profundidad × antigüedad.
- **En vivo**: solo lo que se usa ahora. Una carpeta aparece cuando algo la toca y se apaga a los 8 s sin actividad. Cada punto que viaja es un archivo tocado de verdad, en ámbar si es Claude, turquesa si eres tú y gris azulado si es otro programa.
- **Programas como cubos**: el tamaño es la memoria, las celdas encendidas la CPU, con su icono real. El que tienes delante lleva un halo ámbar.
- **Vista previa al pasar el cursor**: las ventanas de los programas que usan esa carpeta y las imágenes, vídeos y textos que se están tocando.
- **Sigue a la IA**: qué leen, buscan y escriben las sesiones de Claude Code, archivo a archivo.
- **Cinco vistas**: Espacio, Sistema (procesos y red), Tareas (un administrador de tareas en 3D), Árbol (como `tree`, cada carpeta un cubo) y un visor de archivos.
- **Índices de unidades enteras**: millones de archivos, al día en segundo plano.
- **Servidor MCP** para que una IA abra y observe carpetas.
- **Sin dependencias y sin conexión**: Node.js y three.js incluido. Nada sale de tu equipo.

## Empezar

Necesitas [Node.js](https://nodejs.org) 18.15 o superior y Chrome o Edge. Windows es la plataforma más completa; Linux funciona; macOS no está probado.

```bash
npx github:vxtop/vxtop                 # vista en vivo de todo el equipo
npx github:vxtop/vxtop C:\codigo\proyecto --expand
```

O clónalo:

```bash
git clone https://github.com/vxtop/vxtop.git
cd vxtop
node server.js            # abre http://127.0.0.1:4827/
```

En Windows, doble clic en **`vxtop.vbs`**: ventana propia, sin consola, y al cerrarla se cierra todo.

**Controles:** un clic selecciona, centra y abre · el cursor encima muestra lo que se usa ahí · arrastrar gira, clic derecho y arrastrar desplaza, la rueda acerca · `H` encuadrar · `V` Sistema · `T` Tareas · `A` Árbol · `?` ayuda.

¿Quieres probarlo sin enseñar tus archivos? `npm run demo` abre un estudio ficticio (proyectos, fotos, documentos).

Todo lo demás está en la [guía](docs/guia.md).

## Privacidad y seguridad

- Solo escucha en `127.0.0.1`, cada consulta lleva un token de sesión y se rechazan las peticiones de otros orígenes.
- Solo lectura: la única carpeta en la que escribe es la suya (`~/.vxtop`).
- Las imágenes en vivo de tus ventanas están **desactivadas** hasta que las permites y nunca salen del equipo.
- Arranca sin administrador. Un clic en la insignia «SOLO LECTURA» lo reinicia con administrador (Windows pide confirmación) para ver la caché DNS y los archivos abiertos por proceso.

## Licencia

[Apache 2.0](LICENSE) © 2026 virtuanista. Puedes usar, modificar y compartir vxtop, también con fines comerciales, siempre que conserves el aviso de autoría y el archivo [NOTICE](NOTICE) (es decir, que des crédito al autor) e indiques qué has cambiado.
