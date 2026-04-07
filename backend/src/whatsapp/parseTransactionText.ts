/**
 * Mesma lógica do web/voiceUtils: dígitos BR, por extenso, sufixo após local.
 * Mantido alinhado ao frontend para WhatsApp e voz.
 */

const INCOME_WORDS = /\b(recebi|ganhei|entrada|salário|salario|freela|venda|pagamento recebido)\b/;

function parseBrazilianAmountFragment(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s || !/\d/.test(s)) return null;

  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d+,\d{1,2}$/.test(s)) {
    return Number(s.replace(",", "."));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Number(s.replace(/\./g, ""));
  }
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

const UNITS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  três: 3,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
};

const HUNDREDS: Record<string, number> = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
};

function parsePortugueseNumberWords(phrase: string): number | null {
  const t = phrase
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;

  const tokens = t.split(" ").filter(Boolean);
  if (tokens.length === 0) return null;

  if (tokens.includes("mil")) {
    const mi = tokens.indexOf("mil");
    const before = tokens.slice(0, mi);
    const after = tokens.slice(mi + 1);
    let thousands = 1;
    if (before.length === 1 && UNITS[before[0]] != null) thousands = UNITS[before[0]];
    else if (before.length === 1 && before[0] === "um") thousands = 1;
    else if (before.length === 0) thousands = 1;
    else {
      const sub = parseHundredsTensUnits(before.join(" "));
      if (sub != null && sub > 0) thousands = sub;
    }
    let base = thousands * 1000;
    const rest = after.join(" ");
    if (rest && rest !== "e") {
      const r = parseHundredsTensUnits(rest.replace(/^e\s+/, ""));
      if (r != null) base += r;
    }
    return base > 0 ? base : null;
  }

  return parseHundredsTensUnits(t);
}

function parseHundredsTensUnits(t: string): number | null {
  const tokens = t.split(" ").filter(Boolean);
  let total = 0;
  let i = 0;

  while (i < tokens.length) {
    const w = tokens[i];
    if (HUNDREDS[w] != null) {
      total += HUNDREDS[w];
      i += 1;
      continue;
    }
    if (w === "e") {
      i += 1;
      continue;
    }
    if (UNITS[w] != null) {
      const u = UNITS[w];
      if (
        u >= 20 &&
        i + 2 < tokens.length &&
        tokens[i + 1] === "e" &&
        UNITS[tokens[i + 2]] != null &&
        UNITS[tokens[i + 2]] < 10
      ) {
        total += u + UNITS[tokens[i + 2]];
        i += 3;
        continue;
      }
      if (u < 20 || u % 10 === 0) {
        total += u;
        i += 1;
        continue;
      }
    }
    if (total > 0) return total;
    return null;
  }

  return total > 0 ? total : null;
}

const NUMBER_KEYWORDS = new Set([...Object.keys(UNITS), ...Object.keys(HUNDREDS), "e", "mil"]);

function stripLeadingExpenseVerbs(s: string): string {
  return s
    .replace(
      /^(?:gastei|paguei|abasteci|comprei|dei|pago|fiz|lancei|gasto|paguei|depositei|transferi)\s+/i,
      ""
    )
    .trim();
}

function isolateNumberSuffix(phrase: string): string {
  const raw = phrase
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  let start = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const w = tokens[i];
    if (NUMBER_KEYWORDS.has(w)) {
      start = i;
      continue;
    }
    break;
  }
  if (start >= tokens.length) return "";
  return tokens.slice(start).join(" ");
}

function extractAmountFromPortuguese(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  const digitPatterns: RegExp[] = [
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*reais?\b/i,
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*reais?\b/i,
    /\br\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)\b/i,
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*(?:no|de|em|na)\s+\w+/i,
    /(?:gastei|paguei|abasteci|gasto|comprei|paguei)\s*(?:de\s+|por\s+)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)/i,
    /(?:recebi|ganhei)\s*(?:de\s+|por\s+)?(\d{1,6}(?:[.,]\d{1,2})?)/i,
    /\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)\b/,
    /\b(\d{1,6}(?:[.,]\d{1,2})?)\s+(?:no|de|em|na)\s+/i,
    /^(\d{1,6}(?:[.,]\d{1,2})?)\s/,
    /\b(\d{1,6}(?:[.,]\d{1,2})?)$/,
  ];

  for (const p of digitPatterns) {
    const m = t.match(p);
    if (m?.[1]) {
      const n = parseBrazilianAmountFragment(m[1]);
      if (n != null && n > 0) return n;
    }
  }

  const beforeReais = t.split(/\b(reais|real)\b/i)[0]?.trim();
  if (beforeReais && beforeReais.length > 1) {
    const cleaned = stripLeadingExpenseVerbs(beforeReais);
    let fromWords = parsePortugueseNumberWords(cleaned);
    if (fromWords == null || fromWords <= 0) {
      fromWords = parsePortugueseNumberWords(isolateNumberSuffix(beforeReais));
    }
    if (fromWords != null && fromWords > 0) return fromWords;
  }

  const isolated = isolateNumberSuffix(t);
  if (isolated.length > 0) {
    const n = parsePortugueseNumberWords(isolated);
    if (n != null && n > 0) return n;
  }

  return null;
}

export function parseTransactionText(
  text: string
): { amount: number; description: string; type: "INCOME" | "EXPENSE" } | null {
  const raw = text.trim();
  if (!raw) return null;

  const t = raw.toLowerCase();
  const type: "INCOME" | "EXPENSE" = INCOME_WORDS.test(t) ? "INCOME" : "EXPENSE";

  const amount = extractAmountFromPortuguese(raw);
  if (amount == null || amount <= 0) return null;

  let description = t
    .replace(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*reais?/gi, "")
    .replace(/\d{1,6}(?:[.,]\d{1,2})?\s*reais?/gi, "")
    .replace(/r\$\s*[\d.,]+/gi, "")
    .replace(/\b(recebi|ganhei|gastei|paguei|abasteci|gasto|comprei|no|de|em|na|reais?|real|por|de)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  description = description
    .replace(/\b(vinte|trinta|quarenta|cinquenta|cem|mil)\b(\s+e\s+\w+)*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!description) description = type === "EXPENSE" ? "Gasto (WhatsApp)" : "Receita (WhatsApp)";

  return { amount, description: description.slice(0, 200), type };
}

export function suggestCategoryId(
  text: string,
  categories: { id: string; name: string; kind: string }[]
): string | undefined {
  const t = text.toLowerCase();
  const expenseVar = categories.filter((c) => c.kind === "EXPENSE_VARIABLE");
  const expenseFix = categories.filter((c) => c.kind === "EXPENSE_FIXED");
  const income = categories.filter((c) => c.kind === "INCOME");

  const byName: [string[], string[]][] = [
    [["posto", "gasolina", "abasteci", "combustivel"], ["Transporte", "Abastecimento"]],
    [["mercado", "super", "compras", "feira"], ["Mercado"]],
    [["lanche", "restaurante", "uber", "ifood", "comida", "almoco", "jantar"], ["Lazer", "Restaurante"]],
    [["farmacia", "remedio"], ["Farmacia"]],
    [["aluguel", "moradia"], ["Aluguel"]],
    [["internet", "celular", "telefone"], ["Internet"]],
    [["academia", "treino"], ["Academia"]],
    [["luz", "energia"], ["Energia"]],
    [["agua"], ["Agua"]],
    [["salario", "recebi", "ganhei"], ["Salário"]],
    [["freela", "freelance", "extra", "venda"], ["Renda extra"]],
  ];
  for (const [keywords, names] of byName) {
    if (keywords.some((k) => t.includes(k))) {
      for (const name of names) {
        const cat = [...expenseVar, ...expenseFix, ...income].find((c) =>
          c.name.toLowerCase().includes(name.toLowerCase())
        );
        if (cat) return cat.id;
      }
    }
  }
  if (t.includes("recebi") || t.includes("ganhei")) return income[0]?.id;
  return expenseVar[0]?.id;
}
