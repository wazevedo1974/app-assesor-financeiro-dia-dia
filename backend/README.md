# Backend (Express + Prisma + PostgreSQL)

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | URL PostgreSQL |
| `JWT_SECRET` | Produção | Segredo para tokens JWT |
| `PORT` | Não | Padrão `3333` |
| `WHATSAPP_VERIFY_TOKEN` | Para WhatsApp | Token que você define e coloca no painel Meta (verificação do webhook) |
| `WHATSAPP_ACCESS_TOKEN` | Para enviar respostas | Token de acesso da API do WhatsApp (Cloud API) |
| `WHATSAPP_PHONE_NUMBER_ID` | Para enviar respostas | ID do número de telefone na Meta |
| `WHATSAPP_APP_SECRET` | Recomendado | App Secret do app Meta; com `express.json` o body bruto é guardado para validar `X-Hub-Signature-256` |

Sem `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, o webhook **recebe** mensagens e regista na base, mas **não envia** resposta ao utilizador (aparece aviso no log).

## Webhook WhatsApp (Cloud API)

1. URL do callback: `https://SEU_DOMINIO/webhook/whatsapp`
2. `GET`: a Meta envia `hub.verify_token` — deve coincidir com `WHATSAPP_VERIFY_TOKEN`.
3. `POST`: eventos de mensagem; o handler extrai texto e corre o mesmo fluxo de registo/consultas que o painel.

Fluxo do utilizador: no **web**, aba **Resumo** → **Gerar código para WhatsApp** → no telefone enviar `vincular 123456` (código de 6 dígitos) para o número configurado na Meta.

## Migrações

```bash
cd backend
npx prisma migrate deploy
```

Em desenvolvimento, com `DATABASE_URL` definido:

```bash
npx prisma migrate dev
```
