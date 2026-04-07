# Assessor Financeiro — Web (Vite + React)

Frontend do app: Resumo, Transações, Categorias, voz, exportação PDF e compartilhamento.

## Desenvolvimento local

```bash
cd web
npm install
```

**Recomendado:** copie o exemplo de variáveis e suba o backend local (`cd backend && npm run dev`, porta **3333**):

```bash
cp .env.example .env
# Edite .env se o backend não for localhost:3333
npm run dev
```

Ou em uma linha (sem arquivo `.env`):

```bash
VITE_API_URL=https://seu-backend.up.railway.app npm run dev
```

Abra `http://localhost:5174` (porta 5174 para não conflitar com outros apps na 5173). Sem `VITE_API_URL`, o app avisa que falta configurar a API. Na primeira vez use **Criar conta**; depois **Entrar**.

## Deploy na Railway (frontend)

1. No **mesmo projeto** do GitHub ou um novo, **Add service** → **GitHub** → selecione este repositório.
2. **Configure o serviço:**
   - **Root Directory:** `web` (obrigatório).
3. **Variáveis de ambiente** (antes do build):
   - `VITE_API_URL` = URL pública do **backend**, **sem barra no final**  
     Exemplo: `https://seu-backend.up.railway.app`  
   O Vite injeta `VITE_API_URL` no JavaScript **no momento do `npm run build`**; não basta configurar só em runtime.
4. **Build:** `npm install && npm run build` (padrão Nixpacks, se detectar Node).
5. **Start command:** `npm start` (usa `vite preview` com `PORT` e host `0.0.0.0`).
6. Gere o domínio público do serviço e acesse a URL do **frontend** (não a do backend).
7. O backend deve estar no ar com CORS permitindo o front (o app já usa `cors()` aberto).

### Troubleshooting

- **Login falha / “Não foi possível conectar ao servidor”:** confira `VITE_API_URL` e faça um **novo deploy** após alterar a variável (o build precisa ser refeito).
- **Host bloqueado:** o [vite.config.ts](vite.config.ts) permite `.railway.app` em `preview`.

## Build de produção (teste local)

```bash
VITE_API_URL=https://seu-backend.up.railway.app npm run build
npm start
```
