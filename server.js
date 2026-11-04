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
}).array('photos', 10);

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

app.post('/api/admin/orders', (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { client_name, client_email, client_document, client_phone, categories, has_hat, hat_price_cents, initial_hat_qty, product_name, product_description } = req.body;
      
      const photos = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
      const parsed_hat_qty = Number(initial_hat_qty) || 0;
      const parsed_hat_price = Number(hat_price_cents) || 0;

      const new_order = {
        id: randomBytes(3).toString('hex'),
        client_name, client_email, client_document, client_phone,
        photos,
        product_name: product_name || 'Camisa personalizada',
        product_description: product_description || 'Modelo esportivo',
        available_categories: JSON.parse(categories),
        // TRAVA DE SEGURANÇA: Se tiver qtd de boné, ativa o boné automaticamente
        has_hat: (parsed_hat_qty > 0) || (has_hat === 'true'),
        hat_price_cents: parsed_hat_price,
        initial_hat_qty: parsed_hat_qty,
        status: 'draft',
        total_cents: 0
      };

      await create_order(new_order);
      res.json({ order: await get_order(new_order.id) });
    } catch (error) { 
      res.status(500).json({ error: error.message }); 
    }
  });
});

app.post('/api/orders/:id/checkout', async (req, res) => {
  try {
    const { selected_sizes, hat_quantity } = req.body;
    const order = await get_order(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    let total_cents = 0;
    
    // Soma Camisas
    if (selected_sizes && selected_sizes.length > 0) {
      selected_sizes.forEach(sel => {
        const category_info = order.available_categories.find(c => c.name === sel.category);
        if (category_info) {
          for (const [size, qty] of Object.entries(sel.sizes)) {
            total_cents += (category_info.price_cents * qty);
          }
        }
      });
    }

    // Soma Bonés (FORÇADO A CALCULAR SE TIVER QUANTIDADE)
    const final_hat_qty = Number(hat_quantity) || 0;
    if (final_hat_qty > 0) {
      total_cents += (order.hat_price_cents * final_hat_qty);
    }

    if (total_cents === 0) return res.status(400).json({ error: 'Selecione pelo menos um item.' });

    const tx = await create_transaction({ ...order, total_cents, items: [{ description: order.product_name || 'Pedido Bravus', quantity: 1, unit_price_cents: total_cents }] }, base);
    
    await update_order(order.id, {
      selected_sizes,
      hat_quantity: final_hat_qty,
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

app.post('/api/webhook/invictus', async (req, res) => {
  try {
    const { event, transaction } = req.body;
    const order_id = req.query.order_id;

    if (order_id && transaction && event) {
      if (event.includes('CHARGE_PAID')) {
        await update_order(order_id, { status: 'paid', mp_payment_id: transaction.id, paid_at: new Date().toISOString() });
      } else if (event.includes('CHARGE_EXPIRED') || event.includes('CHARGE_REFUND')) {
        await update_order(order_id, { status: 'rejected' });
      }
    }
    res.sendStatus(200);
  } catch (err) { res.sendStatus(500); }
});

app.get('/pagamentoseguro', (_req, res) => res.sendFile(path.resolve('public/order.html')));
app.listen(port, () => console.log(`Rodando em ${base}`));