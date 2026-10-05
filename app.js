const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.getItem('pedido_token') || '', nome: localStorage.getItem('pedido_nome') || '' };

async function api(acao, dados = {}) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      acao,
      token: S.token,
      ...dados
    })
  });

  const texto = await r.text();

  let j;
  try {
    j = JSON.parse(texto);
  } catch (e) {
    console.error('Resposta recebida da API:', texto);
    throw new Error(
      'A API não retornou JSON. Status: ' + r.status +
      '. Verifique a implantação do Apps Script.'
    );
  }

  if (!j.ok) throw new Error(j.erro || 'Erro na API');
  return j.dados;
}

function telaLogin() {
  $('#quem').hidden = true;
  $('#app').innerHTML = `<form class="card" id="f">
    <label>Seu nome<input name="nome" required></label>
    <label>Senha<input name="senha" type="password" required></label>
    <button class="btn">Entrar</button>
    <p class="msg erro" id="erro" hidden></p></form>`;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector('button'), txt = b.textContent;
    b.disabled = true; b.textContent = 'Entrando…'; $('#erro').hidden = true;
    try {
      const d = await api('login', { nome: f.nome.value, senha: f.senha.value });
      S.token = d.token; S.nome = d.nome;
      localStorage.setItem('pedido_token', S.token); localStorage.setItem('pedido_nome', S.nome);
      telaPedido();
    } catch (x) { $('#erro').hidden = false; $('#erro').textContent = x.message; b.disabled = false; b.textContent = txt; }
  };
}

async function telaPedido() {
  $('#quem').hidden = false; $('#quem').innerHTML = `${esc(S.nome)} · <a href="#" id="sair">sair</a>`;
  $('#sair').onclick = e => { e.preventDefault(); localStorage.removeItem('pedido_token'); localStorage.removeItem('pedido_nome'); S.token = ''; telaLogin(); };
  $('#app').innerHTML = '<p class="vazio">Carregando…</p>';
  let o;
  try { o = await api('opcoes'); } catch (x) { if (/[Ss]ess/.test(x.message)) return telaLogin(); $('#app').innerHTML = `<p class="msg erro">${esc(x.message)}</p>`; return; }

  $('#app').innerHTML = `<form class="card" id="f">
    <label>Edificação / Centro de custo<select name="edificacao" required>${o.obras.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
    <label>Etapa da obra (se souber)<input name="etapa" placeholder="ex: Fundação, Acabamento..."></label>
    <label>Material<select name="sel">${o.materiais.map((m, i) => `<option value="${i}">${esc(m.descricao)}${m.unidade ? ' (' + esc(m.unidade) + ')' : ''}</option>`).join('')}<option value="_novo">Outro (digitar)…</option></select></label>
    <label class="novo" hidden>Descreva o material<input name="descricao_novo" placeholder="ex: cimento CP-II 50kg"></label>
    <label>Quantidade<input name="quantidade" type="number" step="any" required></label>
    <label class="novo" hidden>Unidade<select name="unidade_novo">${o.unidades.map(u => `<option>${esc(u)}</option>`).join('')}</select></label>
    <label>Prioridade<select name="prioridade" required>${o.prioridades.map(p => `<option>${esc(p)}</option>`).join('')}</select></label>
    <label>Data que precisa estar na obra<input name="data_necessidade" type="date"></label>
    <label>Observações<input name="observacoes" placeholder="opcional"></label>
    <button class="btn">Enviar pedido</button>
    <p class="msg erro" id="erro" hidden></p></form>
    <section id="acomp"></section>`;
  carregarLista();

  const sel = $('#f [name=sel]'), camposNovo = document.querySelectorAll('#f .novo');
  sel.onchange = () => camposNovo.forEach(x => x.hidden = sel.value !== '_novo');
  if (!o.materiais.length) { sel.value = '_novo'; camposNovo.forEach(x => x.hidden = false); }

  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector('button'), txt = b.textContent;
    const novo = sel.value === '_novo';
    const descricao = novo ? f.descricao_novo.value : o.materiais[sel.value].descricao;
    const unidade = novo ? f.unidade_novo.value : o.materiais[sel.value].unidade;
    if (!descricao) return alert('Informe o material');
    if (!unidade) return alert('Informe a unidade');
    b.disabled = true; b.textContent = 'Enviando…'; $('#erro').hidden = true;
    try {
      await api('criarPedido', { edificacao: f.edificacao.value, etapa: f.etapa.value, descricao, quantidade: f.quantidade.value,
        unidade, prioridade: f.prioridade.value, data_necessidade: f.data_necessidade.value, observacoes: f.observacoes.value });
      $('#app').innerHTML = '<div class="card"><p class="msg ok">Pedido enviado! O pedido já aparece para a equipe de compras.</p><button class="btn" id="outro">Abrir outro pedido</button></div><section id="acomp"></section>';
      $('#outro').onclick = telaPedido;
      carregarLista();
    } catch (x) { $('#erro').hidden = false; $('#erro').textContent = x.message; b.disabled = false; b.textContent = txt; }
  };
}

const ETAPAS = ['Aberto', 'Em cotação', 'Comprado', 'Pago', 'Entregue'];
const fmtData = iso => iso ? iso.split('-').reverse().join('/') : '';
const fmtValor = v => (v === '' || v == null) ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function cartaoPedido(p, todos) {
  const cancelado = p.status === 'Cancelado';
  const idx = ETAPAS.indexOf(p.status);
  const passos = cancelado ? '' : `<ol class="passos">${ETAPAS.map((e, i) =>
    `<li class="${i < idx ? 'feito' : i === idx ? 'atual' : ''}"><span></span>${esc(e)}</li>`).join('')}</ol>`;
  const info = [
    todos ? ['Solicitante', p.solicitante] : null,
    ['Obra', p.edificacao],
    p.fornecedor ? ['Fornecedor', p.fornecedor] : null,
    p.valor !== '' && p.valor != null ? ['Valor', fmtValor(p.valor)] : null,
    p.data_compra ? ['Comprado em', fmtData(p.data_compra)] : null,
    p.data_pagamento ? ['Pago em', fmtData(p.data_pagamento)] : null,
    p.data_entrega ? ['Entregue em', fmtData(p.data_entrega)]
      : p.previsao_entrega ? ['Previsão de entrega', fmtData(p.previsao_entrega)]
      : p.data_necessidade ? ['Necessário até', fmtData(p.data_necessidade)] : null,
    p.obs_compras ? ['Compras', p.obs_compras] : null
  ].filter(Boolean).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('');
  return `<article class="pedido ${cancelado ? 'cancelado' : ''}">
    <div class="topo"><strong>${esc(p.numero)}</strong><span class="tag s-${esc(p.status.replace(/\s/g, '').toLowerCase())}">${esc(p.status)}</span></div>
    <div class="mat">${esc(p.material)} — ${esc(p.quantidade)} ${esc(p.unidade)}${p.prioridade === 'Urgente' ? ' <span class="urg">URGENTE</span>' : ''}</div>
    ${passos}<div class="info">${info}</div></article>`;
}

async function carregarLista() {
  const el = $('#acomp'); if (!el) return;
  el.innerHTML = '<h2 class="sub">Acompanhar pedidos</h2><p class="vazio">Carregando…</p>';
  try {
    const d = await api('meusPedidos');
    if (!$('#acomp')) return; // usuário saiu da tela
    el.innerHTML = `<h2 class="sub">${d.todos ? 'Todos os pedidos' : 'Meus pedidos'} <a href="#" id="atualiza">atualizar</a></h2>`
      + (d.pedidos.length ? d.pedidos.map(p => cartaoPedido(p, d.todos)).join('') : '<p class="vazio">Nenhum pedido ainda.</p>');
    $('#atualiza').onclick = e => { e.preventDefault(); carregarLista(); };
  } catch (x) {
    if (/[Ss]ess/.test(x.message)) return telaLogin();
    el.innerHTML = `<h2 class="sub">Acompanhar pedidos</h2><p class="msg erro">${esc(x.message)}</p>`;
  }
}

S.token ? telaPedido() : telaLogin();
