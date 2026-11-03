import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { create_order, get_orders, get_order, update_order, delete_all_orders } from './db.js';
import { create_transaction } from './invictus.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const base = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;

fs.mkdirSync('uploads', { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) return cb(new Error('Apenas imagens'));
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
app.use('/limpar.html', basic_auth);
app.use('/api/admin', basic_auth);
app.use(express.static('public'));

// ADMIN: Cria o esqueleto do pedido
app.post('/api/admin/orders', upload.single('photo'), async (req, res) => {
  try {
    const { client_name, client_email, client_document, client_phone, categories, has_hat, hat_price_cents } = req.body;
    
    const new_order = {
      id: randomBytes(3).toString('hex'),
      client_name, client_email, client_document, client_phone,
      photo_path: req.file ? `/uploads/${req.file.filename}` : null,
      available_categories: JSON.parse(categories),
      has_hat: has_hat === 'true',
      hat_price_cents: Number(hat_price_cents) || 0,
      status: 'draft',
      total_cents: 0
    };

    await create_order(new_order);
    res.json({ order: await get_order(new_order.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CLIENTE: Finaliza, calcula total e gera PIX
app.post('/api/orders/:id/checkout', async (req, res) => {
  try {
    const { selected_sizes, hat_quantity } = req.body;
    const order = await get_order(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    let total_cents = 0;
    
    // Calcula tamanhos
    selected_sizes.forEach(sel => {
      const category_info = order.available_categories.find(c => c.name === sel.category);
      if (category_info) {
        for (const [size, qty] of Object.entries(sel.sizes)) {
          total_cents += (category_info.price_cents * qty);
        }
      }
    });

    // Calcula bonés
    if (order.has_hat && hat_quantity > 0) {
      total_cents += (order.hat_price_cents * hat_quantity);
    }

    if (total_cents === 0) return res.status(400).json({ error: 'Selecione pelo menos um item.' });

    // Chama a Invictus
    const tx = await create_transaction({ ...order, total_cents, items: [{ description: 'Pedido Bravus', quantity: 1, unit_price_cents: total_cents }] }, base);
    
    await update_order(order.id, {
      selected_sizes,
      hat_quantity: Number(hat_quantity) || 0,
      total_cents,
      status: 'pending',
      payment_link: tx.payment_link,
      mp_preference_id: tx.transaction_id
    });

    res.json({ success: true, payment_link: tx.payment_link });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/orders', async (_req, res) => res.json({ orders: await get_orders() }));
app.delete('/api/admin/orders', async (req, res) => { await delete_all_orders(); res.json({ success: true }); });
app.get('/api/orders/:id', async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ order });
});

app.get('/pagamentoseguro', (_req, res) => res.sendFile(path.resolve('public/order.html')));
app.listen(port, () => console.log(`Rodando em ${base}`));