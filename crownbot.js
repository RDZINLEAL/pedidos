const API_BASE = 'https://www.crownbot.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.CROWNBOT_API_KEY;
  if (!api_key) throw new Error('CROWNBOT_API_KEY ausente no .env');

  const body = {
    amount: order.total_cents,
    description: order.product_name || `Pedido ${order.id}`,
    reference_id: order.id,
    payment_method: 'pix',
    customer: {
      name: order.client_name,
      email: order.client_email,
      document: order.client_document,
      phone: order.client_phone
    }
  };

  if (base_url.startsWith('https://')) {
    body.return_url = `${base_url}/pagamentoseguro#${order.id}`;
    body.webhook_url = `${base_url}/api/webhook/crownbot`;
  }

  const res = await fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`CrownBot API ${res.status}: ${data.message || JSON.stringify(data)}`);
  }

  const tx = data.data || data.transaction || data;
  const pix_code = tx.pix?.qr_code || tx.qr_code || tx.pix_code;

  return {
    transaction_id: tx.id,
    payment_link: pix_code
  };
}