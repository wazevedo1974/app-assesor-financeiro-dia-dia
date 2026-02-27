import express from "express";
import cors from "cors";

import { authRouter } from "./routes/auth";
import { transactionsRouter } from "./routes/transactions";
import { billsRouter } from "./routes/bills";
import { categoriesRouter } from "./routes/categories";
import { adviceRouter } from "./routes/advice";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/transactions", transactionsRouter);
app.use("/bills", billsRouter);
app.use("/categories", categoriesRouter);
app.use("/advice", adviceRouter);

export default app;

