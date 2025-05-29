import Redis from 'ioredis';
import config from '../config/index.js';
import logger from './logger.js';

const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // BullMQ recommendation
  enableReadyCheck: false,    // BullMQ recommendation
  // Adicionar opções de TLS/SSL se necessário
};

// Criar a conexão com o Redis
const redisClient = new Redis(redisOptions);

// Listener para evento de conexão
redisClient.on('connect', () => {
  logger.info(`Conectado ao Redis em ${config.redis.host}:${config.redis.port}`);
});

// Listener para evento de pronto (após conectar)
redisClient.on('ready', () => {
    logger.info('Cliente Redis pronto para uso.');
});

// Listener para evento de erro
redisClient.on('error', (err) => {
  logger.error('Erro na conexão Redis:', err);
  // Em produção, considere estratégias mais robustas:
  // - Tentar reconectar com backoff
  // - Notificar administradores
  // - Parar a aplicação se a conexão for crítica e não recuperável
});

// Listener para evento de fechamento da conexão
redisClient.on('close', () => {
    logger.warn('Conexão Redis fechada.');
});

// Listener para reconexão
redisClient.on('reconnecting', (timeToReconnect) => {
    logger.info(`Reconectando ao Redis em ${timeToReconnect}ms...`);
});

// Exportar o cliente para ser usado pelo BullMQ e potencialmente em outros lugares
export default redisClient;

