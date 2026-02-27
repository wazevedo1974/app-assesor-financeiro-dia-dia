import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { BillRecurrence } from "@prisma/client";

export const billTemplatesRouter = Router();

billTemplatesRouter.use(authMiddleware);

billTemplatesRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const {
      description,
      amount,
      categoryId,
      dueDay,
      recurrence,
      active,
      reminderDays,
    } = req.body as {
      description?: string;
      amount?: number;
      categoryId?: string | null;
      dueDay?: number;
      recurrence?: BillRecurrence;
      active?: boolean;
      reminderDays?: number;
    };

    if (!description || typeof description !== "string") {
      return res
        .status(400)
        .json({ message: "Descrição da conta fixa é obrigatória." });
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res
        .status(400)
        .json({ message: "Valor da conta fixa deve ser maior que zero." });
    }

    if (!dueDay || typeof dueDay !== "number" || dueDay < 1 || dueDay > 31) {
      return res.status(400).json({
        message: "Dia de vencimento inválido. Use um valor entre 1 e 31.",
      });
    }

    const rec =
      recurrence && Object.values(BillRecurrence).includes(recurrence)
        ? recurrence
        : BillRecurrence.MONTHLY;

    const template = await prisma.billTemplate.create({
      data: {
        userId,
        description: description.trim(),
        amount,
        categoryId: categoryId || null,
        dueDay,
        recurrence: rec,
        active: active ?? true,
        reminderDays: reminderDays ?? 1,
      },
    });

    return res.status(201).json({
      id: template.id,
      description: template.description,
      amount: Number(template.amount),
      categoryId: template.categoryId,
      dueDay: template.dueDay,
      recurrence: template.recurrence,
      active: template.active,
      reminderDays: template.reminderDays,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao criar modelo de conta fixa." });
  }
});

billTemplatesRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const templates = await prisma.billTemplate.findMany({
      where: { userId },
      orderBy: [{ active: "desc" }, { dueDay: "asc" }],
    });

    return res.json(
      templates.map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        categoryId: t.categoryId,
        dueDay: t.dueDay,
        recurrence: t.recurrence,
        active: t.active,
        reminderDays: t.reminderDays,
      }))
    );
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao listar modelos de contas fixas." });
  }
});

billTemplatesRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);
    const {
      description,
      amount,
      categoryId,
      dueDay,
      recurrence,
      active,
      reminderDays,
    } = req.body as {
      description?: string;
      amount?: number;
      categoryId?: string | null;
      dueDay?: number;
      recurrence?: BillRecurrence;
      active?: boolean;
      reminderDays?: number;
    };

    const existing = await prisma.billTemplate.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Modelo não encontrado." });
    }

    const data: any = {};

    if (description !== undefined) {
      if (!description || typeof description !== "string") {
        return res
          .status(400)
          .json({ message: "Descrição inválida para o modelo." });
      }
      data.description = description.trim();
    }

    if (amount !== undefined) {
      if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({
          message: "Valor da conta fixa deve ser maior que zero.",
        });
      }
      data.amount = amount;
    }

    if (dueDay !== undefined) {
      if (typeof dueDay !== "number" || dueDay < 1 || dueDay > 31) {
        return res.status(400).json({
          message: "Dia de vencimento inválido. Use um valor entre 1 e 31.",
        });
      }
      data.dueDay = dueDay;
    }

    if (categoryId !== undefined) {
      data.categoryId = categoryId || null;
    }

    if (recurrence !== undefined) {
      if (!Object.values(BillRecurrence).includes(recurrence)) {
        return res.status(400).json({
          message:
            "Recorrência inválida. Use: NONE, MONTHLY ou WEEKLY (no contexto atual, usualmente MONTHLY).",
        });
      }
      data.recurrence = recurrence;
    }

    if (active !== undefined) {
      data.active = active;
    }

    if (reminderDays !== undefined) {
      if (
        typeof reminderDays !== "number" ||
        !Number.isInteger(reminderDays) ||
        reminderDays < 0 ||
        reminderDays > 30
      ) {
        return res.status(400).json({
          message:
            "Dias para lembrete inválido. Use um número inteiro entre 0 e 30.",
        });
      }
      data.reminderDays = reminderDays;
    }

    const updated = await prisma.billTemplate.update({
      where: { id },
      data,
    });

    return res.json({
      id: updated.id,
      description: updated.description,
      amount: Number(updated.amount),
      categoryId: updated.categoryId,
      dueDay: updated.dueDay,
      recurrence: updated.recurrence,
      active: updated.active,
      reminderDays: updated.reminderDays,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao atualizar modelo de conta fixa." });
  }
});

billTemplatesRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = String(req.params.id);

    const existing = await prisma.billTemplate.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Modelo não encontrado." });
    }

    await prisma.billTemplate.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erro ao remover modelo de conta fixa." });
  }
});

