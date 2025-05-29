import { Queue } from 'bullmq';
import redisClient from '../lib/redis.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

// Criar a instância da fila principal para disparos
const messageQueue = new Queue(config.queue.name, {
  connection: redisClient,
  defaultJobOptions: config.queue.defaultJobOptions,
});

// Listener para erros na fila
messageQueue.on('error', (error) => {
    logger.error(`Erro na fila ${config.queue.name}:`, error);
    // Considerar adicionar métricas ou alertas aqui
});

// Listener para fila pausada (opcional)
messageQueue.on('paused', () => {
    logger.warn(`Fila ${config.queue.name} foi pausada.`);
});

// Listener para fila resumida (opcional)
messageQueue.on('resumed', () => {
    logger.info(`Fila ${config.queue.name} foi resumida.`);
});

// Listener para fila limpa (opcional)
messageQueue.on('cleaned', (jobs, type) => {
    logger.info(`Fila ${config.queue.name} limpa: ${jobs.length} jobs do tipo ${type} removidos.`);
});

logger.info(`Serviço de fila ${config.queue.name} inicializado.`);

/**
 * Adiciona um job de envio de mensagem à fila.
 * @param {object} jobData - Dados do job (instanceName, phone, message, type, etc.)
 * @param {string} [jobId] - (Opcional) ID customizado para o job
 * @param {import('bullmq').JobsOptions} [opts] - (Opcional) Opções específicas para este job (sobrescrevem defaultJobOptions)
 * @returns {Promise<import('bullmq').Job>}
 */
const addMessageDispatchJob = async (jobData, jobId = undefined, opts = {}) => {
  try {
    // Mesclar opções padrão com opções específicas do job
    const jobOptions = { ...config.queue.defaultJobOptions, ...opts, jobId };
    const job = await messageQueue.add('sendMessage', jobData, jobOptions);
    logger.info(`Job ${job.id} (nome: sendMessage) adicionado à fila ${config.queue.name}`);
    return job;
  } catch (error) {
    logger.error('Erro ao adicionar job à fila:', { queueName: config.queue.name, jobData, error });
    // Re-lançar o erro para que a camada superior possa tratá-lo
    throw new Error(`Falha ao adicionar job à fila ${config.queue.name}: ${error.message}`);
  }
};

/**
 * Obtém o status atual da fila (contagem de jobs).
 * @returns {Promise<object>}
 */
const getQueueStatus = async () => {
  try {
    const counts = await messageQueue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed', 'paused');
    const isPaused = await messageQueue.isPaused();
    return {
      name: messageQueue.name,
      counts,
      isPaused,
    };
  } catch (error) {
    logger.error(`Erro ao obter status da fila ${config.queue.name}:`, error);
    throw new Error(`Falha ao obter status da fila: ${error.message}`);
  }
};

/**
 * Obtém um job específico pelo ID.
 * @param {string} jobId
 * @returns {Promise<import('bullmq').Job | null>}
 */
const getJobById = async (jobId) => {
    try {
        const job = await messageQueue.getJob(jobId);
        return job;
    } catch (error) {
        logger.error(`Erro ao obter job ${jobId} da fila ${config.queue.name}:`, error);
        throw new Error(`Falha ao obter job: ${error.message}`);
    }
};

// Exportar funções e a instância da fila
export {
  messageQueue, // Exportar a instância para uso nos workers e potencialmente em outros lugares
  addMessageDispatchJob,
  getQueueStatus,
  getJobById,
};

