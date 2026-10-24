import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { create_order, get_orders, get_order, update_order } from './db.js';
import { create_transaction } from './invictus.js';

const app  = express();
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
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) return cb(new Error('somente jpg/png/webp'));
    cb(null, true);
  }
});

app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

app.post('/api/admin/orders', upload.single('photo'), async (req, res) => {
  try {
    const { client_name, client_email, client_document, client_phone, items } = req.body;
    if (!client_name || !client_email || !client_document || !client_phone || !items) {
      return res.status(400).json({ error: 'Dados do cliente e itens são obrigatórios' });
    }
    
    const parsed_items = JSON.parse(items);
    if (parsed_items.length === 0) {
      return res.status(400).json({ error: 'Adicione pelo menos um item' });
    }

    let total_cents = 0;
    parsed_items.forEach(item => {
      total_cents += (item.unit_price_cents * item.quantity);
    });

    // Gera um ID curto (ex: a8f3b2) em vez do ID gigante
    const id = randomBytes(3).toString('hex');
    const photo_path = req.file ? `/uploads/${req.file.filename}` : null;

    const new_order = {
      id,
      client_name,
      client_email,
      client_document,
      client_phone,
      items: parsed_items,
      total_cents,
      photo_path,
      payment_link: null,
      mp_preference_id: null,
      mp_payment_id: null,
      paid_at: null
    };

    create_order(new_order);

    try {
      const tx = await create_transaction(new_order, base);
      update_order(id, { mp_preference_id: tx.transaction_id, payment_link: tx.payment_link });
    } catch (err) {
      console.error('[invictus] transação falhou:', err.message);
    }

    const updated = get_order(id);
    res.json({ order: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders', (_req, res) => {
  res.json({ orders: get_orders() });
});

app.get('/api/orders/:id', (req, res) => {
  const order = get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'pedido não encontrado' });
  res.json({ order });
});

app.post('/api/webhook/invictus', (req, res) => {
  try {
    const { event, transaction } = req.body;
    const order_id = req.query.order_id;

    if (order_id && transaction) {
      if (event === 'EVENT:CHARGE_PAID') {
        update_order(order_id, {
          status: 'paid',
          mp_payment_id: transaction.id,
          paid_at: new Date().toISOString()
        });
      } else if (event === 'EVENT:CHARGE_EXPIRED' || event === 'EVENT:CHARGE_REFUND') {
        update_order(order_id, { status: 'rejected' });
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook invictus]', err);
    res.sendStatus(500);
  }
});

// Nova rota bonita
app.get('/pagamentoseguro', (_req, res) => res.sendFile(path.resolve('public/order.html')));

// Mantém a rota antiga por segurança
app.get('/order/:id', (_req, res) => res.sendFile(path.resolve('public/order.html')));

app.listen(port, () => console.log(`http://localhost:${port}`));