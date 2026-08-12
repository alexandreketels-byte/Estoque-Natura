/* ===================== ESTADO ===================== */
let pinDigitado = '';
let usuarioAtual = localStorage.getItem('estoque_usuario') || null;
let produtos = [];
let produtoSelecionadoMov = null;
let tipoMovAtual = 'Entrada';
let filtroNivelAtual = 'todos';

/* ===================== API ===================== */
async function chamarApi(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const resp = await fetch(url, { method: 'GET' });
  return resp.json();
}

async function chamarApiPost(action, body = {}) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action }, body))
  });
  return resp.json();
}

/* ===================== LOGIN (PIN) ===================== */
function atualizarPinDisplay() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((d, i) => d.classList.toggle('preenchido', i < pinDigitado.length));
}

document.querySelectorAll('.pin-pad button').forEach(btn => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    document.getElementById('pin-erro').textContent = '';
    if (k === 'apagar') {
      pinDigitado = pinDigitado.slice(0, -1);
    } else if (k === 'ok') {
      tentarLogin();
      return;
    } else if (pinDigitado.length < 6) {
      pinDigitado += k;
    }
    atualizarPinDisplay();
    if (pinDigitado.length >= 4) tentarLogin();
  });
});

async function tentarLogin() {
  if (!pinDigitado) return;
  try {
    const res = await chamarApi('login', { pin: pinDigitado });
    if (res.ok) {
      usuarioAtual = res.usuario;
      localStorage.setItem('estoque_usuario', usuarioAtual);
      entrarNoApp();
    } else {
      document.getElementById('pin-erro').textContent = res.error || 'PIN inválido';
      pinDigitado = '';
      atualizarPinDisplay();
    }
  } catch (e) {
    document.getElementById('pin-erro').textContent = 'Erro de conexão. Verifique a API.';
  }
}

document.getElementById('btn-sair').addEventListener('click', () => {
  usuarioAtual = null;
  localStorage.removeItem('estoque_usuario');
  pinDigitado = '';
  atualizarPinDisplay();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('tela-login').classList.remove('hidden');
});

function entrarNoApp() {
  document.getElementById('tela-login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('nome-usuario').textContent = usuarioAtual;
  carregarDashboard();
  carregarProdutosSilencioso();
}

async function carregarProdutosSilencioso() {
  try {
    const res = await chamarApi('listarProdutos');
    if (res.ok) produtos = res.produtos;
  } catch (e) { /* será recarregado ao abrir a aba Produtos */ }
}

/* ===================== NAVEGAÇÃO ===================== */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => mostrarView(btn.dataset.view));
});

function mostrarView(nome) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('ativo'));
  document.getElementById('view-' + nome).classList.remove('hidden');
  document.querySelector('.nav-item[data-view="' + nome + '"]').classList.add('ativo');

  if (nome === 'dashboard') carregarDashboard();
  if (nome === 'produtos') carregarProdutos();
  if (nome === 'historico') carregarHistorico();
  if (nome === 'abc') carregarAbc();
}

/* ===================== TOAST ===================== */
function mostrarToast(msg, erro) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('erro', !!erro);
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ===================== DASHBOARD ===================== */
async function carregarDashboard() {
  try {
    const res = await chamarApi('dashboard');
    if (!res.ok) return;
    document.getElementById('num-total').textContent = res.totalProdutos;
    document.getElementById('num-abaixo').textContent = res.abaixoIdeal;
    document.getElementById('num-zerado').textContent = res.semEstoque;
    document.getElementById('num-hoje').textContent = res.movimentacoesHoje;

    const mov = await chamarApi('listarMovimentacoes', { limit: 6 });
    renderizarMovimentacoes(mov.movimentacoes || [], 'lista-recentes');
  } catch (e) { mostrarToast('Erro ao carregar dados', true); }
}

/* ===================== PRODUTOS ===================== */
async function carregarProdutos() {
  const lista = document.getElementById('lista-produtos');
  lista.innerHTML = '<div class="vazio">Carregando...</div>';
  const res = await chamarApi('listarProdutos');
  if (!res.ok) { lista.innerHTML = '<div class="vazio">Erro ao carregar produtos</div>'; return; }
  produtos = res.produtos;
  aplicarFiltrosProdutos();
}

function classificarSaldo(p) {
  if (p.saldoAtual <= 0) return 'saldo-critico';
  if (p.saldoAtual < p.estoqueIdeal) return 'saldo-baixo';
  return 'saldo-ok';
}

function classificarNivel(p) {
  if (p.saldoAtual < p.estoqueIdeal) return 'abaixo';
  if (p.saldoAtual > p.estoqueIdeal) return 'acima';
  return 'ideal';
}

function aplicarFiltrosProdutos() {
  const termo = document.getElementById('busca-produto').value.toLowerCase();
  const filtrados = produtos.filter(p => {
    const bateBusca = String(p.nome).toLowerCase().includes(termo) || String(p.sku).includes(termo);
    const bateNivel = filtroNivelAtual === 'todos' || classificarNivel(p) === filtroNivelAtual;
    return bateBusca && bateNivel;
  });
  renderizarProdutos(filtrados);
}

document.querySelectorAll('.filtro-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    filtroNivelAtual = btn.dataset.filtro;
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.toggle('ativo', b === btn));
    aplicarFiltrosProdutos();
  });
});

function renderizarProdutos(lista) {
  const el = document.getElementById('lista-produtos');
  if (!lista.length) { el.innerHTML = '<div class="vazio">Nenhum produto encontrado</div>'; return; }
  el.innerHTML = lista.map(p => {
    const classe = classificarSaldo(p);
    const perc = p.estoqueIdeal > 0 ? Math.min(100, (p.saldoAtual / p.estoqueIdeal) * 100) : 100;
    const diff = p.saldoAtual - p.estoqueIdeal;
    let diffHtml = '<span class="diff-neutro">no ideal</span>';
    if (diff > 0) diffHtml = `<span class="diff-acima">+${diff} acima</span>`;
    if (diff < 0) diffHtml = `<span class="diff-abaixo">${diff} abaixo</span>`;
    return `
      <div class="item-produto ${classe}" data-sku="${p.sku}">
        <div class="item-produto-info">
          <div class="item-produto-nome">${p.nome}</div>
          <div class="item-produto-sku">SKU ${p.sku} · ${p.grupo || ''} · ideal ${p.estoqueIdeal}</div>
        </div>
        <div class="item-produto-saldo">
          <span class="saldo-num">${p.saldoAtual}</span>
          <div class="diff-ideal">${diffHtml}</div>
          <div class="barra-nivel"><div class="barra-nivel-fill" style="width:${perc}%"></div></div>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.item-produto').forEach(item => {
    item.addEventListener('click', () => {
      const p = produtos.find(x => String(x.sku) === item.dataset.sku);
      abrirModalMov(p);
    });
  });
}

document.getElementById('busca-produto').addEventListener('input', aplicarFiltrosProdutos);

/* ===================== HISTÓRICO ===================== */
async function carregarHistorico() {
  const el = document.getElementById('lista-historico');
  el.innerHTML = '<div class="vazio">Carregando...</div>';
  const res = await chamarApi('listarMovimentacoes', { limit: 150 });
  renderizarMovimentacoes(res.movimentacoes || [], 'lista-historico');
}

function renderizarMovimentacoes(lista, idAlvo) {
  const el = document.getElementById(idAlvo);
  if (!lista.length) { el.innerHTML = '<div class="vazio">Nenhuma movimentação registrada</div>'; return; }
  el.innerHTML = lista.map(m => {
    const classe = m.tipo === 'Entrada' ? 'mov-entrada' : 'mov-saida';
    const icone = m.tipo === 'Entrada' ? '↓' : '↑';
    const sinal = m.tipo === 'Entrada' ? '+' : '−';
    return `
      <div class="item-mov ${classe}">
        <div class="mov-icone">${icone}</div>
        <div class="item-mov-info">
          <div class="item-mov-nome">${m.produto}</div>
          <div class="item-mov-meta">${m.dataHora} · ${m.usuario}${m.motivo ? ' · ' + m.motivo : ''}</div>
        </div>
        <div class="item-mov-qtd">${sinal}${m.quantidade}</div>
      </div>`;
  }).join('');
}

/* ===================== CURVA ABC ===================== */
async function carregarAbc() {
  const el = document.getElementById('corpo-abc');
  el.innerHTML = '<tr><td colspan="5" class="vazio">Carregando...</td></tr>';
  const res = await chamarApi('curvaAbc');
  const itens = res.itens || [];
  if (!itens.length) { el.innerHTML = '<tr><td colspan="5" class="vazio">Sem dados</td></tr>'; return; }
  el.innerHTML = itens.map(i => `
    <tr>
      <td><span class="classe-${i.curva}">${i.curva}</span></td>
      <td>${i.produto}</td>
      <td>${i.categoria}</td>
      <td>R$ ${Number(i.precoUnitario).toFixed(2)}</td>
      <td>${i.estoque}</td>
    </tr>`).join('');
}

/* ===================== MODAL MOVIMENTAÇÃO ===================== */
const modal = document.getElementById('modal-mov');
document.getElementById('btn-nova-mov').addEventListener('click', () => abrirModalMov(null));
document.getElementById('fechar-modal').addEventListener('click', fecharModalMov);

function abrirModalMov(produto) {
  modal.classList.remove('hidden');
  document.getElementById('mov-erro').textContent = '';
  document.getElementById('mov-quantidade').value = '';
  document.getElementById('mov-motivo').value = '';
  document.getElementById('mov-busca-produto').value = '';
  document.getElementById('mov-sugestoes').innerHTML = '';
  produtoSelecionadoMov = produto || null;
  atualizarProdutoSelecionadoUI();
  tipoMovAtual = 'Entrada';
  document.querySelectorAll('.tipo-btn').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === 'Entrada'));
}

function fecharModalMov() { modal.classList.add('hidden'); }

function atualizarProdutoSelecionadoUI() {
  const el = document.getElementById('mov-produto-selecionado');
  if (produtoSelecionadoMov) {
    el.classList.remove('hidden');
    el.innerHTML = `<span>${produtoSelecionadoMov.nome} (SKU ${produtoSelecionadoMov.sku}) — saldo atual: ${produtoSelecionadoMov.saldoAtual}</span>`;
  } else {
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

document.getElementById('mov-busca-produto').addEventListener('input', (e) => {
  const termo = e.target.value.toLowerCase();
  const sug = document.getElementById('mov-sugestoes');
  if (!termo) { sug.innerHTML = ''; return; }
  const encontrados = produtos.filter(p =>
    String(p.nome).toLowerCase().includes(termo) || String(p.sku).includes(termo)
  ).slice(0, 8);
  sug.innerHTML = encontrados.map(p =>
    `<div class="sugestao-item" data-sku="${p.sku}"><b>${p.nome}</b> — SKU ${p.sku} (saldo ${p.saldoAtual})</div>`
  ).join('');
  sug.querySelectorAll('.sugestao-item').forEach(item => {
    item.addEventListener('click', () => {
      produtoSelecionadoMov = produtos.find(p => String(p.sku) === item.dataset.sku);
      atualizarProdutoSelecionadoUI();
      sug.innerHTML = '';
      document.getElementById('mov-busca-produto').value = '';
    });
  });
});

document.querySelectorAll('.tipo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    tipoMovAtual = btn.dataset.tipo;
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.toggle('ativo', b === btn));
  });
});

document.getElementById('btn-confirmar-mov').addEventListener('click', async () => {
  const erroEl = document.getElementById('mov-erro');
  erroEl.textContent = '';
  if (!produtoSelecionadoMov) { erroEl.textContent = 'Selecione um produto'; return; }
  const quantidade = Number(document.getElementById('mov-quantidade').value);
  if (!quantidade || quantidade <= 0) { erroEl.textContent = 'Informe uma quantidade válida'; return; }
  const motivo = document.getElementById('mov-motivo').value;

  const btn = document.getElementById('btn-confirmar-mov');
  btn.disabled = true; btn.textContent = 'Registrando...';

  try {
    const res = await chamarApiPost('registrarMovimentacao', {
      sku: produtoSelecionadoMov.sku,
      tipo: tipoMovAtual,
      quantidade: quantidade,
      motivo: motivo,
      usuario: usuarioAtual
    });
    if (res.ok) {
      mostrarToast(`${tipoMovAtual} registrada — novo saldo: ${res.novoSaldo}`);
      fecharModalMov();
      carregarDashboard();
      if (!document.getElementById('view-produtos').classList.contains('hidden')) carregarProdutos();
      if (!document.getElementById('view-historico').classList.contains('hidden')) carregarHistorico();
    } else {
      erroEl.textContent = res.error || 'Erro ao registrar';
    }
  } catch (e) {
    erroEl.textContent = 'Erro de conexão';
  }
  btn.disabled = false; btn.textContent = 'Registrar';
});

/* ===================== AJUSTE EM MASSA ===================== */
const modalAjuste = document.getElementById('modal-ajuste');
let diferencasAjuste = [];

document.getElementById('btn-ajuste-massa').addEventListener('click', () => {
  document.getElementById('ajuste-texto').value = '';
  document.getElementById('ajuste-resumo').classList.add('hidden');
  document.getElementById('ajuste-erro').textContent = '';
  document.getElementById('ajuste-preview').innerHTML = '';
  diferencasAjuste = [];
  modalAjuste.classList.remove('hidden');
});
document.getElementById('fechar-modal-ajuste').addEventListener('click', () => modalAjuste.classList.add('hidden'));

function parseListaAjuste(texto) {
  return texto.split('\n')
    .map(l => l.trim())
    .filter(l => l.length)
    .map(l => {
      const partes = l.split(/[\t;,]+/).map(p => p.trim());
      return { sku: partes[0], quantidade: Number(partes[1]) };
    })
    .filter(item => item.sku && !isNaN(item.quantidade));
}

document.getElementById('btn-analisar-ajuste').addEventListener('click', () => {
  const texto = document.getElementById('ajuste-texto').value;
  const itens = parseListaAjuste(texto);
  const erroEl = document.getElementById('ajuste-erro');
  erroEl.textContent = '';

  if (!itens.length) { erroEl.textContent = 'Nenhum item válido encontrado. Confira o formato.'; return; }
  if (!produtos.length) { erroEl.textContent = 'Produtos ainda não carregados, tente novamente em instantes.'; return; }

  diferencasAjuste = itens.map(item => {
    const p = produtos.find(x => String(x.sku) === String(item.sku));
    if (!p) return { sku: item.sku, ok: false, error: 'SKU não encontrado' };
    const diff = item.quantidade - p.saldoAtual;
    return { sku: item.sku, nome: p.nome, saldoAtual: p.saldoAtual, quantidadeInformada: item.quantidade, diff: diff, ok: true };
  });

  renderizarPreviewAjuste();
});

function renderizarPreviewAjuste() {
  const el = document.getElementById('ajuste-preview');
  const comDiferenca = diferencasAjuste.filter(d => !d.ok || d.diff !== 0);
  document.getElementById('ajuste-resumo').classList.remove('hidden');

  if (!comDiferenca.length) {
    el.innerHTML = '<div class="vazio">Nenhuma diferença — estoque já está de acordo com a contagem.</div>';
    document.getElementById('btn-confirmar-ajuste').classList.add('hidden');
    return;
  }
  document.getElementById('btn-confirmar-ajuste').classList.remove('hidden');

  el.innerHTML = comDiferenca.map(d => {
    if (!d.ok) {
      return `<div class="item-ajuste erro"><div class="item-ajuste-nome">SKU ${d.sku}<small>${d.error}</small></div></div>`;
    }
    const classe = d.diff > 0 ? 'acima' : 'abaixo';
    const sinal = d.diff > 0 ? '+' : '';
    return `
      <div class="item-ajuste ${classe}">
        <div class="item-ajuste-nome">${d.nome}<small>SKU ${d.sku} · sistema: ${d.saldoAtual} → contagem: ${d.quantidadeInformada}</small></div>
        <div class="item-ajuste-diff">${sinal}${d.diff}</div>
      </div>`;
  }).join('');
}

document.getElementById('btn-confirmar-ajuste').addEventListener('click', async () => {
  const validos = diferencasAjuste.filter(d => d.ok && d.diff !== 0);
  if (!validos.length) return;

  const erroEl = document.getElementById('ajuste-erro');
  const btn = document.getElementById('btn-confirmar-ajuste');
  btn.disabled = true; btn.textContent = 'Aplicando...';

  try {
    const res = await chamarApiPost('ajustarEstoqueEmMassa', {
      itens: validos.map(d => ({ sku: d.sku, quantidade: d.quantidadeInformada })),
      usuario: usuarioAtual
    });
    if (res.ok) {
      mostrarToast(`${res.aplicados} produto(s) ajustado(s)`);
      modalAjuste.classList.add('hidden');
      carregarProdutos();
      carregarDashboard();
    } else {
      erroEl.textContent = res.error || 'Erro ao aplicar ajustes';
    }
  } catch (e) {
    erroEl.textContent = 'Erro de conexão';
  }
  btn.disabled = false; btn.textContent = 'Aplicar ajustes';
});

/* ===================== INICIALIZAÇÃO ===================== */
if (usuarioAtual) {
  entrarNoApp();
}
