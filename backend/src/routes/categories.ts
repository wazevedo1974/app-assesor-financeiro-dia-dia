import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { CategoryKind } from "@prisma/client";

export const categoriesRouter = Router();

categoriesRouter.use(authMiddleware);

const VALID_KINDS: CategoryKind[] = [
  CategoryKind.EXPENSE_FIXED,
  CategoryKind.EXPENSE_VARIABLE,
  CategoryKind.INCOME,
];

categoriesRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });

    return res.json(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar categorias." });
  }
});

categoriesRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, kind } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ message: "Nome da categoria é obrigatório." });
    }

    if (!kind || !VALID_KINDS.includes(kind)) {
      return res.status(400).json({
        message: "Tipo inválido. Use: EXPENSE_FIXED, EXPENSE_VARIABLE ou INCOME.",
      });
    }

    const existing = await prisma.category.findFirst({
      where: { userId, name: name.trim() },
    });
    if (existing) {
      return res.status(409).json({ message: "Já existe uma categoria com esse nome." });
    }

    const category = await prisma.category.create({
      data: {
        userId,
        name: name.trim(),
        kind: kind as CategoryKind,
      },
    });

    return res.status(201).json({
      id: category.id,
      name: category.name,
      kind: category.kind,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao criar categoria." });
  }
});

