# Contribuir a Prisma

Gracias por tu interés. Prisma es pequeño a propósito: Node.js sin más, sin dependencias de npm y sin paso de compilación. Por favor, mantenlo así.

## Reglas básicas

1. **Solo lectura, siempre.** Prisma observa: nunca crea, modifica ni borra nada de lo que mira, y nunca actúa sobre procesos ni sobre el sistema. La única carpeta en la que puede escribir es la suya (`~/.prisma`). No se aceptan *pull requests* que rompan esta regla.
2. **Local y privado.** El servidor solo escucha en `127.0.0.1`, cada llamada a la API lleva el token de sesión y no se envía nada a servicios externos.
3. **Sin dependencias nuevas.** El código de terceros va en `public/vendor/` con su licencia, y solo cuando no hay una alternativa razonable.

## Empezar

```bash
git clone https://github.com/vxtop/prisma.git
cd prisma
node server.js --port 4899      # una segunda instancia junto a la que usas a diario
```

Los cambios en `public/` se ven al recargar; los cambios en `server.js` necesitan reiniciar.

## Estilo de código

- Código, identificadores y comentarios en **inglés**; los textos que ve el usuario (interfaz, mensajes de la terminal) en **español**.
- Los comentarios explican el *porqué*, no el *qué*. Que sean cortos.
- Todos los ficheros de código empiezan con la cabecera SPDX:
  ```js
  // SPDX-License-Identifier: Apache-2.0
  // Copyright 2026 virtuanista
  ```
- El cliente es un único módulo ES repartido en ficheros ordenados (`public/js/NN-nombre.js`) que comparten un solo ámbito. Pon el código nuevo en el fichero de su área y crea un fichero numerado nuevo solo para un área nueva. Más en [docs/arquitectura.md](docs/arquitectura.md).
- Reglas visuales: todo se dibuja como cubos de 27 celdas (carpetas y programas), que se distinguen por color, tamaño y emblema; nada se mueve sin motivo; un clic lo hace todo.

## Pruebas

```bash
npm run check        # sintaxis
npm test             # prueba rápida, sin navegador: token, solo lectura, paquete
npm run test:e2e     # Chrome sin interfaz: clics, foco, carreras, zoom, vistas, árbol, búsqueda
npm run test:live    # lo mismo, más el espacio en vivo con programas reales
```

Las pruebas usan un árbol de prueba y una carpeta personal desechables dentro de la carpeta temporal del sistema: nunca tocan tus datos. Las capturas se guardan en `test/artifacts/`.

## Pull requests

- Un tema por *pull request*, con una descripción breve del *porqué*.
- `npm run check`, `npm test` y `npm run test:e2e` pasan.
- Cambios de interfaz: adjunta una captura de antes y después.

Al contribuir aceptas que tu contribución se publique con la [licencia Apache 2.0](LICENSE).
