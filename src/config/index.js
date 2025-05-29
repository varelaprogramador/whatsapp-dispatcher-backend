import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Obter o diretório atual (necessário para ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente do arquivo .env na raiz do projeto
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = {
  // Configurações do Servidor
  server: {
    port: parseInt(process.env.PORT, 10) || 3001,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  // Configurações da Evolution API
  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
  },
  // Configurações do Redis
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  // Configurações da Fila (BullMQ)
  queue: {
    name: process.env.QUEUE_NAME || 'message-dispatch-queue',
    defaultJobOptions: {
      attempts: parseInt(process.env.JOB_ATTEMPTS, 10) || 3,
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.JOB_BACKOFF_DELAY, 10) || 5000,
      },
      removeOnComplete: process.env.JOB_REMOVE_ON_COMPLETE === 'true',
      removeOnFail: parseInt(process.env.JOB_REMOVE_ON_FAIL, 10) || 1000,
    },
  },
  // Configurações do Worker
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 5,
    apiCallDelay: parseInt(process.env.WORKER_API_CALL_DELAY, 10) || 1000,
    // Adicionar configurações de limiter se necessário
    // limiter: {
    //   max: 10,
    //   duration: 1000,
    // },
  },
};

// Validar configurações essenciais
if (!config.evolution.apiUrl || !config.evolution.apiKey) {
  console.error('Erro: Variáveis de ambiente EVOLUTION_API_URL e EVOLUTION_API_KEY são obrigatórias.');
  process.exit(1);
}

export default config;

