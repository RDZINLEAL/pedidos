/* ============================================================
   PAGAMENTO DA LOJA — Pix real (PinguPag) ou pedido pelo WhatsApp
   O servidor recalcula preços, kits, cupons e frete; o navegador
   só envia os produtos escolhidos e os dados de entrega.
   Depois de gerar o Pix, o cliente vai para /pagamentoseguro#codigo,
   a mesma página dos pedidos do painel, que confirma sozinha.
   ============================================================ */

/* Promoção de parcerias (definida no servidor) */
let PROMO_LOJA = null;
// Este arquivo carrega antes do app.js, por isso lê o localStorage direto aqui
let banco = (() => { try { return JSON.parse(localStorage.getItem("bv_banco")) || null; } catch { return null; } })(); // 'caixa' | 'sicredi' | null
const salvarBanco = (b) => { banco = b; store.set("bv_banco", b); };
if (location.protocol.startsWith("http")) fetch("/api/promo").then((r) => r.json()).then((j) => {
  PROMO_LOJA = j.promo || null;
  if (!PROMO_LOJA || !PROMO_LOJA.banks[banco]) banco = null;
  if (["pagamento", "checkout"].includes(rotaAtual().rota)) render();
}).catch(() => {});

function cpfValido(cpf) {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += +cpf[i] * (n + 1 - i);
    if ((s * 10) % 11 % 10 !== +cpf[n]) return false;
  }
  return true;
}

/* Mensagem do pedido para o WhatsApp */
function montarPedido(d, pagTexto, codigo) {
  const t = totais(d.uf);
  const numero = "#" + (codigo ? codigo.slice(0, 6).toUpperCase() : "BV" + Date.now().toString().slice(-6));
  const itens = sacola.map((i) => { const p = porId(i.id); const o = Object.entries(i.opcoes).map(([k, v]) => `${k}: ${v}`).join(", "); return `${i.qtd}× ${p.nome}${o ? ` (${o})` : ""} — ${brl(p.preco * i.qtd)}`; });
  const endereco = `${d.rua}, ${d.numero}${d.comp ? " – " + d.comp : ""} · ${d.bairro}, ${d.cidade}/${d.uf} · CEP ${d.cep}`;
  const mensagem = [
    `*Pedido ${numero} — ${LOJA.nome}*`, "",
    ...itens, "",
    `Subtotal: ${brl(t.subtotal)}`,
    t.descKit ? `Desconto kit: −${brl(t.descKit)}` : null,
    t.descCupom ? `Cupom ${cupom}: −${brl(t.descCupom)}` : null,
    `Frete: ${t.gratis ? "Grátis" : brl(t.frete || 0)}`,
    `*Total: ${brl(t.total)}*`,
    `Pagamento: ${pagTexto}`, "",
    `*Cliente:* ${d.nome}`, d.cpf ? `CPF: ${d.cpf}` : null, `E-mail: ${d.email}`, `WhatsApp: ${d.tel}`, `Entrega: ${endereco}`,
    d.obs ? `Obs.: ${d.obs}` : null
  ].filter((l) => l !== null).join("\n");
  return { numero, nome: d.nome, pag: pagTexto, total: t.total, endereco, itens, mensagem };
}

/* Envia o pedido ao servidor */
function enviarPedido(forma) {
  const c = store.get("bv_cliente", {});
  return API.enviar("/api/loja/pedidos", {
    forma,
    cliente: { ...c, lgpd: true },
    itens: sacola.map((i) => ({ id: i.id, qtd: i.qtd, opcoes: i.opcoes })),
    cupom,
    banco: forma === "pix" ? banco : null
  });
}

/* Chamado pelo formulário de checkout (js/app.js) */
async function registrarCheckout(d, acao, botao) {
  if (acao === "pagar") { location.hash = "#/pagamento"; return; }
  if (botao) { botao.disabled = true; botao.dataset.txt = botao.innerHTML; botao.innerHTML = "Enviando…"; }
  const r = await enviarPedido("whatsapp");
  if (botao) { botao.disabled = false; botao.innerHTML = botao.dataset.txt; }
  if (!r.ok && !r.offline) { $("#erro-checkout").textContent = r.error || "Não foi possível enviar o pedido."; return; }
  const ped = montarPedido(d, "A combinar no WhatsApp", r.ok ? r.id : null);
  store.set("bv_ultimo_pedido", ped);
  window.open(wa(ped.mensagem), "_blank", "noopener");
  sacola = []; cupom = null; salvarSacola();
  location.hash = "#/pedido";
}

/* ---------- Página de pagamento (Pix) ---------- */
const nomeApp = (b) => (b === "caixa" ? "da Caixa ou do Caixa Tem" : "do Sicredi");

function paginaPagamento() {
  const c = store.get("bv_cliente", null);
  if (!sacola.length) { location.hash = "#/sacola"; return ""; }
  if (!c || !c.nome || !c.uf) { location.hash = "#/checkout"; return ""; }
  const t = totais(c.uf, true);
  return `
    <section class="pagina-topo">
      <nav class="trilha"><a href="#/sacola">Sacola</a> / <a href="#/checkout">Dados e entrega</a> / <span>Pagamento</span></nav>
      <h1 class="titulo">Pagamento <span>com Pix</span></h1>
      <ol class="etapas"><li class="ok">Sacola</li><li class="ok">Dados e entrega</li><li class="atual">Pagamento</li><li>Confirmação</li></ol>
    </section>
    <div class="duas-col pg-layout">
      <div class="pg-principal">
        ${PROMO_LOJA ? `
        <div class="pg-promo">
          <img src="/assets/promo-parcerias.webp" alt="A Bravus agora tem parcerias: Caixa e Sicredi">
          <h3><span>${PROMO_LOJA.percent}% de desconto</span> pagando pelo app do seu banco parceiro</h3>
          <div class="pg-bancos" role="radiogroup" aria-label="Banco para o desconto">
            ${Object.entries(PROMO_LOJA.banks).map(([id, nome]) => `<button type="button" class="pg-banco ${id} ${banco === id ? "on" : ""}" data-banco="${id}" aria-pressed="${banco === id}">${esc(nome)}</button>`).join("")}
            <button type="button" class="pg-banco nenhum ${!banco ? "on" : ""}" data-banco="" aria-pressed="${!banco}">Outro banco (sem cupom)</button>
          </div>
          ${banco ? `<p class="pg-aviso">⚠️ Para ter o desconto, pague o Pix pelo app <strong>${nomeApp(banco)}</strong>.</p>` : ""}
          ${banco && cupom ? `<p class="nota">O cupom do banco substitui o cupom ${esc(cupom)}.</p>` : ""}
        </div>` : ""}
        <div class="pg-gerar">
          <p class="pg-valor">${brl(t.total)}</p>
          <ol class="pg-como">
            <li>Toque em <strong>Gerar Pix</strong></li>
            <li>Copie o código e pague no app ${banco ? `<strong>${nomeApp(banco)}</strong>` : "do seu banco"}</li>
            <li>A confirmação aparece sozinha na tela</li>
          </ol>
          <button type="button" class="btn btn-amarelo btn-largo" id="btn-gerar-pix" data-gerar-pix>⚡ Gerar Pix de ${brl(t.total)}</button>
          <p class="erro" id="erro-pix" role="alert"></p>
          <a class="btn btn-contorno btn-largo" href="#/checkout">Prefiro fechar pelo WhatsApp</a>
        </div>
        <div class="pg-selos">
          <span>🔒 Conexão criptografada (SSL)</span><span>🛡️ Dados protegidos (LGPD)</span><span>⚡ Pix com confirmação automática</span>
        </div>
      </div>
      <div>
        <div class="pg-entrega">
          <div><span class="nota">Entregar para</span><strong>${esc(c.nome)}</strong><span class="nota">${esc(`${c.rua}, ${c.numero} · ${c.cidade}/${c.uf}`)}</span></div>
          <a href="#/checkout" class="link">Alterar</a>
        </div>
        ${resumoHTML(t, "checkout")}
      </div>
    </div>`;
}

/* Pop-up da promoção: 3 segundos depois de chegar ao pagamento, uma vez por compra */
let promoTimer = null;
function iniciarPagamento() {
  clearTimeout(promoTimer);
  promoTimer = setTimeout(() => {
    if (!PROMO_LOJA || banco || rotaAtual().rota !== "pagamento" || store.get("bv_promo_vista", false)) return;
    abrirPromo();
  }, 3000);
}

function abrirPromo(passo = 1, escolhido = null) {
  fecharPromo();
  const c = store.get("bv_cliente", {});
  const semDesc = totais(c.uf).total;
  const el = document.createElement("div");
  el.className = "promo-pop"; el.id = "promo-pop";
  el.innerHTML = `
    <div class="promo-fundo" data-promo-fechar></div>
    <div class="promo-caixa" role="dialog" aria-modal="true" aria-label="Promoção de parcerias">
      <button class="promo-x" data-promo-fechar aria-label="Fechar">×</button>
      <img src="/assets/promo-parcerias.webp" alt="A Bravus agora tem parcerias: Caixa e Sicredi">
      ${passo === 1 ? `
        <h3><span>${PROMO_LOJA.percent}%</span> de desconto no seu pedido!</h3>
        <p>A BRAVUS agora tem parceria com a <b>Caixa / Caixa Tem</b> e o <b>Sicredi</b>. Pagando o Pix por um desses bancos, você ganha <b>${PROMO_LOJA.percent}%</b> de desconto. Por qual banco você quer pagar?</p>
        <div class="promo-bancos">
          ${Object.entries(PROMO_LOJA.banks).map(([id, nome]) => `<button class="pg-banco ${id}" data-promo-banco="${id}">${esc(nome)}</button>`).join("")}
        </div>
        <button class="promo-pular" data-promo-fechar>Continuar sem o cupom</button>` : `
        <h3>Quase lá!</h3>
        <p>Para garantir os <b>${PROMO_LOJA.percent}%</b> de desconto, o pagamento do Pix precisa ser feito pelo app <b>${nomeApp(escolhido)}</b>.</p>
        <div class="promo-preco"><span>Sem cupom <s>${brl(semDesc)}</s></span><span>Com o cupom <strong>${brl(totaisCom(escolhido, c.uf).total)}</strong></span></div>
        <button class="btn btn-amarelo btn-largo" data-promo-aplicar="${escolhido}">Aplicar meu cupom</button>
        <button class="promo-pular" data-promo-voltar>Voltar e escolher outro banco</button>`}
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add("modal-aberto");
}
function totaisCom(b, uf) { const antes = banco; banco = b; const t = totais(uf, true); banco = antes; return t; }
function fecharPromo() { $("#promo-pop")?.remove(); document.body.classList.remove("modal-aberto"); }

/* ---------- Gerar o Pix ---------- */
async function gerarPix(btn) {
  const erro = $("#erro-pix"); erro.innerHTML = "";
  btn.disabled = true; const txt = btn.innerHTML; btn.innerHTML = "Gerando Pix…";
  const r = await enviarPedido("pix");
  if (!r.ok) {
    btn.disabled = false; btn.innerHTML = txt;
    erro.innerHTML = `${esc(r.error || r.erro || "Não foi possível gerar o Pix agora.")}<br><a href="#/checkout" class="link">Fechar o pedido pelo WhatsApp</a>`;
    return;
  }
  const c = store.get("bv_cliente", {});
  store.set("bv_ultimo_pedido", { ...montarPedido(c, "Pix", r.id), id: r.id });
  sacola = []; cupom = null; salvarSacola(); salvarBanco(null); store.set("bv_promo_vista", false);
  location.href = "/pagamentoseguro#" + r.id;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-banco]");
  if (b) { salvarBanco(b.dataset.banco || null); store.set("bv_promo_vista", true); render(); return; }
  if (e.target.closest("[data-gerar-pix]")) { gerarPix(e.target.closest("[data-gerar-pix]")); return; }
  const pb = e.target.closest("[data-promo-banco]");
  if (pb) { abrirPromo(2, pb.dataset.promoBanco); return; }
  if (e.target.closest("[data-promo-voltar]")) { abrirPromo(1); return; }
  const ap = e.target.closest("[data-promo-aplicar]");
  if (ap) { salvarBanco(ap.dataset.promoAplicar); store.set("bv_promo_vista", true); fecharPromo(); render(); avisar(`Cupom ${PROMO_LOJA.banks[banco]} aplicado: ${PROMO_LOJA.percent}% de desconto!`, null); return; }
  if (e.target.closest("[data-promo-fechar]")) { store.set("bv_promo_vista", true); fecharPromo(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#promo-pop")) { store.set("bv_promo_vista", true); fecharPromo(); } });
