const API_BASE = 'https://pagamento-processador.org.ua/gateway/v1';

export async function create_transaction(order, base_url) {
  const api_key = process.env.PINGUPAG_API_KEY;
  if (!api_key) throw new Error('PINGUPAG_API_KEY ausente no .env');

  const clean_document = String(order.client_document || '').replace(/\D/g, '');
  const clean_phone = String(order.client_phone || '').replace(/\D/g, '');

  // Confere antes de enviar: dados nesse formato são a causa mais comum de erro 400.
  const problems = [];
  if (!String(order.client_name || '').trim()) problems.push('nome do cliente vazio');
  if (!/^\S+@\S+\.\S+$/.test(String(order.client_email || '').trim())) problems.push('e-mail inválido');
  if (clean_document.length !== 11 && clean_document.length !== 14) problems.push(`CPF/CNPJ com ${clean_document.length} dígitos (precisa de 11 ou 14)`);
  else if (/^(\d)\1+$/.test(clean_document)) problems.push('CPF/CNPJ inválido (todos os dígitos iguais)');
  if (clean_phone.length < 10 || clean_phone.length > 13) problems.push(`telefone com ${clean_phone.length} dígitos (use DDD + número)`);
  if (!Number.isInteger(order.total_cents) || order.total_cents <= 0) problems.push('valor do pedido inválido');
  if (!/^https:\/\//.test(base_url)) problems.push(`PUBLIC_BASE_URL precisa começar com https:// (está "${base_url}")`);
  if (problems.length) throw new Error(`Pedido #${order.id} não enviado à PinguPag: ${problems.join('; ')}.`);

  const body = {
    amount: order.total_cents,
    description: order.product_name || `Pedido #${order.id}`,
    reference: order.id,
    // O servidor manda o endereço já assinado (?sig=...) para que avisos falsos sejam recusados.
    postback_url: order.postback_url || `${base_url}/api/webhook/pingupag`,
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
    // Mostra no log do servidor a resposta completa (os detalhes do 400 costumam vir em "errors").
    console.error(`[PinguPag] pedido #${order.id} recusado. Status ${res.status}. Resposta:`, textData);
    const details = json.errors ? ` | ${JSON.stringify(json.errors)}` : '';
    throw new Error(`PinguPag API ${res.status}: ${json.message || JSON.stringify(json)}${details}`);
  }

  return {
    transaction_id: json.transaction_id,
    payment_link: json.qr_code,
    qr_image: json.qr_code_base64 // Pode vir em base64, já vamos usar ele direto
  };
}