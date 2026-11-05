'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const staticRoot = path.join(__dirname, 'dist');
const indexPath = path.join(staticRoot, 'index.html');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};
const port = Number(process.env.PORT) || 8765;
const host = process.env.HOST || '127.0.0.1';

if (!fs.existsSync(indexPath)) {
  console.error('No se encontro la carpeta dist con la version compilada.');
  console.error('Ejecuta primero: npm install && npm run build');
  process.exit(1);
}

const prefix = staticRoot.endsWith(path.sep) ? staticRoot : staticRoot + path.sep;

const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Metodo no permitido');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Solicitud invalida');
    return;
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const file = path.resolve(staticRoot, pathname.replace(/^\/+/, ''));

  // Evita salir de dist mediante .. o rutas absolutas.
  if (file !== staticRoot && !file.startsWith(prefix)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acceso denegado');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    const immutable = pathname.startsWith('/assets/');
    res.writeHead(200, {
      ...securityHeaders,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.on('error', (error) => {
  console.error('No se pudo iniciar:', error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  if (process.platform === 'win32' && process.env.NO_OPEN !== '1') {
    const { execFile } = require('node:child_process');
    execFile('cmd.exe', ['/c', 'start', '', 'http://' + host + ':' + port], { windowsHide: true }, () => {});
  }
  console.log('');
  console.log('  GENERADOR PABBLY | VERSION COMPILADA');
  console.log('  Enlace: http://' + host + ':' + port);
  console.log('  Para cerrar: Ctrl+C o cerrar esta consola.');
  console.log('  Los datos no se guardan ni se envian a ningun servidor.');
  console.log('');
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  setTimeout(() => process.exit(0), 1500).unref();
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, shutdown);
