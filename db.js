import fs from 'fs';

const db_file = 'data.json';

function read_db() {
  if (!fs.existsSync(db_file)) return { orders: [] };
  const content = fs.readFileSync(db_file, 'utf-8');
  return JSON.parse(content || '{"orders":[]}');
}

function write_db(data) {
  fs.writeFileSync(db_file, JSON.stringify(data, null, 2));
}

export function create_order(order) {
  const data = read_db();
  order.created_at = new Date().toISOString();
  order.status = 'pending';
  data.orders.push(order);
  write_db(data);
}

export function get_orders() {
  const data = read_db();
  return data.orders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
}

export function get_order(id) {
  const data = read_db();
  return data.orders.find(o => o.id === id);
}

export function update_order(id, updates) {
  const data = read_db();
  const idx = data.orders.findIndex(o => o.id === id);
  if (idx !== -1) {
    data.orders[idx] = { ...data.orders[idx], ...updates };
    write_db(data);
  }
}