import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { create_order, get_orders, get_order, update_order, delete_all_orders } from './db.js';
import { create_transaction } from './crownbot.js';

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
app.use('/limpar.html', basic_auth);
app.use('/api/admin', basic_auth);
app.use(express.static('public'));

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
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
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

    // Cria a cobrança no CrownBot
    const tx = await create_transaction({ ...order, total_cents }, base);
    
    await update_order(order.id, {
      selected_sizes,
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

// WEBHOOK CROWNBOT (Configurar no painel do CrownBot a URL: https://bravuspersonalizados.com.br/api/webhook/crownbot)
app.post('/api/webhook/crownbot', async (req, res) => {
  try {
    console.log('Webhook recebido do CrownBot:', JSON.stringify(req.body, null, 2));
    
    // O CrownBot pode enviar o id da transação ou a referência externa
    const payload = req.body;
    const order_id = payload.reference_id || (payload.data && payload.data.reference_id);
    const event = payload.event || payload.status;

    if (order_id && event) {
      if (event.includes('paid') || event.includes('approved') || event === 'PAID') {
        await update_order(order_id, { status: 'paid', mp_payment_id: payload.id || 'crownbot', paid_at: new Date().toISOString() });
      } else if (event.includes('expired') || event.includes('refused') || event.includes('cancelled')) {
        await update_order(order_id, { status: 'rejected' });
      }
    }
    res.sendStatus(200);
  } catch (err) { 
    console.error('Erro no webhook:', err);
    res.sendStatus(500); 
  }
});

app.get('/pagamentoseguro', (_req, res) => res.sendFile(path.resolve('public/order.html')));
app.listen(port, () => console.log(`Rodando em ${base}`));