import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { CategoryKind, TransactionType } from "@prisma/client";

export const monthsRouter = Router();

monthsRouter.use(authMiddleware);

monthsRouter.get("/:ym/overview", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const ym = String(req.params.ym);

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
        .json({ message: "Parâmetro de mês inválido. Use o formato YYYY-MM." });
    }

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const wherePeriod: any = {
      userId,
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    };

    const [incomesAgg, expensesAgg, groupedTx, bills] = await Promise.all([
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
          dueDate: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const totalIncome = Number(incomesAgg._sum.amount || 0);
    const totalExpense = Number(expensesAgg._sum.amount || 0);
    const balance = totalIncome - totalExpense;

    const categoryIds = Array.from(
      new Set(groupedTx.map((g) => g.categoryId).filter((id): id is string => !!id))
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

    for (const g of groupedTx) {
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

    const totalDue = bills.reduce((sum, b) => sum + Number(b.amount), 0);
    const totalPaid = bills
      .filter((b) => b.paid)
      .reduce((sum, b) => sum + Number(b.amount), 0);
    const totalOpen = bills
      .filter((b) => !b.paid)
      .reduce((sum, b) => sum + Number(b.amount), 0);

    const savingsRate =
      totalIncome > 0 ? balance / totalIncome : 0;
    const fixedPct =
      totalIncome > 0 ? fixedExpenses / totalIncome : 0;
    const variablePct =
      totalIncome > 0 ? variableExpenses / totalIncome : 0;

    const cashAvailableAfterOpenBills = balance - totalOpen;

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
        savingsRate,
        fixedPct,
        variablePct,
        cashAvailableAfterOpenBills,
      },
      bills: {
        totalDue,
        totalPaid,
        totalOpen,
        items: bills.map((b) => ({
          id: b.id,
          description: b.description,
          amount: Number(b.amount),
          dueDate: b.dueDate,
          paid: b.paid,
          paidAt: b.paidAt,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Erro ao gerar visão mensal.",
    });
  }
});

