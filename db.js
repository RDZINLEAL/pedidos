import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('ERRO FATAL: MONGODB_URI ausente.'); process.exit(1); }

mongoose.connect(uri)
  .then(() => console.log('MongoDB Conectado.'))
  .catch(err => console.error('Erro no MongoDB:', err));

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  kind: String,           // 'auto' (Pix PinguPag) ou 'manual' (QR do banco). Pedidos antigos não têm.
  client_name: String,
  client_email: String,
  client_document: String,
  client_phone: String,

  photos: [String],

  payment_link: String,   // Pix copia e cola
  qr_image: String,       // Imagem base64 (PinguPag) ou caminho /uploads/... (manual)
  expires_at: Date,       // Prazo do Pix manual

  mp_payment_id: String,  // ID da transação na PinguPag
  status: { type: String, default: 'draft' }, // draft | pending | paid | rejected
  paid_by: String,        // 'webhook' ou 'painel'

  product_name: { type: String, default: 'Camisa personalizada' },
  product_description: { type: String, default: 'Modelo esportivo' },

  available_categories: Array,
  selected_sizes: Array,

  total_cents: Number,
  coupon: String,          // 'caixa' ou 'sicredi' (promoção de parcerias)
  subtotal_cents: Number,  // total antes do desconto
  discount_cents: Number,
  created_at: { type: Date, default: Date.now },
  paid_at: Date
});

const Order = mongoose.model('Order', OrderSchema);

export const create_order = async (data) => await new Order(data).save();
export const get_orders = async () => await Order.find().sort({ created_at: -1 }).lean();
export const get_order = async (id) => await Order.findOne({ id: String(id) }).lean();
export const update_order = async (id, updates, unset = {}) => {
  const op = { $set: updates };
  if (Object.keys(unset).length) op.$unset = unset;
  return await Order.updateOne({ id: String(id) }, op);
};
export const delete_order = async (id) => await Order.deleteOne({ id: String(id) });
export const delete_all_orders = async () => await Order.deleteMany({});
