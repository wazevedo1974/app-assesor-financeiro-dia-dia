## App Assessor Financeiro – MVP

Este projeto é um **MVP de assessor financeiro pessoal**, focado em:

- **Despesas fixas e variáveis**
- **Gastos do dia a dia**
- **Receitas**
- **Contas a pagar com avisos**

Arquitetura inicial:

- **Backend**: Node.js + TypeScript + Express + Prisma + Postgres (Railway)
- **Mobile**: Expo + React Native (TypeScript) – a ser configurado após o backend básico

### Estrutura do projeto

- `backend/` – API REST (Node/TS) conectada ao Postgres
- `mobile/` – aplicativo mobile (Expo/React Native)

### Requisitos gerais

- Node.js LTS instalado
- Conta na Railway com banco Postgres configurado

### Próximos passos

1. Configurar o backend (`backend/`) com modelos de:
   - Usuário
   - Transações (despesas/receitas)
   - Categorias (fixas, variáveis, receitas)
   - Contas a pagar
2. Subir o backend na Railway.
3. Criar o app mobile (`mobile/`) para registro rápido de transações e visualização de resumo.

Mais instruções de instalação e uso serão adicionadas conforme o desenvolvimento avançar.

