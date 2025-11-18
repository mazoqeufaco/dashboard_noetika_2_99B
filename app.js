import { initEntrada } from './entrada.js';

const IMG_SRC = 'public/triangulo2.png';
const CSV_ZSCORES = 'data/Matriz de Decisão - Zscores para dash.csv';
const CSV_NOMES   = 'data/Matriz de Decisão - só nomes e coordenadas.csv';
const SOLUTION_DESC = 'solution_description5.json';

let solutionDescriptions = null;

// -------- CSV util --------
function parseCSV(text){
  // Detecta separador: se tem ; e não tem , fora de aspas, usa ;, senão usa ,
  const hasSemicolon = text.indexOf(';') > -1;
  const hasComma = text.indexOf(',') > -1;
  let sep = (hasSemicolon && !hasComma) ? ';' : ',';
  
  const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.trim().length>0);
  if(!lines.length) return {header:[], rows:[]};
  
  // Função para parsear linha CSV respeitando aspas
  function parseCSVLine(line, separator){
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for(let i = 0; i < line.length; i++){
      const char = line[i];
      const nextChar = line[i + 1];
      
      if(char === '"'){
        if(inQuotes && nextChar === '"'){
          // Aspas duplas escapadas
          current += '"';
          i++; // Pula o próximo caractere
        } else {
          // Toggle estado de aspas
          inQuotes = !inQuotes;
        }
      } else if(char === separator && !inQuotes){
        // Separador fora de aspas - fim do campo
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    // Adiciona último campo
    result.push(current.trim());
    return result;
  }
  
  const header = parseCSVLine(lines[0], sep).map(h=>h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cols = parseCSVLine(lines[i], sep);
    const o = {}; header.forEach((h,j)=>o[h]=(cols[j]??'').trim());
    rows.push(o);
  }
  return {header, rows};
}
const coerceNum = s => {
  if (s === null || s === undefined || s === '') return 0;
  // Remove aspas e substitui TODAS as vírgulas por ponto (formato brasileiro)
  const cleaned = String(s).replace(/"/g, '').replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

async function loadCSVs(){
  const [zs, nm] = await Promise.allSettled([
    fetch(CSV_ZSCORES, {cache:'no-store'}).then(r=>r.text()),
    fetch(CSV_NOMES,   {cache:'no-store'}).then(r=>r.text())
  ]);
  const zText = zs.status==='fulfilled' ? zs.value : '';
  const nText = nm.status==='fulfilled' ? nm.value : '';
  return { z: parseCSV(zText), n: parseCSV(nText) };
}

async function loadSolutionDescriptions(){
  try {
    const response = await fetch(SOLUTION_DESC, {cache:'no-store'});
    if(!response.ok) throw new Error(`Não foi possível carregar ${SOLUTION_DESC}`);
    solutionDescriptions = await response.json();
    return solutionDescriptions;
  } catch(err) {
    console.error(`Erro ao carregar ${SOLUTION_DESC}:`, err);
    return null;
  }
}

function findSolutionById(coordStr){
  if(!solutionDescriptions || !solutionDescriptions.itens || !coordStr) return null;
  
  const normalizedCoord = coordStr.trim();
  
  // 1. Busca exata primeiro
  let solution = solutionDescriptions.itens.find(item => item.id === normalizedCoord);
  if(solution) return solution;
  
  // 2. Busca case-insensitive
  solution = solutionDescriptions.itens.find(item => 
    item.id.toLowerCase() === normalizedCoord.toLowerCase()
  );
  if(solution) return solution;
  
  // 3. Tenta variações comuns do formato
  const variations = [
    normalizedCoord,
    normalizedCoord.toLowerCase(),
    normalizedCoord.toUpperCase(),
  ];
  
  // Se termina com número, tenta adicionar .a, .b, .c
  if(/^[IVXLCDM]+\.\d+$/i.test(normalizedCoord)){
    variations.push(
      `${normalizedCoord}.a`, 
      `${normalizedCoord}.b`, 
      `${normalizedCoord}.c`,
      `${normalizedCoord}.d`
    );
  }
  
  // Tenta todas as variações
  for(const variant of variations){
    solution = solutionDescriptions.itens.find(item => item.id === variant);
    if(solution) return solution;
    
    solution = solutionDescriptions.itens.find(item => 
      item.id.toLowerCase() === variant.toLowerCase()
    );
    if(solution) return solution;
  }
  
  return null;
}

function findSolutionByName(nome){
  if(!solutionDescriptions || !solutionDescriptions.itens) return null;
  return solutionDescriptions.itens.find(item => 
    item.nome_curto === nome || item.nome === nome
  ) || null;
}

function formatCurrency(value){
  if(!value) return 'N/A';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function showSolutionModal(solutionName, coordStr){
  console.log(`🔍 Buscando solução: nome="${solutionName}", coord="${coordStr}"`);
  
  // Prioriza busca por coordenada/ID
  let solution = null;
  if(coordStr){
    solution = findSolutionById(coordStr);
    if(solution){
      const nomeSol = solution.nome_curto || solution.nome || 'N/A';
      console.log(`✅ Solução encontrada por ID: "${solution.id}" - "${nomeSol}"`);
    }
  }
  
  // Fallback: busca por nome se não encontrou por ID
  if(!solution){
    solution = findSolutionByName(solutionName);
    if(solution){
      const nomeSol = solution.nome_curto || solution.nome || 'N/A';
      console.log(`✅ Solução encontrada por nome: "${nomeSol}"`);
    }
  }
  
  if(!solution){
    console.warn(`❌ Solução não encontrada`);
    console.log('   Nome:', solutionName);
    console.log('   Coordenada:', coordStr);
    console.log('💡 Soluções disponíveis:', solutionDescriptions?.itens?.map(i => `${i.id}: ${i.nome_curto || i.nome || 'N/A'}`) || []);
    const modal = document.getElementById('solutionModal');
    const content = document.getElementById('solutionModalContent');
    if(modal && content){
      content.innerHTML = `<p>Informações sobre "${solutionName}" (${coordStr || 'sem coordenada'}) não encontradas.</p>`;
      modal.showModal();
    }
    return;
  }

  const modal = document.getElementById('solutionModal');
  const content = document.getElementById('solutionModalContent');
  if(!modal || !content) return;
  
  // Mapeia campos do novo formato para compatibilidade
  const nome = solution.nome_curto || solution.nome || 'N/A';
  const tronco = solution.linha || solution.tronco || 'N/A';
  const descricao = solution.descricao_para_leigos || solution.descricao || 'N/A';
  const sinalDados = solution.sinal_dados || '';
  const processamentoDados = solution.processamento_dados || {};
  
  // Monta o HTML do modal
  const html = `
    <div class="solution-header">
      <h2>${nome}</h2>
      <div class="solution-id">${solution.id} • Tronco ${tronco}</div>
    </div>

    <div class="solution-section">
      <h3>📋 Descrição</h3>
      <p>${descricao}</p>
    </div>

    <div class="solution-section">
      <h3>🎯 Escopo</h3>
      <ul class="solution-list">
        ${solution.escopo ? solution.escopo.map(item => `<li>${item}</li>`).join('') : '<li>N/A</li>'}
      </ul>
    </div>

    <div class="solution-section">
      <h3>🛡️ Governança</h3>
      ${sinalDados ? `<div class="governance-badges"><span class="gov-badge">${sinalDados}</span></div>` : ''}
      ${processamentoDados.onde ? `<p class="solution-text"><strong>Processamento:</strong> ${processamentoDados.onde}</p>` : ''}
      ${processamentoDados.contratos ? `<p class="solution-text"><strong>Contratos:</strong> ${Array.isArray(processamentoDados.contratos) ? processamentoDados.contratos.join(', ') : processamentoDados.contratos}</p>` : ''}
      ${processamentoDados.dados_dormem ? `<p class="solution-text"><strong>Dados em repouso:</strong> ${processamentoDados.dados_dormem}</p>` : ''}
    </div>

    <div class="solution-grid">
      <div class="solution-card">
        <h3>💰 Custos</h3>
        ${solution.preco_cliente ? `
        <div class="cost-item">
          <strong>CAPEX:</strong> ${formatCurrency(solution.preco_cliente.capex_brl)}
        </div>
        <div class="cost-item">
          <strong>OPEX Mensal:</strong> ${formatCurrency(solution.preco_cliente.opex_mensal_brl)}
        </div>
        ` : `
        <div class="cost-item">
          <strong>CAPEX:</strong> ${formatCurrency(solution.capex_brl)}
        </div>
        <div class="cost-item">
          <strong>OPEX Mensal:</strong> ${formatCurrency(solution.opex_mensal_brl)}
        </div>
        `}
      </div>

      <div class="solution-card">
        <h3>⏱️ Prazos</h3>
        ${solution.prazos_dias ? `
        <div class="time-item">
          <strong>Implantação:</strong> ${solution.prazos_dias.implantacao} dias
        </div>
        <div class="time-item">
          <strong>Testes UAT:</strong> ${solution.prazos_dias.testes_UAT} dias
        </div>
        <div class="time-item">
          <strong>Total:</strong> ${solution.prazos_dias.total} dias
        </div>
        <div class="time-item">
          <strong>σ (Incerteza):</strong> ${solution.prazos_dias.sigma} dias
        </div>
        ` : '<div class="time-item">N/A</div>'}
      </div>
    </div>

    ${solution.indicadores ? `
    <div class="solution-section">
      <h3>📊 Indicadores</h3>
      <ul class="solution-list">
        ${Array.isArray(solution.indicadores) ? solution.indicadores.map(ind => `<li>${ind}</li>`).join('') : `<li>${solution.indicadores}</li>`}
      </ul>
    </div>
    ` : ''}

    <div class="solution-grid">
      ${solution.riscos_chave && solution.riscos_chave.length > 0 ? `
      <div class="solution-card solution-warning">
        <h3>⚠️ Riscos</h3>
        <ul class="solution-list">
          ${solution.riscos_chave.map(risco => `<li>${risco}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${solution.mitigacoes && solution.mitigacoes.length > 0 ? `
      <div class="solution-card solution-success">
        <h3>✅ Mitigações</h3>
        <ul class="solution-list">
          ${solution.mitigacoes.map(mit => `<li>${mit}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>

    ${solution.retorno_estimado ? `
    <div class="solution-section solution-highlight">
      <h3>📈 Retorno Estimado</h3>
      <p>${solution.retorno_estimado}</p>
    </div>
    ` : ''}

    ${solution.viabilidade_preliminar ? `
    <div class="solution-section">
      <h3>⚖️ Viabilidade Preliminar</h3>
    <div class="solution-grid">
        ${solution.viabilidade_preliminar.tecnica ? `
        <div class="solution-card">
          <strong>Técnica:</strong> ${solution.viabilidade_preliminar.tecnica}
        </div>
        ` : ''}
        ${solution.viabilidade_preliminar.economica ? `
        <div class="solution-card">
          <strong>Econômica:</strong> ${solution.viabilidade_preliminar.economica}
        </div>
        ` : ''}
        ${solution.viabilidade_preliminar.organizacional ? `
        <div class="solution-card">
          <strong>Organizacional:</strong> ${solution.viabilidade_preliminar.organizacional}
        </div>
        ` : ''}
      </div>
      </div>
      ` : ''}

    ${solution.dependencias ? `
    <div class="solution-section">
      <h3>🔗 Dependências</h3>
        <ul class="solution-list">
        ${Array.isArray(solution.dependencias) ? solution.dependencias.map(dep => `<li>${dep}</li>`).join('') : `<li>${solution.dependencias}</li>`}
        </ul>
      </div>
      ` : ''}

    ${solution.saidas_esperadas ? `
    <div class="solution-section">
      <h3>✅ Saídas Esperadas</h3>
      <ul class="solution-list">
        ${Array.isArray(solution.saidas_esperadas) ? solution.saidas_esperadas.map(saida => `<li>${saida}</li>`).join('') : `<li>${solution.saidas_esperadas}</li>`}
      </ul>
    </div>
    ` : ''}
  `;

  content.innerHTML = html;
  modal.showModal();
}

function setupSolutionLinks(){
  // Intercepta todos os cliques em links de solução
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if(!link || !link.href) return;
    
    // Verifica se é um link de detalhe.html ou link de solução
    const href = link.getAttribute('href');
    if(href && (href.includes('detalhe.html?sol=') || href.includes('?sol='))){
      e.preventDefault();
      e.stopPropagation();
      
      // Extrai nome e coordenada do link
      let solutionName = '';
      let coordStr = '';
      
      if(href.includes('?')){
      const urlParams = new URLSearchParams(href.split('?')[1]);
        solutionName = decodeURIComponent(urlParams.get('sol') || '');
        coordStr = decodeURIComponent(urlParams.get('coord') || '');
      }
      
      // Tenta extrair coordenada do texto do link se não tiver na URL
      if(!coordStr){
        const coordMatch = link.textContent.match(/\(([IVXLCDM]+\.\d+\.[a-z])\)/i);
        if(coordMatch) coordStr = coordMatch[1];
      }
      
      // Tenta extrair nome do texto do link se não tiver na URL
      if(!solutionName){
        solutionName = link.textContent.split('(')[0].trim();
      }
      
      if(solutionName || coordStr){
        showSolutionModal(solutionName, coordStr);
      }
    }
  });
}

// -------- helpers de header/coord --------
function headerLike(header, key){
  const norm = s => s.toLowerCase().replace(/\s+/g,'');
  const K = norm(key);
  return header.find(h => norm(h).includes(K));
}

function parseCoord(s){
  if(!s) return null;
  // Aceita coordenadas com ou sem terceiro nível (ex: "I.1" ou "I.1.a")
  const m = String(s).trim().match(/^([IVXLCDM]+)\s*[\.\-]\s*(\d+)\s*(?:[\.\-]\s*([a-z]))?$/i);
  if(!m) return null;
  return { 
    pri: m[1].toUpperCase(), 
    sec: parseInt(m[2],10), 
    ter: (m[3] || '').toLowerCase() 
  };
}
function romanToInt(r){
  const map={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; let n=0, prev=0;
  for(const ch of r.split('').reverse()){ const v=map[ch]||0; if(v<prev) n-=v; else n+=v, prev=v; }
  return n;
}

// -------- ranking bruto --------
function computeRanking(zData, {r,g,b}){
  const {header, rows} = zData;
  const ZC = headerLike(header,'zcusto');
  const ZQ = headerLike(header,'zqual');
  const ZP = headerLike(header,'zprazo');
  const sC = headerLike(header,'s_zcusto') || headerLike(header,'szcusto');
  const sQ = headerLike(header,'s_zqual')  || headerLike(header,'szqual');
  const sP = headerLike(header,'s_zprazo') || headerLike(header,'szprazo');
  
  if(!ZC||!ZQ||!ZP) throw new Error('CSV de Zscores deve ter ZCusto, ZQualidade e ZPrazo.');
  
  // Verifica se temos covariâncias (últimas 3 colunas devem conter "cov" no nome)
  const covCols = header.slice(-3);
  const hasCovariances = covCols.length === 3 && 
    covCols.some(col => col.toLowerCase().includes('cov'));
  const hasErrors = sC && sQ && sP;

  const results = rows.map((row, i)=>{
    const zc=coerceNum(row[ZC]), zq=coerceNum(row[ZQ]), zp=coerceNum(row[ZP]);
    
    // r, g, b já estão entre 0 e 1 (não percentual) - vem do entrada.js
    // Zranking = (-r*zc) + (g*zq) + (-b*zp)
    const Zranking = (-r*zc) + (g*zq) + (-b*zp);
    
    let s_Zrank = 0;
    
    if(hasErrors){
      const sc=coerceNum(row[sC] || 0);
      const sq=coerceNum(row[sQ] || 0);
      const sp=coerceNum(row[sP] || 0);
      
      // Validação: valores de erro padrão devem ser razoáveis (0 a 100)
      // Se estiverem muito grandes, pode ser erro de parsing
      if(sc > 100 || sq > 100 || sp > 100){
        console.warn(`⚠️ Valores de erro padrão muito grandes na linha ${i+1}: sC=${sc}, sQ=${sq}, sP=${sp}`);
        console.warn(`   Valores originais: sC="${row[sC]}", sQ="${row[sQ]}", sP="${row[sP]}"`);
        console.warn(`   r=${r}, g=${g}, b=${b} (devem estar entre 0 e 1)`);
      }
      
      if(hasCovariances){
        // Fórmula COMPLETA com covariâncias
        // Para Z = -r*C + g*Q - b*P
        // Var(Z) = r²*Var(C) + g²*Var(Q) + b²*Var(P) 
        //         - 2*r*g*Cov(C,Q) + 2*r*b*Cov(C,P) - 2*g*b*Cov(Q,P)
        const cov_CQ = coerceNum(row[covCols[0]] || 0);
        const cov_CP = coerceNum(row[covCols[1]] || 0);
        const cov_QP = coerceNum(row[covCols[2]] || 0);
        
        const s0_squared = (r*sc)**2 + (g*sq)**2 + (b*sp)**2;
        // Correção com covariâncias (não ao quadrado!)
        const correction = 2 * (
          -r*g * cov_CQ +  // sinal negativo porque -r*C e +g*Q
          r*b * cov_CP +   // sinal positivo porque -r*C e -b*P
          -g*b * cov_QP    // sinal negativo porque +g*Q e -b*P
        );
        
        s_Zrank = Math.sqrt(Math.max(0, s0_squared + correction));
      } else {
        // Fórmula SIMPLES sem covariâncias
        // Var(Z) = r²*Var(C) + g²*Var(Q) + b²*Var(P)
        s_Zrank = Math.sqrt(
          (r*sc)**2 + 
          (g*sq)**2 + 
          (b*sp)**2
        );
      }
    }
    
    return { idx:i, id:(i+1), Zranking, s_Zrank };
  });

  // Reescalonamento para nota absoluta 0-10 baseado em distribuição gaussiana
  const Z_MIN = -3;
  const Z_MAX = 3;
  const Z_RANGE = Z_MAX - Z_MIN; // 6
  
  // Calcula número de casas decimais baseado no menor erro (2 algarismos significativos)
  function significativeDecimalPlaces(n){
    if(n === 0) return 2;
    const absN = Math.abs(n);
    
    // Converte para notação científica para identificar posição do primeiro dígito
    const exp = Math.floor(Math.log10(absN));
    
    // Número de casas decimais para números < 1 é |expoente|, para >= 1 é 2
    if(exp < 0){
      // Para 0.01 (exp=-2), precisamos de 2 casas
      // Para 0.001 (exp=-3), precisamos de 3 casas
      return Math.abs(exp);
    } else {
      // Para números >= 1, sempre 2 casas
      return 2;
    }
  }
  
  const sZValues = results.map(r => r.s_Zrank).filter(e => e > 0);
  // Se não houver erros, usa 2 casas decimais padrão
  const numDecimals = sZValues.length > 0 
    ? significativeDecimalPlaces(Math.min(...sZValues))
    : 2;
  
  const processed = results.map(r => {
    // Mapeia de [-3, +3] para [0, 10] - escala absoluta baseada em distribuição gaussiana
    let nota;
    if(r.Zranking <= Z_MIN) {
      nota = 0; // Zranking <= -3 → nota 0
    } else if(r.Zranking >= Z_MAX) {
      nota = 10; // Zranking >= +3 → nota 10
    } else {
      // Interpolação linear entre -3 e +3
      nota = ((r.Zranking - Z_MIN) / Z_RANGE) * 10;
    }
    
    // Reescalona margem de erro proporcionalmente para a escala 0-10
    const margemErroReescalada = (r.s_Zrank / Z_RANGE) * 10;
    const multiplier = Math.pow(10, numDecimals);
    return { 
      ...r, 
      nota: Math.round(nota * multiplier) / multiplier,
      margemErro: Math.round(margemErroReescalada * multiplier) / multiplier
    };
  });
  
  // Retorna os resultados junto com o número de casas decimais
  return { items: processed, decimals: numDecimals };
}

// -------- enriquece com nomes/coords --------
function enrichWithNames(rows, namesParsed){
  const nameCol  = headerLike(namesParsed.header, 'nome') || namesParsed.header[0];
  const coordCol = headerLike(namesParsed.header, 'coordenadas') || headerLike(namesParsed.header,'coord');
  return rows.map(r=>{
    const nome = namesParsed.rows[r.idx]?.[nameCol] ?? `Sol ${r.id}`;
    let coordStr = namesParsed.rows[r.idx]?.[coordCol] ?? '';
    const coordOriginal = coordStr;
    // Normaliza: III.1a -> III.1.a
    coordStr = coordStr.replace(/(\d+)([a-z])/i, '$1.$2');
    const coord = parseCoord(coordStr) || parseCoord(coordOriginal);
    return { ...r, nome, coordStr, coordOriginal, coord };
  });
}

// -------- Clustering GMM simplificado --------
function gmmCluster(items, maxComponents = 8){
  if(items.length <= 1) return items.map((item, i) => ({...item, cluster: 1}));
  if(items.length <= 3) return items.map((item, i) => ({...item, cluster: i+1}));
  
  const x = items.map(item => item.nota);
  const n = x.length;
  
  function findOptimalK(data, maxK){
    if(data.length <= maxK) return Math.min(3, data.length);
    
    const sorted = [...data].sort((a,b) => a - b);
    const bics = [];
    
    for(let k = 1; k <= Math.min(maxK, n-1); k++){
      const centroids = kmeansInit(sorted, k);
      const labels = assignClusters(sorted, centroids);
      const bic = calculateBIC(sorted, labels, k);
      bics.push(bic);
    }
    
    let optimalK = 1;
    let minBIC = bics[0];
    for(let i = 1; i < bics.length; i++){
      if(bics[i] < minBIC){
        minBIC = bics[i];
        optimalK = i + 1;
      }
    }
    
    return optimalK;
  }
  
  function kmeansInit(data, k){
    const min = Math.min(...data);
    const max = Math.max(...data);
    const centroids = [];
    for(let i = 0; i < k; i++){
      centroids.push(min + (max - min) * (i + 0.5) / k);
    }
    return centroids;
  }
  
  function assignClusters(data, centroids){
    return data.map(x => {
      let minDist = Infinity;
      let cluster = 0;
      centroids.forEach((c, i) => {
        const dist = Math.abs(x - c);
        if(dist < minDist){
          minDist = dist;
          cluster = i;
        }
      });
      return cluster;
    });
  }
  
  function calculateBIC(data, labels, k){
    const n = data.length;
    if(k === 1){
      const mean = data.reduce((a,b) => a+b, 0) / n;
      const variance = data.reduce((sum, x) => sum + (x - mean)**2, 0) / n;
      const logLikelihood = -n * 0.5 * Math.log(2 * Math.PI * variance) - n / 2;
      return -2 * logLikelihood + k * Math.log(n);
    }
    
    const clusters = {};
    labels.forEach((label, i) => {
      if(!clusters[label]) clusters[label] = [];
      clusters[label].push(data[i]);
    });
    
    let logLikelihood = 0;
    Object.values(clusters).forEach(cluster => {
      if(cluster.length === 0) return;
      const mean = cluster.reduce((a,b) => a+b, 0) / cluster.length;
      const variance = cluster.reduce((sum, x) => sum + (x - mean)**2, 0) / cluster.length || 0.001;
      logLikelihood -= cluster.length * 0.5 * Math.log(2 * Math.PI * variance);
      logLikelihood -= cluster.reduce((sum, x) => sum + (x - mean)**2, 0) / (2 * variance);
    });
    
    return -2 * logLikelihood + k * Math.log(n);
  }
  
  const optimalK = findOptimalK(x, maxComponents);
  const centroids = kmeansInit(x, optimalK);
  
  const sorted = [...items].sort((a,b) => b.nota - a.nota);
  const sortedX = sorted.map(item => item.nota);
  const labels = assignClusters(sortedX, centroids);
  
  const uniqueLabels = [...new Set(labels)].sort((a,b) => {
    const meanA = sortedX.filter((_, i) => labels[i] === a).reduce((s,x) => s+x, 0) / labels.filter(l => l === a).length;
    const meanB = sortedX.filter((_, i) => labels[i] === b).reduce((s,x) => s+x, 0) / labels.filter(l => l === b).length;
    return meanB - meanA;
  });
  
  const labelMap = {};
  uniqueLabels.forEach((oldLabel, i) => {
    labelMap[oldLabel] = i + 1;
  });
  
  return sorted.map((item, i) => ({
    ...item,
    cluster: labelMap[labels[i]]
  }));
}

function smartCluster(items){
  return gmmCluster(items, 8);
}

// -------- Nomes dos clusters --------
function getClusterName(clusterId, totalClusters){
  const names = ['Ouro', 'Prata', 'Bronze', 'Ferro', 'Barro', 'Lama', 'Nem Olhe', 'Olhe Menos'];
  if(!clusterId || isNaN(clusterId) || clusterId < 1) return 'N/A';
  if(clusterId <= names.length && clusterId > 0) return names[clusterId - 1];
  return `Cluster ${clusterId}`;
}

// -------- PÓDIO por cluster --------
function renderPodiumClusters(items, decimals){
  const host = document.getElementById('podium');
  if(!host) return;

  // Aplica clustering inteligente
  const clustered = smartCluster(items);
  
  // Agrupa por cluster
  const clusters = new Map();
  for(const item of clustered){
    const cid = item.cluster;
    if(!clusters.has(cid)) clusters.set(cid, { maxNota: -Infinity, items: [] });
    const c = clusters.get(cid);
    c.items.push(item);
    if(item.nota > c.maxNota) c.maxNota = item.nota;
  }
  
  // Ordena clusters pela melhor nota
  const ordered = [...clusters.entries()].sort((a,b)=> b[1].maxNota - a[1].maxNota);
  const totalClusters = ordered.length;
  const displayClusters = ordered.slice(0,3);

  const medals = ['🥇','🥈','🥉','🏅','🏅','🏅','🏅','🏅'];
  const classes = ['medal-1','medal-2','medal-3','medal-4','medal-5','medal-6','medal-7','medal-8'];

  const cards = displayClusters.map(([cid, group], i)=>{
    group.items.sort((a,b)=> b.nota - a.nota);
    const topItems = group.items;
    const links = topItems.map(it=>{
      const label = `${it.nome} (${it.coordStr || ''})`;
      const coord = it.coordStr || '';
      const href  = `detalhe.html?sol=${encodeURIComponent(it.nome)}&coord=${encodeURIComponent(coord)}`;
      return `<a class="podium-link" href="${href}">${label}</a>`;
    }).join('');
    const best = group.items[0];
    const scoreLine = best ? `<div class="podium-score">melhor nota: ${best.nota.toFixed(decimals)} • margem de erro: ${best.margemErro.toFixed(decimals)}</div>` : '';
    const clusterName = getClusterName(cid, totalClusters);
    return `
      <div class="podium-card">
        <div class="podium-medal ${classes[i]}">${medals[i]} ${clusterName}</div>
        ${links}
        ${scoreLine}
      </div>`;
  }).join('');

  host.innerHTML = cards || '<em>Sem dados.</em>';
}

// -------- Tabela (ranking completo) --------
function renderTable(items, decimals, priorities){
  const host = document.getElementById('table');
  if(!items?.length){ host.innerHTML = '<em>Nenhum resultado.</em>'; return; }
  
  // Aplica clustering e ordena por nota
  const clustered = smartCluster(items);
  const sorted = clustered.sort((a,b) => b.nota - a.nota);
  
  const head = `<thead><tr><th>#</th><th>Cluster</th><th>Nome</th><th class="num">Nota</th><th class="num">Margem de Erro</th></tr></thead>`;
  const body = sorted.map((r,i)=>{
    const coord = r.coordStr || '';
    const href = `detalhe.html?sol=${encodeURIComponent(r.nome)}&coord=${encodeURIComponent(coord)}`;
    const clusterName = getClusterName(r.cluster, Math.max(...clustered.map(x => x.cluster)));
    return `<tr>
      <td>${i+1}</td>
      <td><span class="cluster-badge cluster-${r.cluster}">${clusterName}</span></td>
      <td><a href="${href}">${r.nome} ${r.coordStr?`(${r.coordStr})`:''}</a></td>
      <td class="num">${r.nota.toFixed(decimals)}</td>
      <td class="num">${r.margemErro.toFixed(decimals)}</td>
    </tr>`;
  }).join('');
  host.innerHTML = `<table class="table">${head}<tbody>${body}</tbody></table>`;
  
  // Renderiza gráfico de clusters
  renderClusterPlot(clustered, decimals, priorities);
}

// -------- Gráfico de clusters 1D --------
function renderClusterPlot(items, decimals, priorities){
  const host = document.getElementById('clusterPlot');
  if(!host || !items?.length) return;
  
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 380;
  canvas.style.width = '100%';
  canvas.style.maxWidth = '1000px';
  canvas.style.height = 'auto';
  canvas.style.background = '#0e0e0e';
  canvas.style.border = '1px solid #222';
  canvas.style.borderRadius = '12px';
  canvas.style.marginTop = '16px';
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 90, right: 40, bottom: 55, left: 70 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  
  const sorted = [...items].sort((a,b) => b.nota - a.nota);
  const y = sorted.map(item => item.nota);
  const x = sorted.map((item, idx) => idx + 1);
  const clusters = sorted.map(item => item.cluster);
  
  const minY = 0;
  const maxY = 10;
  const rangeY = 10;
  const maxX = sorted.length;
  
  const colors = [
    '#ffd700', '#c0c0c0', '#cd7f32', '#708090', 
    '#8b4513', '#654321', '#2F4F2F', '#1c1c1c'
  ];
  
  ctx.fillStyle = '#0e0e0e';
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#cfcfcf';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Nota x Classificação', width / 2, 22);
  
  if(priorities){
    const rPct = (priorities.r * 100).toFixed(1);
    const gPct = (priorities.g * 100).toFixed(1);
    const bPct = (priorities.b * 100).toFixed(1);
    ctx.fillStyle = '#b8b8b8';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`com prioridades em: ${rPct}% Custo, ${gPct}% Qualidade e ${bPct}% Prazo`, width / 2, 42);
  }
  
  const maxCluster = Math.max(...clusters);
  function drawMarker(ctx, x, y, clusterId, color){
    const name = getClusterName(clusterId, maxCluster);
    if(name === 'Ferro' || name === 'Barro'){
      ctx.fillStyle = color;
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    } else if(name === 'Lama' || name === 'Nem Olhe' || name === 'Olhe Menos'){
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
  
  const uniqueClusters = [...new Set(clusters)].sort((a,b) => a - b);
  ctx.globalAlpha = 1;
  
  ctx.fillStyle = '#cfcfcf';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Legenda:', padding.left, 60);
  
  ctx.font = '11px system-ui, sans-serif';
  let legendX = padding.left;
  let legendY = 75;
  let maxLegendY = legendY;
  
  uniqueClusters.forEach(clusterId => {
    const color = clusterId <= colors.length ? colors[clusterId - 1] : '#888';
    const name = getClusterName(clusterId, maxCluster);
    drawMarker(ctx, legendX + 5, legendY, clusterId, color);
    ctx.fillStyle = '#eaeaea';
    ctx.fillText(name, legendX + 14, legendY + 4);
    legendX += 85;
    if(legendX > width - 100){
      legendX = padding.left;
      legendY += 20;
    }
    maxLegendY = Math.max(maxLegendY, legendY + 12);
  });
  
  const legendHeight = maxLegendY - 60;
  const spaceAfterLegend = 15;
  const adjustedPaddingTop = maxLegendY + spaceAfterLegend;
  const adjustedPlotHeight = height - adjustedPaddingTop - padding.bottom;
  
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  for(let i = 0; i <= 10; i++){
    const value = i;
    const yPos = adjustedPaddingTop + adjustedPlotHeight - ((value / 10) * adjustedPlotHeight);
    ctx.beginPath();
    ctx.moveTo(padding.left, yPos);
    ctx.lineTo(padding.left + plotWidth, yPos);
    ctx.stroke();
  }
  
  const numTicks = Math.min(20, maxX);
  for(let i = 0; i <= numTicks; i++){
    const xPos = padding.left + (plotWidth * i / numTicks);
    ctx.beginPath();
    ctx.moveTo(xPos, adjustedPaddingTop);
    ctx.lineTo(xPos, adjustedPaddingTop + adjustedPlotHeight);
    ctx.stroke();
  }
  
  ctx.fillStyle = '#b8b8b8';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for(let i = 0; i <= 10; i++){
    const value = i;
    const yPos = adjustedPaddingTop + adjustedPlotHeight - ((value / 10) * adjustedPlotHeight);
    ctx.fillText(value.toFixed(decimals), padding.left - 12, yPos + 5);
  }
  
  ctx.fillStyle = '#eaeaea';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.save();
  ctx.translate(18, (adjustedPaddingTop + adjustedPlotHeight / 2));
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Nota', 0, 0);
  ctx.restore();
  
  ctx.fillStyle = '#b8b8b8';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const tickStep = Math.max(1, Math.floor(maxX / 20));
  for(let i = 0; i <= maxX; i += tickStep){
    const xPos = padding.left + ((i / maxX) * plotWidth);
    ctx.fillText(i.toString(), xPos, height - 20);
  }
  
  ctx.fillStyle = '#eaeaea';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Classificação', width / 2, height - 8);
  
  sorted.forEach((item, i) => {
    const clusterId = item.cluster;
    const xValue = i + 1;
    const yValue = item.nota;
    const xPos = padding.left + ((xValue / maxX) * plotWidth);
    const yPos = adjustedPaddingTop + adjustedPlotHeight - ((yValue / 10) * adjustedPlotHeight);
    const color = clusterId <= colors.length ? colors[clusterId - 1] : '#888';
    
    const error = item.margemErro || 0;
    if(error > 0){
      const errorHeight = (error / 10) * adjustedPlotHeight;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(xPos, yPos - errorHeight);
      ctx.lineTo(xPos, yPos + errorHeight);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPos - 3, yPos - errorHeight);
      ctx.lineTo(xPos + 3, yPos - errorHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xPos - 3, yPos + errorHeight);
      ctx.lineTo(xPos + 3, yPos + errorHeight);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 0.9;
    drawMarker(ctx, xPos, yPos, clusterId, color);
  });
  
  host.innerHTML = '';
  host.appendChild(canvas);
}

// -------- Dados globais para relatório --------
let currentRankingData = null;
let currentPriorities = null;

// -------- Função para gerar relatório --------
async function generateReport() {
  try {
    if (!currentRankingData || !currentPriorities) {
      alert('Erro: Dados do ranking não disponíveis.');
      return;
    }

    const clusterPlotHost = document.getElementById('clusterPlot');
    if (!clusterPlotHost?.querySelector('canvas')) {
      renderClusterPlot(currentRankingData.items, currentRankingData.decimals, currentPriorities);
    }
    
    const canvas = clusterPlotHost?.querySelector('canvas');
    let graphImage = null;
    
    if (canvas) {
      graphImage = canvas.toDataURL('image/png');
    } else {
      console.warn('Gráfico não disponível para captura');
    }

    const sortedItems = [...currentRankingData.items].sort((a, b) => b.nota - a.nota);
    const clusterIds = sortedItems.map(x => x.cluster).filter(c => c != null && !isNaN(c) && c > 0);
    const maxCluster = clusterIds.length > 0 ? Math.max(...clusterIds) : 8;
    const rankingTable = sortedItems.map((item, index) => {
      const clusterId = item.cluster != null && !isNaN(item.cluster) && item.cluster > 0 ? item.cluster : null;
      const clusterName = clusterId ? getClusterName(clusterId, maxCluster) : 'N/A';
      return {
        position: index + 1,
        categoria: clusterName || 'N/A',
        name: item.nome,
        coord: item.coordStr || '',
        nota: item.nota.toFixed(currentRankingData.decimals),
        margemErro: item.margemErro.toFixed(currentRankingData.decimals)
      };
    });
    
    let clustered = currentRankingData.items;
    if(!currentRankingData.items[0]?.cluster) {
      clustered = smartCluster(currentRankingData.items);
    }
    
    const clusters = new Map();
    for(const item of clustered){
      const cid = item.cluster;
      if(cid != null && !isNaN(cid) && cid > 0) {
        if(!clusters.has(cid)) clusters.set(cid, { maxNota: -Infinity, items: [] });
        const c = clusters.get(cid);
        c.items.push(item);
        if(item.nota > c.maxNota) c.maxNota = item.nota;
      }
    }
    const ordered = [...clusters.entries()].sort((a,b)=> b[1].maxNota - a[1].maxNota);
    const podiumClusters = ordered.slice(0, 3);
    
    const podiumData = podiumClusters.map(([cid, group], index) => {
      group.items.sort((a,b)=> b.nota - a.nota);
      const clusterName = cid ? getClusterName(cid, ordered.length) : 'N/A';
      return {
        categoria: clusterName,
        items: group.items.map(item => {
          let solutionInfo = null;
          if(item.coordStr) {
            solutionInfo = findSolutionById(item.coordStr);
          }
          if(!solutionInfo && item.nome) {
            solutionInfo = findSolutionByName(item.nome);
          }
          
          return {
            nome: item.nome,
            coord: item.coordStr || '',
            nota: item.nota.toFixed(currentRankingData.decimals),
            margemErro: item.margemErro.toFixed(currentRankingData.decimals),
            solutionData: solutionInfo ? {
              ...solutionInfo,
              nome: solutionInfo.nome_curto || solutionInfo.nome,
              tronco: solutionInfo.linha || solutionInfo.tronco
            } : null
          };
        })
      };
    });

    const rPct = (currentPriorities.r * 100).toFixed(1);
    const gPct = (currentPriorities.g * 100).toFixed(1);
    const bPct = (currentPriorities.b * 100).toFixed(1);

    // Obtém sessionId do tracking (tracking.js deve estar carregado antes)
    const sessionId = (typeof trackingSession !== 'undefined' && trackingSession?.sessionId) 
      ? trackingSession.sessionId 
      : (window.trackingSession?.sessionId || '');
    
    const response = await fetch('/api/generate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rankingTable,
        podiumData,
        priorities: {
          r: parseFloat(rPct),
          g: parseFloat(gPct),
          b: parseFloat(bPct)
        },
        graphImage,
        sessionId
      })
    });

    if (!response.ok) {
      throw new Error(`Erro ao gerar relatório: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tribussula_report_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erro ao gerar relatório:', err);
    
    // Se for erro 502 (Bad Gateway), o backend não está disponível
    if (err.message && err.message.includes('502')) {
      alert('Backend não está disponível. A geração de relatório requer o servidor backend em execução.\n\n' +
            'Em produção, certifique-se de que o backend Python está rodando corretamente.');
    } else {
      alert('Erro ao gerar relatório. Verifique o console para mais detalhes.\n\n' +
            'Erro: ' + err.message);
    }
  }
}

// -------- Árvore --------
const TREE_STRUCTURE = {
  root: { label: 'seu problema', color: '#000' },
  branches: {
    'I': { 
      label: 'Soluções prontas',
      children: {
        '1': { label: '1', solutions: ['I.1', 'I.2', 'I.3'] }
      }
    },
    'II': { 
      label: 'IA por API',
      children: {
        '1': { 
          label: 'sem anonimização',
          solutions: ['II.1.a', 'II.1.b']
        },
        '2': { 
          label: 'com anonimização',
          solutions: ['II.2.a', 'II.2.b']
        }
      }
    },
    'III': { 
      label: 'IA própria',
      children: {
        '1': { 
          label: 'sem engenharia reversa',
          solutions: ['III.1a', 'III.1.b']
        },
        '2': { 
          label: 'com engenharia reversa',
          solutions: ['III.2.a', 'III.2.b', 'III.2.c']
        }
      }
    }
  }
};

// Função para converter romano para inteiro (necessária para ordenação)
function romanToInt(r){
  const map={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; 
  let n=0, prev=0;
  for(const ch of r.split('').reverse()){ 
    const v=map[ch]||0; 
    if(v<prev) n-=v; 
    else n+=v, prev=v; 
  }
  return n;
}

// parseCoord já existe acima, não duplicar

// Função para comparar coordenadas
function compareCoords(a,b){
  if(a.pri!==b.pri) return romanToInt(a.pri)-romanToInt(b.pri);
  if(a.sec!==b.sec) return a.sec-b.sec;
  return a.ter.localeCompare(b.ter);
}

function buildTree(items){
  // Formato: Map(pri -> Map(sec -> [leaves]))
  const tree = new Map();
  for(const it of items){
    if(!it.coordStr) continue;
    const coord = parseCoord(it.coordStr);
    if(!coord) continue;
    
    const p = coord.pri, s = coord.sec;
    if(!tree.has(p)) tree.set(p, new Map());
    const sec = tree.get(p);
    if(!sec.has(s)) sec.set(s, []);
    sec.get(s).push({...it, coord});
  }
  
  // Ordena internamente
  for(const [,sec] of tree){
    for(const [s,arr] of sec){
      arr.sort((a,b)=> compareCoords(a.coord,b.coord) || (b.nota - a.nota));
      sec.set(s, arr);
    }
  }
  return tree;
}

function renderTree(tree, decimals){
  const host = document.getElementById('tree');
  if(!host){ return; }
  if(!tree || tree.size === 0){ 
    host.innerHTML='<em>Nenhuma solução mapeada.</em>'; 
    return; 
  }

  // Renderização HTML simples (como na pasta 99D)
  const primKeys = [...tree.keys()].sort((a,b)=> romanToInt(a)-romanToInt(b));
  const html = primKeys.map(pri => {
    const secs = tree.get(pri);
    const secKeys = [...secs.keys()].sort((a,b)=> a-b);
    const secHtml = secKeys.map(sec => {
      const leaves = secs.get(sec);
      const leafHtml = leaves.map(l => {
        const coordStr = l.coordStr || '';
        const nota = l.nota ? l.nota.toFixed(decimals || 2) : 'N/A';
        const margemErro = l.margemErro ? l.margemErro.toFixed(decimals || 2) : 'N/A';
        
        // Aplica cores baseadas na coordenada
        let colorClass = '';
        let colorStyle = '';
        if(coordStr) {
          if(/^I\.(1|2|3)$/.test(coordStr)) {
            colorStyle = 'color: #ff4444;';
          } else if(/^II\.(2|2\.a|3|2\.b)$/.test(coordStr) || coordStr === 'II.2' || coordStr === 'II.3') {
            colorStyle = 'color: #4299e1;';
          } else if(/^III\.1a$/.test(coordStr) || coordStr === 'III.1a') {
            colorStyle = 'color: #4299e1;';
          } else if(/^III\.1\.b$/.test(coordStr) || coordStr === 'III.1.b') {
            colorStyle = 'color: #ff8c00;';
          } else if(/^III\.2\.(a|b)$/.test(coordStr)) {
            colorStyle = 'color: #ff8c00;';
          } else if(/^III\.2\.c$/.test(coordStr)) {
            colorStyle = 'color: #4299e1;';
          }
        }
        
        return `<li><span class="leaf" style="${colorStyle}"><a href="#" onclick="event.preventDefault(); showSolutionModal('${l.nome.replace(/'/g, "\\'")}', '${coordStr}'); return false;">${l.nome}</a> ${coordStr ? `(${coordStr})` : ''}</span> <span class="score">(Nota=${nota}, σ=${margemErro})</span></li>`;
      }).join('');
      return `<li><span class="branch">${pri}.${sec}</span><ul>${leafHtml}</ul></li>`;
    }).join('');
    return `<li><span class="branch">${pri}</span><ul>${secHtml}</ul></li>`;
  }).join('');

  host.innerHTML = `<ul>${html}</ul>`;
  
  // Adicionar legenda
  const legend = document.createElement('div');
  legend.className = 'tree-legend';
  legend.style.cssText = 'margin-top: 20px; padding: 15px; background: #1a1a1a; border-radius: 8px; border: 1px solid #333; color: #cfcfcf; font-size: 13px;';
  
  legend.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold;">Legenda:</div>
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <div style="width: 20px; height: 20px; background: #ff4444; border-radius: 3px; margin-right: 10px; border: 1px solid #555;"></div>
      <span>confia? essas empresas terão dados da SEG</span>
    </div>
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <div style="width: 20px; height: 20px; background: #4299e1; border-radius: 3px; margin-right: 10px; border: 1px solid #555;"></div>
      <span>plataformas com login a partir de qualquer lugar, e em qualquer horário</span>
    </div>
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <div style="width: 20px; height: 20px; background: #ff8c00; border-radius: 3px; margin-right: 10px; border: 1px solid #555;"></div>
      <span>pode demandar instalação de novos terminais</span>
    </div>
  `;
  
  host.appendChild(legend);
}

// -------- toggle helpers --------
function show(el){ el.style.display='block'; }
function hide(el){ el.style.display='none'; }
function toggle(el){ el.style.display = (el.style.display==='none' || !el.style.display) ? 'block' : 'none'; }

// -------- Bootstrap --------
(async () => {
    const entrada = await initEntrada({ imgSrc: IMG_SRC, vertexToChannel: ['B','R','G'] });
    const CSVS = await loadCSVs();
    await loadSolutionDescriptions();
    setupSolutionLinks();

    // Configura fechamento do modal
    const modal = document.getElementById('solutionModal');
    const closeBtn = document.getElementById('closeModal');
  if(closeBtn && modal){
      closeBtn.addEventListener('click', () => modal.close());
    }
  if(modal){
    modal.addEventListener('click', (e) => {
      if(e.target === modal) modal.close();
    });
  }

  // Botões de navegação
  const btnRanking = document.getElementById('btnRanking');
  const btnTree = document.getElementById('btnTree');
  const rankingSection = document.getElementById('rankingSection');
  const treeSection = document.getElementById('treeSection');

  entrada.onConfirm(({r,g,b})=>{
    try{
      // ranking - retorna {items, decimals}
      const rankingResult = computeRanking(CSVS.z, {r,g,b});
      const rows = rankingResult.items;
      const numDecimals = rankingResult.decimals;
      rows.sort((a,b)=> b.Zranking - a.Zranking);

      // enriquece com nomes/coords
      const items = enrichWithNames(rows, CSVS.n);
      
      // Aplica clustering aos itens
      const clusteredItems = smartCluster(items);

      // PÓDIO por cluster
      renderPodiumClusters(clusteredItems, numDecimals);

      // Ranking completo (mantém oculto até clicar)
      renderTable(clusteredItems, numDecimals, {r,g,b});

      // Salva dados para geração de relatório
      currentRankingData = {
        items: clusteredItems,
        decimals: numDecimals
      };
      currentPriorities = {r, g, b};

      // Árvore (mantém oculta até clicar)
      const tree = buildTree(items);
      renderTree(tree, numDecimals);

      // listeners (uma vez só)
      if(!btnRanking.dataset.bound){
        btnRanking.addEventListener('click', ()=> toggle(rankingSection));
        btnRanking.dataset.bound = '1';
      }
      if(!btnTree.dataset.bound){
        btnTree.addEventListener('click', ()=> toggle(treeSection));
        btnTree.dataset.bound = '1';
      }

      // Botão gerar relatório
      const btnGenerateReport = document.getElementById('btnGenerateReport');
      const reportConfirmDlg = document.getElementById('reportConfirmDlg');
      const reportConfirmOk = document.getElementById('reportConfirmOk');
      const reportConfirmCancel = document.getElementById('reportConfirmCancel');
      
      if(btnGenerateReport && !btnGenerateReport.dataset.bound){
        btnGenerateReport.addEventListener('click', () => {
          if(!currentRankingData || !currentPriorities){
            alert('Por favor, confirme as prioridades primeiro para gerar o relatório.');
            return;
          }
          reportConfirmDlg.showModal();
        });
        
        if(reportConfirmCancel){
          reportConfirmCancel.addEventListener('click', () => {
            reportConfirmDlg.close();
          });
        }
        
        if(reportConfirmOk){
          reportConfirmOk.addEventListener('click', async () => {
            reportConfirmDlg.close();
            await generateReport();
          });
        }
        
        btnGenerateReport.dataset.bound = '1';
      }

      console.log('(r,g,b) puros ->', r.toFixed(6), g.toFixed(6), b.toFixed(6));
    }catch(err){
      console.error(err); alert(err.message || 'Erro ao processar CSV.');
    }
  });
})();
