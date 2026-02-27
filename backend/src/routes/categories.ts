import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";

export const categoriesRouter = Router();

categoriesRouter.use(authMiddleware);

categoriesRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
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

