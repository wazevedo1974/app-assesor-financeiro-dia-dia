import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";

export const billsRouter = Router();

billsRouter.use(authMiddleware);

billsRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { description, amount, dueDate, categoryId, recurrence, reminderDays } = req.body;

    if (!description || !amount || !dueDate) {
      return res.status(400).json({ message: "Descrição, valor e data de vencimento são obrigatórios." });
    }

    const bill = await prisma.bill.create({
      data: {
        userId,
        description,
        amount,
        dueDate: new Date(dueDate),
        categoryId,
        recurrence: recurrence || "NONE",
        reminderDays: reminderDays ?? 1,
      },
    });

    return res.status(201).json(bill);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao criar conta a pagar." });
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
      if (from) where.dueDate.gte = new Date(String(from));
      if (to) where.dueDate.lte = new Date(String(to));
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
    return res.status(500).json({ message: "Erro ao listar contas a pagar." });
  }
});

billsRouter.patch("/:id/pay", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
    if (!id) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const bill = await prisma.bill.findFirst({
      where: { id, userId },
    });

    if (!bill) {
      return res.status(404).json({ message: "Conta não encontrada." });
    }

    const updated = await prisma.bill.update({
      where: { id: bill.id },
      data: {
        paid: true,
        paidAt: new Date(),
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao marcar conta como paga." });
  }
});

