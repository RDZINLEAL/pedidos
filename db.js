import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('ERRO FATAL: MONGODB_URI não configurada.');
  process.exit(1);
}

mongoose.connect(uri)
  .then(() => console.log('Conectado ao MongoDB com sucesso!'))
  .catch(err => console.error('Erro no MongoDB:', err));

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  client_name: String,
  client_email: String,
  client_document: String,
  client_phone: String,
  items: Array,
  total_cents: Number,
  photo_path: String,
  payment_link: String,
  mp_preference_id: String,
  mp_payment_id: String,
  status: { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now },
  paid_at: Date
});

const Order = mongoose.model('Order', OrderSchema);

export async function create_order(order_data) {
  const order = new Order(order_data);
  await order.save();
}

export async function get_orders() {
  return await Order.find().sort({ created_at: -1 }).lean();
}

export async function get_order(id) {
  return await Order.findOne({ id }).lean();
}

export async function update_order(id, updates) {
  await Order.updateOne({ id }, { $set: updates });
}

// A FUNÇÃO NOVA PARA O BOTÃO DE LIMPAR
export async function delete_all_orders() {
  await Order.deleteMany({});
}