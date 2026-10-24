const API_BASE = 'https://api.invictuspayv2.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.INVICTUS_API_KEY;
  if (!api_key) throw new Error('INVICTUS_API_KEY ausente no .env');

  const api_items = order.items.map(item => ({
    description: item.description,
    quantity: item.quantity,
    amount: item.unit_price_cents * item.quantity
  }));

  const body = {
    amount: order.total_cents,
    paymentMethod: 'pix',
    customer: {
      name: order.client_name,
      email: order.client_email,
      document: order.client_document,
      phone: order.client_phone
    },
    items: api_items
  };

  if (base_url.startsWith('https://')) {
    body.postbackUrl = `${base_url}/api/webhook/invictus?order_id=${order.id}`;
  }

  const res = await fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': api_key
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Invictus API ${res.status}: ${json.message || JSON.stringify(json)}`);
  }

  const txData = json.data || json;
  const pix_code = txData.pix && txData.pix.qr_code ? txData.pix.qr_code : null;

  return {
    transaction_id: txData.id,
    payment_link: pix_code
  };
}