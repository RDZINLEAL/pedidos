document.getElementById('btn-clear').addEventListener('click', async () => {
  const confirmed = confirm('ATENÇÃO: Isso vai apagar TODOS os pedidos do MongoDB. Tem certeza absoluta?');
  if (!confirmed) return;

  const btn = document.getElementById('btn-clear');
  const status = document.getElementById('status');
  
  btn.disabled = true;
  status.textContent = 'Apagando...';
  status.style.color = '#8a6d1f';

  try {
    const res = await fetch('/api/admin/orders', { method: 'DELETE' });
    const json = await res.json();
    
    if (res.ok) {
      status.textContent = 'Todos os dados foram limpos com sucesso.';
      status.style.color = '#1f7a2e';
    } else {
      status.textContent = 'Erro: ' + json.error;
      status.style.color = '#8a1f28';
    }
  } catch (err) {
    status.textContent = 'Erro de conexão com o servidor.';
    status.style.color = '#8a1f28';
  } finally {
    btn.disabled = false;
  }
});