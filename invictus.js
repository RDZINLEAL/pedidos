const API_BASE = 'https://api.invictuspayv2.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.INVICTUS_API_KEY;
  if (!api_key) throw new Error('INVICTUS_API_KEY ausente no .env');

  // Limpa o CPF (deixa só números) e o telefone
  const clean_document = String(order.client_document || '').replace(/\D/g, '');
  const clean_phone = String(order.client_phone || '').replace(/\D/g, '');

  // Estrutura idêntica à documentação oficial
  const body = {
    amount: order.total_cents,
    paymentMethod: 'pix',
    customer: {
      name: order.client_name,
      email: order.client_email,
      document: clean_document,
      phone: clean_phone
    },
    items: [
      {
        description: order.product_name || `Pedido ${order.id}`,
        quantity: 1,
        amount: order.total_cents
      }
    ],
    pix: {
      expirationInSeconds: 1800 // 30 minutos (padrão da doc)
    }
  };

  // Adiciona o postback se estiver em produção
  if (base_url.startsWith('https://')) {
    body.postbackUrl = `${base_url}/api/webhook/invictus?order_id=${order.id}`;
  }

  const res = await fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accept': 'application/json',
      'X-Api-Key': api_key
    },
    body: JSON.stringify(body)
  });

  const textData = await res.text();
  let json;
  
  try {
    json = JSON.parse(textData);
  } catch (e) {
    throw new Error(`A Invictus retornou HTML. Status: ${res.status}.`);
  }

  if (!res.ok) {
    // Traduz o erro feio deles
    const errorMsg = json.error || json.message || JSON.stringify(json);
    throw new Error(`Erro Invictus: ${errorMsg}. Verifique se o CPF (${clean_document}) e o Telefone (${clean_phone}) são reais e válidos.`);
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