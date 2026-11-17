/* BRAVUS Brasil — loja interativa
   Rotas: início, loja, produto, kit (montador), personalizar (simulador),
   favoritos, sacola, checkout, pedido, sobre, contato. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const porId = (id) => PRODUTOS.find((p) => p.id === id);
const nomeCat = (id) => (CATEGORIAS.find((c) => c.id === id) || {}).nome || "";
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const wa = (txt) => `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(txt)}`;
const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ponteiroFino = matchMedia("(hover: hover) and (pointer: fine)").matches;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ============ ESTADO ============ */
let sacola = store.get("bv_sacola", []).filter((i) => porId(i.id));
let cupom = store.get("bv_cupom", null);
let favs = store.get("bv_favs", []).filter((id) => porId(id));
const chave = (id, op) => id + "|" + Object.entries(op).map(([k, v]) => k + ":" + v).join(",");
const fotoDoItem = (p, op) => p.imagens[p.fotoPor ? Math.max(0, p.variacoes[p.fotoPor].indexOf(op[p.fotoPor])) : 0];

function salvarSacola() { store.set("bv_sacola", sacola); store.set("bv_cupom", cupom); atualizarContadores(); renderGaveta(); }

function adicionar(id, opcoes = {}, qtd = 1, { origem = null, abrir = true } = {}) {
  const k = chave(id, opcoes);
  const it = sacola.find((i) => i.chave === k);
  if (it) it.qtd += qtd; else sacola.push({ chave: k, id, opcoes, qtd });
  salvarSacola();
  if (origem) voarParaSacola(origem);
  if (abrir) setTimeout(abrirGaveta, origem && !reduzMovimento ? 550 : 0);
}
function mudarQtd(k, d) {
  const it = sacola.find((i) => i.chave === k); if (!it) return;
  it.qtd += d; if (it.qtd <= 0) sacola = sacola.filter((i) => i !== it);
  salvarSacola(); rerenderSePrecisa();
}
function remover(k) { sacola = sacola.filter((i) => i.chave !== k); salvarSacola(); rerenderSePrecisa(); }
function rerenderSePrecisa() { const r = rotaAtual().rota; if (r === "sacola" || r === "checkout") render(); }

function totais(uf, comBanco = false) {
  const subtotal = sacola.reduce((s, i) => s + porId(i.id).preco * i.qtd, 0);
  let descKit = 0; const kits = [];
  Object.entries(KITS).forEach(([g, k]) => {
    const itens = sacola.filter((i) => porId(i.id).grupoKit === g);
    const n = itens.reduce((s, i) => s + i.qtd, 0);
    const q = Math.floor(n / k.qtd);
    if (!q) return;
    const d = q * (k.qtd * porId(itens[0].id).preco - k.preco);
    if (d > 0) { descKit += d; kits.push(`${q}× ${k.nome}`); }
  });
  const base = subtotal - descKit;
  // Cupom do banco (promoção de parcerias, só no Pix) substitui o cupom da loja
  const bancoOk = comBanco && banco && PROMO_LOJA?.banks?.[banco] ? banco : null;
  const descBanco = bancoOk ? base * PROMO_LOJA.percent / 100 : 0;
  const descCupom = !bancoOk && cupom && LOJA.cupons[cupom] ? base * LOJA.cupons[cupom] : 0;
  const paraFrete = base - descCupom;
  const liquido = paraFrete - descBanco;
  const gratis = paraFrete >= LOJA.freteGratisAcima;
  const frete = subtotal === 0 || gratis ? 0 : uf ? (LOJA.fretePorEstado[uf] ?? null) : null;
  return { subtotal, descKit, kits, descCupom, descBanco, banco: bancoOk, paraFrete, liquido, gratis, frete, total: liquido + (frete || 0), itens: sacola.reduce((s, i) => s + i.qtd, 0) };
}

/* Quanto falta para o próximo kit (dica de venda) */
function dicaKit() {
  for (const [g, k] of Object.entries(KITS)) {
    const n = sacola.filter((i) => porId(i.id).grupoKit === g).reduce((s, i) => s + i.qtd, 0) % k.qtd;
    if (n > 0) return `Adicione mais ${k.qtd - n} ${g === "camisa" ? (k.qtd - n > 1 ? "camisas" : "camisa") : (k.qtd - n > 1 ? "bonés" : "boné")} e pague ${brl(k.preco)} no ${k.nome.toLowerCase()}.`;
  }
  return "";
}

function toggleFav(id) {
  const on = !favs.includes(id);
  favs = on ? [...favs, id] : favs.filter((f) => f !== id);
  store.set("bv_favs", favs);
  $$(`[data-fav="${id}"]`).forEach((b) => { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); if (on && !reduzMovimento) { b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); } });
  atualizarContadores();
  avisar(on ? "Salvo nos favoritos ♥" : "Removido dos favoritos", on ? "#/favoritos" : null, "Ver favoritos");
  if (rotaAtual().rota === "favoritos") render();
}

function atualizarContadores() {
  const n = totais().itens;
  const c = $("#contador"); c.textContent = n; c.hidden = !n;
  if (n && !reduzMovimento) { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
  const f = $("#fav-contador"); f.textContent = favs.length; f.hidden = !favs.length;
}

function avisar(msg, link = "#/sacola", rotulo = "Ver sacola") {
  const t = $("#toast");
  t.innerHTML = `${esc(msg)}${link ? ` <a href="${link}">${rotulo} →</a>` : ""}`;
  t.classList.add("on"); clearTimeout(avisar.t);
  avisar.t = setTimeout(() => t.classList.remove("on"), 3000);
}

/* Animação: a foto "voa" até o ícone da sacola */
function voarParaSacola(img) {
  if (reduzMovimento || !img) return;
  const alvo = $(".sacola").getBoundingClientRect();
  const r = img.getBoundingClientRect();
  if (!r.width) return;
  const c = img.cloneNode();
  Object.assign(c.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", objectFit: "contain", zIndex: 999, borderRadius: "12px", pointerEvents: "none", transition: "all .6s cubic-bezier(.5,-.2,.3,1)" });
  document.body.appendChild(c);
  requestAnimationFrame(() => Object.assign(c.style, { left: alvo.left + alvo.width / 2 - 14 + "px", top: alvo.top + alvo.height / 2 - 14 + "px", width: "28px", height: "28px", opacity: ".4", borderRadius: "50%" }));
  setTimeout(() => c.remove(), 650);
}

/* ============ ÍCONES ============ */
const icone = {
  frete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  seguro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  cartao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  caixa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>',
  pincel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  seta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  olho: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  coracao: '<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  dado: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
  wpp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2s-.8 1-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.5l-.9-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.2 3.1c.2.2 2.2 3.4 5.4 4.7.8.3 1.4.5 1.8.6.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.3-1.3c1.4.8 3 1.3 4.7 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>'
};

/* ============ COMPONENTES ============ */
const estrelas = (p) => `<span class="estrelas" aria-label="Nota ${p.avaliacao}">★★★★★</span> <span class="nota">${p.avaliacao.toFixed(1)} · ${p.avaliacoes} avaliações</span>`;
const btnFav = (id, extra = "") => `<button type="button" class="fav ${favs.includes(id) ? "on" : ""} ${extra}" data-fav="${id}" aria-pressed="${favs.includes(id)}" aria-label="Favoritar">${icone.coracao}</button>`;

function precoHTML(p) {
  if (p.sobEncomenda) return `<p class="preco">Sob orçamento</p>`;
  const k = p.grupoKit && KITS[p.grupoKit];
  return `<p class="preco">${p.personalizavel ? "<small>a partir de</small> " : ""}${brl(p.preco)}</p>
    ${k ? `<p class="parcela">ou <strong>${k.nome.toLowerCase()} por ${brl(k.preco)}</strong></p>` : `<p class="parcela">ou 12× de ${brl(p.preco / 12)}</p>`}`;
}

function cartao(p) {
  const n = Object.values(p.variacoes)[0]?.length;
  const selo = p.sobEncomenda ? "Sob encomenda" : p.personalizavel ? "Personalize" : p.grupoKit ? `Kit 4 = ${brl(KITS[p.grupoKit].preco)}` : "";
  return `
    <article class="cartao revelar">
      <div class="cartao-img">
        <a href="#/produto/${p.id}" class="cartao-link" aria-label="${esc(p.nome)}">
          <img src="${p.imagens[0]}" alt="${esc(p.nome)}" loading="lazy" class="img-a">
          ${p.imagens[1] ? `<img src="${p.imagens[1]}" alt="" loading="lazy" class="img-b">` : ""}
        </a>
        ${selo ? `<span class="selo">${selo}</span>` : ""}
        ${btnFav(p.id)}
        ${p.sobEncomenda ? "" : `<button type="button" class="espiar" data-qv="${p.id}">${icone.olho} Espiar</button>`}
        ${p.fotoPor && n > 1 ? `<span class="qtd-opcoes">${n} ${p.fotoPor === "Estampa" ? "estampas" : "cores"}</span>` : ""}
      </div>
      <div class="cartao-info">
        <span class="cat">${p.linha === "Personalizados" ? "Personalizado" : "Linha " + p.linha}</span>
        <h3><a href="#/produto/${p.id}">${esc(p.nome)}</a></h3>
        ${precoHTML(p)}
      </div>
      ${p.sobEncomenda
        ? `<a class="btn-mini wpp" href="${wa(`Olá! Quero orçar: ${p.nome}.`)}" target="_blank" rel="noopener">Orçar no WhatsApp</a>`
        : p.personalizavel
          ? `<a class="btn-mini" href="#/personalizar?peca=${p.grupoKit}">Personalizar agora</a>`
          : `<button class="btn-mini" data-add="${p.id}">${Object.keys(p.variacoes).length ? "Escolher opções" : "Adicionar à sacola"}</button>`}
    </article>`;
}

const carrossel = (lista) => `
  <div class="carrossel">
    <button class="seta-car esq" data-car="-1" aria-label="Anterior">‹</button>
    <div class="trilho">${lista.map(cartao).join("")}</div>
    <button class="seta-car dir" data-car="1" aria-label="Próximo">›</button>
  </div>`;

function galeriaHTML(p) {
  return `
    <div class="galeria">
      <div class="palco" data-zoom>
        <img class="foto-principal" src="${p.imagens[0]}" alt="${esc(p.nome)}">
        <span class="selo-linha">${p.linha === "Personalizados" ? "Personalizável" : "Linha " + p.linha}</span>
        ${ponteiroFino ? '<span class="dica-zoom">Passe o mouse para ampliar</span>' : ""}
      </div>
      ${p.imagens.length > 1 && !p.fotoPor ? `<div class="miniaturas">${p.imagens.map((src, i) =>
        `<button type="button" class="mini ${i === 0 ? "ativo" : ""}" data-foto="${i}" aria-label="Foto ${i + 1}"><img src="${src}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    </div>`;
}

function formProduto(p) {
  if (p.sobEncomenda) return `<a class="btn btn-verde btn-largo" href="${wa(`Olá! Quero orçar: ${p.nome}. Minha ideia é: `)}" target="_blank" rel="noopener">${icone.wpp} Pedir orçamento no WhatsApp</a>`;
  return `
    ${p.personalizavel ? `<a class="btn btn-amarelo btn-largo brilho" href="#/personalizar?peca=${p.grupoKit}">✨ Abrir simulador de personalização</a><p class="ou">ou escolha só a cor base</p>` : ""}
    <form class="form-produto" data-id="${p.id}">
      ${Object.entries(p.variacoes).map(([nome, ops]) => `
        <fieldset class="variacao ${nome === p.fotoPor ? "com-foto" : ""}">
          <legend>${nome} · <span data-sel="${esc(nome)}">${esc(ops[0])}</span></legend>
          <div class="opcoes">
          ${ops.map((o, i) => `<label ${nome === p.fotoPor ? `title="${esc(o)}"` : ""}><input type="radio" name="${esc(nome)}" value="${esc(o)}" data-i="${i}" ${i === 0 ? "checked" : ""}>${
            nome === p.fotoPor ? `<span class="swatch"><img src="${p.imagens[i]}" alt="${esc(o)}" loading="lazy"></span>` : `<span>${esc(o)}</span>`}</label>`).join("")}
          </div>
        </fieldset>`).join("")}
      <div class="comprar">
        <div class="qtd"><button type="button" data-q="-1" aria-label="Diminuir">−</button><input class="qtd-input" type="number" min="1" max="50" value="1" aria-label="Quantidade"><button type="button" data-q="1" aria-label="Aumentar">+</button></div>
        <button class="btn btn-amarelo" type="submit">Adicionar à sacola</button>
        ${btnFav(p.id, "fav-grande")}
      </div>
      <button class="btn btn-contorno btn-largo comprar-agora" type="button">Comprar agora</button>
    </form>`;
}

function precoProduto(p) {
  const k = p.grupoKit && KITS[p.grupoKit];
  if (p.sobEncomenda) return `<p class="preco grande">Sob orçamento</p><p class="parcela">Resposta em minutos pelo WhatsApp</p>`;
  return `<p class="preco grande">${p.personalizavel ? "<small>a partir de</small> " : ""}${brl(p.preco)}</p>
    ${k ? `<p class="parcela kit">🔥 ${k.nome} por <strong>${brl(k.preco)}</strong> — <a href="#/kit?tipo=${p.grupoKit}">monte o seu</a></p>` : `<p class="parcela">ou até 12× de ${brl(p.preco / 12)} no cartão</p>`}`;
}

/* ============ PÁGINAS ============ */
function paginaInicio() {
  const destaques = PRODUTOS.filter((p) => p.destaque);
  const capa = { camisas: "img/camisa-pesca/1.jpg", bones: "img/bone-pesca/1.jpg", "botas-chapeus": "img/bota-chapeu/1.png", fivelas: "img/fivelas/1.png", personalizados: "img/camisa-personalizada/1.jpg" };
  const faixa = ["Frete grátis acima de " + brl(LOJA.freteGratisAcima), "Kit 4 camisas " + brl(KITS.camisa.preco), "Personalize com o seu nome", "Envio em 24h", "Proteção UV 50+", "Feito no Espírito Santo"];
  return `
    <section class="hero">
      <div class="hero-bg" aria-hidden="true"></div>
      <img src="img/marca/hero-model.png" alt="" class="hero-modelo" aria-hidden="true">
      <div class="hero-conteudo">
        <img src="img/marca/hero-logo.png" alt="BRAVUS Brasil — Estilo Agro, Pesca e Country" class="hero-logo">
        <div class="acoes hero-acoes">
          <a href="#/loja" class="btn btn-amarelo">Ver produtos ${icone.seta}</a>
          <a href="#/kit" class="btn btn-contorno-claro">Montar meu kit</a>
        </div>
      </div>
      <a href="#inicio-conteudo" class="rolar-dica" aria-label="Rolar para baixo"><span></span></a>
    </section>

    <div class="marquee" aria-hidden="true"><div class="marquee-trilho">${[...faixa, ...faixa].map((t) => `<span>${t}</span><b>✦</b>`).join("")}</div></div>

    <div class="faixa-confianca" id="inicio-conteudo">
      <div class="revelar">${icone.frete}<p><strong>Frete grátis</strong><span>acima de ${brl(LOJA.freteGratisAcima)}</span></p></div>
      <div class="revelar">${icone.seguro}<p><strong>Compra segura</strong><span>seus dados protegidos</span></p></div>
      <div class="revelar">${icone.cartao}<p><strong>Pix, cartão e boleto</strong><span>pague como preferir</span></p></div>
      <div class="revelar">${icone.caixa}<p><strong>Envio em 24h</strong><span>pós-confirmação</span></p></div>
      <div class="revelar">${icone.pincel}<p><strong>Personalização</strong><span>com a sua identidade</span></p></div>
    </div>

    <section class="bloco">
      <h2 class="titulo revelar">Nossas <span>categorias</span></h2>
      <div class="categorias">
        ${CATEGORIAS.map((c) => `
          <a href="#/loja?cat=${c.id}" class="cat-card revelar">
            <img src="${capa[c.id]}" alt="${c.nome}" loading="lazy">
            <div class="cat-overlay"><span class="cat-qtd">${PRODUTOS.filter((p) => p.categoria === c.id).length} produtos</span><span class="cat-nome">${c.nome}</span><span class="cat-link">Ver produtos ${icone.seta}</span></div>
          </a>`).join("")}
      </div>
    </section>

    <section class="bloco">
      <div class="bloco-topo revelar"><h2 class="titulo">Mais <span>vendidos</span></h2><a href="#/loja">Ver tudo →</a></div>
      ${carrossel(destaques)}
    </section>

    <section class="destaque-kit revelar">
      <div class="dk-texto">
        <span class="sobretitulo">Novo · Montador de kit</span>
        <h2>Monte o seu kit e <em>economize ${brl(KITS.camisa.qtd * 39.9 - KITS.camisa.preco)}</em></h2>
        <p>Escolha 4 estampas entre as linhas Pesca e Agro, veja a economia ao vivo e leve tudo por ${brl(KITS.camisa.preco)}. Bonés também: 4 por ${brl(KITS.bone.preco)}.</p>
        <div class="acoes"><a href="#/kit?tipo=camisa" class="btn btn-amarelo">Montar kit de camisas ${icone.seta}</a><a href="#/kit?tipo=bone" class="btn btn-contorno">Kit de bonés</a></div>
      </div>
      <div class="dk-slots" aria-hidden="true">
        ${["camisa-pesca/1.jpg", "camisa-agro/4.jpg", "camisa-pesca/8.jpg", "camisa-agro/9.jpg"].map((s, i) => `<div class="dk-slot" style="--i:${i}"><img src="img/${s}" alt="" loading="lazy"></div>`).join("")}
      </div>
    </section>

    <section class="linhas">
      <a href="#/loja?linha=Pesca" class="linha-card revelar" style="background-image:linear-gradient(90deg,rgba(0,0,0,.92) 25%,rgba(0,0,0,.3)),url('img/camisa-pesca/5.jpg')">
        <span class="sobretitulo">Linha</span><h3>Pesca</h3>
        <p>Tucunaré, pôr do sol e rio. Pra quem vive a água e não troca por nada.</p>
        <span class="cat-link">Ver linha Pesca ${icone.seta}</span>
      </a>
      <a href="#/loja?linha=Agro" class="linha-card revelar" style="background-image:linear-gradient(90deg,rgba(0,0,0,.92) 25%,rgba(0,0,0,.3)),url('img/camisa-agro/1.jpg')">
        <span class="sobretitulo">Linha</span><h3>Agro</h3>
        <p>Gado, trator, moinho e campo. A tradição de quem vive da terra.</p>
        <span class="cat-link">Ver linha Agro ${icone.seta}</span>
      </a>
    </section>

    <section class="destaque-perso revelar">
      <div class="dp-preview">
        <div class="sim-palco sim-camisa">
          <img src="img/camisa-personalizada/9.jpg" alt="Prévia de camisa personalizada">
          <div class="sim-texto pos-peito digitando" style="font-family:'Barlow Condensed';font-style:italic;font-weight:900;color:#f5b400" data-digitar='["FAZENDA SÃO JOÃO","TIME DO RIO","SEU NOME AQUI"]'></div>
        </div>
      </div>
      <div>
        <span class="sobretitulo">Simulador de personalização</span>
        <h2 class="titulo">Veja a sua camisa <span>antes de pedir</span></h2>
        <p>Digite o nome, escolha a cor da camisa, a fonte e a posição e veja a prévia na hora. Também dá pra subir o logo da fazenda ou do time.</p>
        <ol class="mini-passos"><li>Escolha a peça e a cor</li><li>Digite o texto e a fonte</li><li>Adicione à sacola</li></ol>
        <a href="#/personalizar" class="btn btn-amarelo">Abrir simulador ${icone.seta}</a>
      </div>
    </section>

    <section class="numeros-home">
      <div class="revelar"><strong data-contar="5000" data-prefixo="+">0</strong><span>clientes atendidos</span></div>
      <div class="revelar"><strong data-contar="27">0</strong><span>estados com entrega</span></div>
      <div class="revelar"><strong data-contar="4.9" data-decimais="1" data-sufixo="★">0</strong><span>avaliação média</span></div>
      <div class="revelar"><strong data-contar="50" data-sufixo="+">0</strong><span>estampas e modelos</span></div>
    </section>

    <section class="bloco">
      <h2 class="titulo revelar">Quem veste, <span>aprova</span></h2>
      <div class="depoimentos">
        <blockquote class="revelar"><span class="estrelas">★★★★★</span>“Usei a camisa Pesca numa semana inteira no rio. Sol pesado e nada de queimar — e a estampa continua novinha.”<cite>Rafael · Linhares/ES (exemplo)</cite></blockquote>
        <blockquote class="revelar"><span class="estrelas">★★★★★</span>“Fiz o kit de 4 camisas personalizadas com a marca da fazenda. Ficou top, a turma toda pediu.”<cite>Carlos · Rio Verde/GO (exemplo)</cite></blockquote>
        <blockquote class="revelar"><span class="estrelas">★★★★★</span>“O boné Agro com o cavalo é ainda mais bonito pessoalmente. Chegou rápido demais.”<cite>Juliana · Uberaba/MG (exemplo)</cite></blockquote>
      </div>
    </section>`;
}

function paginaLoja(params) {
  const cat = params.get("cat") || "";
  const linha = params.get("linha") || "";
  const ordem = params.get("ordem") || "relevancia";
  const q = norm((params.get("q") || "").trim());
  let lista = PRODUTOS.filter((p) => (!cat || p.categoria === cat) && (!linha || p.linha === linha) &&
    (!q || norm(p.nome + " " + p.resumo + " " + nomeCat(p.categoria) + " " + Object.values(p.variacoes).flat().join(" ")).includes(q)));
  if (ordem === "menor") lista = [...lista].sort((a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity));
  if (ordem === "maior") lista = [...lista].sort((a, b) => (b.preco ?? -1) - (a.preco ?? -1));
  if (ordem === "avaliados") lista = [...lista].sort((a, b) => b.avaliacoes - a.avaliacoes);
  const link = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); if (k === "cat") p.delete("linha"); p.delete("q"); return "#/loja?" + p; };
  const titulo = q ? `Busca: <span>“${esc(params.get("q"))}”</span>` : cat ? esc(nomeCat(cat)) : linha ? `Linha <span>${linha}</span>` : "Todos os <span>produtos</span>";
  return `
    <section class="pagina-topo">
      <nav class="trilha"><a href="#/">Início</a> / <span>Loja</span></nav>
      <h1 class="titulo">${titulo}</h1>
      <p class="nota">${lista.length} ${lista.length === 1 ? "produto" : "produtos"}</p>
    </section>
    <div class="filtros">
      <nav class="chips" aria-label="Categorias">
        <a href="${link("cat", "")}" class="${!cat && !linha ? "ativo" : ""}">Tudo</a>
        ${CATEGORIAS.map((c) => `<a href="${link("cat", c.id)}" class="${cat === c.id ? "ativo" : ""}">${c.nome}</a>`).join("")}
        <span class="sep"></span>
        ${["Pesca", "Agro", "Country"].map((l) => `<a href="${link("linha", linha === l ? "" : l)}" class="${linha === l ? "ativo" : ""}">Linha ${l}</a>`).join("")}
      </nav>
      <label class="ordenar">Ordenar
        <select id="ordem">
          ${[["relevancia", "Relevância"], ["avaliados", "Mais avaliados"], ["menor", "Menor preço"], ["maior", "Maior preço"]]
            .map(([v, t]) => `<option value="${v}" ${ordem === v ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </label>
    </div>
    ${(cat === "camisas" || cat === "bones") ? `<a class="faixa-kit revelar" href="#/kit?tipo=${cat === "camisas" ? "camisa" : "bone"}">🔥 <strong>${KITS[cat === "camisas" ? "camisa" : "bone"].nome} por ${brl(KITS[cat === "camisas" ? "camisa" : "bone"].preco)}</strong> — abra o montador de kit ${icone.seta}</a>` : ""}
    ${cat === "personalizados" ? `<a class="faixa-kit revelar" href="#/personalizar">✨ <strong>Simulador:</strong> veja sua camisa ou boné com o seu nome antes de pedir ${icone.seta}</a>` : ""}
    ${lista.length ? `<div class="grade">${lista.map(cartao).join("")}</div>`
      : `<div class="vazio"><p>Nada encontrado.</p><a class="btn btn-amarelo" href="#/loja">Ver todos</a></div>`}`;
}

function paginaProduto(id) {
  const p = porId(id);
  if (!p) return paginaNaoEncontrada();
  const rel = PRODUTOS.filter((x) => x.id !== p.id && (x.categoria === p.categoria || x.linha === p.linha)).slice(0, 8);
  return `
    <nav class="trilha"><a href="#/">Início</a> / <a href="#/loja?cat=${p.categoria}">${nomeCat(p.categoria)}</a> / <span>${esc(p.nome)}</span></nav>
    <section class="produto" data-produto="${p.id}">
      ${galeriaHTML(p)}
      <div class="produto-info">
        <span class="sobretitulo">${LOJA.nome} · ${p.linha === "Personalizados" ? "Linha Personalizada" : "Linha " + p.linha}</span>
        <h1>${esc(p.nome)}</h1>
        <p class="subtitulo">${esc(p.titulo)}</p>
        <p class="avaliacao">${estrelas(p)}</p>
        <p class="resumo">${esc(p.resumo)}</p>
        <div class="caixa-preco">${precoProduto(p)}</div>
        ${formProduto(p)}
        <ul class="garantias">
          <li>${icone.frete}<span><strong>Frete grátis</strong> acima de ${brl(LOJA.freteGratisAcima)}</span></li>
          <li>${icone.seguro}<span><strong>Compra segura</strong> dados protegidos</span></li>
          <li>${icone.caixa}<span><strong>Troca fácil</strong> até 30 dias</span></li>
        </ul>
        <details open><summary>Descrição</summary><p>${esc(p.descricao)}</p></details>
        <details><summary>Detalhes</summary><ul>${p.detalhes.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></details>
        <details><summary>Entrega e trocas</summary><p>Envio em até 24h após a confirmação do pagamento (peças personalizadas: 5 a 7 dias úteis de produção). Frete grátis acima de ${brl(LOJA.freteGratisAcima)}; abaixo disso, a partir de ${brl(19.9)} conforme o estado. Troca em até 30 dias.</p></details>
      </div>
    </section>
    <section class="bloco">
      <div class="bloco-topo"><h2 class="titulo">Você também <span>vai curtir</span></h2></div>
      ${carrossel(rel)}
    </section>`;
}

/* ---------- Montador de kit ---------- */
const kit = { tipo: "camisa", slots: [null, null, null, null], filtro: "Todas" };

function opcoesKit(tipo) {
  return PRODUTOS.filter((p) => p.grupoKit === tipo && !p.personalizavel).flatMap((p) =>
    p.variacoes[p.fotoPor].map((nome, i) => ({ id: p.id, nome, img: p.imagens[i], linha: p.linha, preco: p.preco })));
}

function paginaKit(params) {
  const tipo = params.get("tipo") === "bone" ? "bone" : "camisa";
  if (tipo !== kit.tipo) { kit.tipo = tipo; kit.slots = [null, null, null, null]; kit.filtro = "Todas"; }
  const K = KITS[tipo];
  return `
    <section class="pagina-topo">
      <nav class="trilha"><a href="#/">Início</a> / <span>Montador de kit</span></nav>
      <h1 class="titulo">Monte o seu <span>kit</span></h1>
      <p class="nota">Escolha ${K.qtd} ${tipo === "camisa" ? "camisas" : "bonés"} e leve tudo por ${brl(K.preco)}. Clique numa estampa para colocar no kit.</p>
      <div class="abas">
        <a href="#/kit?tipo=camisa" class="${tipo === "camisa" ? "ativo" : ""}">Kit de camisas · ${brl(KITS.camisa.preco)}</a>
        <a href="#/kit?tipo=bone" class="${tipo === "bone" ? "ativo" : ""}">Kit de bonés · ${brl(KITS.bone.preco)}</a>
      </div>
    </section>
    <div class="kit-layout">
      <div>
        <div class="chips kit-filtros">
          ${["Todas", "Pesca", "Agro"].map((f) => `<button type="button" data-kfiltro="${f}" class="${kit.filtro === f ? "ativo" : ""}">${f === "Todas" ? "Todas as estampas" : "Linha " + f}</button>`).join("")}
          <button type="button" class="aleatorio" id="kit-aleatorio">${icone.dado} Completar aleatório</button>
        </div>
        <div class="kit-grade" id="kit-grade"></div>
      </div>
      <aside class="kit-painel" id="kit-painel"></aside>
    </div>`;
}

function renderKitGrade() {
  const g = $("#kit-grade"); if (!g) return;
  const ops = opcoesKit(kit.tipo);
  g.innerHTML = ops.map((o, i) => {
    if (kit.filtro !== "Todas" && o.linha !== kit.filtro) return "";
    const n = kit.slots.filter((s) => s && s.id === o.id && s.nome === o.nome).length;
    return `<button type="button" class="kit-op ${n ? "escolhido" : ""}" data-kadd="${i}">
      <img src="${o.img}" alt="" loading="lazy">
      ${n ? `<span class="kit-n">${n}×</span>` : ""}
      <span class="kit-op-info"><small>Linha ${o.linha}</small>${esc(o.nome)}</span>
    </button>`;
  }).join("");
}

function renderKitPainel() {
  const el = $("#kit-painel"); if (!el) return;
  const K = KITS[kit.tipo];
  const cheios = kit.slots.filter(Boolean);
  const avulso = cheios.reduce((s, x) => s + x.preco, 0);
  const completo = cheios.length === K.qtd;
  const economia = completo ? avulso - K.preco : 0;
  el.innerHTML = `
    <h2>Seu kit</h2>
    <div class="kit-slots">
      ${kit.slots.map((s, i) => s ? `
        <div class="kit-slot cheio">
          <img src="${s.img}" alt="">
          <button type="button" class="kit-rm" data-krm="${i}" aria-label="Remover">×</button>
          <span class="kit-slot-nome">${esc(s.nome)}</span>
          ${kit.tipo === "camisa" ? `<select data-ktam="${i}" aria-label="Tamanho">${TAM_CAMISA.map((t) => `<option ${s.tam === t ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}
        </div>` : `<div class="kit-slot vazio-slot"><span>${i + 1}</span></div>`).join("")}
    </div>
    <div class="kit-progresso"><span style="--p:${(cheios.length / K.qtd) * 100}%"></span></div>
    <p class="nota centro">${completo ? "Kit completo! 🎉" : `${cheios.length} de ${K.qtd} escolhidos`}</p>
    <dl class="kit-contas">
      <dt>Preço avulso</dt><dd>${brl(cheios.length ? (completo ? avulso : cheios.length * cheios[0].preco) : 0)}</dd>
      <dt>Preço do kit</dt><dd>${completo ? brl(K.preco) : "—"}</dd>
      <dt class="eco">Você economiza</dt><dd class="eco" data-eco>${brl(economia)}</dd>
    </dl>
    <button class="btn btn-amarelo btn-largo" id="kit-add" ${completo ? "" : "disabled"}>${completo ? `Adicionar kit por ${brl(K.preco)}` : `Escolha mais ${K.qtd - cheios.length}`}</button>
    ${cheios.length ? `<button class="link centro limpar" id="kit-limpar" type="button">Limpar kit</button>` : ""}`;
}

function kitAdicionar(op) {
  const i = kit.slots.indexOf(null);
  if (i < 0) { avisar("Kit completo — remova uma peça para trocar", null); return false; }
  kit.slots[i] = { ...op, tam: "M" };
  renderKitGrade(); renderKitPainel();
  const slot = $$(".kit-slot")[i];
  if (slot && !reduzMovimento) slot.classList.add("entrou");
  return true;
}

/* ---------- Simulador de personalização ---------- */
const FONTES = {
  esportiva: { nome: "Esportiva", css: "font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:900" },
  country: { nome: "Country", css: "font-family:'Rye',serif;font-weight:400" },
  assinatura: { nome: "Assinatura", css: "font-family:'Kaushan Script',cursive;font-weight:400" }
};
const CORES_TEXTO = { Branco: "#ffffff", Preto: "#141414", Amarelo: "#f5b400", Dourado: "#c9a54a", Vermelho: "#c62828" };
const CORES_CAMISA_CLARAS = ["Amarelo", "Bege", "Cinza", "Branco"];
const CORES_BONE = { Branco: "#efefef", Cinza: "#8b8f96", Preto: "#1c1c1c", Verde: "#3d5a2c", Azul: "#203d74", Areia: "#cdb48a", Amarelo: "#f0bf14", Vermelho: "#b3201e", Vinho: "#6a1b2a", Roxo: "#5a2a85" };
const CORES_BONE_CLARAS = ["Branco", "Areia", "Amarelo", "Cinza"];
const perso = { peca: "camisa", cor: 8, texto: "", fonte: "esportiva", corTexto: "Amarelo", corManual: false, posicao: "Peito", tamanho: "M", qtd: 1, logo: null };

function coresDaPeca() { return perso.peca === "camisa" ? porId("camisa-personalizada").variacoes["Cor base"] : Object.keys(CORES_BONE); }

function paginaPersonalizar(params) {
  const peca = params.get("peca") === "bone" ? "bone" : "camisa";
  if (peca !== perso.peca) { perso.peca = peca; perso.cor = peca === "camisa" ? 8 : 2; perso.corManual = false; autoCorTexto(); }
  const cores = coresDaPeca();
  const prod = porId(peca === "camisa" ? "camisa-personalizada" : "bone-personalizado");
  return `
    <section class="pagina-topo">
      <nav class="trilha"><a href="#/">Início</a> / <a href="#/loja?cat=personalizados">Personalizados</a> / <span>Simulador</span></nav>
      <h1 class="titulo">Simulador de <span>personalização</span></h1>
      <p class="nota">Monte a sua peça e veja a prévia na hora. Depois do pedido, a gente confere a arte com você pelo WhatsApp antes de produzir.</p>
      <div class="abas">
        <a href="#/personalizar?peca=camisa" class="${peca === "camisa" ? "ativo" : ""}">Camisa · ${brl(39.9)}</a>
        <a href="#/personalizar?peca=bone" class="${peca === "bone" ? "ativo" : ""}">Boné · ${brl(25)}</a>
      </div>
    </section>
    <div class="sim-layout">
      <div class="sim-preview-col"><div id="sim-preview"></div><p class="nota centro">Prévia ilustrativa — a posição e o tamanho finais são conferidos com você.</p></div>
      <form class="sim-controles" id="form-sim">
        <fieldset class="variacao"><legend>Cor da ${peca === "camisa" ? "camisa" : "boné"} · <span id="sim-cor-nome">${cores[perso.cor]}</span></legend>
          <div class="opcoes cores-redondas">
            ${cores.map((c, i) => `<label title="${c}"><input type="radio" name="sim-cor" value="${i}" ${i === perso.cor ? "checked" : ""}><span class="bolinha" style="background:${peca === "camisa" ? corCamisaHex(c) : CORES_BONE[c]}"></span></label>`).join("")}
          </div>
        </fieldset>
        <label class="campo">Texto (nome, apelido, fazenda, time)
          <input id="sim-texto" maxlength="18" placeholder="Ex.: FAZENDA BOA VISTA" value="${esc(perso.texto)}">
          <small class="nota"><span id="sim-cont">${perso.texto.length}</span>/18 caracteres</small>
        </label>
        <fieldset class="variacao"><legend>Fonte</legend>
          <div class="opcoes">${Object.entries(FONTES).map(([k, f]) => `<label><input type="radio" name="sim-fonte" value="${k}" ${perso.fonte === k ? "checked" : ""}><span style="${f.css};font-size:1.05rem">${f.nome}</span></label>`).join("")}</div>
        </fieldset>
        <fieldset class="variacao"><legend>Cor do texto</legend>
          <div class="opcoes cores-redondas">${Object.entries(CORES_TEXTO).map(([n, h]) => `<label title="${n}"><input type="radio" name="sim-cortexto" value="${n}" ${perso.corTexto === n ? "checked" : ""}><span class="bolinha" style="background:${h}"></span></label>`).join("")}</div>
        </fieldset>
        ${peca === "camisa" ? `
        <fieldset class="variacao"><legend>Posição do texto</legend>
          <div class="opcoes">${["Peito", "Centro", "Barra"].map((p) => `<label><input type="radio" name="sim-pos" value="${p}" ${perso.posicao === p ? "checked" : ""}><span>${p}</span></label>`).join("")}</div>
        </fieldset>
        <fieldset class="variacao"><legend>Tamanho</legend>
          <div class="opcoes">${TAM_CAMISA.map((t) => `<label><input type="radio" name="sim-tam" value="${t}" ${perso.tamanho === t ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
        </fieldset>` : ""}
        <label class="campo upload">Logo ou brasão (opcional)
          <input type="file" id="sim-logo" accept="image/*">
          <span class="upload-btn">${perso.logo ? "✓ Logo carregado — trocar" : "＋ Enviar imagem do logo"}</span>
          ${perso.logo ? `<button type="button" class="link" id="sim-logo-rm">Remover logo</button>` : ""}
        </label>
        <div class="sim-total">
          <div><span class="nota">Preço</span><strong>${brl(prod.preco)}</strong><span class="nota">${KITS[peca].nome} por ${brl(KITS[peca].preco)}</span></div>
          <div class="qtd"><button type="button" data-q="-1" aria-label="Diminuir">−</button><input class="qtd-input" type="number" min="1" max="50" value="1" aria-label="Quantidade"><button type="button" data-q="1" aria-label="Aumentar">+</button></div>
        </div>
        <button class="btn btn-amarelo btn-largo" type="submit">Adicionar à sacola ${icone.seta}</button>
      </form>
    </div>`;
}

function corCamisaHex(nome) {
  return { Laranja: "#f07a12", Roxo: "#6b2bb5", Vermelho: "#cf1f1f", Amarelo: "#f2d61b", Bege: "#cbb79a", Azul: "#1d2f66", Verde: "#4a5a2f", Cinza: "#b9bcc0", Preto: "#1a1a1a", Branco: "#f4f4f4" }[nome] || "#888";
}

function autoCorTexto() {
  if (perso.corManual) return;
  const nome = coresDaPeca()[perso.cor];
  const clara = (perso.peca === "camisa" ? CORES_CAMISA_CLARAS : CORES_BONE_CLARAS).includes(nome);
  perso.corTexto = clara ? "Preto" : (nome === "Preto" ? "Amarelo" : "Branco");
}

function renderPreview() {
  const el = $("#sim-preview"); if (!el) return;
  const f = FONTES[perso.fonte];
  const cor = CORES_TEXTO[perso.corTexto];
  const texto = esc(perso.texto || "SEU NOME");
  const vazio = !perso.texto;
  if (perso.peca === "camisa") {
    const posLogo = perso.posicao === "Centro" ? "Peito" : "Centro";
    const largura = { Peito: 25, Centro: 58, Barra: 62 }[perso.posicao];
    const base = { Peito: 4.4, Centro: 7.5, Barra: 6 }[perso.posicao];
    const fator = perso.fonte === "country" ? 0.68 : perso.fonte === "assinatura" ? 0.58 : 0.5;
    const fs = Math.min(base, largura / (Math.max(4, (perso.texto || "SEU NOME").length) * fator));
    el.innerHTML = `
      <div class="sim-palco sim-camisa">
        <img src="${porId("camisa-personalizada").imagens[perso.cor]}" alt="Prévia da camisa">
        <div class="sim-texto pos-${perso.posicao.toLowerCase()} ${vazio ? "fantasma" : ""}" style="${f.css};color:${cor};font-size:${fs.toFixed(2)}cqw">${texto}</div>
        ${perso.logo ? `<img class="sim-logo pos-${posLogo.toLowerCase()}" src="${perso.logo}" alt="Logo">` : ""}
      </div>`;
  } else {
    const base = CORES_BONE[coresDaPeca()[perso.cor]];
    const tam = Math.max(22, Math.min(46, 360 / Math.max(6, (perso.texto || "SEU NOME").length)));
    const yTexto = perso.logo ? 172 : 148;
    el.innerHTML = `
      <div class="sim-palco sim-bone">
        <svg viewBox="0 0 400 320" role="img" aria-label="Prévia do boné">
          <defs>
            <radialGradient id="luz" cx="40%" cy="30%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
            <linearGradient id="aba" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
          </defs>
          <ellipse cx="200" cy="292" rx="150" ry="14" fill="#000" opacity=".45"/>
          <path d="M66 214 Q62 72 200 58 Q338 72 334 214 Z" fill="${base}"/>
          <path d="M66 214 Q62 72 200 58 Q338 72 334 214 Z" fill="url(#luz)"/>
          <path d="M200 60 L200 212 M200 60 Q132 96 120 213 M200 60 Q268 96 280 213" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="2"/>
          <circle cx="78" cy="168" r="4" fill="#000" opacity=".25"/><circle cx="322" cy="168" r="4" fill="#000" opacity=".25"/>
          <circle cx="200" cy="60" r="8" fill="${base}" stroke="#000" stroke-opacity=".25"/>
          ${perso.logo ? `<image href="${perso.logo}" x="160" y="84" width="80" height="62" preserveAspectRatio="xMidYMid meet"/>` : ""}
          <text x="200" y="${yTexto}" text-anchor="middle" dominant-baseline="middle" font-size="${tam}" fill="${cor}" opacity="${vazio ? ".45" : "1"}" style="${f.css};letter-spacing:1px">${texto}</text>
          <path d="M40 212 Q200 186 360 212 Q372 262 200 274 Q28 262 40 212 Z" fill="${base}"/>
          <path d="M40 212 Q200 186 360 212 Q372 262 200 274 Q28 262 40 212 Z" fill="url(#aba)"/>
          <path d="M62 222 Q200 200 338 222 M70 236 Q200 214 330 236" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.6" stroke-dasharray="5 4"/>
        </svg>
      </div>`;
  }
}

/* ---------- Sacola, checkout, outras páginas ---------- */
function resumoHTML(t, modo) {
  const faltam = LOJA.freteGratisAcima - t.paraFrete;
  const freteTxt = t.gratis ? "Grátis" : t.frete == null ? (modo === "checkout" ? "Informe o estado" : "Calculado no checkout") : brl(t.frete);
  const dica = dicaKit();
  return `
    <aside class="resumo-pedido">
      <h2>Resumo do pedido</h2>
      ${modo === "checkout" ? `<ul class="mini-itens">${sacola.map((i) => { const p = porId(i.id); return `<li><img src="${fotoDoItem(p, i.opcoes)}" alt=""><span>${i.qtd}× ${esc(p.nome)}<small>${esc(Object.values(i.opcoes).join(" · "))}</small></span><strong>${brl(p.preco * i.qtd)}</strong></li>`; }).join("")}</ul>` : ""}
      <dl>
        <dt>Subtotal (${t.itens} ${t.itens === 1 ? "item" : "itens"})</dt><dd>${brl(t.subtotal)}</dd>
        ${t.descKit ? `<dt>Desconto ${esc(t.kits.join(" + "))}</dt><dd class="desc">−${brl(t.descKit)}</dd>` : ""}
        ${t.descCupom ? `<dt>Cupom ${esc(cupom)}</dt><dd class="desc">−${brl(t.descCupom)}</dd>` : ""}
        ${t.descBanco ? `<dt>Cupom ${esc(PROMO_LOJA.banks[t.banco])} (−${PROMO_LOJA.percent}%)</dt><dd class="desc">−${brl(t.descBanco)}</dd>` : ""}
        <dt>Frete</dt><dd id="frete-valor">${freteTxt}</dd>
        <dt class="total">Total</dt><dd class="total" id="total-valor">${brl(t.total)}</dd>
      </dl>
      ${faltam > 0 ? `<p class="nota barra-frete">Faltam <strong>${brl(faltam)}</strong> para o frete grátis<span style="--p:${Math.max(0, Math.min(100, (t.paraFrete / LOJA.freteGratisAcima) * 100))}%"></span></p>` : `<p class="nota ok">✓ Você ganhou frete grátis</p>`}
      ${dica ? `<p class="nota dica">💡 ${dica}</p>` : ""}
      ${modo === "sacola" ? `
        <form id="form-cupom" class="cupom">
          <label class="sr" for="cupom">Cupom</label>
          <input id="cupom" placeholder="Cupom de desconto" value="${cupom ? esc(cupom) : ""}">
          <button class="btn btn-contorno" type="submit">Aplicar</button>
        </form>
        <p class="nota" id="cupom-msg">${cupom ? `Cupom ${esc(cupom)} aplicado.` : "Cupom de exemplo: BRAVUS10"}</p>
        <a class="btn btn-amarelo btn-largo" href="#/checkout">Finalizar compra ${icone.seta}</a>
        <a class="link centro" href="#/loja">Continuar comprando</a>` : ""}
    </aside>`;
}

function itemHTML(i, compacto = false) {
  const p = porId(i.id);
  const ops = Object.entries(i.opcoes).map(([k, v]) => `${k}: ${esc(v)}`).join(" · ");
  return `
    <li class="item ${compacto ? "compacto" : ""}">
      <a href="#/produto/${p.id}" class="item-img"><img src="${fotoDoItem(p, i.opcoes)}" alt="${esc(p.nome)}"></a>
      <div class="item-info">
        <h3><a href="#/produto/${p.id}">${esc(p.nome)}</a></h3>
        ${ops ? `<p class="nota">${ops}</p>` : ""}
        ${compacto ? "" : `<p class="nota">${brl(p.preco)} cada</p>`}
      </div>
      <div class="qtd pequeno">
        <button data-mq="${esc(i.chave)}" data-d="-1" aria-label="Diminuir">−</button><span>${i.qtd}</span><button data-mq="${esc(i.chave)}" data-d="1" aria-label="Aumentar">+</button>
      </div>
      <p class="item-total">${brl(p.preco * i.qtd)}</p>
      <button class="remover" data-rm="${esc(i.chave)}">Remover</button>
    </li>`;
}

function paginaSacola() {
  if (!sacola.length) return `
    <section class="vazio grande">
      <h1 class="titulo">Sua sacola está <span>vazia</span></h1>
      <p>Bora escolher uma camisa pra próxima pescaria?</p>
      <a class="btn btn-amarelo" href="#/loja">Ver produtos ${icone.seta}</a>
    </section>`;
  return `
    <section class="pagina-topo"><h1 class="titulo">Sua <span>sacola</span></h1></section>
    <div class="duas-col">
      <ul class="itens">${sacola.map((i) => itemHTML(i)).join("")}</ul>
      ${resumoHTML(totais(), "sacola")}
    </div>`;
}

function paginaFavoritos() {
  const lista = favs.map(porId).filter(Boolean);
  return `
    <section class="pagina-topo">
      <nav class="trilha"><a href="#/">Início</a> / <span>Favoritos</span></nav>
      <h1 class="titulo">Seus <span>favoritos</span></h1>
      <p class="nota">${lista.length ? `${lista.length} ${lista.length === 1 ? "produto salvo" : "produtos salvos"} neste aparelho` : ""}</p>
    </section>
    ${lista.length ? `<div class="grade">${lista.map(cartao).join("")}</div>`
      : `<div class="vazio"><p>Toque no ♥ de um produto para guardar aqui.</p><a class="btn btn-amarelo" href="#/loja">Ver produtos</a></div>`}`;
}

function paginaCheckout() {
  if (!sacola.length) { location.hash = "#/sacola"; return ""; }
  const c = store.get("bv_cliente", {});
  const v = (k) => esc(c[k] || "");
  return `
    <section class="pagina-topo">
      <nav class="trilha"><a href="#/sacola">Sacola</a> / <span>Finalizar</span></nav>
      <h1 class="titulo">Finalizar <span>compra</span></h1>
      <ol class="etapas"><li class="ok">Sacola</li><li class="atual">Dados e entrega</li><li>Pagamento</li><li>Confirmação</li></ol>
    </section>
    <div class="duas-col">
      <form id="form-checkout" class="formulario" novalidate>
        <fieldset>
          <legend><b>1</b> Seus dados</legend>
          <label>Nome completo<input name="nome" required autocomplete="name" value="${v("nome")}"></label>
          <div class="linha">
            <label>E-mail<input name="email" type="email" required autocomplete="email" value="${v("email")}"></label>
            <label>WhatsApp<input name="tel" required inputmode="tel" placeholder="(27) 90000-0000" autocomplete="tel" value="${v("tel")}"></label>
          </div>
          <label>CPF (para a nota fiscal)<input name="cpf" required inputmode="numeric" placeholder="000.000.000-00" maxlength="14" value="${v("cpf")}"></label>
        </fieldset>
        <fieldset>
          <legend><b>2</b> Entrega</legend>
          <div class="linha">
            <label class="curto">CEP<input name="cep" required inputmode="numeric" placeholder="00000-000" maxlength="9" value="${v("cep")}"></label>
            <label>Rua<input name="rua" required autocomplete="address-line1" value="${v("rua")}"></label>
          </div>
          <div class="linha">
            <label class="curto">Número<input name="numero" required value="${v("numero")}"></label>
            <label>Complemento<input name="comp" value="${v("comp")}"></label>
          </div>
          <div class="linha">
            <label>Bairro<input name="bairro" required value="${v("bairro")}"></label>
            <label>Cidade<input name="cidade" required value="${v("cidade")}"></label>
            <label class="curto">UF
              <select name="uf" required>
                <option value="">—</option>
                ${Object.keys(LOJA.fretePorEstado).sort().map((uf) => `<option ${c.uf === uf ? "selected" : ""}>${uf}</option>`).join("")}
              </select>
            </label>
          </div>
          <p class="nota" id="cep-msg">Digite o CEP para preencher o endereço automaticamente.</p>
        </fieldset>
        <fieldset>
          <legend><b>3</b> Observações</legend>
          <label>Observações (arte da personalização, horário pra contato…)<textarea name="obs" rows="3">${v("obs")}</textarea></label>
        </fieldset>
        <label class="consentimento"><input type="checkbox" name="lgpd" required ${c.lgpd ? "checked" : ""}><span>Concordo que a ${LOJA.nome} use meus dados para processar o pedido, emitir a nota e falar comigo sobre a entrega, conforme a <a href="#/contato">política de privacidade</a> (LGPD).</span></label>
        <p class="erro" id="erro-checkout" role="alert"></p>
        <button class="btn btn-amarelo btn-largo" type="submit" name="acao" value="pagar">⚡ Pagar com Pix ${icone.seta}</button>
        <button class="btn btn-contorno btn-largo" type="submit" name="acao" value="whatsapp">${icone.wpp} Prefiro fechar pelo WhatsApp</button>
        <p class="nota centro">Pix: aprovação na hora${PROMO_LOJA ? ` e <strong>${PROMO_LOJA.percent}% de desconto</strong> pagando com ${Object.values(PROMO_LOJA.banks).join(" ou ")}` : ""}. No WhatsApp, o pedido vai pronto e a gente combina o pagamento.</p>
      </form>
      ${resumoHTML(totais(c.uf), "checkout")}
    </div>`;
}

function paginaPedido() {
  const p = store.get("bv_ultimo_pedido", null);
  if (!p) return paginaNaoEncontrada();
  if (p.pago) return `
    <section class="confirmacao">
      <div class="check pulsa">✓</div>
      <h1 class="titulo">Pagamento <span>aprovado!</span></h1>
      <p>Valeu, ${esc(p.nome.split(" ")[0])}! Seu pedido <strong>${esc(p.numero)}</strong> está confirmado.</p>
      <ol class="rastreio">
        <li class="ok"><b>✓</b>Pagamento aprovado<small>agora</small></li>
        <li class="atual"><b>2</b>Separando / produzindo<small>até 24h (personalizados: 5 a 7 dias)</small></li>
        <li><b>3</b>Enviado<small>código de rastreio por WhatsApp e e-mail</small></li>
        <li><b>4</b>Entregue<small>em casa</small></li>
      </ol>
      <div class="caixa">
        <ul>${p.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
        <p><strong>Total:</strong> ${brl(p.total)}</p>
        <p><strong>Pagamento:</strong> ${esc(p.pag)}</p>
        <p><strong>Entrega:</strong> ${esc(p.endereco)}</p>
      </div>
      <div class="acoes centro">
        <a class="btn btn-amarelo" href="#/loja">Continuar comprando</a>
        <a class="btn btn-contorno" href="${wa(`Olá! Fiz o pedido ${p.numero} no site e queria acompanhar.`)}" target="_blank" rel="noopener">${icone.wpp} Falar com a loja</a>
      </div>
    </section>`;
  return `
    <section class="confirmacao">
      <div class="check">✓</div>
      <h1 class="titulo">Pedido <span>${esc(p.numero)}</span></h1>
      <p>Valeu, ${esc(p.nome.split(" ")[0])}! Seu pedido foi montado e aberto no WhatsApp. É só <strong>enviar a mensagem</strong> que a gente confirma e manda o pagamento.</p>
      <div class="caixa">
        <ul>${p.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
        <p><strong>Total:</strong> ${brl(p.total)} · <strong>Pagamento:</strong> ${esc(p.pag)}</p>
        <p><strong>Entrega:</strong> ${esc(p.endereco)}</p>
      </div>
      <div class="acoes centro">
        <a class="btn btn-verde" href="${wa(p.mensagem)}" target="_blank" rel="noopener">${icone.wpp} Abrir WhatsApp de novo</a>
        <a class="btn btn-contorno" href="#/loja">Voltar à loja</a>
      </div>
    </section>`;
}

function paginaSobre() {
  return `
    <section class="sobre">
      <span class="sobretitulo">${LOJA.nome} · Nossa história</span>
      <h1 class="titulo">Nascidos no <span>Espírito Santo</span></h1>
      <p class="lead revelar">A BRAVUS não nasceu numa sala de reunião. Nasceu numa estrada de terra, numa beira de rio, num curral ao amanhecer — do jeito capixaba de viver, com raiz, coragem e orgulho de vestir o que acredita.</p>
      <div class="numeros">
        <div class="revelar"><strong data-contar="10" data-sufixo="+">0</strong>linhas de produto</div>
        <div class="revelar"><strong data-contar="5" data-sufixo="k+">0</strong>clientes atendidos</div>
        <div class="revelar"><strong data-contar="27">0</strong>estados com entrega</div>
        <div class="revelar"><strong data-contar="4.9" data-decimais="1" data-sufixo="★">0</strong>avaliação média</div>
      </div>
      <h2 class="revelar">De uma paixão à marca</h2>
      <p class="revelar">Tudo começou em Vila Velha, numa garagem, com um sonho simples: vestir o povo do campo com camisas que durassem de verdade — que aguentassem sol, chuva, suor e trabalho pesado, sem perder o estilo. Primeiro veio a linha Pesca, com tucunaré, pôr do sol e rio. Depois a Agro, com gado, trator e moinho. Depois a Country, com botas, chapéus e fivelas.</p>
      <p class="revelar">A marca cresceu porque quem vestia voltava pra comprar mais. Hoje a BRAVUS entrega em todo o Brasil, mas mantém o mesmo jeito capixaba de fazer negócio: atendimento humano, qualidade de verdade e preço justo.</p>
      <div class="linha-tempo">
        <div class="revelar"><b>01</b><h3>Linha Pesca</h3><p>Tucunaré, pôr do sol e rio.</p></div>
        <div class="revelar"><b>02</b><h3>Linha Agro</h3><p>Gado, trator, moinho e campo.</p></div>
        <div class="revelar"><b>03</b><h3>Linha Country</h3><p>Bonés, botas e fivelas.</p></div>
        <div class="revelar"><b>04</b><h3>Personalizados</h3><p>Sua marca, seu nome, seu estilo.</p></div>
      </div>
      <div class="pilares">
        <div class="revelar"><h3>Raiz de verdade</h3><p>Conhecemos o barro, o sal e o sol das 5 da manhã. Cada estampa nasce de história real.</p></div>
        <div class="revelar"><h3>Qualidade sem enrolação</h3><p>Tecido respirável, proteção UV, secagem rápida e costura reforçada.</p></div>
        <div class="revelar"><h3>Preço justo</h3><p>Vendemos direto, sem atravessador: camisa boa a partir de ${brl(39.9)}.</p></div>
      </div>
      <div class="acoes"><a href="#/loja" class="btn btn-amarelo">Ver produtos ${icone.seta}</a><a href="#/contato" class="btn btn-contorno">Fale com a gente</a></div>
    </section>`;
}

function paginaContato() {
  return `
    <section class="contato">
      <div>
        <span class="sobretitulo">Atendimento</span>
        <h1 class="titulo">Fale com a <span>BRAVUS</span></h1>
        <p>Dúvida de tamanho, prazo, kit ou personalização? Chama no WhatsApp — a gente responde rápido.</p>
        <ul class="contatos">
          <li><strong>WhatsApp</strong><a href="${wa("Olá! Vim pelo site da BRAVUS.")}" target="_blank" rel="noopener">Chamar agora</a></li>
          <li><strong>E-mail</strong><a href="mailto:${LOJA.email}">${LOJA.email}</a></li>
          <li><strong>Endereço</strong><span>${LOJA.endereco}</span></li>
        </ul>
        <h2>Perguntas frequentes</h2>
        <details><summary>Qual o prazo de entrega?</summary><p>Enviamos em até 24h após a confirmação do pagamento. Peças personalizadas têm 5 a 7 dias úteis de produção.</p></details>
        <details><summary>Como funciona o kit?</summary><p>A cada 4 camisas na sacola você paga ${brl(KITS.camisa.preco)}; a cada 4 bonés, ${brl(KITS.bone.preco)}. Pode misturar linhas e estampas — o desconto é automático. Use o <a class="link-inline" href="#/kit">montador de kit</a>.</p></details>
        <details><summary>Quanto custa o frete?</summary><p>Grátis acima de ${brl(LOJA.freteGratisAcima)}. Abaixo disso: Sudeste ${brl(19.9)}, Sul e Centro-Oeste ${brl(24.9)}, Nordeste ${brl(29.9)} e Norte ${brl(39.9)}.</p></details>
        <details><summary>Como faço a troca?</summary><p>Você tem até 30 dias. Chama a gente no WhatsApp com o número do pedido.</p></details>
        <details><summary>Meus dados estão seguros?</summary><p>Só usamos o necessário para vender e entregar seu produto, nunca vendemos seus dados e você pode pedir a exclusão a qualquer momento (LGPD).</p></details>
      </div>
      <form id="form-contato" class="formulario">
        <fieldset>
          <legend>Mande uma mensagem</legend>
          <label>Nome<input name="nome" required></label>
          <label>Mensagem<textarea name="msg" rows="6" required></textarea></label>
          <button class="btn btn-verde" type="submit">${icone.wpp} Enviar pelo WhatsApp</button>
        </fieldset>
      </form>
    </section>`;
}

const paginaNaoEncontrada = () => `<section class="vazio grande"><h1 class="titulo">Página não <span>encontrada</span></h1><a class="btn btn-amarelo" href="#/">Voltar ao início</a></section>`;

/* ============ GAVETA (sacola lateral) e MODAL ============ */
function renderGaveta() {
  const corpo = $("#gaveta-corpo"); const pe = $("#gaveta-pe");
  const t = totais();
  $("#gaveta-qtd").textContent = t.itens ? `(${t.itens})` : "";
  if (!sacola.length) {
    corpo.innerHTML = `<div class="vazio"><p>Sua sacola está vazia.</p><a class="btn btn-amarelo" href="#/loja">Ver produtos</a></div>`;
    pe.innerHTML = ""; return;
  }
  const faltam = LOJA.freteGratisAcima - t.liquido;
  const dica = dicaKit();
  corpo.innerHTML = `
    <div class="g-frete">${faltam > 0 ? `Faltam <strong>${brl(faltam)}</strong> para o frete grátis` : "✓ Você ganhou <strong>frete grátis</strong>"}<span style="--p:${Math.min(100, (t.liquido / LOJA.freteGratisAcima) * 100)}%"></span></div>
    ${dica ? `<p class="g-dica">💡 ${dica} <a href="#/kit">Montar kit</a></p>` : ""}
    <ul class="itens">${sacola.map((i) => itemHTML(i, true)).join("")}</ul>`;
  pe.innerHTML = `
    <dl>
      <dt>Subtotal</dt><dd>${brl(t.subtotal)}</dd>
      ${t.descKit ? `<dt>Desconto ${esc(t.kits.join(" + "))}</dt><dd class="desc">−${brl(t.descKit)}</dd>` : ""}
      ${t.descCupom ? `<dt>Cupom ${esc(cupom)}</dt><dd class="desc">−${brl(t.descCupom)}</dd>` : ""}
      <dt class="total">Total (sem frete)</dt><dd class="total">${brl(t.liquido)}</dd>
    </dl>
    <a class="btn btn-amarelo btn-largo" href="#/checkout">Finalizar compra ${icone.seta}</a>
    <a class="link centro" href="#/sacola">Ver sacola completa</a>`;
}
function abrirGaveta() { renderGaveta(); document.body.classList.add("gaveta-aberta"); $("#gaveta").setAttribute("aria-hidden", "false"); setTimeout(() => $("#gaveta .fechar").focus(), 50); }
function fecharGaveta() { document.body.classList.remove("gaveta-aberta"); $("#gaveta").setAttribute("aria-hidden", "true"); }

function abrirEspiar(id) {
  const p = porId(id); if (!p) return;
  $("#modal-corpo").innerHTML = `
    <div class="qv" data-produto="${p.id}">
      ${galeriaHTML(p)}
      <div class="produto-info">
        <span class="sobretitulo">${p.linha === "Personalizados" ? "Personalizado" : "Linha " + p.linha}</span>
        <h2>${esc(p.nome)}</h2>
        <p class="avaliacao">${estrelas(p)}</p>
        <div class="caixa-preco">${precoProduto(p)}</div>
        ${formProduto(p)}
        <a class="link" href="#/produto/${p.id}">Ver todos os detalhes →</a>
      </div>
    </div>`;
  document.body.classList.add("modal-aberto");
  $("#modal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#modal .fechar").focus(), 50);
}
function fecharModal() { document.body.classList.remove("modal-aberto"); $("#modal").setAttribute("aria-hidden", "true"); }

/* ============ EFEITOS ============ */
const observador = "IntersectionObserver" in window && !reduzMovimento ? new IntersectionObserver((ents) => {
  ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visivel"); if (e.target.querySelector("[data-contar]") || e.target.matches("[data-contar]")) contar(e.target); observador.unobserve(e.target); } });
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }) : null;

function ativarRevelar(raiz = app) {
  // atraso escalonado para itens de grade
  $$(".grade, .trilho, .categorias, .depoimentos, .faixa-confianca, .numeros-home, .numeros, .pilares, .linha-tempo", raiz).forEach((g) =>
    [...g.children].forEach((c, i) => c.style.setProperty("--atraso", `${(i % 5) * 70}ms`)));
  $$(".revelar:not(.visivel)", raiz).forEach((el) => {
    if (observador) observador.observe(el); else { el.classList.add("visivel"); contar(el); }
  });
  clearTimeout(ativarRevelar.t);
  ativarRevelar.t = setTimeout(revelarNaTela, 900);
}

/* Reserva: garante que o que já está na tela apareça mesmo se o observador falhar */
function revelarNaTela() {
  $$(".revelar:not(.visivel)").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.95 && r.bottom > 0) { el.classList.add("visivel"); contar(el); observador?.unobserve(el); }
  });
}
addEventListener("scroll", () => { clearTimeout(revelarNaTela.t); revelarNaTela.t = setTimeout(revelarNaTela, 120); }, { passive: true });

function contar(el) {
  $$("[data-contar]", el).concat(el.matches?.("[data-contar]") ? [el] : []).forEach((n) => {
    if (n.dataset.feito) return; n.dataset.feito = 1;
    const alvo = +n.dataset.contar, dec = +(n.dataset.decimais || 0), pre = n.dataset.prefixo || "", suf = n.dataset.sufixo || "";
    const fmt = (v) => pre + v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    if (reduzMovimento) { n.textContent = fmt(alvo); return; }
    const t0 = performance.now(), dur = 1400;
    const passo = (t) => { const k = Math.min(1, (t - t0) / dur); n.textContent = fmt(alvo * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
}

/* Texto que se digita sozinho (vitrine do simulador) */
function ativarDigitacao() {
  $$("[data-digitar]").forEach((el) => {
    const frases = JSON.parse(el.dataset.digitar);
    if (reduzMovimento) { el.textContent = frases[0]; return; }
    let f = 0, c = 0, apagando = false;
    const tick = () => {
      if (!document.body.contains(el)) return;
      const alvo = frases[f];
      c += apagando ? -1 : 1;
      el.textContent = alvo.slice(0, c);
      let espera = apagando ? 45 : 95;
      if (!apagando && c === alvo.length) { apagando = true; espera = 1600; }
      else if (apagando && c === 0) { apagando = false; f = (f + 1) % frases.length; espera = 300; }
      setTimeout(tick, espera);
    };
    tick();
  });
}

/* Parallax do banner e topo que encolhe */
let ticking = false;
function aoRolar() {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    const y = scrollY;
    document.body.classList.toggle("rolou", y > 30);
    const hero = $(".hero");
    if (hero && !reduzMovimento && y < innerHeight * 1.2) hero.style.setProperty("--sy", y);
    ticking = false;
  });
}
addEventListener("scroll", aoRolar, { passive: true });

document.addEventListener("pointermove", (e) => {
  const hero = e.target.closest?.(".hero");
  if (!hero || reduzMovimento || e.pointerType !== "mouse") return;
  const r = hero.getBoundingClientRect();
  hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
  hero.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
});

/* Zoom na foto do produto */
document.addEventListener("pointermove", (e) => {
  const palco = e.target.closest?.("[data-zoom]");
  if (!palco || e.pointerType !== "mouse") return;
  const r = palco.getBoundingClientRect();
  const img = $(".foto-principal", palco);
  img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  palco.classList.add("zoom");
});
document.addEventListener("pointerout", (e) => {
  const palco = e.target.closest?.("[data-zoom]");
  if (palco && !palco.contains(e.relatedTarget)) palco.classList.remove("zoom");
});

/* Carrossel arrastável */
let arrasto = null;
document.addEventListener("pointerdown", (e) => {
  const tr = e.target.closest(".trilho");
  if (!tr || e.pointerType !== "mouse" || e.button !== 0) return;
  arrasto = { tr, x: e.clientX, sl: tr.scrollLeft, moveu: false };
});
document.addEventListener("pointermove", (e) => {
  if (!arrasto) return;
  const dx = e.clientX - arrasto.x;
  if (Math.abs(dx) > 6) { arrasto.moveu = true; arrasto.tr.classList.add("arrastando"); }
  if (arrasto.moveu) arrasto.tr.scrollLeft = arrasto.sl - dx;
});
document.addEventListener("pointerup", () => {
  if (!arrasto) return;
  const a = arrasto; arrasto = null;
  a.tr.classList.remove("arrastando");
  if (a.moveu) { const bloq = (ev) => { ev.preventDefault(); ev.stopPropagation(); }; a.tr.addEventListener("click", bloq, { capture: true, once: true }); setTimeout(() => a.tr.removeEventListener("click", bloq, { capture: true }), 50); }
});
document.addEventListener("dragstart", (e) => { if (e.target.closest(".trilho")) e.preventDefault(); });

/* ============ ROTEADOR ============ */
function rotaAtual() {
  const [caminho, query = ""] = (location.hash.slice(1) || "/").split("?");
  const partes = caminho.split("/").filter(Boolean);
  return { rota: partes[0] || "", partes, params: new URLSearchParams(query) };
}

function render() {
  const { rota, partes, params } = rotaAtual();
  const paginas = {
    "": paginaInicio, loja: () => paginaLoja(params), produto: () => paginaProduto(partes[1]),
    kit: () => paginaKit(params), personalizar: () => paginaPersonalizar(params), favoritos: paginaFavoritos,
    sacola: paginaSacola, checkout: paginaCheckout, pagamento: paginaPagamento, pedido: paginaPedido, sobre: paginaSobre, contato: paginaContato
  };
  app.innerHTML = (paginas[rota] || paginaNaoEncontrada)();
  if (!reduzMovimento) { app.classList.remove("entrando"); void app.offsetWidth; app.classList.add("entrando"); }
  const cat = params.get("cat");
  $$(".menu a").forEach((a) => {
    const h = a.getAttribute("href");
    a.classList.toggle("ativo", rota === "loja" ? h === "#/loja" + (cat ? "?cat=" + cat : "") : h === "#/" + rota);
  });
  document.body.classList.remove("menu-aberto");
  document.body.classList.toggle("na-home", rota === "");
  const t = { loja: "Loja", produto: porId(partes[1])?.nome, kit: "Montador de kit", personalizar: "Simulador de personalização", favoritos: "Favoritos", sacola: "Sacola", checkout: "Finalizar compra", pagamento: "Pagamento", conta: "Minha conta", pedido: "Pedido", sobre: "Sobre nós", contato: "Contato" }[rota];
  document.title = (t ? t + " · " : "") + LOJA.nome + " — " + LOJA.slogan;
  if (rota === "kit") { renderKitGrade(); renderKitPainel(); }
  if (rota === "personalizar") renderPreview();
  if (rota === "pagamento") iniciarPagamento();
  ativarRevelar(); ativarDigitacao(); aoRolar();
}

let rotaAnterior = "";
addEventListener("hashchange", () => {
  if (location.hash === "#inicio-conteudo") { history.replaceState(null, "", "#/"); $("#inicio-conteudo")?.scrollIntoView({ behavior: reduzMovimento ? "auto" : "smooth" }); return; }
  fecharGaveta(); fecharModal();
  const r = location.hash.split("?")[0];
  const mesmaPagina = r === rotaAnterior && !r.startsWith("#/loja") && !r.startsWith("#/kit") && !r.startsWith("#/personalizar");
  render();
  if (!mesmaPagina) scrollTo({ top: 0, behavior: "instant" });
  rotaAnterior = r;
});

/* ============ EVENTOS ============ */
function opcoesDoForm(f, p) {
  const o = {};
  Object.keys(p.variacoes).forEach((k) => { o[k] = $$("input[type=radio]", f).find((i) => i.name === k && i.checked).value; });
  return o;
}
function trocarFoto(cont, i) {
  const p = porId(cont?.dataset.produto); const img = cont && $(".foto-principal", cont);
  if (!p || !img || !p.imagens[i]) return;
  img.classList.add("trocando");
  setTimeout(() => { img.src = p.imagens[i]; img.classList.remove("trocando"); }, reduzMovimento ? 0 : 120);
  $$(".mini", cont).forEach((m) => m.classList.toggle("ativo", +m.dataset.foto === i));
}

document.addEventListener("click", (e) => {
  const t = e.target;
  const fav = t.closest("[data-fav]"); if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav); return; }
  const qv = t.closest("[data-qv]"); if (qv) { abrirEspiar(qv.dataset.qv); return; }
  const add = t.closest("[data-add]");
  if (add) {
    const p = porId(add.dataset.add);
    if (Object.keys(p.variacoes).length) abrirEspiar(p.id);
    else adicionar(p.id, {}, 1, { origem: add.closest(".cartao")?.querySelector(".img-a") });
    return;
  }
  const car = t.closest("[data-car]");
  if (car) { const tr = car.parentElement.querySelector(".trilho"); tr.scrollBy({ left: +car.dataset.car * tr.clientWidth * 0.85, behavior: "smooth" }); return; }
  const mini = t.closest("[data-foto]"); if (mini) { trocarFoto(mini.closest("[data-produto]"), +mini.dataset.foto); return; }
  const q = t.closest("[data-q]");
  if (q) { const i = $(".qtd-input", q.closest(".qtd")); i.value = Math.min(50, Math.max(1, (+i.value || 1) + +q.dataset.q)); return; }
  const mq = t.closest("[data-mq]"); if (mq) return mudarQtd(mq.dataset.mq, +mq.dataset.d);
  const rm = t.closest("[data-rm]"); if (rm) return remover(rm.dataset.rm);
  const ca = t.closest(".comprar-agora");
  if (ca) {
    const f = ca.closest(".form-produto"); const p = porId(f.dataset.id);
    adicionar(p.id, opcoesDoForm(f, p), Math.max(1, +$(".qtd-input", f).value || 1), { abrir: false });
    location.hash = "#/checkout"; return;
  }
  // montador de kit
  const kadd = t.closest("[data-kadd]"); if (kadd) { kitAdicionar(opcoesKit(kit.tipo)[+kadd.dataset.kadd]); return; }
  const krm = t.closest("[data-krm]"); if (krm) { kit.slots[+krm.dataset.krm] = null; renderKitGrade(); renderKitPainel(); return; }
  const kf = t.closest("[data-kfiltro]"); if (kf) { kit.filtro = kf.dataset.kfiltro; $$("[data-kfiltro]").forEach((b) => b.classList.toggle("ativo", b === kf)); renderKitGrade(); return; }
  if (t.closest("#kit-aleatorio")) {
    const ops = opcoesKit(kit.tipo).filter((o) => kit.filtro === "Todas" || o.linha === kit.filtro);
    let vazios = kit.slots.filter((s) => !s).length;
    if (!vazios) { avisar("Kit já está completo", null); return; }
    const embaralhadas = [...ops].sort(() => Math.random() - 0.5);
    embaralhadas.slice(0, vazios).forEach((o, i) => setTimeout(() => kitAdicionar(o), reduzMovimento ? 0 : i * 160));
    return;
  }
  if (t.closest("#kit-limpar")) { kit.slots = [null, null, null, null]; renderKitGrade(); renderKitPainel(); return; }
  if (t.closest("#kit-add")) {
    const K = KITS[kit.tipo];
    if (kit.slots.some((s) => !s)) return;
    kit.slots.forEach((s) => { const p = porId(s.id); adicionar(s.id, kit.tipo === "camisa" ? { [p.fotoPor]: s.nome, Tamanho: s.tam } : { [p.fotoPor]: s.nome }, 1, { abrir: false }); });
    kit.slots = [null, null, null, null]; renderKitGrade(); renderKitPainel();
    abrirGaveta(); avisar(`${K.nome} adicionado — ${brl(K.preco)}`);
    return;
  }
  if (t.closest("#sim-logo-rm")) { perso.logo = null; render(); return; }
  // gaveta / modal / menu
  if (t.closest("[data-abrir-sacola]")) { e.preventDefault(); abrirGaveta(); return; }
  if (t.closest("[data-fechar]")) { fecharGaveta(); fecharModal(); return; }
  if (t.closest("#btn-menu")) document.body.classList.toggle("menu-aberto");
  if (!t.closest(".busca")) $("#busca-res").classList.remove("on");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { fecharGaveta(); fecharModal(); $("#busca-res").classList.remove("on"); }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "ordem") { const [c, q = ""] = location.hash.split("?"); const p = new URLSearchParams(q); p.set("ordem", t.value); location.hash = c + "?" + p; }
  if (t.type === "radio" && t.closest(".form-produto")) {
    const f = t.closest(".form-produto");
    const sel = $$("[data-sel]", f).find((s) => s.dataset.sel === t.name);
    if (sel) sel.textContent = t.value;
    if (t.closest(".com-foto")) trocarFoto(f.closest("[data-produto]"), +t.dataset.i);
  }
  if (t.dataset.ktam != null) kit.slots[+t.dataset.ktam].tam = t.value;
  if (t.name === "uf" && t.closest("#form-checkout")) atualizarFrete(t.value);
  // simulador
  if (t.name === "sim-cor") { perso.cor = +t.value; autoCorTexto(); $("#sim-cor-nome").textContent = coresDaPeca()[perso.cor]; $$('input[name="sim-cortexto"]').forEach((r) => (r.checked = r.value === perso.corTexto)); renderPreview(); }
  if (t.name === "sim-fonte") { perso.fonte = t.value; renderPreview(); }
  if (t.name === "sim-cortexto") { perso.corTexto = t.value; perso.corManual = true; renderPreview(); }
  if (t.name === "sim-pos") { perso.posicao = t.value; renderPreview(); }
  if (t.name === "sim-tam") perso.tamanho = t.value;
  if (t.id === "sim-logo" && t.files[0]) {
    const arq = t.files[0];
    if (arq.size > 4 * 1024 * 1024) { avisar("Imagem muito grande (máx. 4 MB)", null); return; }
    const r = new FileReader();
    r.onload = () => { perso.logo = r.result; render(); };
    r.readAsDataURL(arq);
  }
});

function atualizarFrete(uf) {
  const t = totais(uf);
  $("#frete-valor").textContent = t.gratis ? "Grátis" : t.frete == null ? "Informe o estado" : brl(t.frete);
  $("#total-valor").textContent = brl(t.total);
}

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.name === "cep") {
    const d = t.value.replace(/\D/g, "").slice(0, 8);
    t.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
    if (d.length === 8) buscarCEP(d, t.form);
  }
  if (t.id === "busca") sugerir(t.value);
  if (t.id === "sim-texto") { perso.texto = t.value.toUpperCase().replace(/[<>]/g, ""); t.value = perso.texto; $("#sim-cont").textContent = perso.texto.length; renderPreview(); }
});

async function buscarCEP(cep, f) {
  const msg = $("#cep-msg");
  try {
    msg.textContent = "Buscando endereço…";
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const j = await r.json();
    if (j.erro) { msg.textContent = "CEP não encontrado. Preencha o endereço manualmente."; return; }
    f.rua.value = j.logradouro || f.rua.value; f.bairro.value = j.bairro || f.bairro.value;
    f.cidade.value = j.localidade || f.cidade.value; f.uf.value = j.uf || f.uf.value;
    atualizarFrete(f.uf.value); msg.textContent = "Endereço preenchido. Confira o número."; f.numero.focus();
  } catch { msg.textContent = "Não foi possível buscar o CEP agora. Preencha manualmente."; }
}

function sugerir(txt) {
  const box = $("#busca-res"); const q = norm(txt.trim());
  if (!q) { box.classList.remove("on"); return; }
  const hits = PRODUTOS.filter((p) => norm(p.nome + " " + nomeCat(p.categoria) + " " + Object.values(p.variacoes).flat().join(" ")).includes(q)).slice(0, 6);
  box.innerHTML = hits.length ? hits.map((p) => `<a href="#/produto/${p.id}"><img src="${p.imagens[0]}" alt=""><span><small>${nomeCat(p.categoria)}</small>${esc(p.nome)}</span><b>${p.preco ? brl(p.preco) : ""}</b></a>`).join("")
    : `<p class="nota">Nada encontrado pra “${esc(txt)}”</p>`;
  box.classList.add("on");
}

document.addEventListener("submit", (e) => {
  const f = e.target; e.preventDefault();

  if (f.id === "form-busca") {
    const q = $("#busca").value.trim(); $("#busca-res").classList.remove("on");
    location.hash = "#/loja" + (q ? "?q=" + encodeURIComponent(q) : "");
  }
  if (f.classList.contains("form-produto")) {
    const p = porId(f.dataset.id);
    const origem = $(".foto-principal", f.closest("[data-produto]"));
    fecharModal();
    adicionar(p.id, opcoesDoForm(f, p), Math.max(1, +$(".qtd-input", f).value || 1), { origem });
  }
  if (f.id === "form-sim") {
    const camisa = perso.peca === "camisa";
    const id = camisa ? "camisa-personalizada" : "bone-personalizado";
    const op = { "Cor base": coresDaPeca()[perso.cor] };
    if (camisa) op.Tamanho = perso.tamanho;
    op.Texto = perso.texto || "(sem texto)";
    if (perso.texto) { op.Fonte = FONTES[perso.fonte].nome; op["Cor do texto"] = perso.corTexto; if (camisa) op["Posição"] = perso.posicao; }
    op.Logo = perso.logo ? "vou enviar pelo WhatsApp" : "sem logo";
    adicionar(id, op, Math.max(1, +$(".qtd-input", f).value || 1), { origem: $("#sim-preview img, #sim-preview svg") });
  }
  if (f.id === "form-cupom") {
    const c = $("#cupom").value.trim().toUpperCase();
    if (!c) { cupom = null; salvarSacola(); render(); return; }
    if (LOJA.cupons[c]) { cupom = c; salvarSacola(); render(); }
    else $("#cupom-msg").textContent = "Cupom inválido.";
  }
  if (f.id === "form-checkout") {
    const d = Object.fromEntries(new FormData(f));
    const faltando = $$("[required]", f).filter((i) => i.type === "checkbox" ? !i.checked : !i.value.trim());
    $$(".invalido", f).forEach((i) => i.classList.remove("invalido"));
    faltando.forEach((i) => (i.type === "checkbox" ? i.closest("label") : i).classList.add("invalido"));
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || "");
    const cpfOk = cpfValido(d.cpf || "");
    if (!emailOk) f.email.classList.add("invalido");
    if (!cpfOk) f.cpf.classList.add("invalido");
    if (faltando.length || !emailOk || !cpfOk) {
      $("#erro-checkout").textContent = !f.lgpd.checked && faltando.length === 1 ? "Marque a caixa de consentimento para continuar."
        : !cpfOk && d.cpf ? "CPF inválido. Confira os números." : "Preencha os campos destacados para continuar.";
      (faltando[0] || (!emailOk ? f.email : f.cpf)).focus(); return;
    }
    d.lgpd = true;
    store.set("bv_cliente", d);
    registrarCheckout(d, e.submitter?.value || "pagar", e.submitter);
  }
  if (f.id === "form-contato") {
    const d = Object.fromEntries(new FormData(f));
    window.open(wa(`Olá! Sou ${d.nome}. ${d.msg}`), "_blank", "noopener");
    f.reset();
  }
});

/* ============ INÍCIO ============ */
$("#ano").textContent = new Date().getFullYear();
$$("[data-wpp]").forEach((a) => (a.href = wa(a.dataset.wpp || "Olá! Vim pelo site da BRAVUS.")));
atualizarContadores();
renderGaveta();
render();
rotaAnterior = location.hash.split("?")[0];
requestAnimationFrame(() => document.body.classList.add("pronto"));
