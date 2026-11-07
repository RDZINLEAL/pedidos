const API_BASE = 'https://www.crownbot.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.CROWNBOT_API_KEY;
  if (!api_key) throw new Error('CROWNBOT_API_KEY ausente no .env');

  // Monta o corpo da requisição
  const body = {
    amount: order.total_cents, // em centavos
    description: order.product_name || `Pedido ${order.id}`,
    reference_id: order.id,
    payment_method: 'pix', // ou 'PIX' dependendo da documentação
    // Dados do cliente (opcional, mas alguns gateways exigem)
    customer: {
      name: order.client_name,
      email: order.client_email,
      document: order.client_document,
      phone: order.client_phone
    }
  };

  // Se a documentação pedir URLs de retorno
  if (base_url.startsWith('https://')) {
    body.return_url = `${base_url}/pagamentoseguro#${order.id}`;
    body.webhook_url = `${base_url}/api/webhook/crownbot`;
  }

  const res = await fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}` // Padrão CrownBot
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`CrownBot API ${res.status}: ${data.message || JSON.stringify(data)}`);
  }

  // Ajuste os campos de acordo com a resposta real do CrownBot
  // (provavelmente virá em data.pix.qr_code ou data.qr_code)
  const tx = data.data || data.transaction || data;
  const pix_code = tx.pix?.qr_code || tx.qr_code || tx.pix_code;

  return {
    transaction_id: tx.id,
    payment_link: pix_code
  };
}