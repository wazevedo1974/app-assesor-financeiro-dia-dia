import { TransactionType } from "@prisma/client";
import { prisma } from "../prisma";
import { brDayBoundsUtc, monthBoundsUtc, todayYmdBr } from "./dateBr";
import { parseTransactionText, suggestCategoryId } from "./parseTransactionText";
import { sendWhatsAppText } from "./sendWhatsApp";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function handleInboundWhatsAppText(waId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const linkMatch = lower.match(/^(?:vincular|ligar|parear)\s+(\d{6})$/);
  if (linkMatch) {
    await handleLink(waId, linkMatch[1]);
    return;
  }

  const conn = await prisma.whatsAppConnection.findUnique({ where: { waId } });
  if (!conn) {
    await sendWhatsAppText(
      waId,
      "Olá! Para ligar este WhatsApp à sua conta: abra o painel (web), vá ao Resumo e use «Gerar código para WhatsApp». Depois envie aqui: vincular 123456 (com o código que aparecer)."
    );
    return;
  }

  if (
    /^(saldo|balanço|balanco)$/i.test(trimmed) ||
    (/\b(saldo|balanço|balanco)\b/.test(lower) && /\b(mês|mes|atual|esse|este)\b/.test(lower))
  ) {
    await replyMonthBalance(conn.userId, waId);
    return;
  }

  if (/\bquanto\b.*\bgastei\b.*\bhoje\b/i.test(lower) || (/^gastei\b.*\bhoje\b/i.test(lower) && !/\d/.test(lower))) {
    await replyTodayExpense(conn.userId, waId);
    return;
  }

  if (
    /\bquanto\b.*\brecebi\b.*(\bmês|mes|esse|este|neste|nesse)\b/i.test(lower) ||
    /\brecebi\b.*\besse mês\b/i.test(lower)
  ) {
    await replyMonthIncome(conn.userId, waId);
    return;
  }

  if (/\bquanto\b.*\bgastei\b.*(\bmês|mes|esse|este|neste|nesse)\b/i.test(lower)) {
    await replyMonthExpense(conn.userId, waId);
    return;
  }

  const parsed = parseTransactionText(trimmed);
  if (parsed) {
    const categories = await prisma.category.findMany({ where: { userId: conn.userId } });
    const categoryId = suggestCategoryId(trimmed, categories);
    await prisma.transaction.create({
      data: {
        userId: conn.userId,
        amount: parsed.amount,
        type: parsed.type as TransactionType,
        description: parsed.description,
        categoryId,
        date: new Date(),
      },
    });
    const tipo = parsed.type === "INCOME" ? "Receita" : "Despesa";
    await sendWhatsAppText(waId, `${tipo} registrada: ${brl(parsed.amount)} — ${parsed.description}`);
    return;
  }

  await sendWhatsAppText(
    waId,
    "Não entendi. Exemplos: «gastei 45 no mercado», «recebi 3000 de salário», «saldo do mês», «quanto gastei hoje»."
  );
}

async function handleLink(waId: string, codeRaw: string): Promise<void> {
  const code = codeRaw.trim();
  const now = new Date();

  const link = await prisma.whatsAppLinkCode.findFirst({
    where: { code, expiresAt: { gt: now } },
  });

  if (!link) {
    await sendWhatsAppText(
      waId,
      "Código inválido ou expirado. Gere um novo código no painel (Resumo → WhatsApp) e envie: vincular 123456"
    );
    return;
  }

  const existingWa = await prisma.whatsAppConnection.findUnique({ where: { waId } });
  if (existingWa) {
    if (existingWa.userId === link.userId) {
      await prisma.whatsAppLinkCode.deleteMany({ where: { userId: link.userId } });
      await sendWhatsAppText(waId, "Este WhatsApp já está vinculado à sua conta.");
      return;
    }
    await sendWhatsAppText(waId, "Este número já está vinculado a outra conta.");
    return;
  }

  await prisma.$transaction([
    prisma.whatsAppConnection.deleteMany({ where: { userId: link.userId } }),
    prisma.whatsAppConnection.create({
      data: { waId, userId: link.userId },
    }),
    prisma.whatsAppLinkCode.deleteMany({ where: { userId: link.userId } }),
  ]);

  await sendWhatsAppText(
    waId,
    "Conta vinculada com sucesso. Pode enviar gastos e receitas por mensagem, ou perguntar: «saldo do mês», «quanto gastei hoje»."
  );
}

async function replyMonthBalance(userId: string, waId: string): Promise<void> {
  const { gte, lte } = monthBoundsUtc();
  const [incomes, expenses] = await Promise.all([
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { userId, type: "INCOME", date: { gte, lte } },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { userId, type: "EXPENSE", date: { gte, lte } },
    }),
  ]);
  const totalIncome = Number(incomes._sum.amount || 0);
  const totalExpense = Number(expenses._sum.amount || 0);
  const balance = totalIncome - totalExpense;
  await sendWhatsAppText(
    waId,
    `Este mês: receitas ${brl(totalIncome)}, despesas ${brl(totalExpense)}, saldo ${brl(balance)}.`
  );
}

async function replyTodayExpense(userId: string, waId: string): Promise<void> {
  const ymd = todayYmdBr();
  const { gte, lte } = brDayBoundsUtc(ymd);
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: { userId, type: "EXPENSE", date: { gte, lte } },
  });
  const total = Number(agg._sum.amount || 0);
  await sendWhatsAppText(waId, `Hoje você gastou ${brl(total)}.`);
}

async function replyMonthExpense(userId: string, waId: string): Promise<void> {
  const { gte, lte } = monthBoundsUtc();
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: { userId, type: "EXPENSE", date: { gte, lte } },
  });
  const total = Number(agg._sum.amount || 0);
  await sendWhatsAppText(waId, `Este mês suas despesas somam ${brl(total)}.`);
}

async function replyMonthIncome(userId: string, waId: string): Promise<void> {
  const { gte, lte } = monthBoundsUtc();
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: { userId, type: "INCOME", date: { gte, lte } },
  });
  const total = Number(agg._sum.amount || 0);
  await sendWhatsAppText(waId, `Este mês suas receitas somam ${brl(total)}.`);
}
