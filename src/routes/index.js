// src/routes/index.js
import dispatchRoutes from "./dispatch.js";
import queueRoutes from "./queue.js";
import instanceRoutes from "./instances.js";
// import webhookRoutes from './webhook.js'; // Descomentar se implementar webhooks

async function registerRoutes(fastify, options) {
  // Registrar rotas com prefixos
  fastify.register(dispatchRoutes, { prefix: "/dispatch" });
  fastify.register(queueRoutes, { prefix: "/queue" });
  fastify.register(instanceRoutes, { prefix: "/instances" });
  // fastify.register(webhookRoutes, { prefix: '/webhook' });

  // Rota de health check básica
  fastify.get("/health", async (request, reply) => {
    // Poderia adicionar verificações de conexão com Redis ou DB aqui
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Rota raiz (opcional)
  fastify.get("/", async (request, reply) => {
    return {
      message: "WhatsApp Dispatcher Backend API",
      version: options.version || "1.0.0", // Passar a versão do package.json
    };
  });
}

export default registerRoutes;

