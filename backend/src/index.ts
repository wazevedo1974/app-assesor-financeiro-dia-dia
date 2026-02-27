import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./server";

const PORT = process.env.PORT || 3333;

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});

