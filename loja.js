// Cálculo dos pedidos da loja no servidor.
// Lê o mesmo catálogo da loja (public/js/produtos.js), para que preços, kits,
// cupons e frete sejam sempre os mesmos que o cliente vê, mas sem confiar no navegador.
import fs from 'fs';
import vm from 'vm';

const CATALOGO = 'public/js/produtos.js';
let cache = { mtime: 0, data: null };

function catalogo() {
  const mtime = fs.statSync(CATALOGO).mtimeMs;
  if (cache.data && cache.mtime === mtime) return cache.data;
  const code = fs.readFileSync(CATALOGO, 'utf8') + '\n;({ LOJA, KITS, PRODUTOS });';
  cache = { mtime, data: vm.runInNewContext(code, {}, { timeout: 1000 }) };
  return cache.data;
}

// Erro do cliente (resposta 400, com a mensagem visível na loja)
const fail = (msg) => Object.assign(new Error(msg), { status: 400 });

const texto = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// itens: [{ id, qtd, opcoes: { Tamanho: 'M', ... } }]
// promo: { percent, banks } ou null; banco: 'caixa' | 'sicredi' | null
export function calcular_loja({ itens, cupom, uf, banco }, promo) {
  const { LOJA, KITS, PRODUTOS } = catalogo();
  if (!Array.isArray(itens) || !itens.length) throw fail('Sua sacola está vazia.');
  if (itens.length > 50) throw fail('Itens demais no pedido.');

  const linhas = itens.map(i => {
    const p = PRODUTOS.find(x => x.id === i?.id);
    if (!p) throw fail('Um dos produtos não existe mais. Atualize a página.');
    if (p.preco == null) throw fail(`"${p.nome}" é sob encomenda: peça pelo WhatsApp.`);
    const qtd = Math.max(1, Math.min(99, parseInt(i.qtd) || 1));
    const opcoes = {};
    for (const [k, v] of Object.entries(i.opcoes || {}).slice(0, 12)) opcoes[texto(k, 40)] = texto(v);
    const foto = p.imagens[p.fotoPor ? Math.max(0, (p.variacoes[p.fotoPor] || []).indexOf(opcoes[p.fotoPor])) : 0] || p.imagens[0];
    return { id: p.id, nome: p.nome, preco: p.preco, grupoKit: p.grupoKit, qtd, opcoes, foto: '/' + foto };
  });

  // Mesmas contas da função totais() da loja (js/app.js)
  const subtotal = linhas.reduce((s, l) => s + l.preco * l.qtd, 0);
  let descKit = 0; const kits = [];
  for (const [g, k] of Object.entries(KITS)) {
    const doGrupo = linhas.filter(l => l.grupoKit === g);
    const n = doGrupo.reduce((s, l) => s + l.qtd, 0);
    const q = Math.floor(n / k.qtd);
    if (!q) continue;
    const d = q * (k.qtd * doGrupo[0].preco - k.preco);
    if (d > 0) { descKit += d; kits.push(`${q}× ${k.nome}`); }
  }
  const base = subtotal - descKit;
  const banco_ok = promo && promo.banks[banco] ? banco : null;
  // O cupom do banco (promoção de parcerias) substitui o cupom da loja; não somam.
  const cupom_ok = !banco_ok && cupom && LOJA.cupons[cupom] ? cupom : null;
  const descCupom = cupom_ok ? base * LOJA.cupons[cupom_ok] : 0;
  const descBanco = banco_ok ? base * promo.percent / 100 : 0;
  const liquido = base - descCupom - descBanco;
  const gratis = base - descCupom >= LOJA.freteGratisAcima; // frete grátis conta antes do desconto do banco
  const frete = gratis ? 0 : LOJA.fretePorEstado[uf];
  if (frete == null) throw fail('Escolha um estado válido para a entrega.');

  const c = (v) => Math.round(v * 100);
  return {
    linhas, kits, cupom: cupom_ok, banco: banco_ok,
    subtotal_cents: c(subtotal),
    desc_kit_cents: c(descKit),
    desc_cupom_cents: c(descCupom),
    desc_banco_cents: c(descBanco),
    frete_cents: c(frete),
    total_cents: c(liquido + frete),
    whatsapp: LOJA.whatsapp
  };
}
