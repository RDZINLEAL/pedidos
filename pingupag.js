const API_BASE = 'https://pagamento-processador.org.ua/gateway/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.PINGUPAG_API_KEY;
  if (!api_key) throw new Error('PINGUPAG_API_KEY ausente no .env');

  const clean_document = String(order.client_document || '').replace(/\D/g, '');
  const clean_phone = String(order.client_phone || '').replace(/\D/g, '');

  const body = {
    amount: order.total_cents,
    description: order.product_name || `Pedido #${order.id}`,
    reference: order.id,
    postback_url: `${base_url}/api/webhook/pingupag`,
    source: 'api_externa', // Ignora a validação de productHash
    customer: {
      name: order.client_name,
      email: order.client_email,
      phone: clean_phone,
      document: clean_document
    }
  };

  const res = await fetch(`${API_BASE}/transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': api_key
    },
    body: JSON.stringify(body)
  });

  const textData = await res.text();
  let json;
  
  try {
    json = JSON.parse(textData);
  } catch (e) {
    throw new Error(`A PinguPag retornou HTML. Status: ${res.status}.`);
  }

  if (!res.ok || json.status !== 'success') {
    throw new Error(`PinguPag API ${res.status}: ${json.message || JSON.stringify(json)}`);
  }

  return {
    transaction_id: json.transaction_id,
    payment_link: json.qr_code,
    qr_image: json.qr_code_base64 // Pode vir em base64, já vamos usar ele direto
  };
}