import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { create_order, get_orders, get_order, update_order, delete_all_orders } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const base = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;

fs.mkdirSync('uploads', { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) return cb(new Error('Apenas imagens (JPG, PNG, WEBP)'));
    cb(null, true);
  }
});

app.use(express.json());
app.use('/uploads', express.static('uploads'));

function basic_auth(req, res, next) {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD || 'admin123';
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === user && password === pass) return next();
  res.set('WWW-Authenticate', 'Basic realm="Painel"');
  res.status(401).send('Acesso negado.');
}

app.use('/admin.html', basic_auth);
app.use('/manual.html', basic_auth); 
app.use('/limpar.html', basic_auth);
app.use('/api/admin', basic_auth);
app.use(express.static('public'));

// --- ROTAS ANTIGAS ---
app.post('/api/admin/orders', upload.array('photos', 15), async (req, res) => {
  try {
    const { client_name, client_email, client_document, client_phone, categories, product_name, product_description } = req.body;
    const photos = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const new_order = {
      id: randomBytes(3).toString('hex'),
      client_name, client_email, client_document, client_phone,
      photos,
      product_name: product_name || 'Camisa personalizada',
      product_description: product_description || 'Modelo esportivo',
      available_categories: JSON.parse(categories),
      status: 'draft',
      total_cents: 0
    };
    await create_order(new_order);
    res.json({ order: await get_order(new_order.id) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/orders/:id/checkout', async (req, res) => {
  try {
    const { selected_sizes } = req.body;
    const order = await get_order(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    let total_cents = 0;
    selected_sizes.forEach(sel => {
      const category_info = order.available_categories.find(c => c.name === sel.category);
      if (category_info) {
        for (const [size, qty] of Object.entries(sel.sizes)) {
          total_cents += (category_info.price_cents * qty);
        }
      }
    });

    if (total_cents === 0) return res.status(400).json({ error: 'Selecione pelo menos um item.' });
    res.json({ success: true, message: "Aguardando integração de pagamento." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- NOVAS ROTAS MANUAIS ---

// Cria o pedido manual como "draft"
app.post('/api/admin/manual-orders', upload.single('qr_image'), async (req, res) => {
  try {
    const { client_name, client_email, amount_reais, pix_code } = req.body;
    
    if (!client_name || !amount_reais || !pix_code || !req.file) {
      return res.status(400).json({ error: 'Preencha todos os campos e envie o QR Code.' });
    }

    const total_cents = Math.round(parseFloat(amount_reais) * 100);
    const qr_image_path = `/uploads/${req.file.filename}`;
    
    const new_order = {
      id: randomBytes(3).toString('hex'),
      client_name,
      client_email: client_email || 'nao-informado@email.com',
      client_document: '00000000000',
      client_phone: '00000000000',
      total_cents,
      payment_link: pix_code,
      manual_qr_path: qr_image_path,
      product_name: 'Pagamento Manual',
      product_description: 'Via PIX',
      status: 'draft', // <--- MUDOU PARA DRAFT
      available_categories: [],
      selected_sizes: []
    };

    await create_order(new_order);
    res.json({ order: await get_order(new_order.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cliente clica em "Confirmar" e geramos a expiração de 10 minutos
app.post('/api/manual-orders/:id/confirm', async (req, res) => {
  try {
    const order = await get_order(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Define a expiração para 10 minutos a partir de AGORA
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await update_order(order.id, { status: 'pending', expires_at });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Busca os dados para a tela do cliente
app.get('/api/manual-orders/:id', async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json({ order });
});

// --- FIM DAS ROTAS MANUAIS ---

app.get('/api/admin/orders', async (_req, res) => res.json({ orders: await get_orders() }));
app.delete('/api/admin/orders', async (req, res) => { await delete_all_orders(); res.json({ success: true }); });
app.get('/api/orders/:id', async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ order });
});

app.get('/pagamentoseguro', (_req, res) => res.sendFile(path.resolve('public/order.html')));
app.get('/pagamentomanual', (_req, res) => res.sendFile(path.resolve('public/manual_pay.html')));

app.listen(port, () => console.log(`Rodando em ${base}`));