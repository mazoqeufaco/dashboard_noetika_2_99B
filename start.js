#!/usr/bin/env node
/**
 * Script de inicialização para Railway
 * Inicia o backend Python em background e depois o servidor Node.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.resolve(__dirname || process.cwd());
const isProduction = process.env.PORT || process.env.RAILWAY_ENVIRONMENT;

console.log('🚀 Iniciando serviços...');
console.log(`📁 Diretório: ${projectDir}`);
console.log(`🌐 Ambiente: ${isProduction ? 'PRODUÇÃO (Railway)' : 'DESENVOLVIMENTO'}\n`);

// Verifica se backend.py existe
const backendPath = path.join(projectDir, 'backend.py');
if (!fs.existsSync(backendPath)) {
  console.error('❌ Erro: backend.py não encontrado!');
  process.exit(1);
}

// Configura ambiente para Python em produção
if (isProduction) {
  process.env.FLASK_ENV = 'production';
  process.env.ENVIRONMENT = 'production';
  process.env.BACKEND_PORT = '5000';
  console.log('🔧 Variáveis de ambiente configuradas para produção:');
  console.log(`   FLASK_ENV=${process.env.FLASK_ENV}`);
  console.log(`   ENVIRONMENT=${process.env.ENVIRONMENT}`);
  console.log(`   BACKEND_PORT=${process.env.BACKEND_PORT}`);
  console.log(`   PORT=${process.env.PORT || 'não definido'}\n`);
}

// Inicia backend Python
console.log('🐍 Iniciando backend Python...');
console.log(`📁 Diretório: ${projectDir}`);
console.log(`🔍 Verificando se backend.py existe...`);
const backendPath = path.join(projectDir, 'backend.py');
if (!fs.existsSync(backendPath)) {
  console.error(`❌ Erro: backend.py não encontrado em ${backendPath}!`);
  process.exit(1);
}
console.log(`✅ backend.py encontrado em ${backendPath}`);

// Tenta python3 primeiro (comum no Linux/Railway), depois python
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
console.log(`🔍 Usando comando Python: ${pythonCmd}`);
console.log(`🔍 Executando: ${pythonCmd} backend.py\n`);

const pythonBackend = spawn(pythonCmd, ['backend.py'], {
  cwd: projectDir,
  env: { 
    ...process.env,
    PYTHONUNBUFFERED: '1', // Garante que o output do Python apareça imediatamente
    PYTHONIOENCODING: 'utf-8' // Garante encoding UTF-8
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

pythonBackend.on('spawn', () => {
  console.log('✅ Processo Python spawnado com sucesso!');
});

let backendReady = false;
let backendStartupLogs = [];

pythonBackend.stdout.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    console.log(`[Python] ${output}`);
    backendStartupLogs.push(output);
    // Verifica se o backend iniciou com sucesso
    if (output.includes('Server running') || output.includes('Starting Noetika') || output.includes('Using Waitress')) {
      console.log('✅ Backend Python iniciou!');
      backendReady = true;
    }
  }
});

pythonBackend.stderr.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    backendStartupLogs.push(`ERR: ${output}`);
    // Ignora avisos do Flask em produção (já usamos Waitress)
    if (!output.includes('WARNING: This is a development server') && 
        !output.includes('DeprecationWarning') &&
        !output.includes('Deprecation')) {
      console.error(`[Python ERR] ${output}`);
    }
  }
});

pythonBackend.on('error', (err) => {
  if (err.code === 'ENOENT') {
    // Tenta python3 se python não funcionar (apenas Linux/Mac)
    if (pythonCmd === 'python' && process.platform !== 'win32') {
      console.log('⚠️  python não encontrado, tentando python3...');
      const python3Backend = spawn('python3', ['backend.py'], {
        cwd: projectDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      python3Backend.stdout.on('data', (data) => {
        console.log(`[Python] ${data.toString().trim()}`);
      });
      
      python3Backend.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (!output.includes('WARNING: This is a development server')) {
          console.error(`[Python ERR] ${output}`);
        }
      });
      
      python3Backend.on('error', (err2) => {
        console.error('❌ Erro ao iniciar backend Python:', err2.message);
        console.error('💡 Certifique-se de que Python está instalado e as dependências estão instaladas');
        console.error('   Execute: pip install -r requirements.txt');
        process.exit(1);
      });
      
      python3Backend.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`❌ Backend Python encerrou com código ${code}`);
          process.exit(1);
        }
      });
      
      // Continua com python3Backend ao invés de pythonBackend
      const waitTime3 = isProduction ? 5000 : 3000;
      console.log(`⏳ Aguardando ${waitTime3/1000}s para o backend Python iniciar...`);
      setTimeout(() => {
        console.log('\n📦 Iniciando servidor Node.js...\n');
        
        const nodeServer = spawn('node', ['server.js'], {
          cwd: projectDir,
          env: { ...process.env },
          stdio: 'inherit'
        });

        nodeServer.on('error', (err) => {
          console.error('❌ Erro ao iniciar servidor Node.js:', err.message);
          python3Backend.kill();
          process.exit(1);
        });

        nodeServer.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            console.error(`❌ Servidor Node.js encerrou com código ${code}`);
          }
          python3Backend.kill();
          process.exit(code || 0);
        });

        process.on('SIGTERM', () => {
          console.log('\n🛑 Recebido SIGTERM, encerrando serviços...');
          nodeServer.kill();
          python3Backend.kill();
          process.exit(0);
        });

        process.on('SIGINT', () => {
          console.log('\n🛑 Recebido SIGINT, encerrando serviços...');
          nodeServer.kill();
          python3Backend.kill();
          process.exit(0);
        });
      }, waitTime3);
      
      return; // Sai da função para não continuar com o pythonBackend original
    } else {
      console.error('❌ Erro ao iniciar backend Python:', err.message);
      console.error('💡 Certifique-se de que Python está instalado e as dependências estão instaladas');
      console.error('   Execute: pip install -r requirements.txt');
      process.exit(1);
    }
  } else {
    console.error('❌ Erro ao iniciar backend Python:', err.message);
    console.error('💡 Certifique-se de que Python está instalado e as dependências estão instaladas');
    console.error('   Execute: pip install -r requirements.txt');
    process.exit(1);
  }
});

pythonBackend.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend Python encerrou com código ${code}${signal ? ` (sinal: ${signal})` : ''}`);
    console.error('💡 Últimos logs do backend:');
    backendStartupLogs.slice(-10).forEach(log => console.error(`   ${log}`));
    console.error('💡 Verifique os logs acima para identificar o problema');
    process.exit(1);
  } else if (signal) {
    console.log(`⚠️  Backend Python recebeu sinal ${signal}`);
  }
});

// IMPORTANTE: Não inicia o servidor Node.js até o backend Python estar pronto
// Aguarda alguns segundos para o Python iniciar (aumentado para produção)
const waitTime = isProduction ? 8000 : 5000; // Aumentado para dar mais tempo
console.log(`⏳ Aguardando ${waitTime/1000}s para o backend Python iniciar...`);

// Função para verificar se o backend está respondendo
function checkBackendHealth(callback, maxRetries = 5, retryDelay = 1000) {
  const http = require('http');
  let retries = 0;
  
  function attempt() {
    const req = http.request({
      hostname: '127.0.0.1', // Usa IPv4 explicitamente para evitar problemas com IPv6
      port: 5000,
      path: '/api/health',
      method: 'GET',
      timeout: 2000,
      family: 4 // Força IPv4 explicitamente
    }, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Backend Python está respondendo!');
        callback(true);
      } else {
        if (retries < maxRetries) {
          retries++;
          console.log(`⏳ Backend ainda não está pronto (tentativa ${retries}/${maxRetries})...`);
          setTimeout(attempt, retryDelay);
        } else {
          console.log('⚠️  Backend não respondeu após várias tentativas, mas continuando...');
          callback(false);
        }
      }
    });
    
    req.on('error', (err) => {
      if (retries < maxRetries) {
        retries++;
        console.log(`⏳ Backend ainda não está pronto (tentativa ${retries}/${maxRetries})...`);
        setTimeout(attempt, retryDelay);
      } else {
        console.log('⚠️  Backend não respondeu após várias tentativas, mas continuando...');
        callback(false);
      }
    });
    
    req.on('timeout', () => {
      req.destroy();
      if (retries < maxRetries) {
        retries++;
        console.log(`⏳ Backend ainda não está pronto (tentativa ${retries}/${maxRetries})...`);
        setTimeout(attempt, retryDelay);
      } else {
        console.log('⚠️  Backend não respondeu após várias tentativas, mas continuando...');
        callback(false);
      }
    });
    
    req.end();
  }
  
  // Inicia a primeira tentativa após o tempo de espera inicial
  // Mas primeiro verifica se o backend já está pronto pelos logs
  setTimeout(() => {
    console.log('\n🔍 Verificando status do backend Python...');
    console.log(`   backendReady: ${backendReady}`);
    console.log(`   Logs capturados: ${backendStartupLogs.length} linhas`);
    if (backendStartupLogs.length > 0) {
      console.log('   Últimos logs:');
      backendStartupLogs.slice(-5).forEach(log => console.log(`     ${log}`));
    } else {
      console.log('   ⚠️  NENHUM LOG DO PYTHON FOI CAPTURADO!');
      console.log('   Isso significa que o backend Python não está gerando output.');
    }
    
    if (backendReady) {
      console.log('✅ Backend Python já está pronto (detectado pelos logs)!');
      callback(true);
    } else {
      console.log('⏳ Verificando saúde do backend (não detectado nos logs ainda)...');
      attempt();
    }
  }, waitTime);
}

// Verifica saúde do backend antes de iniciar o servidor Node.js
checkBackendHealth((isHealthy) => {
  if (!isHealthy) {
    console.error('❌ Backend Python não está respondendo!');
    console.error('💡 Últimos logs do backend:');
    backendStartupLogs.slice(-10).forEach(log => console.error(`   ${log}`));
    console.error('⚠️  Iniciando servidor Node.js mesmo assim, mas o backend pode não estar funcionando...\n');
  }
  console.log('\n📦 Iniciando servidor Node.js...\n');
  
  // Inicia servidor Node.js
  const nodeServer = spawn('node', ['server.js'], {
    cwd: projectDir,
    env: { ...process.env },
    stdio: 'inherit'
  });

  nodeServer.on('error', (err) => {
    console.error('❌ Erro ao iniciar servidor Node.js:', err.message);
    pythonBackend.kill();
    process.exit(1);
  });

  nodeServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`❌ Servidor Node.js encerrou com código ${code}`);
    }
    pythonBackend.kill();
    process.exit(code || 0);
  });

  // Trata encerramento gracioso
  process.on('SIGTERM', () => {
    console.log('\n🛑 Recebido SIGTERM, encerrando serviços...');
    nodeServer.kill();
    pythonBackend.kill();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 Recebido SIGINT, encerrando serviços...');
    nodeServer.kill();
    pythonBackend.kill();
    process.exit(0);
  });
}, 3000); // Aguarda 3 segundos para Python iniciar
