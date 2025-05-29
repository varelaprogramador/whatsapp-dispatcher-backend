// src/services/evolutionApi.js
import { request } from "undici";
import config from "../config/index.js";
import logger from "../lib/logger.js";

const { apiUrl, apiKey } = config.evolution;

/**
 * Cliente HTTP genérico para a Evolution API.
 * @param {string} endpoint - O endpoint da API (ex: /instance/create)
 * @param {string} method - Método HTTP (GET, POST, PUT, DELETE)
 * @param {object|null} body - Corpo da requisição para POST/PUT
 * @param {object} [queryParams] - Parâmetros de query string
 * @returns {Promise<object>} - Resposta da API
 * @throws {Error} - Em caso de erro na requisição ou resposta não OK
 */
const evolutionApiRequest = async (
  endpoint,
  method = "GET",
  body = null,
  queryParams = {}
) => {
  const url = new URL(endpoint, apiUrl);

  // Adicionar query params à URL
  Object.keys(queryParams).forEach((key) =>
    url.searchParams.append(key, queryParams[key])
  );

  const headers = {
    apikey: apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const requestBodyString = body ? JSON.stringify(body) : undefined;

  const options = {
    method,
    headers,
    body: requestBodyString,
  };

  // Log detalhado da requisição ANTES de enviar (usando WARN para garantir visibilidade)
  logger.warn(
    `[EVOLUTION_API_REQUEST] Enviando ${method} para ${url.toString()}`,
    {
      payload: body, // Logar o objeto ANTES de stringify
    }
  );

  try {
    const { statusCode, body: responseBody } = await request(
      url.toString(),
      options
    );

    // Tentar ler a resposta como JSON
    let responseData = {};
    try {
      // Ler o corpo da resposta como texto primeiro para logar em caso de erro JSON
      const responseText = await responseBody.text();
      logger.debug(`[EVOLUTION_API_RESPONSE_RAW] Status: ${statusCode}, Body: ${responseText}`);
      responseData = JSON.parse(responseText);
    } catch (e) {
      logger.error(
        `[EVOLUTION_API_ERROR] Falha ao fazer parse do JSON da resposta da API Evolution (Status: ${statusCode}). Resposta Raw: ${await responseBody.text().catch(() =>
          'Falha ao ler corpo raw')}`,
        e
      );
      // Criar um erro específico para falha de parse
      const parseError = new Error("Falha ao processar resposta da API Evolution.");
      parseError.statusCode = statusCode; // Manter o status code original
      parseError.rawResponse = await responseBody.text().catch(() => 'Falha ao ler corpo raw');
      throw parseError;
    }

    logger.debug(
      `[EVOLUTION_API_RESPONSE] Status: ${statusCode}, Dados:`, responseData
    );

    // Verificar se o status code indica erro
    if (statusCode < 200 || statusCode >= 300) {
      const errorMessage =
        responseData?.message ||
        responseData?.error ||
        `Erro ${statusCode} da API Evolution`;
      const error = new Error(errorMessage);
      error.statusCode = statusCode;
      error.responseData = responseData; // Anexar a resposta JSON completa ao erro
      throw error; // Lançar o erro para ser capturado abaixo
    }

    // Retornar dados em caso de sucesso
    return responseData;

  } catch (error) {
    // Logar o erro detalhado (usando ERROR para garantir visibilidade)
    // Se o erro já tem responseData (foi lançado pelo bloco acima), incluir isso
    logger.error(
      `[EVOLUTION_API_ERROR] Falha na chamada ${method} ${url.toString()}: ${error.message}`,
      {
        statusCode: error.statusCode,
        responseData: error.responseData, // Inclui a resposta JSON do erro, se disponível
        rawResponse: error.rawResponse, // Inclui a resposta raw se o JSON falhou
        requestPayload: body, // Logar novamente o payload que causou o erro
        stack: error.stack
      }
    );

    // Re-lançar o erro para ser tratado pela camada superior (worker)
    // Garantir que o erro tenha statusCode para o worker poder logar
    if (!error.statusCode) {
      error.statusCode = 500; // Erro genérico de comunicação
    }
    throw error;
  }
};

// --- Funções específicas para endpoints (sem alterações) --- //

// Instâncias
export const createInstance = (data) =>
  evolutionApiRequest("/instance/create", "POST", data);
export const fetchInstances = () =>
  evolutionApiRequest("/instance/fetchInstances", "GET");
export const connectInstance = (instanceName) =>
  evolutionApiRequest(`/instance/connect/${instanceName}`, "GET");
export const getInstanceConnectionState = (instanceName) =>
  evolutionApiRequest(`/instance/connectionState/${instanceName}`, "GET");
export const logoutInstance = (instanceName) =>
  evolutionApiRequest(`/instance/logout/${instanceName}`, "DELETE");
export const deleteInstance = (instanceName) =>
  evolutionApiRequest(`/instance/delete/${instanceName}`, "DELETE");

// Mensagens
export const sendTextMessage = (instanceName, data) =>
  evolutionApiRequest(`/message/sendText/${instanceName}`, "POST", data);
export const sendMediaMessage = (instanceName, data) =>
  evolutionApiRequest(`/message/sendMedia/${instanceName}`, "POST", data);
export const sendButtonsMessage = (instanceName, data) =>
  evolutionApiRequest(`/message/sendButtons/${instanceName}`, "POST", data);
export const sendListMessage = (instanceName, data) =>
  evolutionApiRequest(`/message/sendList/${instanceName}`, "POST", data);
export const sendAudioMessage = (instanceName, data) =>
  evolutionApiRequest(`/message/sendWhatsAppAudio/${instanceName}`, "POST", data);

// Adicionar função para enviar enquete (poll)
export const sendPollMessage = (instanceName, data) =>
  evolutionApiRequest(`/message/sendPoll/${instanceName}`, "POST", data);

// Contatos
export const getContacts = (instanceName) =>
  evolutionApiRequest(`/contacts/getContacts/${instanceName}`, "GET");
export const getContactInfo = (instanceName, phone) =>
  evolutionApiRequest(`/contacts/getContact/${instanceName}/${phone}`, "GET");
export const checkIsWhatsApp = (instanceName, data) =>
  evolutionApiRequest(`/chat/checkIsWhatsApp/${instanceName}`, "POST", data);
export const blockContact = (instanceName, data) =>
  evolutionApiRequest(`/contacts/blockContact/${instanceName}`, "POST", data);
export const unblockContact = (instanceName, data) =>
  evolutionApiRequest(`/contacts/unblockContact/${instanceName}`, "POST", data);

// Webhook
export const setWebhook = (instanceName, data) =>
  evolutionApiRequest(`/webhook/set/${instanceName}`, "POST", data);
export const findWebhook = (instanceName) =>
  evolutionApiRequest(`/webhook/find/${instanceName}`, "GET");

export { evolutionApiRequest };

