const API_BASE = 'https://www.crownbot.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.CROWNBOT_API_KEY;
  if (!api_key) throw new Error('CROWNBOT_API_KEY ausente no .env');

  // Trava de segurança: CrownBot só aceita entre R$ 2,00 e R$ 100,00
  if (order.total_cents < 200 || order.total_cents > 10000) {
    throw new Error(`O gateway CrownBot tem um limite máximo de R$ 100,00 por transação. O valor do seu pedido é R$ ${(order.total_cents / 100).toFixed(2).replace('.', ',')}. Mude para outro gateway.`);
  }

  const body = {
    amount: order.total_cents, // Enviando como inteiro (ex: 5000 para R$ 50,00)
    description: order.product_name || `Pedido #${order.id}`,
    reference_id: order.id,
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

  const res = await fetch(`${API_BASE}/pix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}`
    },
    body: JSON.stringify(body)
  });

  const textData = await res.text();
  let data;
  
  try {
    data = JSON.parse(textData);
  } catch (e) {
    throw new Error(`O CrownBot retornou HTML. Status: ${res.status}.`);
  }

  if (!res.ok) {
    throw new Error(`CrownBot API ${res.status}: ${data.mensagem || data.error || JSON.stringify(data)}`);
  }

  const tx = data.data || data;
  const pix_code = tx.pix?.qr_code || tx.qr_code || tx.pix_code || tx.copy_paste || tx.qrcode;

  if (!pix_code) {
    throw new Error(`A API não retornou o código PIX. Resposta: ${textData}`);
  }

  return {
    transaction_id: tx.id || tx.transaction_id,
    payment_link: pix_code
  };
}