import pino from 'pino';
import config from '../config/index.js';

const logger = pino({
  level: 'debug',
  // Configurações adicionais do Pino, se necessário
  // Exemplo: formatadores para pino-pretty em desenvolvimento
  transport: config.server.nodeEnv !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

export default logger;

