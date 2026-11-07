const API_BASE = 'https://www.crownbot.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.CROWNBOT_API_KEY;
  if (!api_key) throw new Error('CROWNBOT_API_KEY ausente no .env');

  // Converte de centavos para reais (ex: 15000 -> 150.00)
  const valor_reais = order.total_cents / 100;

  const body = {
    amount: valor_reais, 
    value: valor_reais, // Alguns gateways usam 'value'
    price: valor_reais, // Outros usam 'price'
    description: order.product_name || `Pedido #${order.id}`,
    reference_id: order.id, // Alguns gateways usam 'external_reference'
    external_reference: order.id,
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
    body.postback_url = `${base_url}/api/webhook/crownbot`;
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
    throw new Error(`O CrownBot retornou HTML. Status: ${res.status}. Resposta: ${textData.substring(0, 100)}`);
  }

  if (!res.ok) {
    // Se der erro de valor inválido, tenta enviar o valor em centavos como número inteiro com nome 'value_cents'
    if (data.error === 'valor_invalido' || data.message === 'valor_invalido') {
       throw new Error(`A CrownBot recusou o formato do valor. Tente colocar "amount": ${order.total_cents} ou "amount": "${valor_reais}" na documentação. Resposta exata: ${JSON.stringify(data)}`);
    }
    throw new Error(`CrownBot API ${res.status}: ${data.message || data.error || JSON.stringify(data)}`);
  }

  const tx = data.data || data;
  const pix_code = tx.pix?.qr_code || tx.qr_code || tx.pix_code || tx.copy_paste || tx.qrcode;

  if (!pix_code) {
    throw new Error(`A API não retornou o código PIX. Resposta recebida: ${textData}`);
  }

  return {
    transaction_id: tx.id || tx.transaction_id,
    payment_link: pix_code
  };
}