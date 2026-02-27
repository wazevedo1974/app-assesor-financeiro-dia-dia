import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { TransactionType } from "@prisma/client";

export const billsRouter = Router();

billsRouter.use(authMiddleware);

billsRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const {
      description,
      amount,
      dueDate,
      categoryId,
      recurrence,
      reminderDays,
      billTemplateId,
    } = req.body as {
      description?: string;
      amount?: number;
      dueDate?: string;
      categoryId?: string | null;
      recurrence?: string;
      reminderDays?: number;
      billTemplateId?: string | null;
    };

    if (!description || !amount || !dueDate) {
      return res.status(400).json({
        message: "Descrição, valor e data de vencimento são obrigatórios.",
      });
    }

    const bill = await prisma.bill.create({
      data: {
        userId,
        description,
        amount,
        dueDate: new Date(dueDate),
        categoryId: categoryId || null,
        recurrence: (recurrence as any) || "NONE",
        reminderDays: reminderDays ?? 1,
        billTemplateId: billTemplateId || null,
      },
    });

    return res.status(201).json({
      ...bill,
      amount: Number(bill.amount),
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao criar conta a pagar." });
  }
});

billsRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { status, from, to } = req.query;

    const where: any = { userId };

    if (status === "open") {
      where.paid = false;
    } else if (status === "paid") {
      where.paid = true;
    }

    if (from || to) {
      where.dueDate = {};
      if (from) {
        where.dueDate.gte = new Date(String(from));
      }
      if (to) {
        where.dueDate.lte = new Date(String(to));
      }
    }

    const bills = await prisma.bill.findMany({
      where,
      orderBy: {
        dueDate: "asc",
      },
    });
    const serialized = bills.map((b) => ({
      ...b,
      amount: Number(b.amount),
    }));

    return res.json(serialized);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao listar contas a pagar." });
  }
});

billsRouter.post("/generate", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const monthParam = (req.query.month as string | undefined) ?? undefined;

    if (!monthParam) {
      return res
        .status(400)
        .json({ message: "Parâmetro month é obrigatório (formato YYYY-MM)." });
    }

    const [yearStr, monthStr] = monthParam.split("-");
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
        .json({ message: "Parâmetro month inválido. Use o formato YYYY-MM." });
    }

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);
    const lastDay = periodEnd.getDate();

    const templates = await prisma.billTemplate.findMany({
      where: {
        userId,
        active: true,
      },
    });

    const createdBills: any[] = [];

    for (const t of templates) {
      if (!t.dueDay || t.dueDay < 1 || t.dueDay > 31) continue;

      const day = Math.min(t.dueDay, lastDay);
      const dueDate = new Date(year, month - 1, day, 0, 0, 0);

      const existing = await prisma.bill.findFirst({
        where: {
          userId,
          billTemplateId: t.id,
          dueDate: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      if (existing) continue;

      const bill = await prisma.bill.create({
        data: {
          userId,
          billTemplateId: t.id,
          description: t.description,
          amount: t.amount,
          categoryId: t.categoryId,
          dueDate,
          recurrence: t.recurrence,
          reminderDays: t.reminderDays,
        },
      });

      createdBills.push({
        ...bill,
        amount: Number(bill.amount),
      });
    }

    return res.status(201).json({
      generated: createdBills,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao gerar contas do mês." });
  }
});

billsRouter.patch("/:id/pay", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);

    const existing = await prisma.bill.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Conta não encontrada." });
    }

    if (existing.paid && existing.paidTransactionId) {
      return res.json({
        ...existing,
        amount: Number(existing.amount),
      });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findFirst({
        where: { id, userId },
      });

      if (!bill) {
        throw new Error("Bill not found inside transaction.");
      }

      if (bill.paid && bill.paidTransactionId) {
        return bill;
      }

      const transaction = await tx.transaction.create({
        data: {
          userId,
          amount: bill.amount,
          type: TransactionType.EXPENSE,
          description: bill.description,
          categoryId: bill.categoryId,
          date: now,
        },
      });

      const updated = await tx.bill.update({
        where: { id: bill.id },
        data: {
          paid: true,
          paidAt: now,
          paidTransactionId: transaction.id,
        },
      });

      return updated;
    });

    return res.json({
      ...result,
      amount: Number(result.amount),
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao marcar conta como paga." });
  }
});

