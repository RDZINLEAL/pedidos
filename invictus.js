const API_BASE = 'https://api.invictuspayv2.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.INVICTUS_API_KEY;
  if (!api_key) throw new Error('INVICTUS_API_KEY ausente no .env');

  const body = {
    amount: order.total_cents,
    paymentMethod: 'pix',
    customer: {
      name: order.client_name,
      email: order.client_email,
      document: order.client_document,
      phone: order.client_phone
    },
    items: [
      {
        description: order.product_name || `Pedido ${order.id}`,
        quantity: 1,
        amount: order.total_cents
      }
    ]
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

  if (!pix_code) {
    throw new Error(`A API não retornou o código PIX. Resposta: ${JSON.stringify(json)}`);
  }

  return {
    transaction_id: txData.id,
    payment_link: pix_code
  };
}