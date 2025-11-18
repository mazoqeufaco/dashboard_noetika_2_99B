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
  process.env.PYTHONUNBUFFERED = '1';
  process.env.PYTHONIOENCODING = 'utf-8';
}

// Inicia backend Python
console.log('🐍 Iniciando backend Python...');
// Tenta python3 primeiro (comum no Linux/Railway), depois python
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
console.log(`🔍 Comando Python: ${pythonCmd}`);
console.log(`🔍 Diretório: ${projectDir}`);
console.log(`🔍 Variáveis de ambiente:`);
console.log(`   PYTHONUNBUFFERED=${process.env.PYTHONUNBUFFERED || 'não definido'}`);
console.log(`   FLASK_ENV=${process.env.FLASK_ENV || 'não definido'}`);
console.log(`   BACKEND_PORT=${process.env.BACKEND_PORT || 'não definido'}`);

const pythonBackend = spawn(pythonCmd, ['backend.py'], {
  cwd: projectDir,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe']
});

console.log(`🔍 Processo Python spawnado. PID: ${pythonBackend.pid || 'ainda não atribuído'}`);

pythonBackend.stdout.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    console.log(`[Python] ${output}`);
  } else {
    // Log mesmo se vazio para debug
    console.log(`[Python] (output vazio, mas recebido)`);
  }
});

pythonBackend.stderr.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    // Ignora avisos do Flask em produção (já usamos Waitress)
    if (!output.includes('WARNING: This is a development server')) {
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
        const output = data.toString().trim();
        if (output) {
          console.log(`[Python] ${output}`);
        }
      });
      
      python3Backend.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('WARNING: This is a development server')) {
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
      }, 5000); // Aguarda 5 segundos para Python iniciar
      
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

pythonBackend.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend Python encerrou com código ${code}`);
    process.exit(1);
  }
});

// Aguarda alguns segundos para o Python iniciar
console.log(`⏳ Aguardando 5 segundos para o backend Python iniciar...`);
setTimeout(() => {
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
}, 5000); // Aguarda 5 segundos para Python iniciar (aumentado de 3 para 5)
