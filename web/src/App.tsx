import './App.css'
import React, { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import jsPDF from 'jspdf'

interface SpeechRecognitionInstance {
  start: () => void
  stop: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const Win = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
  return Win.SpeechRecognition ?? Win.webkitSpeechRecognition ?? null
}

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'https://app-assesor-financeiro-dia-dia-production.up.railway.app'

type HealthResponse = { status: string }

type AuthResponse = {
  token: string
  user: {
    id: string
    email: string
    name?: string | null
  }
}

type SummaryResponse = {
  totalIncome: number
  totalExpense: number
  balance: number
}

type Bill = {
  id: string
  description: string
  amount: number
  dueDate: string
  paid: boolean
}

type CategoryKind = 'EXPENSE_FIXED' | 'EXPENSE_VARIABLE' | 'INCOME'

type Category = {
  id: string
  name: string
  kind: CategoryKind
}

type TransactionType = 'EXPENSE' | 'INCOME'

type Transaction = {
  id: string
  amount: number
  type: TransactionType
  description?: string | null
  date: string
  categoryId?: string | null
}

type AdviceSeverity = 'info' | 'warning' | 'alert'

type Advice = {
  id: string
  severity: AdviceSeverity
  title: string
  message: string
}

type AdviceResponse = {
  period: {
    from: string
    to: string
  }
  totals: {
    income: number
    expense: number
    balance: number
    fixedExpenses: number
    variableExpenses: number
  }
  advices: Advice[]
}

type View = 'login' | 'register' | 'dashboard'
type Tab = 'overview' | 'transactions' | 'categories' | 'charts' | 'insights'
type TxViewMode = 'gastos' | 'contas' | 'receitas'
type OverviewFilter = 'tudo' | 'gastos' | 'contas' | 'receitas'

const VOICE_KEYWORDS: { keywords: string[]; categoryName: string; label: string }[] = [
  { keywords: ['abasteci', 'posto', 'gasolina', 'combustível', 'combustivel', 'de gasolina', 'com gasolina', 'em gasolina', 'gastei de gasolina', 'gastei com gasolina'], categoryName: 'Transporte', label: 'Gasolina' },
  { keywords: ['mercado', 'super', 'compras', 'supermercado', 'no mercado', 'do mercado'], categoryName: 'Mercado', label: 'Mercado' },
  { keywords: ['lanche', 'restaurante', 'comida', 'uber', 'ifood', 'delivery', 'almoço', 'almoco', 'jantar'], categoryName: 'Lazer', label: 'Alimentação' },
  { keywords: ['farmácia', 'farmacia', 'remédio', 'remedio', 'medicamento'], categoryName: 'Lazer', label: 'Farmácia' },
  { keywords: ['aluguel'], categoryName: 'Aluguel', label: 'Aluguel' },
  { keywords: ['internet', 'net', 'wi-fi', 'wifi'], categoryName: 'Internet', label: 'Internet' },
  { keywords: ['academia'], categoryName: 'Academia', label: 'Academia' },
  { keywords: ['salário', 'salario', 'receita', 'entrada'], categoryName: 'Salário', label: 'Salário' },
]

function inferCategoryAndLabel(description: string, categories: Category[]): { categoryId: string; label: string } | undefined {
  const lower = description.toLowerCase().trim()
  for (const { keywords, categoryName, label } of VOICE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) {
      const cat = categories.find(
        (c) => c.name.toLowerCase().includes(categoryName.toLowerCase()) || categoryName.toLowerCase().includes(c.name.toLowerCase())
      )
      if (cat) return { categoryId: cat.id, label }
    }
  }
  return undefined
}

function kindLabel(kind: CategoryKind): string {
  if (kind === 'EXPENSE_FIXED') return 'Fixo'
  if (kind === 'EXPENSE_VARIABLE') return 'Variável'
  return 'Receita'
}

function App() {
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [health, setHealth] = useState<string | null>(null)
  const [nowLabel, setNowLabel] = useState<string>('')

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('assesor_token'),
  )
  const [userName, setUserName] = useState<string | null>(() =>
    localStorage.getItem('assesor_user_name'),
  )

  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [monthlyMetrics, setMonthlyMetrics] = useState<{
    savingsRate: number
    fixedPct: number
    variablePct: number
    cashAfterOpen: number
    totalDue: number
    totalPaid: number
    totalOpen: number
  } | null>(null)

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [txViewMode, setTxViewMode] = useState<TxViewMode>('gastos')
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>('tudo')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = `${d.getMonth() + 1}`.padStart(2, '0')
    return `${year}-${month}`
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [advice, setAdvice] = useState<AdviceResponse | null>(null)
  const [loadingAdvice, setLoadingAdvice] = useState(false)

  const [newTxType, setNewTxType] = useState<TransactionType>('EXPENSE')
  const [newTxAmount, setNewTxAmount] = useState('')
  const [newTxDescription, setNewTxDescription] = useState('')
  const [newTxCategoryId, setNewTxCategoryId] = useState<string>('')
  const [newTxDate, setNewTxDate] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })

  const [quickCommand, setQuickCommand] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const [overviewAdvice, setOverviewAdvice] = useState<{
    fixedExpenses: number
    variableExpenses: number
  } | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryKind, setNewCategoryKind] = useState<CategoryKind>('EXPENSE_VARIABLE')
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editType, setEditType] = useState<TransactionType>('EXPENSE')
  const [editDescription, setEditDescription] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [chartData, setChartData] = useState<{ categories: Array<{ id: string; name: string; kind: string; income: number; expense: number }>; byKind: { fixed: number; variable: number; income: number } } | null>(null)
  const [loadingCharts, setLoadingCharts] = useState(false)

  useEffect(() => {
    if (token) {
      setView('dashboard')
      loadDashboard()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  useEffect(() => {
    function updateNow() {
      const d = new Date()
      const date = d.toLocaleDateString('pt-BR')
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      setNowLabel(`${date} • ${time}`)
    }
    updateNow()
    const id = setInterval(updateNow, 60000)
    return () => clearInterval(id)
  }, [])

  async function checkHealth() {
    try {
      setHealth('Verificando...')
      const res = await fetch(`${API_BASE_URL}/health`)
      const data = (await res.json()) as HealthResponse
      setHealth(`API online: ${data.status}`)
    } catch (error) {
      console.error(error)
      setHealth('Erro ao conectar na API')
    }
  }

  function getMonthRange(ym: string): { from: string; to: string } {
    const [yearStr, monthStr] = ym.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const start = new Date(year, month - 1, 1, 0, 0, 0)
    const end = new Date(year, month, 0, 23, 59, 59)
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    }
  }

  async function handleAuth(
    event: React.FormEvent,
    mode: 'login' | 'register',
  ) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const body =
        mode === 'login'
          ? { email, password }
          : { email, password, name: name || undefined }

      const res = await fetch(`${API_BASE_URL}/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const responseBody = (await res.json().catch(() => null)) as
        | AuthResponse
        | { message?: string }
        | null

      if (!res.ok || !responseBody || !('token' in responseBody)) {
        const errorMessage =
          (responseBody as { message?: string })?.message ||
          `Erro ao ${mode === 'login' ? 'fazer login' : 'registrar'} (status ${
            res.status
          })`
        setMessage(errorMessage)
        return
      }

      const data = responseBody as AuthResponse

      localStorage.setItem('assesor_token', data.token)
      localStorage.setItem('assesor_user_name', data.user.name || data.user.email)
      setToken(data.token)
      setUserName(data.user.name || data.user.email)
      setMessage(
        mode === 'login'
          ? 'Login realizado com sucesso!'
          : 'Cadastro realizado com sucesso!',
      )
      setView('dashboard')
      await loadDashboard(data.token)
    } catch (error) {
      console.error(error)
      setMessage(
        mode === 'login'
          ? 'Erro inesperado ao fazer login.'
          : 'Erro inesperado ao registrar.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleExportPdf() {
    if (!token) return
    try {
      const { from, to } = getMonthRange(selectedMonth)

      const [yearStr, monthStr] = selectedMonth.split('-')
      const ymLabel = `${monthStr}/${yearStr}`

      const [overviewRes, txRes] = await Promise.all([
        fetch(`${API_BASE_URL}/months/${yearStr}-${monthStr}/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `${API_BASE_URL}/transactions?from=${from}&to=${to}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      ])

      if (!overviewRes.ok) {
        setMessage('Não foi possível gerar o relatório. Tente novamente.')
        return
      }

      const overview = (await overviewRes.json()) as {
        totals: {
          income: number
          expense: number
          balance: number
          fixedExpenses: number
          variableExpenses: number
          savingsRate: number
          fixedPct: number
          variablePct: number
          cashAvailableAfterOpenBills: number
        }
        bills: {
          totalDue: number
          totalPaid: number
          totalOpen: number
        }
      }

      const txData = txRes.ok ? ((await txRes.json()) as Transaction[]) : []

      const doc = new jsPDF()
      let y = 15

      doc.setFontSize(14)
      doc.text('Relatório financeiro familiar', 14, y)
      y += 7

      doc.setFontSize(11)
      doc.text(`Mês: ${ymLabel}`, 14, y)
      y += 6
      if (userName) {
        doc.text(`Responsável: ${userName}`, 14, y)
        y += 6
      }

      y += 2
      doc.setFontSize(12)
      doc.text('Resumo do mês', 14, y)
      y += 5
      doc.setFontSize(10)

      const fmt = (v: number) =>
        `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

      doc.text(`Receitas: ${fmt(overview.totals.income)}`, 14, y)
      y += 5
      doc.text(`Despesas: ${fmt(overview.totals.expense)}`, 14, y)
      y += 5
      doc.text(`Saldo: ${fmt(overview.totals.balance)}`, 14, y)
      y += 5
      doc.text(
        `Despesas fixas: ${fmt(overview.totals.fixedExpenses)} (${(
          overview.totals.fixedPct * 100
        ).toFixed(0)}% da renda)`,
        14,
        y,
      )
      y += 5
      doc.text(
        `Despesas variáveis: ${fmt(overview.totals.variableExpenses)} (${(
          overview.totals.variablePct * 100
        ).toFixed(0)}% da renda)`,
        14,
        y,
      )
      y += 5
      doc.text(
        `Taxa de poupança do mês: ${(overview.totals.savingsRate * 100).toFixed(0)}%`,
        14,
        y,
      )
      y += 5
      doc.text(
        `Contas previstas: ${fmt(overview.bills.totalDue)} · pagas: ${fmt(
          overview.bills.totalPaid,
        )} · em aberto: ${fmt(overview.bills.totalOpen)}`,
        14,
        y,
      )
      y += 8

      if (txData.length > 0) {
        doc.setFontSize(12)
        doc.text('Transações do mês', 14, y)
        y += 5
        doc.setFontSize(9)

        const maxLines = 25
        const slice = txData.slice(0, maxLines)

        slice.forEach((t) => {
          if (y > 270) {
            doc.addPage()
            y = 15
          }
          const dateLabel = new Date(t.date).toLocaleDateString('pt-BR')
          const typeLabel = t.type === 'INCOME' ? 'Receita' : 'Despesa'
          const line = `${dateLabel} · ${typeLabel} · ${fmt(
            t.amount,
          )} · ${t.description || 'Sem descrição'}`
          doc.text(line, 14, y)
          y += 5
        })

        if (txData.length > maxLines) {
          doc.text(
            `(+ ${txData.length - maxLines} transações adicionais não exibidas)`,
            14,
            y,
          )
        }
      }

      doc.save(`relatorio-financeiro-${selectedMonth}.pdf`)
    } catch (error) {
      console.error(error)
      setMessage('Erro ao gerar PDF. Tente novamente.')
    }
  }

  async function loadDashboard(forcedToken?: string) {
    const authToken = forcedToken || token
    if (!authToken) return
    setLoadingDashboard(true)
    try {
      const [yearStr, monthStr] = selectedMonth.split('-')
      const overviewRes = await fetch(
        `${API_BASE_URL}/months/${yearStr}-${monthStr}/overview`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        },
      )

      if (overviewRes.ok) {
        const data = (await overviewRes.json()) as {
          totals: {
            income: number
            expense: number
            balance: number
            fixedExpenses: number
            variableExpenses: number
            savingsRate: number
            fixedPct: number
            variablePct: number
            cashAvailableAfterOpenBills: number
          }
          bills: {
            totalDue: number
            totalPaid: number
            totalOpen: number
            items: Bill[]
          }
        }
        setSummary({
          totalIncome: data.totals.income,
          totalExpense: data.totals.expense,
          balance: data.totals.balance,
        })
        setBills(
          (data.bills.items || []).map((b) => ({
            ...b,
            amount: b.amount,
          })),
        )
        setOverviewAdvice({
          fixedExpenses: data.totals.fixedExpenses,
          variableExpenses: data.totals.variableExpenses,
        })
        setMonthlyMetrics({
          savingsRate: data.totals.savingsRate,
          fixedPct: data.totals.fixedPct,
          variablePct: data.totals.variablePct,
          cashAfterOpen: data.totals.cashAvailableAfterOpenBills,
          totalDue: data.bills.totalDue,
          totalPaid: data.bills.totalPaid,
          totalOpen: data.bills.totalOpen,
        })
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingDashboard(false)
    }
  }

  async function loadCategories() {
    if (!token) return
    setLoadingCategories(true)
    try {
      const res = await fetch(`${API_BASE_URL}/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as Category[]
        setCategories(data)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingCategories(false)
    }
  }

  async function ensureCategories() {
    if (categories.length > 0) return
    await loadCategories()
  }

  async function loadTransactionsList() {
    if (!token) return
    setLoadingTransactions(true)
    try {
      await ensureCategories()
      const { from, to } = getMonthRange(selectedMonth)
      const params = new URLSearchParams()
      params.set('from', from)
      params.set('to', to)
      const res = await fetch(`${API_BASE_URL}/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as Transaction[]
        setTransactions(data)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingTransactions(false)
    }
  }

  // Mantemos as contas em aberto carregadas via /months/:ym/overview no loadDashboard.

  async function loadAdviceData() {
    if (!token) return
    setLoadingAdvice(true)
    try {
      const res = await fetch(`${API_BASE_URL}/advice/financial?ym=${selectedMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as AdviceResponse
        setAdvice(data)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingAdvice(false)
    }
  }

  async function loadChartData() {
    if (!token) return
    setLoadingCharts(true)
    try {
      const { from, to } = getMonthRange(selectedMonth)
      const params = new URLSearchParams()
      params.set('from', from)
      params.set('to', to)
      const res = await fetch(`${API_BASE_URL}/transactions/summary/by-category?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as {
          categories: Array<{ id: string; name: string; kind: string; income: number; expense: number }>
          byKind: { fixed: number; variable: number; income: number }
        }
        setChartData(data)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingCharts(false)
    }
  }

  function handleChangeTab(tab: Tab) {
    setActiveTab(tab)
    if (!token) return
    if (tab === 'overview') {
      loadDashboard()
    } else if (tab === 'transactions') {
      loadTransactionsList()
    } else if (tab === 'categories') {
      loadCategories()
    } else if (tab === 'charts') {
      loadDashboard()
      loadChartData()
    } else if (tab === 'insights') {
      loadAdviceData()
    }
  }

  async function handleUpdateTransaction(event: React.FormEvent) {
    event.preventDefault()
    if (!token || !editingTransaction) return
    const amount = Number(editAmount.replace(',', '.'))
    if (Number.isNaN(amount) || amount <= 0) {
      setMessage('Informe um valor válido.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/transactions/${editingTransaction.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          type: editType,
          description: editDescription || undefined,
          categoryId: editCategoryId || undefined,
          date: editDate,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setMessage(body?.message || 'Erro ao atualizar.')
        return
      }
      setEditingTransaction(null)
      await loadTransactionsList()
      await loadDashboard()
      setMessage('Transação atualizada.')
    } catch (error) {
      console.error(error)
      setMessage('Erro ao atualizar transação.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteTransaction(id: string) {
    if (!token) return
    if (!window.confirm('Excluir esta transação?')) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/transactions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status !== 204) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setMessage(body?.message || 'Erro ao excluir.')
        return
      }
      if (editingTransaction?.id === id) setEditingTransaction(null)
      await loadTransactionsList()
      await loadDashboard()
      setMessage('Transação excluída.')
    } catch (error) {
      console.error(error)
      setMessage('Erro ao excluir transação.')
    } finally {
      setLoading(false)
    }
  }

  function openEditTransaction(t: Transaction) {
    setEditingTransaction(t)
    setEditAmount(t.amount.toString())
    setEditType(t.type)
    setEditDescription(t.description || '')
    setEditCategoryId(t.categoryId || '')
    setEditDate(t.date.slice(0, 10))
  }

  function parseQuickCommand(text: string): { amount: number; description: string } | null {
    const t = text.trim()
    if (!t) return null
    const numRegex = /(?:R\$\s*)?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*reais?/i
    const match = t.match(numRegex)
    if (!match) return null
    const numStr = (match[1] || match[2] || '').replace(',', '.')
    const amount = Number(numStr)
    if (Number.isNaN(amount) || amount <= 0) return null
    const description = t.replace(match[0], '').trim() || 'Despesa rápida'
    return { amount, description }
  }

  async function submitQuickExpense(parsed: { amount: number; description: string }) {
    if (!token) return
    if (categories.length === 0) await loadCategories()
    const inferred = inferCategoryAndLabel(parsed.description, categories)
    const variableCategory = categories.find((c) => c.kind === 'EXPENSE_VARIABLE')
    const categoryId = inferred?.categoryId || variableCategory?.id
    const descriptionToSave = inferred ? inferred.label : parsed.description
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: parsed.amount,
          type: 'EXPENSE' as TransactionType,
          description: descriptionToSave,
          categoryId: categoryId || undefined,
          date: new Date().toISOString().slice(0, 10),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setMessage(body?.message || 'Erro ao registrar.')
        return
      }
      setQuickCommand('')
      await loadDashboard()
      await loadTransactionsList()
      setActiveTab('transactions')
      setMessage(`Despesa de R$ ${parsed.amount.toFixed(2)} registrada. Veja em Transações.`)
    } catch (error) {
      console.error(error)
      setMessage('Erro ao registrar despesa.')
    } finally {
      setLoading(false)
    }
  }

  async function handleQuickCommand(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    const parsed = parseQuickCommand(quickCommand)
    if (!parsed) {
      setMessage('Digite algo como: "Abasteci R$ 50" ou "50 reais mercado"')
      return
    }
    await submitQuickExpense(parsed)
  }

  function startVoiceInput() {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      setMessage('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.')
      return
    }
    if (!token) return
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'pt-BR'
    recognitionRef.current = recognition
    setIsListening(true)
    setMessage('Fale agora: ex. "Abasteci 50 reais" ou "30 reais mercado"...')

    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim()
      // Assim que recebemos o resultado, paramos explicitamente a captura
      recognition.stop()
      setIsListening(false)
      recognitionRef.current = null

      setQuickCommand(transcript)
      const parsed = parseQuickCommand(transcript)
      if (parsed) {
        submitQuickExpense(parsed).then(() => {
          setMessage('Despesa registrada por voz.')
        })
      } else {
        setMessage('Não entendi o valor. Corrija o texto e clique em Registrar.')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onerror = (event: { error: string }) => {
      setIsListening(false)
      recognitionRef.current = null
      if (event.error === 'not-allowed') {
        setMessage('Microfone bloqueado. Permita o acesso nas configurações do navegador.')
      } else {
        setMessage('Erro ao ouvir. Tente de novo.')
      }
    }

    recognition.start()
  }

  function stopVoiceInput() {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }

  async function handleCreateCategory(event: React.FormEvent) {
    event.preventDefault()
    if (!token || !newCategoryName.trim()) return
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newCategoryName.trim(), kind: newCategoryKind }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string } | Category | null
      if (!res.ok) {
        setMessage((body as { message?: string })?.message || 'Erro ao criar categoria.')
        return
      }
      setNewCategoryName('')
      setNewCategoryKind('EXPENSE_VARIABLE')
      await loadCategories()
      setMessage('Categoria criada com sucesso.')
    } catch (error) {
      console.error(error)
      setMessage('Erro ao criar categoria.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateTransaction(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    const amount = Number(newTxAmount.replace(',', '.'))
    if (!amount || Number.isNaN(amount)) {
      setMessage('Informe um valor válido para a transação.')
      return
    }

    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          type: newTxType,
          description: newTxDescription || undefined,
          categoryId: newTxCategoryId || undefined,
          date: newTxDate,
        }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setMessage(body?.message || 'Erro ao criar transação.')
        return
      }

      setNewTxAmount('')
      setNewTxDescription('')
      setNewTxCategoryId('')
      setNewTxDate(new Date().toISOString().slice(0, 10))
      await loadTransactionsList()
      await loadDashboard()
      setMessage('Transação criada com sucesso.')
    } catch (error) {
      console.error(error)
      setMessage('Erro inesperado ao criar transação.')
    } finally {
      setLoading(false)
    }
  }


  function handleLogout() {
    localStorage.removeItem('assesor_token')
    localStorage.removeItem('assesor_user_name')
    setToken(null)
    setUserName(null)
    setSummary(null)
    setBills([])
    setView('login')
    setMessage(null)
  }

  const isLoginView = view === 'login'

  const computedSummary = React.useMemo(() => {
    if (!summary) return null

    const incomeTotal = summary.totalIncome
    const expenseTotal = summary.totalExpense
    const fixed = overviewAdvice?.fixedExpenses ?? 0
    const variable = overviewAdvice?.variableExpenses ?? 0

    if (overviewFilter === 'gastos') {
      const expense = variable || expenseTotal
      const balance = incomeTotal - expense
      return { income: incomeTotal, expense, balance, fixed, variable }
    }

    if (overviewFilter === 'contas') {
      const expense = fixed || expenseTotal
      const balance = incomeTotal - expense
      return { income: incomeTotal, expense, balance, fixed, variable }
    }

    if (overviewFilter === 'receitas') {
      const income = incomeTotal
      return { income, expense: 0, balance: income, fixed, variable }
    }

    // 'tudo'
    return {
      income: incomeTotal,
      expense: expenseTotal,
      balance: summary.balance,
      fixed,
      variable,
    }
  }, [summary, overviewAdvice, overviewFilter])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-main">
          <h1>Assessor Financeiro - Web</h1>
          <p>Visualize e acompanhe suas finanças mês a mês.</p>
        </div>
        <div className="app-header-actions">
          <button className="secondary" type="button" onClick={checkHealth}>
            Testar conexão com API
          </button>
          {health && <p className="health">{health}</p>}
          {nowLabel && <p className="datetime">{nowLabel}</p>}
        </div>
      </header>

      <main className="card">
        {!token ? (
          <>
            <h2>{isLoginView ? 'Login' : 'Criar conta'}</h2>
            <form
              onSubmit={(e) => handleAuth(e, isLoginView ? 'login' : 'register')}
              className="form"
            >
              {!isLoginView && (
                <label>
                  Nome
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </label>
              )}

              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </label>

              <label>
                Senha
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  required
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading
                  ? isLoginView
                    ? 'Entrando...'
                    : 'Cadastrando...'
                  : isLoginView
                    ? 'Entrar'
                    : 'Criar conta'}
              </button>
            </form>

            {message && <p className="message">{message}</p>}

            <p className="hint">
              {isLoginView
                ? 'Ainda não tem conta? '
                : 'Já tem conta? '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setView(isLoginView ? 'register' : 'login')
                  setMessage(null)
                }}
              >
                {isLoginView ? 'Criar conta' : 'Fazer login'}
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="dashboard-header">
              <div className="dashboard-header-main">
                <h2>Olá, {userName ?? 'usuário'}</h2>
                <p className="hint">Aqui está um resumo rápido das suas finanças.</p>
              </div>
              <div className="dashboard-header-controls">
                <button type="button" className="secondary" onClick={handleExportPdf}>
                  Exportar PDF
                </button>
                <button type="button" className="secondary" onClick={handleLogout}>
                  Sair
                </button>
              </div>
            </div>

            <section className="quick-command">
              <form onSubmit={handleQuickCommand} className="quick-command-form">
                <input
                  type="text"
                  value={quickCommand}
                  onChange={(e) => setQuickCommand(e.target.value)}
                  placeholder='Ex.: Abasteci R$ 50  ou  50 reais mercado'
                  aria-label="Comando rápido de despesa"
                />
                <button type="submit" disabled={loading}>
                  {loading ? '...' : 'Registrar'}
                </button>
                <button
                  type="button"
                  className={`voice-btn ${isListening ? 'listening' : ''}`}
                  onClick={isListening ? stopVoiceInput : startVoiceInput}
                  title={isListening ? 'Parar gravação' : 'Registrar por voz'}
                  aria-label={isListening ? 'Parar gravação' : 'Registrar despesa por voz'}
                >
                  {isListening ? '⏹ Parar' : '🎤 Voz'}
                </button>
              </form>
              <p className="hint">Digite ou use o botão &quot;Voz&quot; e fale: &quot;Abasteci 50 reais&quot;, &quot;30 reais mercado&quot;, etc.</p>
            </section>

            <nav className="tabs">
              <button
                type="button"
                className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => handleChangeTab('overview')}
              >
                Resumo
              </button>
              <button
                type="button"
                className={`tab-button ${activeTab === 'transactions' ? 'active' : ''}`}
                onClick={() => handleChangeTab('transactions')}
              >
                Transações
              </button>
              <button
                type="button"
                className={`tab-button ${activeTab === 'categories' ? 'active' : ''}`}
                onClick={() => handleChangeTab('categories')}
              >
                Categorias
              </button>
              <button
                type="button"
                className={`tab-button ${activeTab === 'charts' ? 'active' : ''}`}
                onClick={() => handleChangeTab('charts')}
              >
                Gráficos
              </button>
              <button
                type="button"
                className={`tab-button ${activeTab === 'insights' ? 'active' : ''}`}
                onClick={() => handleChangeTab('insights')}
              >
                Insights
              </button>
            </nav>

            {message && <p className="message">{message}</p>}

            {activeTab === 'overview' && (
              <>
                {loadingDashboard && (
                  <p className="hint">Atualizando resumo com seus dados...</p>
                )}

                {summary && (
                  <div className="overview-controls">
                    <div className="month-selector">
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          const value = e.target.value
                          if (!value) return
                          setSelectedMonth(value)
                          loadDashboard()
                          // mantém outras abas sincronizadas com o mês
                          loadTransactionsList()
                          loadChartData()
                          loadAdviceData()
                        }}
                      />
                    </div>
                    <div className="overview-filter">
                      <button
                        type="button"
                        className={`chip ${overviewFilter === 'tudo' ? 'active' : ''}`}
                        onClick={() => setOverviewFilter('tudo')}
                      >
                        Tudo
                      </button>
                      <button
                        type="button"
                        className={`chip ${overviewFilter === 'gastos' ? 'active' : ''}`}
                        onClick={() => setOverviewFilter('gastos')}
                      >
                        Gastos
                      </button>
                      <button
                        type="button"
                        className={`chip ${overviewFilter === 'contas' ? 'active' : ''}`}
                        onClick={() => setOverviewFilter('contas')}
                      >
                        Contas
                      </button>
                      <button
                        type="button"
                        className={`chip ${overviewFilter === 'receitas' ? 'active' : ''}`}
                        onClick={() => setOverviewFilter('receitas')}
                      >
                        Receitas
                      </button>
                    </div>
                  </div>
                )}

                {summary && computedSummary && (
                  <section className="summary">
                    <div>
                      <span>Receitas</span>
                      <strong>
                        {computedSummary.income.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>
                    </div>
                    {overviewAdvice && overviewFilter !== 'receitas' ? (
                      <>
                        <div>
                          <span>Despesas fixas</span>
                          <strong>
                            {computedSummary.fixed.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </strong>
                        </div>
                        <div>
                          <span>Despesas variáveis</span>
                          <strong>
                            {computedSummary.variable.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <div>
                        <span>Despesas</span>
                        <strong>
                          {summary.totalExpense.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </strong>
                      </div>
                    )}
                    <div>
                      <span>Saldo</span>
                      <strong>
                        {computedSummary.balance.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>
                    </div>
                  </section>
                )}

                {monthlyMetrics && (
                  <section className="summary-metrics">
                    <p>
                      Taxa de poupança do mês:{' '}
                      <strong>{(monthlyMetrics.savingsRate * 100).toFixed(0)}%</strong>
                    </p>
                    <p>
                      Distribuição de despesas sobre a renda:{' '}
                      <strong>
                        fixas {(monthlyMetrics.fixedPct * 100).toFixed(0)}% · variáveis{' '}
                        {(monthlyMetrics.variablePct * 100).toFixed(0)}%
                      </strong>
                    </p>
                  </section>
                )}

                <section className="bills">
                  <h3>Contas em aberto</h3>
                  {monthlyMetrics && (
                    <p className="hint">
                      Previsto no mês:{' '}
                      <strong>
                        {monthlyMetrics.totalDue.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>{' '}
                      · já pago:{' '}
                      <strong>
                        {monthlyMetrics.totalPaid.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>{' '}
                      · em aberto:{' '}
                      <strong>
                        {monthlyMetrics.totalOpen.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>
                      {summary && (
                        <>
                          {' '}
                          · saldo após contas em aberto:{' '}
                          <strong>
                            {monthlyMetrics.cashAfterOpen.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </strong>
                        </>
                      )}
                    </p>
                  )}
                  {bills.length === 0 ? (
                    <p className="hint">Nenhuma conta em aberto encontrada.</p>
                  ) : (
                    <ul>
                      {bills.map((bill) => (
                        <li key={bill.id}>
                          <div>
                            <strong>{bill.description}</strong>
                            <span>
                              Vence em{' '}
                              {new Date(bill.dueDate).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <span>
                            {bill.amount.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {activeTab === 'transactions' && (
              <section className="transactions">
                <h3>Transações</h3>
                <div className="tx-view-toggle">
                  <button
                    type="button"
                    className={`chip ${txViewMode === 'gastos' ? 'active' : ''}`}
                    onClick={() => setTxViewMode('gastos')}
                  >
                    Gastos (dia a dia)
                  </button>
                  <button
                    type="button"
                    className={`chip ${txViewMode === 'contas' ? 'active' : ''}`}
                    onClick={() => setTxViewMode('contas')}
                  >
                    Contas do mês
                  </button>
                  <button
                    type="button"
                    className={`chip ${txViewMode === 'receitas' ? 'active' : ''}`}
                    onClick={() => setTxViewMode('receitas')}
                  >
                    Receitas
                  </button>
                </div>
                {txViewMode !== 'contas' && (
                  <form className="form" onSubmit={handleCreateTransaction}>
                    <div className="form-row">
                      <label>
                        Tipo
                        <select
                          value={
                            txViewMode === 'gastos'
                              ? 'EXPENSE'
                              : txViewMode === 'receitas'
                                ? 'INCOME'
                                : newTxType
                          }
                          onChange={(e) =>
                            setNewTxType(e.target.value as TransactionType)
                          }
                        >
                          <option value="EXPENSE">Despesa</option>
                          <option value="INCOME">Receita</option>
                        </select>
                      </label>
                      <label>
                        Data
                        <input
                          type="date"
                          value={newTxDate}
                          onChange={(e) => setNewTxDate(e.target.value)}
                        />
                      </label>
                    </div>

                    <label>
                      Valor
                      <input
                        type="number"
                        step="0.01"
                        value={newTxAmount}
                        onChange={(e) => setNewTxAmount(e.target.value)}
                        placeholder="0,00"
                        required
                      />
                    </label>

                    <label>
                      Categoria
                      <select
                        value={newTxCategoryId}
                        onChange={(e) => setNewTxCategoryId(e.target.value)}
                      >
                        <option value="">Selecione (opcional)</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({kindLabel(c.kind)})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Descrição
                      <input
                        type="text"
                        value={newTxDescription}
                        onChange={(e) => setNewTxDescription(e.target.value)}
                        placeholder="Ex.: Uber, Mercado..."
                      />
                    </label>

                    <button type="submit" disabled={loading}>
                      {loading ? 'Salvando...' : 'Adicionar transação'}
                    </button>
                  </form>
                )}

                {txViewMode === 'contas' && (
                  <p className="hint">
                    As contas do mês são calculadas a partir das categorias fixas e das
                    contas cadastradas. Em breve vamos trazer um formulário dedicado
                    aqui, separado dos gastos do dia a dia.
                  </p>
                )}

                {loadingTransactions ? (
                  <p className="hint">Carregando suas transações...</p>
                ) : transactions.length === 0 ? (
                  <p className="hint">Você ainda não registrou nenhuma transação.</p>
                ) : (
                  <ul className="transactions-list">
                    {transactions
                      .filter((t) => {
                        if (txViewMode === 'gastos') {
                          return t.type === 'EXPENSE'
                        }
                        if (txViewMode === 'receitas') {
                          return t.type === 'INCOME'
                        }
                        // 'contas' mostra apenas despesas classificadas como fixas
                        const cat = categories.find((c) => c.id === t.categoryId)
                        return (
                          t.type === 'EXPENSE' &&
                          cat?.kind === 'EXPENSE_FIXED'
                        )
                      })
                      .map((t) => {
                        const cat = categories.find((c) => c.id === t.categoryId)
                        const categoryLabel = cat
                          ? `${cat.name} (${kindLabel(cat.kind)})`
                          : 'Sem categoria'
                        return (
                          <li key={t.id}>
                            <div>
                              <strong>{t.description || cat?.name || 'Sem categoria'}</strong>
                              <span>
                                {categoryLabel} •{' '}
                                {new Date(t.date).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <div className="tx-actions">
                              <span
                                className={
                                  t.type === 'INCOME'
                                    ? 'amount income'
                                    : 'amount expense'
                                }
                              >
                                {t.type === 'INCOME' ? '+' : '-'}
                                {t.amount.toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </span>
                              <button
                                type="button"
                                className="secondary small"
                                onClick={() => openEditTransaction(t)}
                                title="Editar"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="secondary small danger"
                                onClick={() => handleDeleteTransaction(t.id)}
                                title="Excluir"
                              >
                                Excluir
                              </button>
                            </div>
                          </li>
                        )
                      })}
                  </ul>
                )}
              </section>
            )}

            {activeTab === 'categories' && (
              <section className="categories-section">
                <h3>Categorias</h3>
                <p className="hint">Crie categorias e use em transações e contas. Tipo: Fixo (despesas recorrentes), Variável (gastos do dia a dia), Receita.</p>
                <form className="form" onSubmit={handleCreateCategory}>
                  <label>
                    Nome
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex.: Gasolina, Farmácia..."
                      required
                    />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={newCategoryKind}
                      onChange={(e) =>
                        setNewCategoryKind(e.target.value as CategoryKind)
                      }
                    >
                      <option value="EXPENSE_FIXED">Despesa fixa</option>
                      <option value="EXPENSE_VARIABLE">Despesa variável</option>
                      <option value="INCOME">Receita</option>
                    </select>
                  </label>
                  <button type="submit" disabled={loading}>
                    {loading ? 'Salvando...' : 'Adicionar categoria'}
                  </button>
                </form>
                {loadingCategories ? (
                  <p className="hint">Carregando categorias...</p>
                ) : categories.length === 0 ? (
                  <p className="hint">Nenhuma categoria ainda. Crie uma acima.</p>
                ) : (
                  <ul className="categories-list">
                    {categories.map((c) => (
                      <li key={c.id}>
                        <span className="category-name">{c.name}</span>
                        <span className={`category-badge kind-${c.kind.toLowerCase()}`}>
                          {kindLabel(c.kind)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeTab === 'charts' && (
              <section className="charts-section">
                <h3>Gráficos</h3>
                {loadingCharts && <p className="hint">Carregando...</p>}
                {!loadingCharts && chartData && (
                  <>
                    {summary && (
                      <div className="chart-summary-bars">
                        <h4>Receitas x Despesas</h4>
                        <div className="bar-chart-simple">
                          <div className="bar-row">
                            <span>Receitas</span>
                            <div className="bar-track"><div className="bar fill-income" style={{ width: `${summary.totalIncome > 0 ? Math.min(100, (summary.totalIncome / (summary.totalIncome + summary.totalExpense || 1)) * 100) : 0}%` }} /></div>
                            <span>{summary.totalIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          </div>
                          <div className="bar-row">
                            <span>Despesas</span>
                            <div className="bar-track"><div className="bar fill-expense" style={{ width: `${summary.totalExpense > 0 ? Math.min(100, (summary.totalExpense / (summary.totalIncome + summary.totalExpense || 1)) * 100) : 0}%` }} /></div>
                            <span>{summary.totalExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {chartData.categories.filter((c) => c.expense > 0).length === 0 ? (
                      <p className="hint">Registre despesas com categorias para ver o gráfico.</p>
                    ) : (
                      <div className="chart-pie-wrap">
                        <h4>Despesas por categoria</h4>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={chartData.categories.filter((c) => c.expense > 0).map((c) => ({ name: c.name, value: c.expense }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                              label={({ name, value }) => `${name}: R$ ${value.toFixed(0)}`}
                            >
                              {chartData.categories.filter((c) => c.expense > 0).map((c, i) => (
                                <Cell key={c.id} fill={`hsl(${260 + i * 40}, 70%, 55%)`} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {activeTab === 'insights' && (
              <section className="insights">
                <h3>Insights financeiros</h3>
                {loadingAdvice && (
                  <p className="hint">Buscando conselhos com base nos seus dados...</p>
                )}
                {!loadingAdvice && advice && advice.advices.length === 0 && (
                  <p className="hint">
                    Ainda não há insights gerados. Registre receitas, despesas e
                    contas para ver recomendações personalizadas.
                  </p>
                )}
                {!loadingAdvice &&
                  advice &&
                  advice.advices.map((item) => (
                    <article
                      key={item.id}
                      className={`advice-card advice-${item.severity}`}
                    >
                      <h4>{item.title}</h4>
                      <p>{item.message}</p>
                    </article>
                  ))}
              </section>
            )}
          </>
        )}
      </main>

      {editingTransaction && (
        <div className="modal-overlay" onClick={() => setEditingTransaction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar transação</h3>
            <form className="form" onSubmit={handleUpdateTransaction}>
              <label>
                Tipo
                <select value={editType} onChange={(e) => setEditType(e.target.value as TransactionType)}>
                  <option value="EXPENSE">Despesa</option>
                  <option value="INCOME">Receita</option>
                </select>
              </label>
              <label>
                Valor
                <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} required />
              </label>
              <label>
                Data
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
              </label>
              <label>
                Categoria
                <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({kindLabel(c.kind)})</option>
                  ))}
                </select>
              </label>
              <label>
                Descrição
                <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descrição" />
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setEditingTransaction(null)}>Cancelar</button>
                <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
