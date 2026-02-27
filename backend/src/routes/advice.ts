import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { CategoryKind, TransactionType } from "@prisma/client";

export const adviceRouter = Router();

adviceRouter.use(authMiddleware);

adviceRouter.get("/financial", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const ym = (req.query.ym as string | undefined) ?? undefined;

    const now = new Date();

    let periodStart: Date;
    let periodEnd: Date;

    if (ym) {
      const [yearStr, monthStr] = ym.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      if (
        !yearStr ||
        !monthStr ||
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
      ) {
        return res
          .status(400)
          .json({ message: "Parâmetro ym inválido. Use o formato YYYY-MM." });
      }
      periodStart = new Date(year, month - 1, 1, 0, 0, 0);
      periodEnd = new Date(year, month, 0, 23, 59, 59);
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const wherePeriod: any = {
      userId,
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    };

    const [incomesAgg, expensesAgg, grouped, upcomingBills] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...wherePeriod, type: TransactionType.INCOME },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...wherePeriod, type: TransactionType.EXPENSE },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId", "type"],
        where: { ...wherePeriod, categoryId: { not: null } },
        _sum: { amount: true },
      }),
      prisma.bill.findMany({
        where: {
          userId,
          paid: false,
          dueDate: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const totalIncome = Number(incomesAgg._sum.amount || 0);
    const totalExpense = Number(expensesAgg._sum.amount || 0);

    const categoryIds = Array.from(
      new Set(grouped.map((g) => g.categoryId).filter((id): id is string => !!id))
    );

    const categories =
      categoryIds.length > 0
        ? await prisma.category.findMany({
            where: { id: { in: categoryIds } },
          })
        : [];

    const catMap = new Map<
      string,
      {
        id: string;
        name: string;
        kind: CategoryKind;
        income: number;
        expense: number;
      }
    >(
      categories.map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          kind: c.kind,
          income: 0,
          expense: 0,
        },
      ])
    );

    let fixedExpenses = 0;
    let variableExpenses = 0;

    for (const g of grouped) {
      if (!g.categoryId) continue;
      const item = catMap.get(g.categoryId);
      if (!item) continue;
      const amount = Number(g._sum.amount || 0);

      if (g.type === TransactionType.INCOME) {
        item.income += amount;
      } else if (g.type === TransactionType.EXPENSE) {
        item.expense += amount;
        if (item.kind === CategoryKind.EXPENSE_FIXED) {
          fixedExpenses += amount;
        } else if (item.kind === CategoryKind.EXPENSE_VARIABLE) {
          variableExpenses += amount;
        }
      }
    }

    const advices: {
      id: string;
      severity: "info" | "warning" | "alert";
      title: string;
      message: string;
    }[] = [];

    const balance = totalIncome - totalExpense;

    if (totalIncome <= 0 && totalExpense > 0) {
      advices.push({
        id: "no-income",
        severity: "info",
        title: "Registre suas receitas",
        message:
          "Você registrou despesas neste mês, mas nenhuma receita. Registre seus recebimentos para ter uma visão real do seu saldo.",
      });
    }

    if (totalIncome > 0) {
      const fixedPct = fixedExpenses / totalIncome;
      const variablePct = variableExpenses / totalIncome;

      if (fixedPct > 0.5) {
        advices.push({
          id: "high-fixed",
          severity: "warning",
          title: "Despesas fixas altas",
          message: `Suas despesas fixas representam aproximadamente ${(fixedPct * 100).toFixed(
            0
          )}% da sua renda do mês. Tente manter este valor abaixo de 50% ao longo do tempo.`,
        });
      }

      if (variablePct > 0.3) {
        advices.push({
          id: "high-variable",
          severity: "warning",
          title: "Gastos variáveis elevados",
          message: `Seus gastos variáveis estão em torno de ${(variablePct * 100).toFixed(
            0
          )}% da sua renda. Reveja itens como lazer, transporte e mercado para equilibrar melhor.`,
        });
      }
    }

    if (balance < 0) {
      advices.push({
        id: "negative-balance",
        severity: "alert",
        title: "Mês no vermelho",
        message: `Suas despesas superam suas receitas em aproximadamente R$ ${Math.abs(
          balance
        ).toFixed(
          2
        )} neste mês. Considere cortar gastos variáveis e adiar despesas não essenciais.`,
      });
    }

    const expenseCategories = Array.from(catMap.values()).filter((c) => c.expense > 0);
    if (expenseCategories.length > 0 && totalExpense > 0) {
      expenseCategories.sort((a, b) => b.expense - a.expense);
      const top = expenseCategories[0];
      const share = top.expense / totalExpense;
      if (share > 0.3) {
        advices.push({
          id: "top-category",
          severity: "info",
          title: "Categoria de gasto mais pesada",
          message: `A categoria "${top.name}" concentra cerca de ${(share * 100).toFixed(
            0
          )}% de todas as suas despesas deste mês. Vale analisar se dá para reduzir um pouco nessa área.`,
        });
      }
    }

    if (upcomingBills.length > 0) {
      const totalUpcoming = upcomingBills.reduce(
        (sum, b) => sum + Number(b.amount),
        0
      );
      advices.push({
        id: "upcoming-bills",
        severity: "info",
        title: "Contas a pagar nos próximos 7 dias",
        message: `Você tem R$ ${totalUpcoming.toFixed(
          2
        )} em contas a pagar nos próximos 7 dias. Garanta que esse valor esteja reservado para não comprometer o caixa do mês.`,
      });
    }

    return res.json({
      period: {
        from: periodStart,
        to: periodEnd,
      },
      totals: {
        income: totalIncome,
        expense: totalExpense,
        balance,
        fixedExpenses,
        variableExpenses,
      },
      advices,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao gerar conselhos financeiros." });
  }
});

