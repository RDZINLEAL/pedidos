/* ============================================================
   CATÁLOGO BRAVUS BRASIL
   Edite aqui produtos, preços, estampas e dados da loja.
   - preco: número com ponto decimal (ex.: 39.9)
   - grupoKit: produtos do mesmo grupo somam para o kit (ver KITS)
   - imagens: lista de fotos; se "fotoPor" for definido, cada opção
     dessa variação usa a foto de mesma posição.
   - sobEncomenda: true = botão leva ao WhatsApp em vez da sacola
   ============================================================ */

const LOJA = {
  nome: "BRAVUS Brasil",
  slogan: "Estilo Agro, Pesca e Country",
  whatsapp: "5511954894952",               // só números, com DDI e DDD
  email: "contato@bravusbrasil.com.br",
  endereco: "Rua Santa Rosa, 254 — Glória · Vila Velha/ES · CEP 29122-290",
  cnpj: "00.000.000/0001-00",
  freteGratisAcima: 250,
  fretePorEstado: {
    SP: 19.9, RJ: 19.9, MG: 19.9, ES: 19.9,
    PR: 24.9, SC: 24.9, RS: 24.9,
    DF: 24.9, GO: 24.9, MT: 24.9, MS: 24.9,
    BA: 29.9, SE: 29.9, AL: 29.9, PE: 29.9, PB: 29.9, RN: 29.9, CE: 29.9, PI: 29.9, MA: 29.9,
    AC: 39.9, AM: 39.9, RO: 39.9, RR: 39.9, PA: 39.9, AP: 39.9, TO: 39.9
  },
  cupons: { BRAVUS10: 0.10 }
};

/* Kits: a cada 4 peças do mesmo grupo, o cliente paga o preço do kit */
const KITS = {
  camisa: { qtd: 4, preco: 99.89, nome: "Kit 4 camisas" },
  bone:   { qtd: 4, preco: 60.00, nome: "Kit 4 bonés" }
};

const CATEGORIAS = [
  { id: "camisas",        nome: "Camisas" },
  { id: "bones",          nome: "Bonés" },
  { id: "botas-chapeus",  nome: "Botas & Chapéus" },
  { id: "fivelas",        nome: "Fivelas" },
  { id: "personalizados", nome: "Personalizados" }
];

const TAM_CAMISA = ["P", "M", "G", "GG", "XG"];
const serie = (pasta, n, ext) => Array.from({ length: n }, (_, i) => `img/${pasta}/${i + 1}.${ext}`);

const PRODUTOS = [
  {
    id: "camisa-pesca", nome: "Camisa BRAVUS Linha Pesca", categoria: "camisas", linha: "Pesca",
    preco: 39.9, grupoKit: "camisa", destaque: true, avaliacao: 4.9, avaliacoes: 214,
    titulo: "Pesca & Água Doce",
    resumo: "Estampas de peixe, pôr do sol e rio — pra quem vive a água e não troca por nada.",
    descricao: "Manga longa, zíper frontal, gola alta e proteção UV. Tecido tático com toque de algodão e estampa embutida no tecido: não descasca, não desbota. Disponível em 10 estampas.",
    detalhes: ["Proteção UV 50+", "Tecido respirável Dry-Fit com toque de algodão", "Zíper frontal de metal e gola alta", "Estampa embutida — não descasca"],
    imagens: serie("camisa-pesca", 10, "jpg"), fotoPor: "Estampa",
    variacoes: {
      Estampa: ["Branco Cardume", "Cinza Rios", "Preto Dourado", "Verde Selvagem", "Azul Profundo", "Areia Pôr do Sol", "Amarelo Isca", "Vermelho Tucunaré", "Vinho Crepúsculo", "Roxo Noturno"],
      Tamanho: TAM_CAMISA
    }
  },
  {
    id: "camisa-agro", nome: "Camisa BRAVUS Linha Agro", categoria: "camisas", linha: "Agro",
    preco: 39.9, grupoKit: "camisa", destaque: true, avaliacao: 4.9, avaliacoes: 268,
    titulo: "Agro & Tradição",
    resumo: "Gado, trator, moinho e campo — pra quem vive a terra e carrega a tradição no peito.",
    descricao: "Manga longa, zíper frontal, gola alta e proteção UV. Feita pra aguentar sol, poeira e lida pesada sem perder o estilo. Disponível em 10 estampas.",
    detalhes: ["Proteção UV 50+", "Tecido respirável Dry-Fit com toque de algodão", "Zíper frontal de metal e gola alta", "Estampa embutida — não descasca"],
    imagens: serie("camisa-agro", 10, "jpg"), fotoPor: "Estampa",
    variacoes: {
      Estampa: ["Branco Pecuária", "Cinza Agro", "Preto Noturno", "Verde Pasto", "Azul Fazenda", "Areia Country", "Amarelo Colheita", "Vermelho Boi", "Vinho Tradição", "Roxo Crepúsculo"],
      Tamanho: TAM_CAMISA
    }
  },
  {
    id: "bone-pesca", nome: "Boné BRAVUS Linha Pesca", categoria: "bones", linha: "Pesca",
    preco: 25, grupoKit: "bone", destaque: true, avaliacao: 4.9, avaliacoes: 214,
    titulo: "Pesca & Água Doce",
    resumo: "Estampas de peixe, pôr do sol e rio — pra quem vive a água e não troca por nada.",
    descricao: "Estrutura firme, aba curva pré-formada e proteção UV. Estampa costurada à mão, que não descasca. Disponível em 10 cores.",
    detalhes: ["Proteção UV 50+", "Malha respirável Dry-Fit", "Aba curva pré-formada", "Regulagem traseira"],
    imagens: serie("bone-pesca", 10, "jpg"), fotoPor: "Cor",
    variacoes: {
      Cor: ["Branco Cardume", "Cinza Rios", "Preto Dourado", "Verde Selvagem", "Azul Profundo", "Areia Pôr do Sol", "Amarelo Isca", "Vermelho Tucunaré", "Vinho Crepúsculo", "Roxo Noturno"]
    }
  },
  {
    id: "bone-agro", nome: "Boné BRAVUS Linha Agro", categoria: "bones", linha: "Agro",
    preco: 25, grupoKit: "bone", destaque: true, avaliacao: 4.9, avaliacoes: 268,
    titulo: "Agro & Tradição",
    resumo: "Estampas de cavalo, boi e cerca — pra quem vive a terra e carrega a tradição no peito.",
    descricao: "Estrutura firme, aba curva pré-formada e proteção UV. Detalhes em couro e estampa costurada à mão. Disponível em 10 cores.",
    detalhes: ["Proteção UV 50+", "Malha respirável Dry-Fit", "Aba curva pré-formada", "Regulagem traseira"],
    imagens: serie("bone-agro", 10, "png"), fotoPor: "Cor",
    variacoes: {
      Cor: ["Branco Pecuária", "Cinza Agro", "Preto Noturno", "Verde Pasto", "Azul Fazenda", "Areia Country", "Amarelo Colheita", "Vermelho Boi", "Vinho Tradição", "Roxo Crepúsculo"]
    }
  },
  {
    id: "camisa-personalizada", nome: "Camisa Personalizada", categoria: "personalizados", linha: "Personalizados",
    preco: 39.9, grupoKit: "camisa", personalizavel: true, avaliacao: 4.9, avaliacoes: 87,
    titulo: "Sua marca, sua história",
    resumo: "Escolha a cor base e personalize como quiser — nome, logo, brasão, time ou frase.",
    descricao: "Cada camisa personalizada sai da nossa produção como peça única. Você escolhe a cor base, manda a arte ou só a ideia, e a gente coloca a sua identidade direto no tecido — sem impressão que descasca. Após o pedido, alinhamos arte, fonte e posição pelo WhatsApp.",
    detalhes: ["Nome ou apelido nas costas, manga ou peito", "Logo da fazenda, empresa, time ou família", "Conferência da arte antes de produzir", "Produção em 5 a 7 dias úteis"],
    imagens: serie("camisa-personalizada", 10, "jpg"), fotoPor: "Cor base",
    variacoes: {
      "Cor base": ["Laranja", "Roxo", "Vermelho", "Amarelo", "Bege", "Azul", "Verde", "Cinza", "Preto", "Branco"],
      Tamanho: TAM_CAMISA
    }
  },
  {
    id: "bone-personalizado", nome: "Boné Personalizado", categoria: "personalizados", linha: "Personalizados",
    preco: 25, grupoKit: "bone", personalizavel: true, avaliacao: 4.9, avaliacoes: 62,
    titulo: "Bordado com a sua identidade",
    resumo: "Nome, logo, brasão da fazenda ou apelido bordado no boné, um a um.",
    descricao: "Você escolhe a cor base e manda a ideia; a gente borda a sua identidade direto no tecido — sem adesivo que solta. Após o pedido, alinhamos o bordado pelo WhatsApp.",
    detalhes: ["Bordado na frente ou nas laterais", "Logo, brasão, nome ou número", "Conferência da arte antes de bordar", "Produção em 5 a 7 dias úteis"],
    imagens: serie("bone-agro", 10, "png").slice(9).concat(serie("bone-agro", 9, "png")), fotoPor: null,
    variacoes: {
      "Cor base": ["Branco", "Cinza", "Preto", "Verde", "Azul", "Areia", "Amarelo", "Vermelho", "Vinho", "Roxo"]
    }
  },
  {
    id: "bota-usa", nome: "Bota BRAVUS USA", categoria: "botas-chapeus", linha: "Country",
    preco: 289.9, destaque: true, avaliacao: 4.8, avaliacoes: 41,
    titulo: "Couro, tradição e estilo",
    resumo: "Bota em couro legítimo com acabamento country trabalhado à mão.",
    descricao: "Feita pra durar anos de lida: couro legítimo, costura reforçada e solado firme. Acabamento country com identidade brasileira.",
    detalhes: ["Couro legítimo", "Costura reforçada", "Solado antiderrapante"],
    imagens: ["img/bota-chapeu/1.png"],
    variacoes: { Numeração: ["37", "38", "39", "40", "41", "42", "43", "44"] }
  },
  {
    id: "bota-country", nome: "Bota BRAVUS Country", categoria: "botas-chapeus", linha: "Country",
    preco: 269.9, avaliacao: 4.8, avaliacoes: 35,
    titulo: "Couro, tradição e estilo",
    resumo: "Bota country clássica em couro legítimo.",
    descricao: "Modelo clássico para o dia a dia no campo, no rodeio ou na cidade. Couro legítimo trabalhado à mão.",
    detalhes: ["Couro legítimo", "Costura reforçada", "Solado antiderrapante"],
    imagens: ["img/bota-chapeu/2.png"],
    variacoes: { Numeração: ["37", "38", "39", "40", "41", "42", "43", "44"] }
  },
  {
    id: "bota-bege", nome: "Bota BRAVUS Bege", categoria: "botas-chapeus", linha: "Country",
    preco: 269.9, avaliacao: 4.8, avaliacoes: 28,
    titulo: "Couro, tradição e estilo",
    resumo: "Bota em couro bege com acabamento country.",
    descricao: "Tom claro que combina com tudo, em couro legítimo e acabamento feito à mão.",
    detalhes: ["Couro legítimo", "Costura reforçada", "Solado antiderrapante"],
    imagens: ["img/bota-chapeu/3.png"],
    variacoes: { Numeração: ["37", "38", "39", "40", "41", "42", "43", "44"] }
  },
  {
    id: "chapeu-preto", nome: "Chapéu BRAVUS Preto", categoria: "botas-chapeus", linha: "Country",
    preco: 189.9, destaque: true, avaliacao: 4.9, avaliacoes: 52,
    titulo: "Feltro e tradição",
    resumo: "Chapéu country em feltro preto, acabamento à mão.",
    descricao: "Chapéu em feltro com aba estruturada e acabamento country. Clássico pra festa, rodeio ou lida.",
    detalhes: ["Feltro", "Aba estruturada", "Acabamento à mão"],
    imagens: ["img/bota-chapeu/4.png"],
    variacoes: { Tamanho: ["56", "57", "58", "59", "60"] }
  },
  {
    id: "chapeu-palha", nome: "Chapéu BRAVUS Palha", categoria: "botas-chapeus", linha: "Country",
    preco: 149.9, avaliacao: 4.8, avaliacoes: 39,
    titulo: "Leve e fresco",
    resumo: "Chapéu de palha country, leve pro sol forte.",
    descricao: "Palha trançada com acabamento country. Leve, fresco e perfeito pros dias de sol no campo ou na beira do rio.",
    detalhes: ["Palha trançada", "Aba larga", "Acabamento à mão"],
    imagens: ["img/bota-chapeu/5.png"],
    variacoes: { Tamanho: ["56", "57", "58", "59", "60"] }
  },
  {
    id: "chapeu-marrom", nome: "Chapéu BRAVUS Marrom", categoria: "botas-chapeus", linha: "Country",
    preco: 189.9, avaliacao: 4.9, avaliacoes: 44,
    titulo: "Feltro e tradição",
    resumo: "Chapéu country em feltro marrom.",
    descricao: "Feltro marrom com aba estruturada e acabamento country feito à mão.",
    detalhes: ["Feltro", "Aba estruturada", "Acabamento à mão"],
    imagens: ["img/bota-chapeu/6.png"],
    variacoes: { Tamanho: ["56", "57", "58", "59", "60"] }
  },
  ...[
    ["touro", "Touro", 1], ["ferradura", "Ferradura", 2], ["aguia", "Águia", 3], ["bandeira-usa", "Bandeira USA", 4],
    ["cartas", "Cartas", 5], ["rosa", "Rosa", 6], ["girassol", "Girassol", 7], ["ferradura-detalhada", "Ferradura Detalhada", 9]
  ].map(([id, nome, n], i) => ({
    id: "fivela-" + id, nome: "Fivela BRAVUS " + nome, categoria: "fivelas", linha: "Country",
    preco: 89.9, destaque: i < 2, avaliacao: 4.9, avaliacoes: 30 + n * 7,
    titulo: "Ferro, couro e tradição",
    resumo: "Fivela country em metal envelhecido com acabamento prata escovado.",
    descricao: "Metal envelhecido, acabamento prata escovado e detalhes trabalhados à mão. Do boi à ferradura, da águia ao girassol — tem um modelo pra cada estilo de vida.",
    detalhes: ["Metal envelhecido", "Acabamento prata escovado", "Encaixe para cintos de até 4 cm"],
    imagens: [`img/fivelas/${n}.png`],
    variacoes: {}
  })),
  {
    id: "bota-personalizada", nome: "Bota ou Chapéu Personalizado", categoria: "personalizados", linha: "Personalizados",
    preco: null, sobEncomenda: true, avaliacao: 4.9, avaliacoes: 18,
    titulo: "Gravado a fogo",
    resumo: "Seu nome, inicial, brasão da fazenda ou escudo do time gravado a fogo.",
    descricao: "Produzimos bota e chapéu sob encomenda, com acabamento country e personalização única. Mande a sua ideia no WhatsApp — orçamento em minutos.",
    detalhes: ["Gravação a fogo", "Couro legítimo ou feltro", "Orçamento pelo WhatsApp"],
    imagens: ["img/bota-chapeu/3.png", "img/bota-chapeu/4.png"],
    variacoes: {}
  },
  {
    id: "fivela-personalizada", nome: "Fivela Personalizada", categoria: "personalizados", linha: "Personalizados",
    preco: null, sobEncomenda: true, avaliacao: 4.9, avaliacoes: 12,
    titulo: "A sua marca no metal",
    resumo: "Sua marca, brasão, inicial ou desenho único em metal envelhecido.",
    descricao: "Fivela sob encomenda em metal envelhecido, com até 8 cm de diâmetro. Mande a sua ideia no WhatsApp — orçamento em minutos.",
    detalhes: ["Metal envelhecido", "Até 8 cm de diâmetro", "Orçamento pelo WhatsApp"],
    imagens: ["img/fivelas/8.png"],
    variacoes: {}
  }
];
