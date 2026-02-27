const API_URL = import.meta.env.VITE_API_URL || '';

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name?: string | null };
}

let authToken: string | null = localStorage.getItem('token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (authToken) (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    const msg =
      err instanceof TypeError && err.message === "Failed to fetch"
        ? "Não foi possível conectar ao servidor. Verifique se a URL da API (VITE_API_URL) está correta no deploy e se o backend está no ar."
        : err instanceof Error ? err.message : "Erro de rede.";
    throw new Error(msg);
  }
  if (res.status === 401) {
    setAuthToken(null);
    window.location.reload();
    throw new Error('Sessão expirada');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Erro na requisição');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  async login(email: string, password: string) {
    const data = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(data.token);
    return data;
  },
  async register(email: string, password: string, name?: string) {
    const data = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setAuthToken(data.token);
    return data;
  },
  async getSummary(from?: string, to?: string) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString();
    return request<{ totalIncome: number; totalExpense: number; balance: number }>(
      `/transactions/summary${qs ? `?${qs}` : ''}`
    );
  },
  async getCategorySummary(from?: string, to?: string) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString();
    return request<{
      categories: { id: string; name: string; kind: string; income: number; expense: number }[];
      byKind: { fixed: number; variable: number; income: number };
    }>(`/transactions/summary/by-category${qs ? `?${qs}` : ''}`);
  },
  async listBills(status?: 'open' | 'paid', from?: string, to?: string) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString();
    return request<{ id: string; description: string; amount: number; dueDate: string; paid: boolean; recurrence?: string }[]>(
      `/bills${qs ? `?${qs}` : ''}`
    );
  },
  async createBill(input: { description: string; amount: number; dueDate: string; categoryId?: string; recurrence?: 'NONE' | 'MONTHLY' | 'WEEKLY' }) {
    return request('/bills', { method: 'POST', body: JSON.stringify(input) });
  },
  async payBill(id: string) {
    return request(`/bills/${id}/pay`, { method: 'PATCH' });
  },
  async updateBill(id: string, data: { description?: string; amount?: number; dueDate?: string; categoryId?: string | null; recurrence?: 'NONE' | 'MONTHLY' | 'WEEKLY' }) {
    return request(`/bills/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  async deleteBill(id: string) {
    return request<void>(`/bills/${id}`, { method: 'DELETE' });
  },
  async listTransactions(from?: string, to?: string, type?: 'INCOME' | 'EXPENSE') {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (type) params.append('type', type);
    const qs = params.toString();
    return request<{ id: string; amount: number; type: string; description?: string | null; date: string; categoryId?: string | null }[]>(
      `/transactions${qs ? `?${qs}` : ''}`
    );
  },
  async createTransaction(input: { amount: number; type: 'INCOME' | 'EXPENSE'; description?: string; categoryId?: string; date?: string }) {
    return request('/transactions', { method: 'POST', body: JSON.stringify(input) });
  },
  async updateTransaction(id: string, data: { amount?: number; type?: 'INCOME' | 'EXPENSE'; description?: string; categoryId?: string | null; date?: string }) {
    return request(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  async deleteTransaction(id: string) {
    return request<void>(`/transactions/${id}`, { method: 'DELETE' });
  },
  async deleteTransactionsInPeriod(from: string, to: string) {
    return request<{ deleted: number }>(`/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: 'DELETE' });
  },
  async listCategories() {
    return request<{ id: string; name: string; kind: string }[]>('/categories');
  },
  async createCategory(name: string, kind: 'EXPENSE_FIXED' | 'EXPENSE_VARIABLE' | 'INCOME') {
    return request<{ id: string; name: string; kind: string }>('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), kind }),
    });
  },
  async getFinancialAdvice() {
    return request<{
      advices: { id: string; severity: string; title: string; message: string }[];
    }>('/advice/financial');
  },
};
