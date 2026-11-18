# Seguridad

## Modelo

Prisma es un monitor local de solo lectura. Su seguridad se basa en cuatro reglas:

- **Solo bucle local.** El servidor HTTP escucha en `127.0.0.1` y rechaza las peticiones cuyo `Host` no sea `127.0.0.1` ni `localhost` (protección contra *DNS rebinding*).
- **Token de sesión.** Cada llamada a `/api` necesita el token aleatorio incrustado en la página (o el que lee el servidor MCP local de `~/.prisma/token`, con permisos `0600`). Las peticiones POST necesitan además la cabecera `X-Prisma` y un `Origin` del mismo origen, así que otras webs no pueden lanzar lecturas, escaneos ni indexaciones, ni siquiera a ciegas.
- **Solo lectura.** Ningún *endpoint* escribe, renombra, borra ni ejecuta nada en las carpetas observadas, ni actúa sobre procesos. Solo se escribe en `~/.prisma` (índices, escenas y token). Las rutas de red (`\\servidor\recurso`) están bloqueadas.
- **Mínimo privilegio.** Arranca sin permisos de administrador. Solo se eleva cuando el usuario hace clic en la insignia de solo lectura y acepta el aviso de Windows, y solo para añadir acceso de lectura (caché DNS y archivos abiertos por proceso).

Las miniaturas de las ventanas (`PrintWindow`) se generan en el equipo, están desactivadas hasta que el usuario las permite y solo se sirven a la página a través de la API protegida por token.

## Informar de una vulnerabilidad

Por favor, no abras una *issue* pública. Usa el aviso privado de vulnerabilidades de GitHub (**Security → Report a vulnerability**) en el repositorio, con los pasos para reproducirla. Tendrás respuesta en menos de una semana.
