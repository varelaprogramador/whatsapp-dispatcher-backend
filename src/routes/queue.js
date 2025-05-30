// src/routes/queue.js
import {
  getQueueStatus,
  getJobStatus,
  listJobs, // Importar a nova função
} from "../services/queue.js";
import logger from "../lib/logger.js";

async function queueRoutes(fastify, options) {
  fastify.get("/status", async (request, reply) => {
    try {
      const status = await getQueueStatus();
      return status;
    } catch (error) {
      logger.error("Erro na rota /queue/status:", error);
      reply.status(500).send({ success: false, message: error.message });
    }
  });

  fastify.get("/jobs/:jobId/status", async (request, reply) => {
    const { jobId } = request.params;
    try {
      const job = await getJobStatus(jobId);
      if (!job) {
        return reply.status(404).send({ success: false, message: "Job não encontrado." });
      }
      // Retornar um objeto mais limpo para o frontend
      return {
        id: job.id,
        name: job.name,
        data: job.data,
        state: job.state,
        progress: job.progress,
        failedReason: job.failedReason,
        returnValue: job.returnvalue,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        attemptsMade: job.attemptsMade,
      };
    } catch (error) {
      logger.error(`Erro na rota /queue/jobs/${jobId}/status:`, error);
      reply.status(500).send({ success: false, message: error.message });
    }
  });

  // Nova rota para listar jobs
  fastify.get("/jobs", async (request, reply) => {
    const { types, start, end, order } = request.query;

    // Parse e validação básica dos parâmetros
    const jobTypes = types ? types.split(",").map(t => t.trim()).filter(t => t) : [];
    const startIndex = parseInt(start, 10);
    const endIndex = parseInt(end, 10);
    const sortOrder = order?.toUpperCase() === "ASC"; // default é DESC (false)

    // Definir padrões se não fornecidos ou inválidos
    const pageStart = !isNaN(startIndex) && startIndex >= 0 ? startIndex : 0;
    // O end do BullMQ é o índice final, então se o frontend manda '19', buscamos de 0 a 19.
    const pageEnd = !isNaN(endIndex) && endIndex >= pageStart ? endIndex : pageStart + 19; // Padrão de 20 itens

    logger.info(`Recebida requisição para listar jobs: types=${jobTypes.join("|") || "todos"}, start=${pageStart}, end=${pageEnd}, order=${sortOrder ? "ASC" : "DESC"}`);

    try {
      const result = await listJobs(jobTypes, pageStart, pageEnd, sortOrder);
      // Adicionar informações de paginação à resposta pode ser útil
      return {
        jobs: result.jobs,
        total: result.total,
        start: pageStart,
        end: pageEnd,
        types: jobTypes.length > 0 ? jobTypes : ["completed", "failed", "active", "waiting", "delayed", "paused"], // Retorna os tipos efetivamente buscados
      };
    } catch (error) {
      logger.error("Erro na rota /queue/jobs:", error);
      reply.status(500).send({ success: false, message: error.message });
    }
  });

}

export default queueRoutes;

