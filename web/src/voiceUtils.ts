/**
 * Extrai valor e descricao de um texto falado em portugues.
 * Ex.: "Abasteci 50 reais" -> { amount: 50, description: "Abasteci" }
 */
export function parseVoiceText(text: string): { amount: number; description: string; type: 'INCOME' | 'EXPENSE' } | null {
  const t = text.trim().toLowerCase()
  if (!t) return null

  const incomeWords = /\b(recebi|ganhei|entrada|salário|salario|freela|venda|pagamento recebido)\b/
  const type: 'INCOME' | 'EXPENSE' = incomeWords.test(t) ? 'INCOME' : 'EXPENSE'

  const patterns = [
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*reais?/i,
    /r\$\s*(\d{1,6}(?:[.,]\d{1,2})?)/i,
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:no|de|em|na|no)\s+/i,
    /(?:gastei|paguei|abasteci|gasto)\s*(\d{1,6}(?:[.,]\d{1,2})?)/i,
    /(?:recebi|ganhei)\s*(\d{1,6}(?:[.,]\d{1,2})?)/i,
    /^(\d{1,6}(?:[.,]\d{1,2})?)\s/,
    /(\d{1,6}(?:[.,]\d{1,2})?)$/,
  ]
  let amount = 0
  for (const p of patterns) {
    const m = t.match(p)
    if (m) {
      amount = Number(m[1].replace('.', '').replace(',', '.'))
      if (!Number.isNaN(amount) && amount > 0) break
    }
  }
  if (amount <= 0) return null

  let description = t
    .replace(/\d{1,6}(?:[.,]\d{1,2})?\s*reais?/gi, '')
    .replace(/r\$\s*\d{1,6}(?:[.,]\d{1,2})?/gi, '')
    .replace(/\b(recebi|ganhei|gastei|paguei|abasteci|gasto|no|de|em|na|no|reais?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!description) description = type === 'EXPENSE' ? 'Gasto por voz' : 'Receita por voz'

  return { amount, description: description.slice(0, 200), type }
}

/**
 * Sugere categoryId com base em palavras do texto.
 */
export function suggestCategoryId(
  text: string,
  categories: { id: string; name: string; kind: string }[]
): string | undefined {
  const t = text.toLowerCase()
  const expenseVar = categories.filter((c) => c.kind === 'EXPENSE_VARIABLE')
  const expenseFix = categories.filter((c) => c.kind === 'EXPENSE_FIXED')
  const income = categories.filter((c) => c.kind === 'INCOME')

  const byName: [string[], string[]][] = [
    [['posto', 'gasolina', 'abasteci', 'combustivel'], ['Transporte', 'Abastecimento']],
    [['mercado', 'super', 'compras', 'feira'], ['Mercado']],
    [['lanche', 'restaurante', 'uber', 'ifood', 'comida', 'almoco', 'jantar'], ['Lazer', 'Restaurante']],
    [['farmacia', 'remedio'], ['Farmacia']],
    [['aluguel', 'moradia'], ['Aluguel']],
    [['internet', 'celular', 'telefone'], ['Internet']],
    [['academia', 'treino'], ['Academia']],
    [['luz', 'energia'], ['Energia']],
    [['agua'], ['Agua']],
    [['salario', 'recebi', 'ganhei'], ['Salario']],
    [['freela', 'freelance', 'extra', 'venda'], ['Renda extra']],
  ]
  for (const [keywords, names] of byName) {
    if (keywords.some((k) => t.includes(k))) {
      for (const name of names) {
        const cat = [...expenseVar, ...expenseFix, ...income].find((c) =>
          c.name.toLowerCase().includes(name.toLowerCase())
        )
        if (cat) return cat.id
      }
    }
  }
  if (t.includes('recebi') || t.includes('ganhei')) return income[0]?.id
  return expenseVar[0]?.id
}
