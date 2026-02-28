import { useState, useEffect, useRef, useCallback } from 'react'
import { api, setAuthToken } from './api'
import { parseVoiceText, suggestCategoryId } from './voiceUtils'
import { generateReportPdf } from './pdfReport'
import './App.css'

interface SpeechRecognitionInstance {
  start: () => void
  stop: () => void
  lang: string
  continuous: boolean
  onresult: ((e: unknown) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
const SpeechRecognitionCtor = typeof window !== 'undefined' && (
  (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition ||
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition
)

type MainTab = 'resumo' | 'transacoes' | 'categorias'
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

/** Formata valor numérico em Real (padrão BR: 1.234,56) */
function formatBRL(value: number): string {
  return value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
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
type Category = { id: string; name: string; kind: string }

function Resumo({ selectedMonth, setSelectedMonth }: { selectedMonth: string; setSelectedMonth: (m: string) => void }) {
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>('tudo')
  const [summary, setSummary] = useState<{ totalIncome: number; totalExpense: number; balance: number } | null>(null)
  const [openBills, setOpenBills] = useState<{ id: string; description: string; amount: number; dueDate: string; categoryId?: string | null; recurrence?: string }[]>([])
  const [transactions, setTransactions] = useState<{ id: string; amount: number; type: string; description?: string | null; date: string; categoryId?: string | null }[]>([])
  const [advices, setAdvices] = useState<{ id: string; severity: string; title: string; message: string }[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editModal, setEditModal] = useState<'conta'|'tx'|null>(null)
  const [editingBillId, setEditingBillId] = useState<string | null>(null)
  const [cEditDesc, setCEditDesc] = useState('')
  const [cEditAmount, setCEditAmount] = useState('')
  const [cEditDueDate, setCEditDueDate] = useState('')
  const [cEditCategoryId, setCEditCategoryId] = useState('')
  const [cEditRecurring, setCEditRecurring] = useState(false)
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [txEditDesc, setTxEditDesc] = useState('')
  const [txEditAmount, setTxEditAmount] = useState('')
  const [txEditDate, setTxEditDate] = useState('')
  const [txEditCategoryId, setTxEditCategoryId] = useState('')
  const [txEditType, setTxEditType] = useState<'INCOME'|'EXPENSE'>('EXPENSE')

  const { from, to } = getMonthBounds(selectedMonth)
  const categoriesContas = categories.filter((c) => c.kind === 'EXPENSE_FIXED' || c.kind === 'EXPENSE_VARIABLE')
  const categoriesGastos = categories.filter((c) => c.kind === 'EXPENSE_VARIABLE')
  const categoriesReceitas = categories.filter((c) => c.kind === 'INCOME')

  async function load() {
    setLoading(true)
    try {
      const [sum, bills, txs, advice, cats] = await Promise.all([
        api.getSummary(from, to),
        api.listBills('open', from, to),
        api.listTransactions(from, to),
        api.getFinancialAdvice(),
        api.listCategories(),
      ])
      setSummary(sum)
      setOpenBills(bills)
      setTransactions(txs)
      setAdvices(advice.advices || [])
      setCategories(cats)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [selectedMonth])
  useEffect(() => {
    const onRefresh = () => load()
    window.addEventListener('assessor:refresh', onRefresh)
    return () => window.removeEventListener('assessor:refresh', onRefresh)
  }, [selectedMonth])

  function openEditBill(b: { id: string; description: string; amount: number; dueDate: string; categoryId?: string | null; recurrence?: string }) {
    setEditingBillId(b.id)
    setCEditDesc(b.description)
    setCEditAmount(String(b.amount))
    setCEditDueDate(b.dueDate.slice(0, 10))
    setCEditCategoryId(b.categoryId || '')
    setCEditRecurring(b.recurrence === 'MONTHLY')
    setEditModal('conta')
    setMenuOpenId(null)
  }
  async function saveEditBill() {
    if (!editingBillId) return
    const num = Number(cEditAmount.replace(',', '.'))
    if (!cEditDesc.trim() || isNaN(num) || num <= 0 || !cEditDueDate) return
    try {
      await api.updateBill(editingBillId, { description: cEditDesc.trim(), amount: num, dueDate: cEditDueDate, categoryId: cEditCategoryId || undefined, recurrence: cEditRecurring ? 'MONTHLY' : 'NONE' })
      setEditingBillId(null)
      setEditModal(null)
      await load()
    } catch (e) { console.error(e) }
  }
  async function handlePayBill(id: string) {
    try { await api.payBill(id); await load(); } catch (e) { console.error(e) }
    setMenuOpenId(null)
  }
  async function handleDeleteBill(id: string) {
    if (!window.confirm('Excluir esta conta?')) return
    try { await api.deleteBill(id); await load(); } catch (e) { console.error(e) }
    setMenuOpenId(null)
  }

  function openEditTx(t: { id: string; description?: string | null; amount: number; date: string; type: string; categoryId?: string | null }) {
    setEditingTxId(t.id)
    setTxEditDesc(t.description || '')
    setTxEditAmount(String(t.amount))
    setTxEditDate(t.date.slice(0, 10))
    setTxEditCategoryId(t.categoryId || '')
    setTxEditType(t.type === 'INCOME' ? 'INCOME' : 'EXPENSE')
    setEditModal('tx')
    setMenuOpenId(null)
  }
  async function saveEditTx() {
    if (!editingTxId) return
    const num = Number(txEditAmount.replace(',', '.'))
    if (isNaN(num) || num <= 0) return
    try {
      await api.updateTransaction(editingTxId, { amount: num, type: txEditType, description: txEditDesc.trim() || undefined, date: txEditDate, categoryId: txEditCategoryId || undefined })
      setEditingTxId(null)
      setEditModal(null)
      await load()
    } catch (e) { console.error(e) }
  }
  async function handleDeleteTx(id: string) {
    if (!window.confirm('Excluir este lançamento?')) return
    try { await api.deleteTransaction(id); await load(); } catch (e) { console.error(e) }
    setMenuOpenId(null)
  }

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
          <span className="value income">R$ {formatBRL(summary?.totalIncome ?? 0)}</span>
        </div>
        <div className="card">
          <span className="label">Despesas realizadas</span>
          <span className="value expense">R$ {formatBRL(summary?.totalExpense ?? 0)}</span>
        </div>
        <div className="card">
          <span className="label">Saldo</span>
          <span className={`value ${summary && summary.balance >= 0 ? 'income' : 'expense'}`}>
            R$ {formatBRL(summary?.balance ?? 0)}
          </span>
        </div>
      </div>

      <p className="line-total">Contas a pagar: <span className="expense">R$ {formatBRL(openBills.reduce((a, b) => a + b.amount, 0))}</span></p>
      <button type="button" className="link-btn" onClick={async () => { if (window.confirm(`Limpar todas as transações de ${formatMonthLabel(selectedMonth)}?`)) { try { await api.deleteTransactionsInPeriod(from, to); await load(); } catch (e) { console.error(e); } } }}>Limpar transações do mês</button>

      {(overviewFilter === 'tudo' || overviewFilter === 'contas') && openBills.length > 0 && (
        <section className="section">
          <h3>Contas a pagar</h3>
          <div className="card">
            <p className="label">Total: R$ {formatBRL(openBills.reduce((a, b) => a + b.amount, 0))}</p>
            <ul className="bill-list tx-list-slim">
              {filteredBills.map((b) => (
                <li key={b.id}>
                  <span>{b.description} — vence {formatDateBR(b.dueDate)}</span>
                  <span className="row-right">
                    <span className="expense">R$ {formatBRL(b.amount)}</span>
                    <div className="menu-wrap">
                      <button type="button" className="btn-menu" onClick={() => setMenuOpenId(menuOpenId === b.id ? null : b.id)} aria-label="Ações">⋮</button>
                      {menuOpenId === b.id && (
                        <>
                          <div className="menu-backdrop" onClick={() => setMenuOpenId(null)} />
                          <div className="menu-dropdown">
                            <button type="button" onClick={() => handlePayBill(b.id)}>Marcar paga</button>
                            <button type="button" onClick={() => openEditBill(b)}>Editar</button>
                            <button type="button" onClick={() => handleDeleteBill(b.id)}>Excluir</button>
                          </div>
                        </>
                      )}
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(overviewFilter === 'tudo' || overviewFilter === 'gastos' || overviewFilter === 'receitas') && filteredTx.length > 0 && (
        <section className="section">
          <h3>Movimentações</h3>
          <ul className="tx-list tx-list-slim">
            {filteredTx.map((t) => (
              <li key={t.id}>
                <span>{formatDateBR(t.date)} {t.description || '-'}</span>
                <span className="row-right">
                  <span className={t.type === 'INCOME' ? 'income' : 'expense'}>
                    {t.type === 'INCOME' ? '+' : '-'} R$ {formatBRL(t.amount)}
                  </span>
                  <div className="menu-wrap">
                    <button type="button" className="btn-menu" onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)} aria-label="Ações">⋮</button>
                    {menuOpenId === t.id && (
                      <>
                        <div className="menu-backdrop" onClick={() => setMenuOpenId(null)} />
                        <div className="menu-dropdown">
                          <button type="button" onClick={() => openEditTx(t)}>Editar</button>
                          <button type="button" onClick={() => handleDeleteTx(t.id)}>Excluir</button>
                        </div>
                      </>
                    )}
                  </div>
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

      {editModal === 'conta' && (
        <div className="modal-backdrop" onClick={() => { setEditModal(null); setEditingBillId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar conta</h3>
            <input placeholder="Descrição" value={cEditDesc} onChange={(e) => setCEditDesc(e.target.value)} />
            <input placeholder="Valor (R$) — ex: 100,50" value={cEditAmount} onChange={(e) => setCEditAmount(e.target.value)} />
            <input type="date" value={cEditDueDate} onChange={(e) => setCEditDueDate(e.target.value)} />
            <select value={cEditCategoryId} onChange={(e) => setCEditCategoryId(e.target.value)}><option value="">Categoria</option>{categoriesContas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <label className="checkbox-label"><input type="checkbox" checked={cEditRecurring} onChange={(e) => setCEditRecurring(e.target.checked)} /> Repetir todo mês</label>
            <div className="modal-actions">
              <button type="button" className="btn-save" onClick={saveEditBill}>Salvar</button>
              <button type="button" onClick={() => { setEditModal(null); setEditingBillId(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {editModal === 'tx' && (
        <div className="modal-backdrop" onClick={() => { setEditModal(null); setEditingTxId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{txEditType === 'INCOME' ? 'Editar receita' : 'Editar gasto'}</h3>
            <input placeholder="Descrição" value={txEditDesc} onChange={(e) => setTxEditDesc(e.target.value)} />
            <input placeholder="Valor (R$) — ex: 100,50" value={txEditAmount} onChange={(e) => setTxEditAmount(e.target.value)} />
            <input type="date" value={txEditDate} onChange={(e) => setTxEditDate(e.target.value)} />
            <select value={txEditCategoryId} onChange={(e) => setTxEditCategoryId(e.target.value)}>
              <option value="">Categoria</option>
              {(txEditType === 'INCOME' ? categoriesReceitas : categoriesGastos).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="modal-actions">
              <button type="button" className="btn-save" onClick={saveEditTx}>Salvar</button>
              <button type="button" onClick={() => { setEditModal(null); setEditingTxId(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Transações (3 modos: Gastos | Contas do mês | Receitas) ---

function Transacoes({ selectedMonth, setSelectedMonth }: { selectedMonth: string; setSelectedMonth: (m: string) => void }) {
  const [txViewMode, setTxViewMode] = useState<TxViewMode>('gastos')
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
  const [bills, setBills] = useState<{ id: string; description: string; amount: number; dueDate: string; paid: boolean; categoryId?: string | null; recurrence?: string }[]>([])
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

  // Edição (um por vez por tipo)
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null)
  const [gEditDesc, setGEditDesc] = useState('')
  const [gEditAmount, setGEditAmount] = useState('')
  const [gEditDate, setGEditDate] = useState('')
  const [gEditCategoryId, setGEditCategoryId] = useState('')

  const [editingBillId, setEditingBillId] = useState<string | null>(null)
  const [cEditDesc, setCEditDesc] = useState('')
  const [cEditAmount, setCEditAmount] = useState('')
  const [cEditDueDate, setCEditDueDate] = useState('')
  const [cEditCategoryId, setCEditCategoryId] = useState('')
  const [cEditRecurring, setCEditRecurring] = useState(false)

  const [editingReceitaId, setEditingReceitaId] = useState<string | null>(null)
  const [rEditDesc, setREditDesc] = useState('')
  const [rEditAmount, setREditAmount] = useState('')
  const [rEditDate, setREditDate] = useState('')
  const [rEditCategoryId, setREditCategoryId] = useState('')

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editModal, setEditModal] = useState<'gasto'|'conta'|'receita'|null>(null)

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
  useEffect(() => {
    const onRefresh = () => { loadGastos(); loadBills(); loadReceitas() }
    window.addEventListener('assessor:refresh', onRefresh)
    return () => window.removeEventListener('assessor:refresh', onRefresh)
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

  function openEditGasto(t: { id: string; description?: string | null; amount: number; date: string; categoryId?: string | null }) {
    setEditingGastoId(t.id)
    setGEditDesc(t.description || '')
    setGEditAmount(String(t.amount))
    setGEditDate(t.date.slice(0, 10))
    setGEditCategoryId(t.categoryId || '')
    setEditModal('gasto')
    setMenuOpenId(null)
  }
  async function saveEditGasto() {
    if (!editingGastoId) return
    const num = Number(gEditAmount.replace(',', '.'))
    if (isNaN(num) || num <= 0) return
    try {
      await api.updateTransaction(editingGastoId, { amount: num, description: gEditDesc.trim() || undefined, date: gEditDate, categoryId: gEditCategoryId || undefined })
      setEditingGastoId(null)
      setEditModal(null)
      await loadGastos()
    } catch (e) { console.error(e) }
  }

  function openEditBill(b: { id: string; description: string; amount: number; dueDate: string; categoryId?: string | null; recurrence?: string }) {
    setEditingBillId(b.id)
    setCEditDesc(b.description)
    setCEditAmount(String(b.amount))
    setCEditDueDate(b.dueDate.slice(0, 10))
    setCEditCategoryId(b.categoryId || '')
    setCEditRecurring(b.recurrence === 'MONTHLY')
    setEditModal('conta')
    setMenuOpenId(null)
  }
  async function saveEditBill() {
    if (!editingBillId) return
    const num = Number(cEditAmount.replace(',', '.'))
    if (!cEditDesc.trim() || isNaN(num) || num <= 0 || !cEditDueDate) return
    try {
      await api.updateBill(editingBillId, { description: cEditDesc.trim(), amount: num, dueDate: cEditDueDate, categoryId: cEditCategoryId || undefined, recurrence: cEditRecurring ? 'MONTHLY' : 'NONE' })
      setEditingBillId(null)
      setEditModal(null)
      await loadBills()
    } catch (e) { console.error(e) }
  }
  async function handleDeleteBill(id: string) {
    if (!window.confirm('Excluir esta conta?')) return
    try {
      await api.deleteBill(id)
      await loadBills()
    } catch (e) { console.error(e) }
    setMenuOpenId(null)
  }

  function openEditReceita(t: { id: string; description?: string | null; amount: number; date: string; categoryId?: string | null }) {
    setEditingReceitaId(t.id)
    setREditDesc(t.description || '')
    setREditAmount(String(t.amount))
    setREditDate(t.date.slice(0, 10))
    setREditCategoryId(t.categoryId || '')
    setEditModal('receita')
    setMenuOpenId(null)
  }
  async function saveEditReceita() {
    if (!editingReceitaId) return
    const num = Number(rEditAmount.replace(',', '.'))
    if (isNaN(num) || num <= 0) return
    try {
      await api.updateTransaction(editingReceitaId, { amount: num, type: 'INCOME', description: rEditDesc.trim() || undefined, date: rEditDate, categoryId: rEditCategoryId || undefined })
      setEditingReceitaId(null)
      setEditModal(null)
      await loadReceitas()
    } catch (e) { console.error(e) }
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
          <form onSubmit={handleAddGasto} className="form-block form-compact">
            <input placeholder="Descrição" value={gDesc} onChange={(e) => setGDesc(e.target.value)} />
            <input placeholder="Valor (R$) — ex: 100,50" type="text" inputMode="decimal" value={gAmount} onChange={(e) => setGAmount(e.target.value)} required />
            <input type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} />
            <select value={gCategoryId} onChange={(e) => setGCategoryId(e.target.value)}><option value="">Categoria</option>{categoriesGastos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button type="submit" disabled={gSending}>{gSending ? '...' : '+'}</button>
          </form>
          <ul className="tx-list tx-list-slim">
            {gastosList.map((t) => (
              <li key={t.id}>
                <span>{formatDateBR(t.date)} {t.description || '-'}</span>
                <span className="row-right">
                  <span className="expense">R$ {formatBRL(t.amount)}</span>
                  <div className="menu-wrap">
                    <button type="button" className="btn-menu" onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)} aria-label="Ações">⋮</button>
                    {menuOpenId === t.id && (
                      <>
                        <div className="menu-backdrop" onClick={() => setMenuOpenId(null)} />
                        <div className="menu-dropdown">
                          <button type="button" onClick={() => openEditGasto(t)}>Editar</button>
                          <button type="button" onClick={async () => { try { await api.deleteTransaction(t.id); await loadGastos(); setMenuOpenId(null); } catch (e) { console.error(e); } }}>Excluir</button>
                        </div>
                      </>
                    )}
                  </div>
                </span>
              </li>
            ))}
          </ul>
          {gastosList.length === 0 && <p className="muted">Nenhum gasto neste mês.</p>}
        </>
      )}

      {txViewMode === 'contas' && (
        <>
          <form onSubmit={handleAddConta} className="form-block form-compact">
            <input placeholder="Descrição" value={cDesc} onChange={(e) => setCDesc(e.target.value)} required />
            <input placeholder="Valor (R$) — ex: 100,50" type="text" inputMode="decimal" value={cAmount} onChange={(e) => setCAmount(e.target.value)} required />
            <input type="date" value={cDueDate} onChange={(e) => setCDueDate(e.target.value)} required />
            <select value={cCategoryId} onChange={(e) => setCCategoryId(e.target.value)}><option value="">Categoria</option>{categoriesContas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <label className="checkbox-label"><input type="checkbox" checked={cRecurring} onChange={(e) => setCRecurring(e.target.checked)} /> Repetir</label>
            <button type="submit" disabled={cSending}>{cSending ? '...' : '+'}</button>
          </form>
          <ul className="bill-list tx-list-slim">
            {bills.map((b) => (
              <li key={b.id}>
                <span>{b.description} — {formatDateBR(b.dueDate)}</span>
                <span className="row-right">
                  <span className="expense">R$ {formatBRL(b.amount)}</span>
                  <div className="menu-wrap">
                    <button type="button" className="btn-menu" onClick={() => setMenuOpenId(menuOpenId === b.id ? null : b.id)} aria-label="Ações">⋮</button>
                    {menuOpenId === b.id && (
                      <>
                        <div className="menu-backdrop" onClick={() => setMenuOpenId(null)} />
                        <div className="menu-dropdown">
                          <button type="button" onClick={() => handlePayBill(b.id)}>Marcar paga</button>
                          <button type="button" onClick={() => openEditBill(b)}>Editar</button>
                          <button type="button" onClick={() => handleDeleteBill(b.id)}>Excluir</button>
                        </div>
                      </>
                    )}
                  </div>
                </span>
              </li>
            ))}
          </ul>
          {bills.length === 0 && <p className="muted">Nenhuma conta neste mês.</p>}
        </>
      )}

      {txViewMode === 'receitas' && (
        <>
          <form onSubmit={handleAddReceita} className="form-block form-compact">
            <input placeholder="Descrição" value={rDesc} onChange={(e) => setRDesc(e.target.value)} />
            <input placeholder="Valor (R$) — ex: 100,50" type="text" inputMode="decimal" value={rAmount} onChange={(e) => setRAmount(e.target.value)} required />
            <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} />
            <select value={rCategoryId} onChange={(e) => setRCategoryId(e.target.value)}><option value="">Categoria</option>{categoriesReceitas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button type="submit" disabled={rSending}>{rSending ? '...' : '+'}</button>
          </form>
          <ul className="tx-list tx-list-slim">
            {receitasList.map((t) => (
              <li key={t.id}>
                <span>{formatDateBR(t.date)} {t.description || '-'}</span>
                <span className="row-right">
                  <span className="income">R$ {formatBRL(t.amount)}</span>
                  <div className="menu-wrap">
                    <button type="button" className="btn-menu" onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)} aria-label="Ações">⋮</button>
                    {menuOpenId === t.id && (
                      <>
                        <div className="menu-backdrop" onClick={() => setMenuOpenId(null)} />
                        <div className="menu-dropdown">
                          <button type="button" onClick={() => openEditReceita(t)}>Editar</button>
                          <button type="button" onClick={async () => { try { await api.deleteTransaction(t.id); await loadReceitas(); setMenuOpenId(null); } catch (e) { console.error(e); } }}>Excluir</button>
                        </div>
                      </>
                    )}
                  </div>
                </span>
              </li>
            ))}
          </ul>
          {receitasList.length === 0 && <p className="muted">Nenhuma receita neste mês.</p>}
        </>
      )}

      {editModal === 'gasto' && (
        <div className="modal-backdrop" onClick={() => { setEditModal(null); setEditingGastoId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar gasto</h3>
            <input placeholder="Descrição" value={gEditDesc} onChange={(e) => setGEditDesc(e.target.value)} />
            <input placeholder="Valor (R$) — ex: 100,50" value={gEditAmount} onChange={(e) => setGEditAmount(e.target.value)} />
            <input type="date" value={gEditDate} onChange={(e) => setGEditDate(e.target.value)} />
            <select value={gEditCategoryId} onChange={(e) => setGEditCategoryId(e.target.value)}><option value="">Categoria</option>{categoriesGastos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <div className="modal-actions">
              <button type="button" className="btn-save" onClick={saveEditGasto}>Salvar</button>
              <button type="button" onClick={() => { setEditModal(null); setEditingGastoId(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {editModal === 'conta' && (
        <div className="modal-backdrop" onClick={() => { setEditModal(null); setEditingBillId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar conta</h3>
            <input placeholder="Descrição" value={cEditDesc} onChange={(e) => setCEditDesc(e.target.value)} />
            <input placeholder="Valor (R$) — ex: 100,50" value={cEditAmount} onChange={(e) => setCEditAmount(e.target.value)} />
            <input type="date" value={cEditDueDate} onChange={(e) => setCEditDueDate(e.target.value)} />
            <select value={cEditCategoryId} onChange={(e) => setCEditCategoryId(e.target.value)}><option value="">Categoria</option>{categoriesContas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <label className="checkbox-label"><input type="checkbox" checked={cEditRecurring} onChange={(e) => setCEditRecurring(e.target.checked)} /> Repetir todo mês</label>
            <div className="modal-actions">
              <button type="button" className="btn-save" onClick={saveEditBill}>Salvar</button>
              <button type="button" onClick={() => { setEditModal(null); setEditingBillId(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {editModal === 'receita' && (
        <div className="modal-backdrop" onClick={() => { setEditModal(null); setEditingReceitaId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar receita</h3>
            <input placeholder="Descrição" value={rEditDesc} onChange={(e) => setREditDesc(e.target.value)} />
            <input placeholder="Valor (R$) — ex: 100,50" value={rEditAmount} onChange={(e) => setREditAmount(e.target.value)} />
            <input type="date" value={rEditDate} onChange={(e) => setREditDate(e.target.value)} />
            <select value={rEditCategoryId} onChange={(e) => setREditCategoryId(e.target.value)}><option value="">Categoria</option>{categoriesReceitas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <div className="modal-actions">
              <button type="button" className="btn-save" onClick={saveEditReceita}>Salvar</button>
              <button type="button" onClick={() => { setEditModal(null); setEditingReceitaId(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Categorias ---
function Categorias() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'EXPENSE_FIXED' | 'EXPENSE_VARIABLE' | 'INCOME'>('EXPENSE_VARIABLE')
  const [sending, setSending] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const list = await api.listCategories()
      setCategories(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSending(true)
    try {
      await api.createCategory(newName.trim(), newKind)
      setNewName('')
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const fixas = categories.filter((c) => c.kind === 'EXPENSE_FIXED')
  const variaveis = categories.filter((c) => c.kind === 'EXPENSE_VARIABLE')
  const receitas = categories.filter((c) => c.kind === 'INCOME')

  if (loading) return <div className="screen"><p>Carregando...</p></div>

  return (
    <div className="screen">
      <h2>Categorias</h2>
      <p className="muted">Crie categorias para classificar gastos, contas e receitas.</p>

      <form onSubmit={handleAdd} className="form-block form-compact" style={{ marginBottom: '1.5rem' }}>
        <input placeholder="Nome da categoria" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value as 'EXPENSE_FIXED' | 'EXPENSE_VARIABLE' | 'INCOME')}>
          <option value="EXPENSE_FIXED">Gasto fixo (contas)</option>
          <option value="EXPENSE_VARIABLE">Gasto variável (dia a dia)</option>
          <option value="INCOME">Receita</option>
        </select>
        <button type="submit" disabled={sending}>{sending ? '...' : 'Adicionar'}</button>
      </form>

      <section className="section">
        <h3>Gastos fixos (contas do mês)</h3>
        <ul className="cat-list">
          {fixas.map((c) => <li key={c.id}>{c.name}</li>)}
        </ul>
        {fixas.length === 0 && <p className="muted">Nenhuma. Adicione acima.</p>}
      </section>
      <section className="section">
        <h3>Gastos variáveis (dia a dia)</h3>
        <ul className="cat-list">
          {variaveis.map((c) => <li key={c.id}>{c.name}</li>)}
        </ul>
        {variaveis.length === 0 && <p className="muted">Nenhuma. Adicione acima.</p>}
      </section>
      <section className="section">
        <h3>Receitas</h3>
        <ul className="cat-list">
          {receitas.map((c) => <li key={c.id}>{c.name}</li>)}
        </ul>
        {receitas.length === 0 && <p className="muted">Nenhuma. Adicione acima.</p>}
      </section>
    </div>
  )
}

// --- App ---
function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [tab, setTab] = useState<MainTab>('resumo')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [isListening, setIsListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const handleVoiceClick = useCallback(async () => {
    if (!SpeechRecognitionCtor) {
      setVoiceError('Reconhecimento de voz não disponível neste navegador. Use Chrome ou Edge.')
      return
    }
    if (isListening) {
      recognitionRef.current?.stop()
      recognitionRef.current = null
      setIsListening(false)
      return
    }
    setVoiceError(null)
    setVoiceMessage(null)
    const rec = new SpeechRecognitionCtor()
    rec.lang = 'pt-BR'
    rec.continuous = false
    rec.onresult = async (e: unknown) => {
      const ev = e as { results: ArrayLike<{ transcript: string }> }
      const first = ev.results?.[0]
      const transcript = first?.transcript ?? ''
      rec.stop()
      recognitionRef.current = null
      setIsListening(false)
      const parsed = parseVoiceText(transcript)
      if (!parsed) {
        setVoiceMessage('Não entendi o valor. Tente: "Abasteci 50 reais" ou "30 no mercado".')
        return
      }
      try {
        const categories = await api.listCategories()
        const categoryId = suggestCategoryId(transcript, categories) || suggestCategoryId(parsed.description, categories)
        await api.createTransaction({
          amount: parsed.amount,
          type: parsed.type,
          description: parsed.description || undefined,
          categoryId: categoryId || undefined,
          date: new Date().toISOString().slice(0, 10),
        })
        const label = parsed.type === 'INCOME' ? 'Receita' : 'Despesa'
        setVoiceMessage(`${label} de R$ ${formatBRL(parsed.amount)} registrada. Veja em Transações.`)
        window.dispatchEvent(new Event('assessor:refresh'))
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : 'Erro ao registrar.')
      }
    }
    rec.onend = () => {
      recognitionRef.current = null
      setIsListening(false)
    }
    rec.onerror = (e: { error: string }) => {
      recognitionRef.current = null
      setIsListening(false)
      if (e.error !== 'aborted') setVoiceError('Erro no microfone. Tente de novo.')
    }
    recognitionRef.current = rec
    setIsListening(true)
    setVoiceMessage('Fale agora: ex. "Abasteci 50 reais"...')
    rec.start()
  }, [isListening])

  const handleExportPdf = useCallback(async () => {
    const ym = selectedMonth
    const { from, to } = getMonthBounds(ym)
    setPdfLoading(true)
    try {
      const [summary, catSummary, transactions, bills] = await Promise.all([
        api.getSummary(from, to),
        api.getCategorySummary(from, to),
        api.listTransactions(from, to),
        api.listBills('open', from, to),
      ])
      const data = {
        monthLabel: formatMonthLabel(ym),
        summary,
        byKind: catSummary.byKind,
        transactions,
        openBills: bills.map((b) => ({ description: b.description, amount: b.amount, dueDate: b.dueDate })),
      }
      const blob = generateReportPdf(data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-financeiro-${ym}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    } finally {
      setPdfLoading(false)
    }
  }, [selectedMonth])

  const handleShareReport = useCallback(async () => {
    const ym = selectedMonth
    const { from, to } = getMonthBounds(ym)
    setPdfLoading(true)
    try {
      const [summary, catSummary, transactions, bills] = await Promise.all([
        api.getSummary(from, to),
        api.getCategorySummary(from, to),
        api.listTransactions(from, to),
        api.listBills('open', from, to),
      ])
      const data = {
        monthLabel: formatMonthLabel(ym),
        summary,
        byKind: catSummary.byKind,
        transactions,
        openBills: bills.map((b) => ({ description: b.description, amount: b.amount, dueDate: b.dueDate })),
      }
      const blob = generateReportPdf(data)
      const file = new File([blob], `relatorio-financeiro-${ym}.pdf`, { type: 'application/pdf' })
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Relatório financeiro', files: [file] })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `relatorio-financeiro-${ym}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error(err)
    } finally {
      setPdfLoading(false)
    }
  }, [selectedMonth])

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
        <div className="header-actions">
          <button type="button" className="btn-voice" onClick={handleVoiceClick} title="Registrar por voz" aria-label={isListening ? 'Parar gravação' : 'Registrar por voz'}>
            {isListening ? '🎤 Parar' : '🎤 Voz'}
          </button>
          <button type="button" className="btn-export" onClick={handleExportPdf} disabled={pdfLoading} title="Baixar PDF do mês">
            {pdfLoading ? '...' : 'Exportar PDF'}
          </button>
          <button type="button" className="btn-share" onClick={handleShareReport} disabled={pdfLoading} title="Compartilhar relatório (ex.: com sua esposa)">
            Compartilhar
          </button>
          <button type="button" className="logout" onClick={handleLogout}>Sair</button>
        </div>
      </header>
      {(voiceMessage || voiceError) && (
        <div className={`voice-feedback ${voiceError ? 'error' : ''}`} role="alert">
          {voiceError || voiceMessage}
        </div>
      )}
      <nav className="tabs main-tabs">
        <button type="button" className={tab === 'resumo' ? 'active' : ''} onClick={() => setTab('resumo')}>Resumo</button>
        <button type="button" className={tab === 'transacoes' ? 'active' : ''} onClick={() => setTab('transacoes')}>Transações</button>
        <button type="button" className={tab === 'categorias' ? 'active' : ''} onClick={() => setTab('categorias')}>Categorias</button>
      </nav>
      {tab === 'resumo' && <Resumo selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />}
      {tab === 'transacoes' && <Transacoes selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />}
      {tab === 'categorias' && <Categorias />}
    </div>
  )
}

export default App
