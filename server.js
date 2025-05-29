// server.js
import app from "./app.js";
import config from "./src/config/index.js";
import logger from "./src/lib/logger.js";

const startServer = async () => {
  try {
    // Iniciar o servidor Fastify
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    // Log após o servidor iniciar com sucesso (o logger do Fastify já loga ao iniciar)
    // logger.info(`Servidor API escutando em http://${config.server.host}:${config.server.port}`);

  } catch (err) {
    logger.error("Erro ao iniciar o servidor API:", err);
    process.exit(1);
  }
};

// Lidar com sinais de encerramento para graceful shutdown (opcional para o servidor API, mais crítico para workers)
const shutdown = async (signal) => {
    logger.info(`Recebido sinal ${signal}. Desligando servidor API...`);
    try {
        await app.close();
        logger.info("Servidor API desligado com sucesso.");
        process.exit(0);
    } catch (err) {
        logger.error("Erro durante o desligamento do servidor API:", err);
        process.exit(1);
    }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Iniciar o servidor
startServer();

