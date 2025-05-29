// worker.js
import { Worker } from "bullmq";
import redisClient from "./src/lib/redis.js";
import config from "./src/config/index.js";
import processMessageJob from "./src/workers/messageProcessor.js";
import logger from "./src/lib/logger.js";

logger.info(`Iniciando worker para a fila: ${config.queue.name}`);

// Configurações do Worker
const workerOptions = {
  connection: redisClient,
  concurrency: config.worker.concurrency,
  // Adicionar limiter se configurado
  // limiter: config.worker.limiter,
};

// Instanciar o Worker
const worker = new Worker(
  config.queue.name,
  processMessageJob, // A função que processará cada job
  workerOptions
);

// --- Listeners de Eventos do Worker --- //

worker.on("completed", (job, result) => {
  // Logar apenas o ID ou informações resumidas para não poluir muito
  logger.info(`Job ${job.id} concluído.`);
  // logger.debug(`Job ${job.id} concluído com resultado:`, result);
});

worker.on("failed", (job, err) => {
  // Log detalhado da falha final (após todas as tentativas)
  logger.error(
    `Job ${job.id} falhou permanentemente após ${job.attemptsMade} tentativas: ${err.message}`,
    { error: err, stack: err.stack, jobData: job.data }
  );
  // TODO: Implementar notificação para falhas críticas persistentes (ex: enviar para Sentry, Slack, etc.)
});

worker.on("error", (err) => {
  // Erro não relacionado a um job específico (ex: problema de conexão Redis no worker)
  logger.error("Erro não tratado no worker:", err);
});

worker.on("progress", (job, progress) => {
  // Logar progresso se a função processMessageJob usar job.updateProgress()
  logger.debug(`Job ${job.id} progrediu para ${progress}%`);
});

worker.on("active", (job) => {
  // Log quando um job começa a ser processado
  logger.debug(`Job ${job.id} iniciado (Tentativa ${job.attemptsMade})`);
});

worker.on("stalled", (jobId) => {
    // Log quando um job fica "stalled" (preso)
    logger.warn(`Job ${jobId} está stalled.`);
});

logger.info(
  `Worker pronto para processar jobs da fila ${config.queue.name}. Concorrência: ${config.worker.concurrency}`
);

// --- Graceful Shutdown --- //

let isShuttingDown = false;
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Recebido sinal ${signal}. Desligando worker gracefulmente...`);
  try {
    // Espera os jobs ativos terminarem e fecha a conexão do worker
    await worker.close();
    logger.info("Worker fechado. Desconectando Redis...");
    // Fechar a conexão Redis (opcional, pode ser compartilhada)
    // await redisClient.quit(); // Cuidado se o servidor API ainda estiver usando
    logger.info("Worker desligado com sucesso.");
    process.exit(0);
  } catch (err) {
    logger.error("Erro durante o graceful shutdown do worker:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM")); // Sinal padrão para término (ex: Docker, Kubernetes, PM2 stop)
process.on("SIGINT", () => shutdown("SIGINT")); // Sinal de interrupção (Ctrl+C)

