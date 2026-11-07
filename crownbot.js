const API_BASE = 'https://www.crownbot.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.CROWNBOT_API_KEY;
  if (!api_key) throw new Error('CROWNBOT_API_KEY ausente no .env');

  // O padrão da maioria dos gateways é enviar o valor em centavos
  const body = {
    amount: order.total_cents, 
    description: order.product_name || `Pedido #${order.id}`,
    reference_id: order.id,
    customer: {
      name: order.client_name,
      email: order.client_email,
      document: order.client_document,
      phone: order.client_phone
    }
  };

  // Adiciona a URL de retorno e webhook apenas se estiver em produção (HTTPS)
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

  // Lê a resposta como texto primeiro para evitar o erro de HTML
  const textData = await res.text();
  let data;
  
  try {
    data = JSON.parse(textData);
  } catch (e) {
    throw new Error(`O CrownBot retornou HTML. Status: ${res.status}. Resposta: ${textData.substring(0, 100)}`);
  }

  if (!res.ok) {
    throw new Error(`CrownBot API ${res.status}: ${data.message || data.error || JSON.stringify(data)}`);
  }

  // Tenta extrair o código PIX de todas as formas possíveis que a API pode retornar
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