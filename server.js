import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from 'crypto';
import path from 'path';
import fs from 'fs';
import { create_order, get_orders, get_order, update_order, delete_order, delete_all_orders } from './db.js';
import { create_transaction } from './pingupag.js';
import { calcular_loja } from './loja.js';

const app = express();
app.set('trust proxy', 1); // na hospedagem, o IP real do cliente vem do proxy
const port = Number(process.env.PORT || 3000);
const base = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;

fs.mkdirSync('uploads', { recursive: true });

/* ---------- Utilidades ---------- */

// Código do pedido: 24 caracteres aleatórios, impossível de adivinhar.
const new_id = () => randomBytes(12).toString('hex');

function safe_equal(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Assinatura do endereço de aviso de pagamento. Usa WEBHOOK_SECRET se existir;
// senão deriva uma chave fixa do MONGODB_URI, que já é secreto.
const webhook_secret = process.env.WEBHOOK_SECRET
  || createHash('sha256').update('bravus-webhook:' + process.env.MONGODB_URI).digest('hex');
const sign = (order_id) => createHmac('sha256', webhook_secret).update(String(order_id)).digest('hex').slice(0, 32);

// Promoção de parcerias: desconto para quem paga o Pix pelo banco escolhido.
// Para desligar, troque active para false.
const PROMO = {
  active: true,
  percent: 15,
  banks: { caixa: 'Caixa / Caixa Tem', sicredi: 'Sicredi' }
};

const order_kind = (o) => o.kind || (typeof o.qr_image === 'string' && o.qr_image.startsWith('/uploads/') ? 'manual' : 'auto');

// O que o cliente pode ver: sem CPF, telefone, e-mail nem ID da transação.
function public_order(o) {
  const show_pix = o.status === 'pending';
  return {
    id: o.id,
    kind: order_kind(o),
    status: o.status,
    first_name: String(o.client_name || '').trim().split(/\s+/)[0] || '',
    photos: o.photos || [],
    product_name: o.product_name,
    product_description: o.product_description,
    available_categories: o.available_categories || [],
    selected_sizes: o.selected_sizes || [],
    total_cents: o.total_cents || 0,
    coupon: o.coupon || null,
    coupon_bank: o.coupon ? PROMO.banks[o.coupon] || o.coupon : null,
    subtotal_cents: o.subtotal_cents || null,
    discount_cents: o.discount_cents || 0,
    // A promoção só vale para o Pix automático: o Pix manual já tem o valor fixo no QR do banco.
    promo: PROMO.active && order_kind(o) === 'auto' ? PROMO : null,
    payment_method: o.payment_method || null,
    payment_link: show_pix ? o.payment_link : null,
    qr_image: show_pix ? o.qr_image : null,
    expires_at: o.expires_at || null,
    paid_at: o.paid_at || null
  };
}

// Na lista do painel, a imagem base64 do QR é pesada e não é usada.
function admin_order(o) {
  const { _id, __v, ...rest } = o;
  if (rest.qr_image && !rest.qr_image.startsWith('/uploads/')) rest.qr_image = '(imagem da PinguPag)';
  return { ...rest, kind: order_kind(o) };
}

function parse_categories(raw) {
  let cats;
  try { cats = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error('Categorias inválidas.'); }
  if (!Array.isArray(cats) || !cats.length) throw new Error('Adicione pelo menos uma categoria.');
  return cats.map(c => {
    const name = String(c.name || '').trim();
    const price_cents = Math.round(Number(c.price_cents));
    if (!name) throw new Error('Toda categoria precisa de um nome.');
    if (!Number.isFinite(price_cents) || price_cents < 0) throw new Error(`Preço inválido em "${name}".`);
    const initial_sizes = {};
    for (const [k, v] of Object.entries(c.initial_sizes || {})) initial_sizes[String(k)] = Math.max(0, Math.min(9999, parseInt(v) || 0));
    return { name, price_cents, has_sizes: !!c.has_sizes, initial_sizes };
  });
}

// Confere as quantidades escolhidas pelo cliente e calcula o total no servidor.
function parse_selection(order, selected_sizes) {
  if (!Array.isArray(selected_sizes)) throw new Error('Seleção inválida.');
  let total_cents = 0;
  const clean = [];
  for (const sel of selected_sizes) {
    const cat = (order.available_categories || []).find(c => c.name === sel?.category);
    if (!cat) continue;
    const sizes = {};
    for (const [size, qty] of Object.entries(sel.sizes || {})) {
      const q = Math.max(0, Math.min(9999, parseInt(qty) || 0));
      sizes[String(size)] = q;
      total_cents += cat.price_cents * q;
    }
    clean.push({ category: cat.name, sizes });
  }
  return { selected_sizes: clean, total_cents };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- Upload de fotos ---------- */

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) return cb(new Error('Apenas imagens JPG, PNG ou WEBP.'));
    cb(null, true);
  }
});

/* ---------- Senha do painel ---------- */

const admin_user = process.env.ADMIN_USER || 'admin';
const admin_pass = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) console.warn('AVISO: ADMIN_PASSWORD não definido. Usando a senha padrão, que é insegura.');

function basic_auth(req, res, next) {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const decoded = Buffer.from(b64auth, 'base64').toString();
  const sep = decoded.indexOf(':');
  const login = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);
  if (sep > -1 && safe_equal(login, admin_user) && safe_equal(password, admin_pass)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Painel"');
  res.status(401).send('Acesso negado.');
}

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static('uploads'));

app.use(['/admin.html', '/api/admin'], basic_auth);
// Telas antigas do painel agora ficam dentro do admin.html.
app.get(['/manual.html', '/limpar.html'], basic_auth, (_req, res) => res.redirect('/admin.html'));
app.use(express.static('public'));

/* ---------- Painel: pedidos ---------- */

app.get('/api/admin/orders', wrap(async (_req, res) => {
  res.json({ orders: (await get_orders()).map(admin_order) });
}));

// Pedido com Pix automático (PinguPag)
app.post('/api/admin/orders', upload.array('photos', 15), wrap(async (req, res) => {
  const { client_name, client_email, client_document, client_phone, categories, product_name, product_description } = req.body;
  if (!String(client_name || '').trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' });
  const new_order = {
    id: new_id(),
    kind: 'auto',
    client_name, client_email, client_document, client_phone,
    photos: (req.files || []).map(f => `/uploads/${f.filename}`),
    product_name: product_name || 'Camisa personalizada',
    product_description: product_description || 'Modelo esportivo',
    available_categories: parse_categories(categories),
    status: 'draft',
    total_cents: 0
  };
  await create_order(new_order);
  res.json({ order: admin_order(await get_order(new_order.id)) });
}));

// Pedido com Pix manual (QR do banco)
app.post('/api/admin/manual-orders', upload.fields([{ name: 'photos', maxCount: 15 }, { name: 'qr_image', maxCount: 1 }]), wrap(async (req, res) => {
  const { client_name, client_email, client_phone, amount_reais, pix_code, categories, product_name, product_description } = req.body;
  const files = req.files || {};
  if (!String(client_name || '').trim() || !amount_reais || !String(pix_code || '').trim() || !files.qr_image) {
    return res.status(400).json({ error: 'Preencha nome, valor, Pix copia e cola e a foto do QR Code.' });
  }
  const total_cents = Math.round(parseFloat(String(amount_reais).replace(',', '.')) * 100);
  if (!Number.isFinite(total_cents) || total_cents <= 0) return res.status(400).json({ error: 'Valor inválido.' });

  const new_order = {
    id: new_id(),
    kind: 'manual',
    client_name, client_email: client_email || '', client_document: '', client_phone: client_phone || '',
    total_cents, payment_link: String(pix_code).trim(),
    qr_image: `/uploads/${files.qr_image[0].filename}`,
    photos: (files.photos || []).map(f => `/uploads/${f.filename}`),
    product_name: product_name || 'Pedido Manual',
    product_description: product_description || 'Personalizado',
    available_categories: parse_categories(categories),
    status: 'draft', selected_sizes: []
  };
  await create_order(new_order);
  res.json({ order: admin_order(await get_order(new_order.id)) });
}));

// Editar um pedido (dados do cliente, produto, categorias, situação, valor/Pix manual)
app.patch('/api/admin/orders/:id', wrap(async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const b = req.body || {};
  const set = {};
  const unset = {};
  for (const f of ['client_name', 'client_email', 'client_document', 'client_phone', 'product_name', 'product_description']) {
    if (typeof b[f] === 'string') set[f] = b[f].trim();
  }
  if (b.available_categories !== undefined) set.available_categories = parse_categories(b.available_categories);

  if (order_kind(order) === 'manual') {
    if (b.total_cents !== undefined) {
      const t = Math.round(Number(b.total_cents));
      if (!Number.isFinite(t) || t <= 0) return res.status(400).json({ error: 'Valor inválido.' });
      set.total_cents = t;
    }
    if (typeof b.payment_link === 'string' && b.payment_link.trim()) set.payment_link = b.payment_link.trim();
  }

  if (b.status !== undefined) {
    if (!['draft', 'pending', 'paid', 'rejected'].includes(b.status)) return res.status(400).json({ error: 'Situação inválida.' });
    set.status = b.status;
    if (b.status === 'paid' && order.status !== 'paid') { set.paid_at = new Date(); set.paid_by = 'painel'; }
    if (b.status !== 'paid') { unset.paid_at = ''; unset.paid_by = ''; }
    // Ao voltar um Pix manual para "aguardando", o cliente ganha mais 10 minutos.
    if (b.status === 'pending' && order_kind(order) === 'manual') set.expires_at = new Date(Date.now() + 10 * 60 * 1000);
  }

  await update_order(order.id, set, unset);
  res.json({ order: admin_order(await get_order(order.id)) });
}));

// Duplicar: mesmo cliente, produto e categorias, sem pagamento.
app.post('/api/admin/orders/:id/duplicate', wrap(async (req, res) => {
  const o = await get_order(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  const kind = order_kind(o);
  const copy = {
    id: new_id(), kind,
    client_name: o.client_name, client_email: o.client_email, client_document: o.client_document, client_phone: o.client_phone,
    photos: o.photos || [], product_name: o.product_name, product_description: o.product_description,
    available_categories: o.available_categories || [], status: 'draft', selected_sizes: [],
    total_cents: kind === 'manual' ? o.total_cents : 0
  };
  if (kind === 'manual') { copy.payment_link = o.payment_link; copy.qr_image = o.qr_image; }
  await create_order(copy);
  res.json({ order: admin_order(await get_order(copy.id)) });
}));

app.delete('/api/admin/orders/:id', wrap(async (req, res) => {
  const r = await delete_order(req.params.id);
  if (!r.deletedCount) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json({ success: true });
}));

// Apagar todos exige a palavra de confirmação, para não acontecer por engano.
app.delete('/api/admin/orders', wrap(async (req, res) => {
  if ((req.body || {}).confirm !== 'APAGAR TUDO') return res.status(400).json({ error: 'Confirmação ausente.' });
  await delete_all_orders();
  res.json({ success: true });
}));

/* ---------- Cliente ---------- */

const send_public = wrap(async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.set('Cache-Control', 'no-store');
  res.json({ order: public_order(order) });
});
app.get('/api/orders/:id', send_public);
app.get('/api/manual-orders/:id', send_public); // endereço antigo

// Pix automático: calcula o total e gera o Pix na PinguPag
app.post('/api/orders/:id/checkout', wrap(async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order_kind(order) === 'manual') return res.status(400).json({ error: 'Este pedido usa Pix manual.' });
  if (order.status === 'paid') return res.status(400).json({ error: 'Este pedido já foi pago.' });

  const { selected_sizes, total_cents: subtotal_cents } = parse_selection(order, (req.body || {}).selected_sizes);
  if (subtotal_cents === 0) return res.status(400).json({ error: 'Selecione pelo menos um item.' });

  const coupon = PROMO.active && PROMO.banks[(req.body || {}).coupon] ? req.body.coupon : null;
  const discount_cents = coupon ? Math.round(subtotal_cents * PROMO.percent / 100) : 0;
  const total_cents = subtotal_cents - discount_cents;

  const postback_url = `${base}/api/webhook/pingupag?sig=${sign(order.id)}`;
  const tx = await create_transaction({ ...order, total_cents, postback_url }, base);

  await update_order(order.id, {
    selected_sizes,
    total_cents,
    subtotal_cents,
    discount_cents,
    coupon,
    status: 'pending',
    payment_link: tx.payment_link,
    qr_image: tx.qr_image,
    mp_payment_id: tx.transaction_id
  });
  res.json({ success: true });
}));

// Pix manual: o cliente confirma os tamanhos e recebe o QR com prazo de 10 minutos
app.post('/api/manual-orders/:id/confirm', wrap(async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.status === 'paid') return res.status(400).json({ error: 'Este pedido já foi pago.' });
  const { selected_sizes } = parse_selection(order, (req.body || {}).selected_sizes);
  await update_order(order.id, { status: 'pending', selected_sizes, expires_at: new Date(Date.now() + 10 * 60 * 1000) });
  res.json({ success: true });
}));

/* ---------- Loja (página inicial) ---------- */

app.get('/api/promo', (_req, res) => res.json({ promo: PROMO.active ? PROMO : null }));

// Limite simples para ninguém disparar dezenas de Pix seguidos
const hits = new Map();
function rate_ok(ip, max = 8, win = 10 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  if (list.length >= max) return false;
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

function cpf_ok(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += +cpf[i] * (n + 1 - i);
    if ((s * 10) % 11 % 10 !== +cpf[n]) return false;
  }
  return true;
}

app.post('/api/loja/pedidos', wrap(async (req, res) => {
  if (!rate_ok(req.ip)) return res.status(429).json({ error: 'Muitos pedidos seguidos. Espere alguns minutos ou fale com a gente no WhatsApp.' });
  const b = req.body || {};
  const c = b.cliente || {};
  const forma = b.forma === 'whatsapp' ? 'whatsapp' : 'pix';
  const t = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

  const nome = t(c.nome), email = t(c.email), uf = t(c.uf, 2).toUpperCase();
  const cpf = String(c.cpf || '').replace(/\D/g, ''), tel = String(c.tel || '').replace(/\D/g, '');
  const cep = t(c.cep, 9), rua = t(c.rua), numero = t(c.numero, 20), comp = t(c.comp, 60), bairro = t(c.bairro, 80), cidade = t(c.cidade, 80);
  if (!nome || !rua || !numero || !bairro || !cidade || !cep) return res.status(400).json({ error: 'Preencha seus dados e o endereço de entrega.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (tel.length < 10 || tel.length > 13) return res.status(400).json({ error: 'WhatsApp inválido. Use DDD + número.' });
  if (!cpf_ok(cpf)) return res.status(400).json({ error: 'CPF inválido.' });
  if (c.lgpd !== true) return res.status(400).json({ error: 'É preciso aceitar o uso dos dados (LGPD).' });

  const calc = calcular_loja({ itens: b.itens, cupom: b.cupom, uf, banco: forma === 'pix' ? b.banco : null }, PROMO.active ? PROMO : null);
  const discount_cents = calc.desc_kit_cents + calc.desc_cupom_cents + calc.desc_banco_cents;
  const pecas = calc.linhas.reduce((s, l) => s + l.qtd, 0);
  const id = new_id();

  const order = {
    id, kind: 'loja', payment_method: forma, status: 'pending',
    client_name: nome, client_email: email, client_document: cpf, client_phone: tel,
    address: `${rua}, ${numero}${comp ? ' – ' + comp : ''} · ${bairro}, ${cidade}/${uf} · CEP ${cep}`,
    notes: t(c.obs, 1000),
    photos: [...new Set(calc.linhas.map(l => l.foto))].slice(0, 15),
    product_name: `Pedido da loja (${pecas} ${pecas === 1 ? 'peça' : 'peças'})`,
    product_description: calc.kits.join(' + '),
    available_categories: [],
    items: calc.linhas,
    // Mesmo formato dos pedidos do painel, para a página do cliente mostrar os itens
    selected_sizes: calc.linhas.map(l => {
      const op = Object.values(l.opcoes).filter(Boolean).join(' · ');
      return { category: l.nome + (op ? ` (${op})` : ''), sizes: { Unico: l.qtd } };
    }),
    shipping_cents: calc.frete_cents,
    subtotal_cents: calc.total_cents + discount_cents, // valor sem descontos (com frete)
    discount_cents,
    coupon: calc.banco,
    store_coupon: calc.cupom,
    total_cents: calc.total_cents
  };

  if (forma === 'pix') {
    let tx;
    try {
      tx = await create_transaction({ ...order, postback_url: `${base}/api/webhook/pingupag?sig=${sign(id)}` }, base);
    } catch (err) {
      console.error('[Loja] Falha ao gerar Pix:', err.message);
      return res.status(502).json({ error: 'Não conseguimos gerar o Pix agora. Tente de novo em instantes ou feche o pedido pelo WhatsApp.' });
    }
    Object.assign(order, { payment_link: tx.payment_link, qr_image: tx.qr_image, mp_payment_id: tx.transaction_id });
  }
  await create_order(order);
  res.json({ id, total_cents: order.total_cents });
}));

/* ---------- Aviso de pagamento da PinguPag ---------- */

app.post('/api/webhook/pingupag', async (req, res) => {
  try {
    const payload = req.body || {};
    const order_id = payload.external_id || payload.store_reference || payload.reference;
    const order = order_id ? await get_order(order_id) : null;
    if (!order) return res.sendStatus(200);

    // Só aceita o aviso se o endereço tiver a assinatura deste pedido
    // ou se o ID da transação for o mesmo que a PinguPag nos devolveu.
    const tx_id = payload.transaction_id || payload.id;
    const sig_ok = safe_equal(req.query.sig, sign(order.id));
    const tx_ok = !!order.mp_payment_id && !!tx_id && String(tx_id) === String(order.mp_payment_id);
    if (!sig_ok && !tx_ok) {
      console.warn(`[Webhook] Aviso recusado para o pedido #${order.id}: assinatura inválida.`);
      return res.sendStatus(401);
    }

    if (payload.status === 'approved' && order.status !== 'paid') {
      await update_order(order.id, { status: 'paid', paid_by: 'webhook', paid_at: new Date() });
    } else if ((payload.status === 'failed' || payload.status === 'refunded') && order.status !== 'paid') {
      await update_order(order.id, { status: 'rejected' });
    } else if (payload.status === 'refunded') {
      await update_order(order.id, { status: 'rejected' }, { paid_at: '', paid_by: '' });
    }
    res.sendStatus(200);
  } catch (err) { console.error('[Webhook]', err); res.sendStatus(500); }
});

/* ---------- Páginas ---------- */

// As duas páginas antigas agora usam a mesma tela; os links já enviados continuam valendo.
app.get(['/pagamentoseguro', '/pagamentomanual'], (_req, res) => res.sendFile(path.resolve('public/order.html')));

// Erros: devolve uma mensagem legível em vez de travar
app.use((err, _req, res, _next) => {
  const status = err.status || err instanceof multer.MulterError || /inválid|Adicione|precisa/i.test(err.message) ? 400 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Erro inesperado.' });
});

app.listen(port, () => console.log(`Rodando em ${base}`));
