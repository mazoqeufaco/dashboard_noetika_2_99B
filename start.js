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

// Log imediato para garantir que o script está sendo executado
console.log('');
console.log('='.repeat(60));
console.log('🚀 INICIANDO start.js - Script de inicialização');
console.log('='.repeat(60));
console.log(`📁 Diretório: ${projectDir}`);
console.log(`🌐 Ambiente: ${isProduction ? 'PRODUÇÃO (Railway)' : 'DESENVOLVIMENTO'}`);
console.log(`🔍 Node version: ${process.version}`);
console.log(`🔍 Platform: ${process.platform}`);
console.log(`🔍 PORT env: ${process.env.PORT || 'não definido'}`);
console.log(`🔍 RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'não definido'}`);
console.log('');

// Verifica se backend.py existe (primeira verificação)
const backendPath = path.join(projectDir, 'backend.py');
if (!fs.existsSync(backendPath)) {
  console.error(`❌ Erro: backend.py não encontrado em ${backendPath}!`);
  process.exit(1);
}
console.log(`✅ backend.py encontrado (primeira verificação): ${backendPath}`);
const backendStats = fs.statSync(backendPath);
console.log(`🔍 Tamanho do arquivo: ${backendStats.size} bytes`);
console.log(`🔍 Última modificação: ${backendStats.mtime}`);

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
// backendPath já foi verificado acima

// Tenta python3 primeiro (comum no Linux/Railway), depois python
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
console.log(`🔍 Usando comando Python: ${pythonCmd}`);
console.log(`🔍 Diretório de trabalho: ${projectDir}`);
console.log(`🔍 Variáveis de ambiente importantes:`);
console.log(`   PYTHONUNBUFFERED=${process.env.PYTHONUNBUFFERED || 'não definido'}`);
console.log(`   FLASK_ENV=${process.env.FLASK_ENV || 'não definido'}`);
console.log(`   BACKEND_PORT=${process.env.BACKEND_PORT || 'não definido'}`);
console.log(`🔍 Executando: ${pythonCmd} backend.py\n`);

// Declara variáveis antes de usar nos handlers
let backendReady = false;
let backendStartupLogs = [];

// Usa let para permitir reatribuição se necessário
console.log(`🔍 Spawnando processo Python: ${pythonCmd} backend.py`);
console.log(`🔍 Diretório: ${projectDir}`);
console.log(`🔍 Python path: ${pythonCmd}`);

// Testa se o Python está disponível
const { execSync } = require('child_process');
try {
  const pythonVersion = execSync(`${pythonCmd} --version`, { encoding: 'utf-8', timeout: 2000 });
  console.log(`✅ Python encontrado: ${pythonVersion.trim()}`);
} catch (err) {
  console.error(`❌ Python não encontrado ou não acessível: ${err.message}`);
  if (pythonCmd === 'python' && process.platform !== 'win32') {
    console.log('⚠️  Tentando python3...');
    try {
      const python3Version = execSync('python3 --version', { encoding: 'utf-8', timeout: 2000 });
      console.log(`✅ Python3 encontrado: ${python3Version.trim()}`);
      pythonCmd = 'python3';
    } catch (err2) {
      console.error(`❌ Python3 também não encontrado: ${err2.message}`);
      console.error('💡 Verifique se Python está instalado no sistema.');
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
}

let pythonBackend = spawn(pythonCmd, ['backend.py'], {
  cwd: projectDir,
  env: { 
    ...process.env,
    PYTHONUNBUFFERED: '1', // Garante que o output do Python apareça imediatamente
    PYTHONIOENCODING: 'utf-8', // Garante encoding UTF-8
    PYTHONDONTWRITEBYTECODE: '1' // Evita arquivos .pyc
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

console.log(`🔍 Processo spawnado, aguardando eventos...`);
console.log(`🔍 PID do processo: ${pythonBackend.pid || 'ainda não atribuído'}`);

pythonBackend.on('spawn', () => {
  console.log('✅ Processo Python spawnado com sucesso!');
  console.log(`   PID: ${pythonBackend.pid}`);
});

pythonBackend.on('error', (err) => {
  console.error(`❌ Erro ao spawnar processo Python: ${err.message}`);
  console.error(`   Código: ${err.code}`);
  console.error(`   Comando tentado: ${pythonCmd} backend.py`);
  console.error(`   Diretório: ${projectDir}`);
  if (err.code === 'ENOENT') {
    console.error('💡 Python não encontrado! Verifique se Python está instalado.');
    // Tenta python3 se python não funcionar (apenas Linux/Mac)
    if (pythonCmd === 'python' && process.platform !== 'win32') {
      console.log('⚠️  Tentando python3...');
      pythonBackend = spawn('python3', ['backend.py'], {
        cwd: projectDir,
        env: { 
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONDONTWRITEBYTECODE: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      pythonBackend.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[Python] ${output}`);
          backendStartupLogs.push(output);
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
          console.error(`[Python ERR] ${output}`);
        }
      });
      
      pythonBackend.on('error', (err2) => {
        console.error('❌ python3 também falhou:', err2.message);
        process.exit(1);
      });
      
      pythonBackend.on('spawn', () => {
        console.log('✅ Processo Python3 spawnado com sucesso!');
        console.log(`   PID: ${pythonBackend.pid}`);
      });
      
      pythonBackend.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
          console.error(`❌ Backend Python encerrou com código ${code}${signal ? ` (sinal: ${signal})` : ''}`);
          process.exit(1);
        }
      });
    } else {
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
});

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
    // SEMPRE mostra erros do Python (não ignora nada em produção para diagnóstico)
    console.error(`[Python ERR] ${output}`);
    // Se for um erro crítico, tenta identificar
    if (output.includes('ModuleNotFoundError') || output.includes('ImportError')) {
      console.error('💡 Erro de importação! Verifique se todas as dependências estão instaladas.');
      console.error('   Execute: pip install -r requirements.txt');
    }
    if (output.includes('SyntaxError') || output.includes('IndentationError')) {
      console.error('💡 Erro de sintaxe no código Python!');
    }
    if (output.includes('FileNotFoundError') || output.includes('No such file')) {
      console.error('💡 Arquivo não encontrado! Verifique se todos os arquivos necessários estão presentes.');
    }
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

const waitTime = isProduction ? 8000 : 5000;
console.log(`⏳ Aguardando ${waitTime/1000}s para o backend Python iniciar...`);

function checkBackendHealth(callback, maxRetries = 5, retryDelay = 1000) {
  const http = require('http');
  let retries = 0;
  
  function attempt() {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/health',
      method: 'GET',
      timeout: 2000,
      family: 4 // Força IPv4
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
});
