const API_BASE = 'https://www.crownbot.com.br/api/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.CROWNBOT_API_KEY;
  if (!api_key) throw new Error('CROWNBOT_API_KEY ausente no .env');

  const valor_centavos = Math.round(Number(order.total_cents));

  if (valor_centavos < 200 || valor_centavos > 10000) {
    throw new Error(`O gateway CrownBot tem um limite de R$ 2,00 a R$ 100,00 por transação. O valor do seu pedido é R$ ${(valor_centavos / 100).toFixed(2).replace('.', ',')}.`);
  }

  const body = {
    valor_centavos: valor_centavos,
    descricao: order.product_name || `Pedido #${order.id}`,
    referencia: order.id,
    cliente: {
      nome: order.client_name,
      email: order.client_email,
      cpf: order.client_document,
      telefone: order.client_phone
    }
  };

  if (base_url.startsWith('https://')) {
    body.url_retorno = `${base_url}/pagamentoseguro#${order.id}`;
    body.url_webhook = `${base_url}/api/webhook/crownbot`;
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
  
  // Separa a imagem do código de texto
  const qr_image = tx.qr_code_base64 || tx.pix?.imagem || tx.imagem_qrcode;
  const pix_code = tx.pix_copia_e_cola || tx.qr_code || tx.pix_code || tx.copia_e_cola;

  if (!pix_code) {
    throw new Error(`A API não retornou o código PIX. Resposta: ${textData}`);
  }

  return {
    transaction_id: tx.id || tx.transaction_id,
    payment_link: pix_code,
    qr_image: qr_image // Salvamos a imagem separada
  };
}