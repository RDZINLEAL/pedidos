import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import 'dotenv/config';
// ... o resto dos imports e do código continua igual
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
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) return cb(new Error('Apenas imagens'));
    cb(null, true);
  }
});

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// FECHADURA DO ADMIN
function basic_auth(req, res, next) {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD || 'admin123';
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  
  if (login && password && login === user && password === pass) return next();
  
  res.set('WWW-Authenticate', 'Basic realm="Painel Restrito"');
  res.status(401).send('Acesso negado.');
}

app.use('/admin.html', basic_auth);
app.use('/limpar.html', basic_auth); // <--- ADICIONE ESTA LINHA
app.use('/api/admin', basic_auth);

app.post('/api/admin/orders', upload.single('photo'), async (req, res) => {
  try {
    const { client_name, client_email, client_document, client_phone, items } = req.body;
    if (!client_name || !client_email || !client_document || !client_phone || !items) {
      return res.status(400).json({ error: 'Preencha todos os dados do cliente e itens.' });
    }
    
    const parsed_items = JSON.parse(items);
    let total_cents = 0;
    parsed_items.forEach(item => total_cents += (item.unit_price_cents * item.quantity));

    const id = randomBytes(3).toString('hex');
    const photo_path = req.file ? `/uploads/${req.file.filename}` : null;

    const new_order = {
      id, client_name, client_email, client_document, client_phone, items: parsed_items, total_cents, photo_path,
      payment_link: null, mp_preference_id: null, mp_payment_id: null, paid_at: null, status: 'pending'
    };

    await create_order(new_order);

    try {
      const tx = await create_transaction(new_order, base);
      await update_order(id, { mp_preference_id: tx.transaction_id, payment_link: tx.payment_link });
    } catch (err) {
      console.error('[invictus] Falha:', err.message);
    }

    res.json({ order: await get_order(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders', async (_req, res) => {
  res.json({ orders: await get_orders() });
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await get_order(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json({ order });
});

app.post('/api/webhook/invictus', async (req, res) => {
  try {
    const { event, transaction } = req.body;
    const order_id = req.query.order_id;

    if (order_id && transaction) {
      if (event === 'EVENT:CHARGE_PAID') {
        await update_order(order_id, { status: 'paid', mp_payment_id: transaction.id, paid_at: new Date().toISOString() });
      } else if (event === 'EVENT:CHARGE_EXPIRED' || event === 'EVENT:CHARGE_REFUND') {
        await update_order(order_id, { status: 'rejected' });
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook]', err);
    res.sendStatus(500);
  }
});

app.get('/pagamentoseguro', (_req, res) => res.sendFile(path.resolve('public/order.html')));
app.get('/order/:id', (_req, res) => res.sendFile(path.resolve('public/order.html')));

app.listen(port, () => console.log(`Rodando em ${base}`));