// Servidor HTTP simples que sempre serve do diretório onde este arquivo está
const http = require('http');
const fs = require('fs');
const path = require('path');

// Backend Python port
const BACKEND_PORT = 5000;
// Usa 127.0.0.1 ao invés de localhost para evitar problemas com IPv6 (::1)
const BACKEND_HOST = '127.0.0.1';

// Usa PORT do ambiente (Railway) ou padrão 8000 para desenvolvimento
const DEFAULT_PORT = process.env.PORT || 8000;
const MAX_PORT_TRIES = 10; // Tenta até 10 portas alternativas

// Usa o diretório onde server.js está localizado
// Isso garante que sempre serve do diretório correto, independente de onde é executado
const projectDir = path.resolve(
  typeof __dirname !== 'undefined' 
    ? __dirname 
    : path.dirname(require.main?.filename || process.argv[1] || process.cwd())
);

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv',
  '.ico': 'image/x-icon'
};

// Proxy para backend Python
function proxyToBackend(req, res) {
  // Coleta o body da requisição
  let body = [];
  req.on('data', chunk => {
    body.push(chunk);
  });
  
  req.on('end', () => {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      family: 4, // Força IPv4 explicitamente
      headers: {
        ...req.headers,
        host: `${BACKEND_HOST}:${BACKEND_PORT}`
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error('❌ Erro ao conectar ao backend Python:', err.message);
      console.error(`   Tentando conectar em: ${BACKEND_HOST}:${BACKEND_PORT}`);
      console.error(`   URL da requisição: ${req.url}`);
      console.error(`   Método: ${req.method}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error', 
        message: 'Backend Python não está disponível. Os dados serão salvos apenas no localStorage.',
        error: err.message,
        backend: `${BACKEND_HOST}:${BACKEND_PORT}`
      }));
    });

    // Envia o body se existir
    if (body.length > 0) {
      proxyReq.write(Buffer.concat(body));
    }
    proxyReq.end();
  });
}

// Função para criar um servidor
function createServer() {
  return http.createServer((req, res) => {
  // Remove query string e decode URL
  let filePath = decodeURIComponent(req.url.split('?')[0]);
  
  // Se for requisição de API, faz proxy para backend Python
  if (filePath.startsWith('/api/')) {
    proxyToBackend(req, res);
    return;
  }
  
  // Se for raiz, serve index.html
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }

  // Resolve caminho absoluto (sempre relativo ao diretório do servidor)
  const fullPath = path.join(projectDir, filePath);

  // Segurança: verifica se o caminho está dentro do diretório do projeto
  const resolvedPath = path.resolve(fullPath);
  const projectRoot = path.resolve(projectDir);
  
  if (!resolvedPath.startsWith(projectRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Verifica se arquivo existe
  fs.access(resolvedPath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + filePath);
      return;
    }

    // Lê e serve o arquivo
    fs.readFile(resolvedPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }

      // Determina MIME type
      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
  });
}

// Função para tentar iniciar o servidor em uma porta
function startServer(port) {
  const server = createServer();
  
  server.listen(port, '0.0.0.0', () => {
    console.log(`\n✅ Servidor rodando em http://0.0.0.0:${port}`);
    console.log(`📁 Diretório: ${projectDir}`);
    console.log(`🔌 API proxy: /api/* → http://${BACKEND_HOST}:${BACKEND_PORT}`);
    if (!process.env.PORT) {
      console.log(`\n⚠️  Certifique-se de que o backend Python está rodando na porta ${BACKEND_PORT}`);
      console.log(`   Execute: python backend.py\n`);
    } else {
      console.log(`\n✅ Modo produção (Railway)\n`);
    }
  });

  // Trata erros
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Tenta próxima porta
      const nextPort = port + 1;
      if (nextPort <= DEFAULT_PORT + MAX_PORT_TRIES) {
        console.log(`⚠️  Porta ${port} em uso. Tentando porta ${nextPort}...`);
        // Fecha este servidor antes de tentar a próxima
        server.close();
        startServer(nextPort);
      } else {
        console.error(`\n❌ Erro: Não foi possível encontrar uma porta livre.`);
        console.log(`   Portas ${DEFAULT_PORT} a ${port} estão em uso.\n`);
        console.log('💡 Soluções:');
        console.log('   1. Feche outros servidores (Ctrl+C nos terminais abertos)');
        console.log('   2. Execute: npm run kill-port');
        console.log('   3. Ou altere DEFAULT_PORT no arquivo server.js\n');
        process.exit(1);
      }
    } else {
      console.error('\n❌ Erro ao iniciar servidor:', err.message);
      process.exit(1);
    }
  });
}

// Inicia o servidor
startServer(DEFAULT_PORT);

