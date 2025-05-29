// src/routes/instances.js
import * as instanceService from "../services/instance.js";
import { Type } from "@sinclair/typebox";

// Schemas para validação
const InstanceNameParamsSchema = {
  params: Type.Object({ instanceName: Type.String() }),
};

const CreateInstanceSchema = {
  body: Type.Object({
    instanceName: Type.String(),
    token: Type.Optional(Type.String()),
    qrcode: Type.Optional(Type.Boolean({ default: true })),
    // Adicionar outros campos da API Evolution se necessário
    // webhook: Type.Optional(Type.String({ format: "uri" })),
    // events: Type.Optional(Type.Array(Type.String())),
  }),
};

async function instanceRoutes(fastify, options) {
  // Rota para Listar Instâncias
  fastify.get("/", async (request, reply) => {
    try {
      const instances = await instanceService.listEvolutionInstances();
      reply.send(instances || []); // Retornar array vazio se for null/undefined
    } catch (error) {
      fastify.log.error("Erro ao listar instâncias:", error);
      reply
        .status(error.statusCode || 500)
        .send({ success: false, message: error.message || "Falha ao listar instâncias." });
    }
  });

  // Rota para Criar Instância
  fastify.post(
    "/",
    { schema: CreateInstanceSchema },
    async (request, reply) => {
      try {
        const result = await instanceService.createEvolutionInstance(request.body);
        reply.status(201).send(result);
      } catch (error) {
        fastify.log.error("Erro ao criar instância:", error);
        reply
          .status(error.statusCode || 500)
          .send({ success: false, message: error.message || "Falha ao criar instância." });
      }
    }
  );

  // Rota para Conectar Instância (Obter QR Code)
  fastify.get(
    "/:instanceName/connect",
    { schema: InstanceNameParamsSchema },
    async (request, reply) => {
      const { instanceName } = request.params;
      try {
        const result = await instanceService.connectEvolutionInstance(instanceName);
        reply.send(result);
      } catch (error) {
        fastify.log.error(`Erro ao conectar instância ${instanceName}:`, error);
        reply
          .status(error.statusCode || 500)
          .send({ success: false, message: error.message || "Falha ao conectar instância." });
      }
    }
  );

  // Rota para Verificar Status da Instância
  fastify.get(
    "/:instanceName/status",
    { schema: InstanceNameParamsSchema },
    async (request, reply) => {
      const { instanceName } = request.params;
      try {
        const result = await instanceService.getEvolutionInstanceStatus(instanceName);
        reply.send(result);
      } catch (error) {
        fastify.log.error(`Erro ao verificar status da instância ${instanceName}:`, error);
        reply
          .status(error.statusCode || 500)
          .send({ success: false, message: error.message || "Falha ao verificar status." });
      }
    }
  );

  // Rota para Desconectar Instância
  fastify.delete(
    "/:instanceName/logout",
    { schema: InstanceNameParamsSchema },
    async (request, reply) => {
      const { instanceName } = request.params;
      try {
        const result = await instanceService.logoutEvolutionInstance(instanceName);
        reply.send(result);
      } catch (error) {
        fastify.log.error(`Erro ao desconectar instância ${instanceName}:`, error);
        reply
          .status(error.statusCode || 500)
          .send({ success: false, message: error.message || "Falha ao desconectar instância." });
      }
    }
  );

  // Rota para Deletar Instância
  fastify.delete(
    "/:instanceName",
    { schema: InstanceNameParamsSchema },
    async (request, reply) => {
      const { instanceName } = request.params;
      try {
        const result = await instanceService.deleteEvolutionInstance(instanceName);
        reply.send(result);
      } catch (error) {
        fastify.log.error(`Erro ao deletar instância ${instanceName}:`, error);
        reply
          .status(error.statusCode || 500)
          .send({ success: false, message: error.message || "Falha ao deletar instância." });
      }
    }
  );

  // TODO: Adicionar rotas para configurar/obter webhook se necessário
}

export default instanceRoutes;

