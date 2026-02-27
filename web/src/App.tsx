import './App.css'
import React, { useEffect, useState } from 'react'

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
type Tab = 'overview' | 'transactions' | 'bills' | 'categories' | 'insights'

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

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('assesor_token'),
  )
  const [userName, setUserName] = useState<string | null>(() =>
    localStorage.getItem('assesor_user_name'),
  )

  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [loadingDashboard, setLoadingDashboard] = useState(false)

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [loadingBills, setLoadingBills] = useState(false)
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

  const [newBillDescription, setNewBillDescription] = useState('')
  const [newBillAmount, setNewBillAmount] = useState('')
  const [newBillDueDate, setNewBillDueDate] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [newBillCategoryId, setNewBillCategoryId] = useState<string>('')

  const [quickCommand, setQuickCommand] = useState('')
  const [overviewAdvice, setOverviewAdvice] = useState<{
    fixedExpenses: number
    variableExpenses: number
  } | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryKind, setNewCategoryKind] = useState<CategoryKind>('EXPENSE_VARIABLE')

  useEffect(() => {
    if (token) {
      setView('dashboard')
      loadDashboard()
    }
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

  async function loadDashboard(forcedToken?: string) {
    const authToken = forcedToken || token
    if (!authToken) return
    setLoadingDashboard(true)
    try {
      const [summaryRes, billsRes, adviceRes] = await Promise.all([
        fetch(`${API_BASE_URL}/transactions/summary`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`${API_BASE_URL}/bills?status=open`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`${API_BASE_URL}/advice/financial`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ])

      if (summaryRes.ok) {
        const s = (await summaryRes.json()) as SummaryResponse
        setSummary(s)
      }

      if (billsRes.ok) {
        const b = (await billsRes.json()) as Bill[]
        setBills(b)
      }

      if (adviceRes.ok) {
        const a = (await adviceRes.json()) as AdviceResponse
        setOverviewAdvice({
          fixedExpenses: a.totals.fixedExpenses,
          variableExpenses: a.totals.variableExpenses,
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
      const res = await fetch(`${API_BASE_URL}/transactions`, {
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

  async function loadBillsList() {
    if (!token) return
    setLoadingBills(true)
    try {
      await ensureCategories()
      const res = await fetch(`${API_BASE_URL}/bills?status=open`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as Bill[]
        setBills(data)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingBills(false)
    }
  }

  async function loadAdviceData() {
    if (!token) return
    setLoadingAdvice(true)
    try {
      const res = await fetch(`${API_BASE_URL}/advice/financial`, {
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

  function handleChangeTab(tab: Tab) {
    setActiveTab(tab)
    if (!token) return
    if (tab === 'overview') {
      loadDashboard()
    } else if (tab === 'transactions') {
      loadTransactionsList()
    } else if (tab === 'bills') {
      loadBillsList()
    } else if (tab === 'categories') {
      loadCategories()
    } else if (tab === 'insights') {
      loadAdviceData()
    }
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

  async function handleQuickCommand(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    const parsed = parseQuickCommand(quickCommand)
    if (!parsed) {
      setMessage('Digite algo como: "Abasteci R$ 50" ou "50 reais mercado"')
      return
    }
    const variableCategory = categories.find((c) => c.kind === 'EXPENSE_VARIABLE')
    try {
      setLoading(true)
      setMessage(null)
      const res = await fetch(`${API_BASE_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: parsed.amount,
          type: 'EXPENSE' as TransactionType,
          description: parsed.description,
          categoryId: variableCategory?.id || undefined,
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
      setMessage(`Despesa de R$ ${parsed.amount.toFixed(2)} registrada.`)
    } catch (error) {
      console.error(error)
      setMessage('Erro ao registrar despesa.')
    } finally {
      setLoading(false)
    }
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

  async function handleCreateBill(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    const amount = Number(newBillAmount.replace(',', '.'))
    if (!amount || Number.isNaN(amount)) {
      setMessage('Informe um valor válido para a conta.')
      return
    }

    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/bills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          description: newBillDescription,
          amount,
          dueDate: newBillDueDate,
          categoryId: newBillCategoryId || undefined,
        }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setMessage(body?.message || 'Erro ao criar conta.')
        return
      }

      setNewBillDescription('')
      setNewBillAmount('')
      setNewBillCategoryId('')
      setNewBillDueDate(new Date().toISOString().slice(0, 10))
      await loadBillsList()
      await loadDashboard()
      setMessage('Conta criada com sucesso.')
    } catch (error) {
      console.error(error)
      setMessage('Erro inesperado ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePayBill(id: string) {
    if (!token) return
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/bills/${id}/pay`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setMessage(body?.message || 'Erro ao marcar conta como paga.')
        return
      }
      await loadBillsList()
      await loadDashboard()
      setMessage('Conta marcada como paga.')
    } catch (error) {
      console.error(error)
      setMessage('Erro inesperado ao marcar conta como paga.')
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Assessor Financeiro - Web</h1>
        <p>Conectado ao backend no Railway</p>
        <button className="secondary" type="button" onClick={checkHealth}>
          Testar conexão com API
        </button>
        {health && <p className="health">{health}</p>}
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
              <div>
                <h2>Olá, {userName ?? 'usuário'}</h2>
                <p className="hint">Aqui está um resumo rápido das suas finanças.</p>
              </div>
              <button type="button" className="secondary" onClick={handleLogout}>
                Sair
              </button>
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
              </form>
              <p className="hint">Digite valor e descrição (ex.: &quot;Abasteci R$ 50&quot;) para registrar uma despesa do dia.</p>
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
                className={`tab-button ${activeTab === 'bills' ? 'active' : ''}`}
                onClick={() => handleChangeTab('bills')}
              >
                Contas
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
                  <section className="summary">
                    <div>
                      <span>Receitas</span>
                      <strong>
                        {summary.totalIncome.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>
                    </div>
                    {overviewAdvice ? (
                      <>
                        <div>
                          <span>Despesas fixas</span>
                          <strong>
                            {overviewAdvice.fixedExpenses.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </strong>
                        </div>
                        <div>
                          <span>Despesas variáveis</span>
                          <strong>
                            {overviewAdvice.variableExpenses.toLocaleString('pt-BR', {
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
                        {summary.balance.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>
                    </div>
                  </section>
                )}

                <section className="bills">
                  <h3>Contas em aberto</h3>
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
                <form className="form" onSubmit={handleCreateTransaction}>
                  <div className="form-row">
                    <label>
                      Tipo
                      <select
                        value={newTxType}
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

                {loadingTransactions ? (
                  <p className="hint">Carregando suas transações...</p>
                ) : transactions.length === 0 ? (
                  <p className="hint">Você ainda não registrou nenhuma transação.</p>
                ) : (
                  <ul className="transactions-list">
                    {transactions.map((t) => {
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
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}

            {activeTab === 'bills' && (
              <section className="bills-section">
                <h3>Contas</h3>

                <form className="form" onSubmit={handleCreateBill}>
                  <label>
                    Descrição
                    <input
                      type="text"
                      value={newBillDescription}
                      onChange={(e) => setNewBillDescription(e.target.value)}
                      placeholder="Ex.: Aluguel, Internet..."
                      required
                    />
                  </label>

                  <div className="form-row">
                    <label>
                      Valor
                      <input
                        type="number"
                        step="0.01"
                        value={newBillAmount}
                        onChange={(e) => setNewBillAmount(e.target.value)}
                        placeholder="0,00"
                        required
                      />
                    </label>
                    <label>
                      Vencimento
                      <input
                        type="date"
                        value={newBillDueDate}
                        onChange={(e) => setNewBillDueDate(e.target.value)}
                        required
                      />
                    </label>
                  </div>

                  <label>
                    Categoria
                    <select
                      value={newBillCategoryId}
                      onChange={(e) => setNewBillCategoryId(e.target.value)}
                    >
                      <option value="">Selecione (opcional)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({kindLabel(c.kind)})
                        </option>
                      ))}
                    </select>
                  </label>

                  <button type="submit" disabled={loading}>
                    {loading ? 'Salvando...' : 'Adicionar conta'}
                  </button>
                </form>

                {loadingBills ? (
                  <p className="hint">Carregando contas...</p>
                ) : bills.length === 0 ? (
                  <p className="hint">Nenhuma conta em aberto encontrada.</p>
                ) : (
                  <ul className="bills-list">
                    {bills.map((bill) => (
                      <li key={bill.id}>
                        <div>
                          <strong>{bill.description}</strong>
                          <span>
                            Vence em{' '}
                            {new Date(bill.dueDate).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div className="bills-actions">
                          <span>
                            {bill.amount.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                          {!bill.paid && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => handlePayBill(bill.id)}
                            >
                              Marcar paga
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
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
    </div>
  )
}

export default App
