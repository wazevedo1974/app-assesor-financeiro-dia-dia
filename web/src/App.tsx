import { useState, useEffect } from 'react'
import { api, setAuthToken } from './api'
import './App.css'

type MainTab = 'resumo' | 'transacoes'
type OverviewFilter = 'tudo' | 'gastos' | 'contas' | 'receitas'
type TxViewMode = 'gastos' | 'contas' | 'receitas'

function getMonthBounds(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const from = `${ym}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${ym}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[m - 1]} ${y}`
}

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Formata data ISO (YYYY-MM-DD) para padrão brasileiro DD/MM/AAAA */
function formatDateBR(iso: string) {
  const s = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// --- Login ---
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.login(email, password)
      onLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <h1>Assessor Financeiro</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  )
}

// --- Resumo (seletor de mês + filtros Tudo/Gastos/Contas/Receitas) ---
function Resumo() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>('tudo')
  const [summary, setSummary] = useState<{ totalIncome: number; totalExpense: number; balance: number } | null>(null)
  const [openBills, setOpenBills] = useState<{ id: string; description: string; amount: number; dueDate: string }[]>([])
  const [transactions, setTransactions] = useState<{ id: string; amount: number; type: string; description?: string | null; date: string }[]>([])
  const [advices, setAdvices] = useState<{ id: string; severity: string; title: string; message: string }[]>([])
  const [loading, setLoading] = useState(true)

  const { from, to } = getMonthBounds(selectedMonth)

  async function load() {
    setLoading(true)
    try {
      const [sum, bills, txs, advice] = await Promise.all([
        api.getSummary(from, to),
        api.listBills('open', from, to),
        api.listTransactions(from, to),
        api.getFinancialAdvice(),
      ])
      setSummary(sum)
      setOpenBills(bills)
      setTransactions(txs)
      setAdvices(advice.advices || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [selectedMonth])

  function prevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number)
    const prev = m === 1 ? [y - 1, 12] : [y, m - 1]
    setSelectedMonth(`${prev[0]}-${String(prev[1]).padStart(2, '0')}`)
  }
  function nextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number)
    const next = m === 12 ? [y + 1, 1] : [y, m + 1]
    setSelectedMonth(`${next[0]}-${String(next[1]).padStart(2, '0')}`)
  }

  const filteredBills = overviewFilter === 'tudo' || overviewFilter === 'contas' ? openBills : []
  const filteredTx = overviewFilter === 'tudo'
    ? transactions
    : overviewFilter === 'gastos'
      ? transactions.filter((t) => t.type === 'EXPENSE')
      : overviewFilter === 'receitas'
        ? transactions.filter((t) => t.type === 'INCOME')
        : []

  if (loading) return <div className="screen"><p>Carregando...</p></div>

  return (
    <div className="screen">
      <div className="month-selector">
        <button type="button" onClick={prevMonth} aria-label="Mês anterior">‹</button>
        <span>{formatMonthLabel(selectedMonth)}</span>
        <button type="button" onClick={nextMonth} aria-label="Próximo mês">›</button>
      </div>

      <div className="filter-chips">
        {(['tudo', 'gastos', 'contas', 'receitas'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={overviewFilter === f ? 'active' : ''}
            onClick={() => setOverviewFilter(f)}
          >
            {f === 'tudo' ? 'Tudo' : f === 'gastos' ? 'Gastos' : f === 'contas' ? 'Contas' : 'Receitas'}
          </button>
        ))}
      </div>

      <div className="cards">
        <div className="card">
          <span className="label">Receitas</span>
          <span className="value income">R$ {summary ? summary.totalIncome.toFixed(2) : '0,00'}</span>
        </div>
        <div className="card">
          <span className="label">Despesas realizadas</span>
          <span className="value expense">R$ {summary ? summary.totalExpense.toFixed(2) : '0,00'}</span>
        </div>
        <div className="card">
          <span className="label">Saldo</span>
          <span className={`value ${summary && summary.balance >= 0 ? 'income' : 'expense'}`}>
            R$ {summary ? summary.balance.toFixed(2) : '0,00'}
          </span>
        </div>
      </div>

      <div className="expense-sums">
        <p><strong>Somas do mês:</strong></p>
        <p>Despesas realizadas (só gastos que você lançou em Transações → Gastos): <span className="expense">R$ {summary ? summary.totalExpense.toFixed(2) : '0,00'}</span></p>
        <p>Total contas a pagar (vencimentos que ainda não pagou): <span className="expense">R$ {openBills.reduce((a, b) => a + b.amount, 0).toFixed(2)}</span></p>
        <p className="expense-sums-hint">&quot;Marcar paga&quot; só tira a conta da lista; não cria despesa. Para aparecer aqui, lance em Transações → Gastos quando pagar.</p>
        <button
          type="button"
          className="btn-reset-month"
          onClick={async () => {
            if (!window.confirm(`Apagar todas as transações (gastos e receitas) de ${formatMonthLabel(selectedMonth)}? Não apaga contas a pagar.`)) return
            try {
              await api.deleteTransactionsInPeriod(from, to)
              await load()
            } catch (e) {
              console.error(e)
            }
          }}
        >
          Limpar transações deste mês
        </button>
      </div>

      {(overviewFilter === 'tudo' || overviewFilter === 'contas') && openBills.length > 0 && (
        <section className="section">
          <h3>Contas a pagar</h3>
          <div className="card">
            <p className="label">Total: R$ {openBills.reduce((a, b) => a + b.amount, 0).toFixed(2)}</p>
            <ul className="bill-list">
              {filteredBills.map((b) => (
                <li key={b.id}>
                  <span>{b.description} — vence {formatDateBR(b.dueDate)}</span>
                  <span className="expense">R$ {b.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(overviewFilter === 'tudo' || overviewFilter === 'gastos' || overviewFilter === 'receitas') && filteredTx.length > 0 && (
        <section className="section">
          <h3>Movimentações</h3>
          <ul className="tx-list">
            {filteredTx.map((t) => (
              <li key={t.id}>
                <span>{formatDateBR(t.date)} {t.description || '-'}</span>
                <span className={t.type === 'INCOME' ? 'income' : 'expense'}>
                  {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overviewFilter === 'tudo' && filteredTx.length === 0 && openBills.length === 0 && (
        <p className="muted">Nenhuma movimentação nem conta a pagar neste mês.</p>
      )}
      {overviewFilter === 'gastos' && filteredTx.length === 0 && <p className="muted">Nenhum gasto neste mês.</p>}
      {overviewFilter === 'contas' && openBills.length === 0 && <p className="muted">Nenhuma conta a pagar neste mês.</p>}
      {overviewFilter === 'receitas' && filteredTx.length === 0 && <p className="muted">Nenhuma receita neste mês.</p>}

      {advices.length > 0 && (
        <section className="section">
          <h3>Conselhos</h3>
          {advices.map((a) => (
            <div key={a.id} className={`advice advice-${a.severity}`}>
              <strong>{a.title}</strong>
              <p>{a.message}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

// --- Transações (3 modos: Gastos | Contas do mês | Receitas) ---
type Category = { id: string; name: string; kind: string }

function Transacoes() {
  const [txViewMode, setTxViewMode] = useState<TxViewMode>('gastos')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Gastos
  const [gastosList, setGastosList] = useState<{ id: string; amount: number; type: string; description?: string | null; date: string }[]>([])
  const [gDesc, setGDesc] = useState('')
  const [gAmount, setGAmount] = useState('')
  const [gDate, setGDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [gCategoryId, setGCategoryId] = useState('')
  const [gSending, setGSending] = useState(false)

  // Contas do mês
  const [bills, setBills] = useState<{ id: string; description: string; amount: number; dueDate: string; paid: boolean }[]>([])
  const [cDesc, setCDesc] = useState('')
  const [cAmount, setCAmount] = useState('')
  const [cDueDate, setCDueDate] = useState('')
  const [cCategoryId, setCCategoryId] = useState('')
  const [cRecurring, setCRecurring] = useState(false)
  const [cSending, setCSending] = useState(false)

  // Receitas
  const [receitasList, setReceitasList] = useState<{ id: string; amount: number; type: string; description?: string | null; date: string }[]>([])
  const [rDesc, setRDesc] = useState('')
  const [rAmount, setRAmount] = useState('')
  const [rDate, setRDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [rCategoryId, setRCategoryId] = useState('')
  const [rSending, setRSending] = useState(false)

  const { from, to } = getMonthBounds(selectedMonth)

  const categoriesGastos = categories.filter((c) => c.kind === 'EXPENSE_VARIABLE')
  const categoriesContas = categories.filter((c) => c.kind === 'EXPENSE_FIXED' || c.kind === 'EXPENSE_VARIABLE')
  const categoriesReceitas = categories.filter((c) => c.kind === 'INCOME')

  async function loadCategories() {
    try {
      const list = await api.listCategories()
      setCategories(list)
    } catch (err) {
      console.error(err)
    }
  }

  async function loadGastos() {
    setLoading(true)
    try {
      const list = await api.listTransactions(from, to, 'EXPENSE')
      setGastosList(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadBills() {
    setLoading(true)
    try {
      const list = await api.listBills('open', from, to)
      setBills(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadReceitas() {
    setLoading(true)
    try {
      const list = await api.listTransactions(from, to, 'INCOME')
      setReceitasList(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCategories() }, [])
  useEffect(() => {
    if (txViewMode === 'gastos') loadGastos()
    else if (txViewMode === 'contas') loadBills()
    else loadReceitas()
  }, [txViewMode, selectedMonth])

  async function handleAddGasto(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(gAmount.replace(',', '.'))
    if (isNaN(num) || num <= 0) return
    setGSending(true)
    try {
      await api.createTransaction({
        amount: num,
        type: 'EXPENSE',
        description: gDesc.trim() || undefined,
        categoryId: gCategoryId || undefined,
        date: gDate,
      })
      setGDesc(''); setGAmount(''); setGDate(new Date().toISOString().slice(0, 10)); setGCategoryId('')
      await loadGastos()
    } catch (err) {
      console.error(err)
    } finally {
      setGSending(false)
    }
  }

  async function handleAddConta(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(cAmount.replace(',', '.'))
    if (!cDesc.trim() || isNaN(num) || num <= 0 || !cDueDate) return
    setCSending(true)
    try {
      await api.createBill({
        description: cDesc.trim(),
        amount: num,
        dueDate: cDueDate,
        categoryId: cCategoryId || undefined,
        recurrence: cRecurring ? 'MONTHLY' : 'NONE',
      })
      setCDesc(''); setCAmount(''); setCDueDate(''); setCCategoryId(''); setCRecurring(false)
      await loadBills()
    } catch (err) {
      console.error(err)
    } finally {
      setCSending(false)
    }
  }

  async function handleAddReceita(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(rAmount.replace(',', '.'))
    if (isNaN(num) || num <= 0) return
    setRSending(true)
    try {
      await api.createTransaction({
        amount: num,
        type: 'INCOME',
        description: rDesc.trim() || undefined,
        categoryId: rCategoryId || undefined,
        date: rDate,
      })
      setRDesc(''); setRAmount(''); setRDate(new Date().toISOString().slice(0, 10)); setRCategoryId('')
      await loadReceitas()
    } catch (err) {
      console.error(err)
    } finally {
      setRSending(false)
    }
  }

  async function handlePayBill(id: string) {
    try {
      await api.payBill(id)
      await loadBills()
    } catch (err) {
      console.error(err)
    }
  }

  if (loading && gastosList.length === 0 && bills.length === 0 && receitasList.length === 0) {
    return <div className="screen"><p>Carregando...</p></div>
  }

  return (
    <div className="screen">
      <div className="tx-mode-chips">
        <button type="button" className={txViewMode === 'gastos' ? 'active' : ''} onClick={() => setTxViewMode('gastos')}>
          Gastos (dia a dia)
        </button>
        <button type="button" className={txViewMode === 'contas' ? 'active' : ''} onClick={() => setTxViewMode('contas')}>
          Contas do mês
        </button>
        <button type="button" className={txViewMode === 'receitas' ? 'active' : ''} onClick={() => setTxViewMode('receitas')}>
          Receitas
        </button>
      </div>

      <div className="month-selector small">
        <button type="button" onClick={() => { const [y,m]=selectedMonth.split('-').map(Number); setSelectedMonth(m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`) }}>‹</button>
        <span>{formatMonthLabel(selectedMonth)}</span>
        <button type="button" onClick={() => { const [y,m]=selectedMonth.split('-').map(Number); setSelectedMonth(m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`) }}>›</button>
      </div>

      {txViewMode === 'gastos' && (
        <>
          <h3>Novo gasto</h3>
          <form onSubmit={handleAddGasto} className="form-block">
            <input placeholder="Descrição" value={gDesc} onChange={(e) => setGDesc(e.target.value)} />
            <input placeholder="Valor" type="text" inputMode="decimal" value={gAmount} onChange={(e) => setGAmount(e.target.value)} required />
            <input type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} required />
            <select value={gCategoryId} onChange={(e) => setGCategoryId(e.target.value)}>
              <option value="">Categoria</option>
              {categoriesGastos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" disabled={gSending}>{gSending ? 'Salvando...' : 'Adicionar'}</button>
          </form>
          <h3>Gastos do mês</h3>
          <ul className="tx-list">
            {gastosList.map((t) => (
              <li key={t.id}>
                <span>{formatDateBR(t.date)} {t.description || '-'}</span>
                <span>
                  <span className="expense">- R$ {t.amount.toFixed(2)}</span>
                  <button type="button" className="btn-delete" onClick={async () => { try { await api.deleteTransaction(t.id); await loadGastos(); } catch (e) { console.error(e); } }}>Excluir</button>
                </span>
              </li>
            ))}
          </ul>
          {gastosList.length === 0 && <p className="muted">Nenhum gasto neste mês.</p>}
        </>
      )}

      {txViewMode === 'contas' && (
        <>
          <h3>Nova conta a pagar</h3>
          <form onSubmit={handleAddConta} className="form-block">
            <input placeholder="Descrição" value={cDesc} onChange={(e) => setCDesc(e.target.value)} required />
            <input placeholder="Valor" type="text" inputMode="decimal" value={cAmount} onChange={(e) => setCAmount(e.target.value)} required />
            <input type="date" value={cDueDate} onChange={(e) => setCDueDate(e.target.value)} required />
            <select value={cCategoryId} onChange={(e) => setCCategoryId(e.target.value)}>
              <option value="">Categoria</option>
              {categoriesContas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="checkbox-label">
              <input type="checkbox" checked={cRecurring} onChange={(e) => setCRecurring(e.target.checked)} />
              Repetir todo mês
            </label>
            <button type="submit" disabled={cSending}>{cSending ? 'Salvando...' : 'Adicionar'}</button>
          </form>
          <h3>Contas do mês</h3>
          <ul className="bill-list">
            {bills.map((b) => (
              <li key={b.id}>
                <span>{b.description} — {formatDateBR(b.dueDate)}</span>
                <span>
                  <span className="expense">R$ {b.amount.toFixed(2)}</span>
                  <button type="button" className="btn-pay" onClick={() => handlePayBill(b.id)}>Marcar paga</button>
                </span>
              </li>
            ))}
          </ul>
          {bills.length === 0 && <p className="muted">Nenhuma conta em aberto neste mês.</p>}
        </>
      )}

      {txViewMode === 'receitas' && (
        <>
          <h3>Nova receita</h3>
          <form onSubmit={handleAddReceita} className="form-block">
            <input placeholder="Descrição" value={rDesc} onChange={(e) => setRDesc(e.target.value)} />
            <input placeholder="Valor" type="text" inputMode="decimal" value={rAmount} onChange={(e) => setRAmount(e.target.value)} required />
            <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} required />
            <select value={rCategoryId} onChange={(e) => setRCategoryId(e.target.value)}>
              <option value="">Categoria (Salário, Vendas, etc.)</option>
              {categoriesReceitas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" disabled={rSending}>{rSending ? 'Salvando...' : 'Adicionar'}</button>
          </form>
          <h3>Receitas do mês</h3>
          <ul className="tx-list">
            {receitasList.map((t) => (
              <li key={t.id}>
                <span>{formatDateBR(t.date)} {t.description || '-'}</span>
                <span>
                  <span className="income">+ R$ {t.amount.toFixed(2)}</span>
                  <button type="button" className="btn-delete" onClick={async () => { try { await api.deleteTransaction(t.id); await loadReceitas(); } catch (e) { console.error(e); } }}>Excluir</button>
                </span>
              </li>
            ))}
          </ul>
          {receitasList.length === 0 && <p className="muted">Nenhuma receita neste mês.</p>}
        </>
      )}
    </div>
  )
}

// --- App (só Resumo e Transações) ---
function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [tab, setTab] = useState<MainTab>('resumo')

  function handleLogin() {
    setToken(localStorage.getItem('token'))
  }

  function handleLogout() {
    setAuthToken(null)
    setToken(null)
  }

  if (!token) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Assessor Financeiro</h1>
        <button type="button" className="logout" onClick={handleLogout}>Sair</button>
      </header>
      <nav className="tabs main-tabs">
        <button type="button" className={tab === 'resumo' ? 'active' : ''} onClick={() => setTab('resumo')}>Resumo</button>
        <button type="button" className={tab === 'transacoes' ? 'active' : ''} onClick={() => setTab('transacoes')}>Transações</button>
      </nav>
      {tab === 'resumo' && <Resumo />}
      {tab === 'transacoes' && <Transacoes />}
    </div>
  )
}

export default App
