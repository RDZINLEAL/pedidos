/* Comunicação com o servidor da loja (servidor.py).
   Se o site for aberto sem o servidor (dois cliques no index.html),
   tudo continua funcionando, só que nada é enviado ao painel. */
const API = {
  ativo: location.protocol.startsWith("http"),
  async enviar(url, corpo = {}, metodo = "POST") {
    if (!this.ativo) return { ok: false, offline: true, erro: "Servidor da loja não está rodando." };
    try {
      const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 501 || r.status === 405) return { ok: false, offline: true, erro: "Servidor da loja não está rodando." };
      return { ok: r.ok, status: r.status, ...j };
    } catch {
      return { ok: false, offline: true, erro: "Não foi possível falar com o servidor." };
    }
  }
};
