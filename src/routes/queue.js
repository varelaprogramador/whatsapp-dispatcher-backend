// src/routes/queue.js
import { messageQueue, getQueueStatus, getJobById } from "../services/queue.js";
import { Type } from "@sinclair/typebox";

const JobStatusParamsSchema = {
  params: Type.Object({
    jobId: Type.String(),
  }),
};

async function queueRoutes(fastify, options) {
  // Rota para Status Geral da Fila
  fastify.get("/status", async (request, reply) => {
    try {
      const status = await getQueueStatus();
      reply.send(status);
    } catch (error) {
      fastify.log.error("Erro ao obter status da fila:", error);
      reply
        .status(500)
        .send({ success: false, message: "Falha ao obter status da fila." });
    }
  });

  // Rota para Status de um Job Específico
  fastify.get(
    "/jobs/:jobId/status",
    { schema: JobStatusParamsSchema },
    async (request, reply) => {
      const { jobId } = request.params;
      try {
        const job = await getJobById(jobId);

        if (!job) {
          return reply
            .status(404)
            .send({ success: false, message: "Job não encontrado." });
        }

        const state = await job.getState();
        const progress = await job.progress;
        const failedReason = job.failedReason;
        const returnValue = job.returnvalue;

        reply.send({
          id: job.id,
          name: job.name,
          data: job.data,
          state,
          progress,
          failedReason,
          returnValue,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          attemptsMade: job.attemptsMade,
        });
      } catch (error) {
        fastify.log.error(`Erro ao obter status do job ${jobId}:`, error);
        reply
          .status(500)
          .send({ success: false, message: "Falha ao obter status do job." });
      }
    }
  );

  // TODO: Adicionar rotas para pausar/resumir fila, limpar jobs, etc. (se necessário)
}

export default queueRoutes;

