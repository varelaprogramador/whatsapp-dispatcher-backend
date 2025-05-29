// src/services/instance.js
import {
  createInstance,
  connectInstance,
  getInstanceConnectionState,
  logoutInstance,
  deleteInstance,
  fetchInstances,
  setWebhook, // Importar se for configurar webhook na criação
} from "./evolutionApi.js";
import logger from "../lib/logger.js";
import config from "../config/index.js";

/**
 * Cria uma nova instância na Evolution API.
 * Pode opcionalmente configurar o webhook padrão.
 * @param {object} data - Dados para criação (instanceName, token, qrcode, etc.)
 * @returns {Promise<object>} Resultado da criação da instância.
 */
export const createEvolutionInstance = async (data) => {
  logger.info(`Tentando criar instância: ${data.instanceName}`);
  try {
    const result = await createInstance(data);
    logger.info(`Instância ${data.instanceName} criada com sucesso.`);

    // Opcional: Configurar webhook padrão após criar a instância
    // if (config.webhook.url) { // Assumindo que a URL do webhook está na config
    //   try {
    //     await setWebhook(data.instanceName, {
    //       url: config.webhook.url,
    //       webhook_by_events: true, // ou false, dependendo da necessidade
    //       events: [/* lista de eventos desejados */]
    //     });
    //     logger.info(`Webhook configurado para a instância ${data.instanceName}`);
    //   } catch (webhookError) {
    //     logger.warn(`Instância ${data.instanceName} criada, mas falha ao configurar webhook:`, webhookError);
    //     // Não falhar a criação, apenas logar o aviso
    //   }
    // }

    return result;
  } catch (error) {
    logger.error(`Erro ao criar instância ${data.instanceName}:`, error);
    throw error; // Re-lançar para a rota tratar
  }
};

/**
 * Inicia a conexão de uma instância (pode retornar QR code).
 * @param {string} instanceName
 * @returns {Promise<object>} Resultado da API (pode conter QR code).
 */
export const connectEvolutionInstance = async (instanceName) => {
  logger.info(`Tentando conectar instância: ${instanceName}`);
  try {
    const result = await connectInstance(instanceName);
    logger.info(`Conexão iniciada para instância ${instanceName}.`);
    return result;
  } catch (error) {
    logger.error(`Erro ao iniciar conexão para ${instanceName}:`, error);
    throw error;
  }
};

/**
 * Obtém o status de conexão de uma instância.
 * @param {string} instanceName
 * @returns {Promise<object>} Status da conexão.
 */
export const getEvolutionInstanceStatus = async (instanceName) => {
  logger.debug(`Verificando status da instância: ${instanceName}`);
  try {
    const result = await getInstanceConnectionState(instanceName);
    logger.debug(`Status da instância ${instanceName}: ${result.state}`);
    return result;
  } catch (error) {
    // Tratar erro 404 como instância não encontrada ou não conectada?
    if (error.statusCode === 404) {
        logger.warn(`Instância ${instanceName} não encontrada ou sem estado de conexão.`);
        return { state: 'NOT_FOUND' }; // Ou lançar erro, dependendo da necessidade
    }
    logger.error(`Erro ao verificar status da instância ${instanceName}:`, error);
    throw error;
  }
};

/**
 * Desconecta uma instância.
 * @param {string} instanceName
 * @returns {Promise<object>} Resultado da operação.
 */
export const logoutEvolutionInstance = async (instanceName) => {
  logger.info(`Tentando desconectar instância: ${instanceName}`);
  try {
    const result = await logoutInstance(instanceName);
    logger.info(`Instância ${instanceName} desconectada.`);
    return result;
  } catch (error) {
    logger.error(`Erro ao desconectar instância ${instanceName}:`, error);
    throw error;
  }
};

/**
 * Deleta uma instância.
 * @param {string} instanceName
 * @returns {Promise<object>} Resultado da operação.
 */
export const deleteEvolutionInstance = async (instanceName) => {
    logger.info(`Tentando deletar instância: ${instanceName}`);
    try {
      const result = await deleteInstance(instanceName);
      logger.info(`Instância ${instanceName} deletada.`);
      return result;
    } catch (error) {
      logger.error(`Erro ao deletar instância ${instanceName}:`, error);
      throw error;
    }
  };

/**
 * Lista todas as instâncias.
 * @returns {Promise<Array<object>>} Lista de instâncias.
 */
export const listEvolutionInstances = async () => {
    logger.debug("Listando instâncias...");
    try {
      const result = await fetchInstances();
      logger.debug(`Encontradas ${result?.length || 0} instâncias.`);
      return result;
    } catch (error) {
      logger.error("Erro ao listar instâncias:", error);
      throw error;
    }
};

