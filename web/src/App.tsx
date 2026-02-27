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

type View = 'login' | 'register' | 'dashboard'

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
      const [summaryRes, billsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/transactions/summary`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`${API_BASE_URL}/bills?status=open`, {
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
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingDashboard(false)
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

            {loadingDashboard && <p className="message">Carregando dados...</p>}

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
                <div>
                  <span>Despesas</span>
                  <strong>
                    {summary.totalExpense.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </div>
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
      </main>
    </div>
  )
}

export default App
