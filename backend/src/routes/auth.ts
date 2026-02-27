import { Router } from "express";
import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { CategoryKind } from "@prisma/client";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

async function createDefaultCategories(userId: string) {
  await prisma.category.createMany({
    data: [
      // Despesas fixas
      { userId, name: "Aluguel", kind: CategoryKind.EXPENSE_FIXED },
      { userId, name: "Internet", kind: CategoryKind.EXPENSE_FIXED },
      { userId, name: "Academia", kind: CategoryKind.EXPENSE_FIXED },
      // Despesas variáveis
      { userId, name: "Mercado", kind: CategoryKind.EXPENSE_VARIABLE },
      { userId, name: "Lazer", kind: CategoryKind.EXPENSE_VARIABLE },
      { userId, name: "Transporte", kind: CategoryKind.EXPENSE_VARIABLE },
      // Receitas
      { userId, name: "Salário", kind: CategoryKind.INCOME },
      { userId, name: "Renda extra", kind: CategoryKind.INCOME },
    ],
    skipDuplicates: true,
  });
}

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "E-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
    });

    await createDefaultCategories(user.id);

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao registrar usuário." });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao autenticar." });
  }
});

