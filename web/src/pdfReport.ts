import { jsPDF } from 'jspdf'

function formatBRL(value: number): string {
  return value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function formatDateBR(iso: string): string {
  const s = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export interface ReportData {
  monthLabel: string
  summary: { totalIncome: number; totalExpense: number; balance: number }
  byKind: { fixed: number; variable: number; income: number }
  transactions: { date: string; type: string; amount: number; description?: string | null }[]
  openBills: { description: string; amount: number; dueDate: string }[]
}

export function generateReportPdf(data: ReportData): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 16
  let y = 20
  const lineH = 6

  doc.setFontSize(16)
  doc.text('Relatório financeiro', margin, y)
  y += lineH + 2
  doc.setFontSize(11)
  doc.text(data.monthLabel, margin, y)
  y += lineH + 6

  doc.setFontSize(10)
  doc.text(`Receitas: R$ ${formatBRL(data.summary.totalIncome)}`, margin, y)
  y += lineH
  doc.text(`Despesas realizadas: R$ ${formatBRL(data.summary.totalExpense)}`, margin, y)
  y += lineH
  doc.text(`Saldo: R$ ${formatBRL(data.summary.balance)}`, margin, y)
  y += lineH
  doc.text(`Despesas fixas: R$ ${formatBRL(data.byKind.fixed)} | Variáveis: R$ ${formatBRL(data.byKind.variable)}`, margin, y)
  y += lineH + 4

  if (data.openBills.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Contas a pagar', margin, y)
    y += lineH
    doc.setFont('helvetica', 'normal')
    const totalBills = data.openBills.reduce((a, b) => a + b.amount, 0)
    doc.text(`Total: R$ ${formatBRL(totalBills)}`, margin, y)
    y += lineH
    data.openBills.forEach((b) => {
      doc.text(`${b.description} — vence ${formatDateBR(b.dueDate)} — R$ ${formatBRL(b.amount)}`, margin, y)
      y += lineH
    })
    y += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Movimentações', margin, y)
  y += lineH
  doc.setFont('helvetica', 'normal')

  const pageH = 277
  data.transactions.slice(0, 80).forEach((t) => {
    if (y > pageH - 20) {
      doc.addPage()
      y = 20
    }
    const tipo = t.type === 'INCOME' ? '+' : '-'
    const desc = (t.description || '-').slice(0, 35)
    doc.text(`${formatDateBR(t.date)} ${desc} ${tipo} R$ ${formatBRL(t.amount)}`, margin, y)
    y += lineH
  })

  return doc.output('blob')
}
