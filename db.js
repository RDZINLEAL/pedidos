import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('ERRO FATAL: MONGODB_URI ausente.'); process.exit(1); }

mongoose.connect(uri)
  .then(() => console.log('MongoDB Conectado.'))
  .catch(err => console.error('Erro no MongoDB:', err));

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  client_name: String,
  client_email: String,
  client_document: String,
  client_phone: String,
  photo_path: String,
  payment_link: String,
  mp_payment_id: String,
  status: { type: String, default: 'draft' }, // draft -> pending -> paid
  
  // NOVO FORMATO DE DADOS
  available_categories: Array, // Ex: [{ name: "Manga Curta", price_cents: 5000 }]
  selected_sizes: Array,       // Ex: [{ category: "Manga Curta", sizes: { M: 2, G: 1 } }]
  has_hat: Boolean,            // Se o admin liberou boné
  hat_price_cents: Number,
  hat_quantity: { type: Number, default: 0 },
  
  total_cents: Number,
  created_at: { type: Date, default: Date.now },
  paid_at: Date
});

const Order = mongoose.model('Order', OrderSchema);

export const create_order = async (data) => await new Order(data).save();
export const get_orders = async () => await Order.find().sort({ created_at: -1 }).lean();
export const get_order = async (id) => await Order.findOne({ id }).lean();
export const update_order = async (id, updates) => await Order.updateOne({ id }, { $set: updates });
export const delete_all_orders = async () => await Order.deleteMany({});