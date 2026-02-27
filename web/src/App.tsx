import { useState, useEffect } from 'react'
import { api, setAuthToken } from './api'
import './App.css'

type Tab = 'resumo' | 'transacoes' | 'contas'

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
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  )
}

function Resumo() {
  const [summary, setSummary] = useState<{ totalIncome: number; totalExpense: number; balance: number } | null>(null)
  const [openBills, setOpenBills] = useState<{ id: string; description: string; amount: number; dueDate: string }[]>([])
  const [advices, setAdvices] = useState<{ id: string; severity: string; title: string; message: string }[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [sum, bills, advice] = await Promise.all([
        api.getSummary(),
        api.listBills('open'),
        api.getFinancialAdvice(),
      ])
      setSummary(sum)
      setOpenBills(bills)
      setAdvices(advice.advices || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="screen"><p>Carregando...</p></div>

  return (
    <div className="screen">
      <h2>Resumo</h2>
      <div className="cards">
        <div className="card">
          <span className="label">Receitas</span>
          <span className="value income">R$ {summary ? summary.totalIncome.toFixed(2) : '0,00'}</span>
        </div>
        <div className="card">
          <span className="label">Despesas</span>
          <span className="value expense">R$ {summary ? summary.totalExpense.toFixed(2) : '0,00'}</span>
        </div>
        <div className="card">
          <span className="label">Saldo</span>
          <span className={`value ${summary && summary.balance >= 0 ? 'income' : 'expense'}`}>
            R$ {summary ? summary.balance.toFixed(2) : '0,00'}
          </span>
        </div>
      </div>
      {openBills.length > 0 && (
        <section className="section">
          <h3>Contas a pagar</h3>
          <div className="card">
            <p className="label">Total: R$ {openBills.reduce((a, b) => a + b.amount, 0).toFixed(2)}</p>
            <ul className="bill-list">
              {openBills.map((b) => (
                <li key={b.id}>
                  <span>{b.description} — vence {b.dueDate.slice(0, 10).split('-').reverse().join('/')}</span>
                  <span className="expense">R$ {b.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
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

function Transacoes() {
  const [list, setList] = useState<{ id: string; amount: number; type: string; description?: string | null; date: string }[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const data = await api.listTransactions()
      setList(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="screen"><p>Carregando...</p></div>

  return (
    <div className="screen">
      <h2>Transações</h2>
      <ul className="tx-list">
        {list.map((t) => (
          <li key={t.id}>
            <span>{t.date.slice(0, 10)} {t.description || '-'}</span>
            <span className={t.type === 'INCOME' ? 'income' : 'expense'}>
              {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="muted">Nenhuma transação.</p>}
    </div>
  )
}

function Contas() {
  const [bills, setBills] = useState<{ id: string; description: string; amount: number; dueDate: string; paid: boolean }[]>([])
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await api.listBills('open')
      setBills(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount.replace(',', '.'))
    if (!desc.trim() || isNaN(num) || num <= 0 || !dueDate) return
    setSending(true)
    try {
      await api.createBill({ description: desc.trim(), amount: num, dueDate })
      setDesc(''); setAmount(''); setDueDate('')
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  async function handlePay(id: string) {
    try {
      await api.payBill(id)
      await load()
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <div className="screen"><p>Carregando...</p></div>

  return (
    <div className="screen">
      <h2>Contas a pagar</h2>
      <form onSubmit={handleAdd} className="form-inline">
        <input placeholder="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} required />
        <input placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        <button type="submit" disabled={sending}>{sending ? 'Salvando...' : 'Adicionar'}</button>
      </form>
      <ul className="bill-list">
        {bills.map((b) => (
          <li key={b.id}>
            <span>{b.description} — {b.dueDate.slice(0, 10)}</span>
            <span>
              <span className="expense">R$ {b.amount.toFixed(2)}</span>
              <button type="button" className="btn-pay" onClick={() => handlePay(b.id)}>Marcar paga</button>
            </span>
          </li>
        ))}
      </ul>
      {bills.length === 0 && <p className="muted">Nenhuma conta em aberto.</p>}
    </div>
  )
}

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [tab, setTab] = useState<Tab>('resumo')

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
      <nav className="tabs">
        <button type="button" className={tab === 'resumo' ? 'active' : ''} onClick={() => setTab('resumo')}>Resumo</button>
        <button type="button" className={tab === 'transacoes' ? 'active' : ''} onClick={() => setTab('transacoes')}>Transações</button>
        <button type="button" className={tab === 'contas' ? 'active' : ''} onClick={() => setTab('contas')}>Contas</button>
      </nav>
      {tab === 'resumo' && <Resumo />}
      {tab === 'transacoes' && <Transacoes />}
      {tab === 'contas' && <Contas />}
    </div>
  )
}

export default App
