import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { CategoryKind, TransactionType } from "@prisma/client";

export const transactionsRouter = Router();

transactionsRouter.use(authMiddleware);

transactionsRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { amount, type, description, categoryId, date } = req.body;

    if (!amount || !type) {
      return res.status(400).json({ message: "Valor e tipo são obrigatórios." });
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        amount,
        type,
        description,
        categoryId,
        date: date ? new Date(date) : new Date(),
      },
    });

    return res.status(201).json(transaction);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao criar transação." });
  }
});

transactionsRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { from, to, type } = req.query;

    const filters: any = {
      where: {
        userId,
      },
      orderBy: {
        date: "desc",
      },
    };

    if (type) {
      filters.where.type = type;
    }

    if (from || to) {
      filters.where.date = {};
      if (from) {
        filters.where.date.gte = new Date(String(from));
      }
      if (to) {
        filters.where.date.lte = new Date(String(to));
      }
    }

    const transactions = await prisma.transaction.findMany(filters);

    const serialized = transactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
    }));

    return res.json(serialized);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar transações." });
  }
});

transactionsRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
    if (!id) {
      return res.status(400).json({ message: "ID inválido." });
    }
    const tx = await prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!tx) {
      return res.status(404).json({ message: "Transação não encontrada." });
    }
    await prisma.transaction.delete({
      where: { id },
    });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao excluir transação." });
  }
});

transactionsRouter.get("/summary", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { from, to } = req.query;

    const dateFilter: any = {};
    if (from) {
      dateFilter.gte = new Date(String(from));
    }
    if (to) {
      dateFilter.lte = new Date(String(to));
    }

    const where: any = { userId };
    if (from || to) {
      where.date = dateFilter;
    }

    const [incomes, expenses] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: "INCOME" },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: "EXPENSE" },
      }),
    ]);

    const totalIncome = Number(incomes._sum.amount || 0);
    const totalExpense = Number(expenses._sum.amount || 0);

    return res.json({
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao gerar resumo." });
  }
});

transactionsRouter.get("/summary/by-category", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { from, to } = req.query;

    const dateFilter: any = {};
    if (from) {
      dateFilter.gte = new Date(String(from));
    }
    if (to) {
      dateFilter.lte = new Date(String(to));
    }

    const where: any = { userId, categoryId: { not: null } };
    if (from || to) {
      where.date = dateFilter;
    }

    const grouped = await prisma.transaction.groupBy({
      by: ["categoryId", "type"],
      where,
      _sum: { amount: true },
    });

    const categoryIds = Array.from(
      new Set(grouped.map((g) => g.categoryId).filter((id): id is string => !!id))
    );

    if (categoryIds.length === 0) {
      return res.json({ categories: [], byKind: { fixed: 0, variable: 0, income: 0 } });
    }

    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    const categoryMap = new Map(
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

    let totalFixed = 0;
    let totalVariable = 0;
    let totalIncome = 0;

    for (const g of grouped) {
      if (!g.categoryId) continue;
      const item = categoryMap.get(g.categoryId);
      if (!item) continue;

      const amount = Number(g._sum.amount || 0);
      if (g.type === TransactionType.INCOME) {
        item.income += amount;
        totalIncome += amount;
      } else if (g.type === TransactionType.EXPENSE) {
        item.expense += amount;
        if (item.kind === CategoryKind.EXPENSE_FIXED) {
          totalFixed += amount;
        } else if (item.kind === CategoryKind.EXPENSE_VARIABLE) {
          totalVariable += amount;
        }
      }
    }

    return res.json({
      categories: Array.from(categoryMap.values()),
      byKind: {
        fixed: totalFixed,
        variable: totalVariable,
        income: totalIncome,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao gerar resumo por categoria." });
  }
});

