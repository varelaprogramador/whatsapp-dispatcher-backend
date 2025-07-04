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
 * @param {object} jobData - Dados do job (instanceName, phone, message, type, etc.) ou dados do lote.
 * @param {string} jobName - O nome do job ('sendMessage' para único, 'sendBulkMessage' para lote).
 * @param {string} [jobId] - (Opcional) ID customizado para o job
 * @param {import('bullmq').JobsOptions} [opts] - (Opcional) Opções específicas para este job (sobrescrevem defaultJobOptions)
 * @returns {Promise<import('bullmq').Job>}
 */
const addMessageDispatchJob = async (jobData, jobName, jobId = undefined, opts = {}) => {
  try {
    // Mesclar opções padrão com opções específicas do job
    const jobOptions = { ...config.queue.defaultJobOptions, ...opts, jobId };
    // Usar o jobName passado como parâmetro
    const job = await messageQueue.add(jobName, jobData, jobOptions);
    logger.info(`Job ${job.id} (nome: ${jobName}) adicionado à fila ${config.queue.name}`);
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
export const listJobs = async (types = [], start = 0, end = 19, asc = false) => {
  try {
    // Validar tipos, usar todos se vazio
    const validTypes = ["completed", "failed", "active", "waiting", "delayed", "paused"];
    const jobTypes = types.length > 0 ? types.filter(t => validTypes.includes(t)) : validTypes;
    
    if (jobTypes.length === 0) {
        return { jobs: [], total: 0 }; // Nenhum tipo válido selecionado
    }

    logger.debug(`Buscando jobs dos tipos [${jobTypes.join(', ')}] de ${start} a ${end}, ordem ${asc ? 'ASC' : 'DESC'}`);

    const jobs = await messageQueue.getJobs(jobTypes, start, end, asc);
    
    // Para obter o total, precisamos contar para cada tipo individualmente
    // (getJobs não retorna o total geral filtrado)
    const counts = await messageQueue.getJobCounts(...jobTypes);
    const total = jobTypes.reduce((sum, type) => sum + (counts[type] || 0), 0);

    // Mapear para retornar apenas dados relevantes (opcional)
    const formattedJobPromises = jobs.map(async job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      state: await job.getState(), // Pega o estado atual
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    }));

    // Aguardar a resolução de todas as promises
    const formattedJobs = await Promise.all(formattedJobPromises);

    return { jobs: formattedJobs, total };
  } catch (error) {
    logger.error("Erro ao listar jobs da fila:", error);
    throw new Error("Falha ao buscar jobs da fila.");
  }
};

/**
 * Atualiza os dados de um job existente na fila.
 * @param {string} jobId - O ID do job a ser atualizado.
 * @param {object} newData - Os novos dados para o job.
 * @returns {Promise<import('bullmq').Job>}
 */
export const updateMessageDispatchJob = async (jobId, newData) => {
  try {
    const job = await messageQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Job com ID ${jobId} não encontrado.`);
    }
    logger.info(`Atualizando dados do job ${jobId}`);
    await job.updateData(newData);
    logger.info(`Dados do job ${jobId} atualizados com sucesso.`);
    return job;
  } catch (error) {
    logger.error(`Erro ao atualizar job ${jobId}:`, error);
    throw new Error(`Falha ao atualizar job ${jobId}: ${error.message}`);
  }
};