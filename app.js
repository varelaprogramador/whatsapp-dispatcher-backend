// app.js
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import logger from "./src/lib/logger.js";
import config from "./src/config/index.js";
import registerRoutes from "./src/routes/index.js";
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obter o diretório atual (necessário para ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ler package.json para obter a versão
let appVersion = "1.0.0";
try {
  const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
  appVersion = packageJson.version;
} catch (error) {
  logger.warn("Não foi possível ler a versão do package.json", error);
}

// Criar instância do Fastify
const app = Fastify({
  logger: logger, // Usar o logger Pino configurado
  // Outras opções do Fastify, se necessário
  // Ex: trustProxy: true (se estiver atrás de um proxy)
});

// Registrar Plugins Essenciais
app.register(cors, {
  // Configurar origens permitidas, métodos, etc.
  // Exemplo: origin: config.server.corsOrigin || "*"
  origin: "*", // Permitir todas as origens por padrão (ajustar para produção)
});
app.register(helmet, {
  // Opções do Helmet (segurança HTTP)
  contentSecurityPolicy: false, // Desabilitar CSP por padrão, pode ser muito restritivo
});

// Registrar Plugins Customizados (se houver)
// Ex: app.register(import("./src/plugins/authenticate.js"));

// Registrar Rotas Principais
app.register(registerRoutes, { prefix: "/api/v1", version: appVersion }); // Adicionar prefixo para versionamento

// Configurar Error Handler Global
app.setErrorHandler((error, request, reply) => {
  app.log.error(error); // Usar o logger do Fastify

  // Se for um erro com statusCode definido (ex: da API Evolution), usar esse status
  const statusCode = error.statusCode || 500;

  // Não expor detalhes do erro em produção
  const message = config.server.nodeEnv === "production" && statusCode === 500
    ? "Ocorreu um erro interno no servidor."
    : error.message || "Ocorreu um erro interno.";

  reply.status(statusCode).send({ success: false, message });
});

// Configurar Handler para Rota Não Encontrada (404)
app.setNotFoundHandler((request, reply) => {
  reply.status(404).send({ success: false, message: `Rota não encontrada: ${request.method} ${request.url}` });
});

export default app;

