// src/workers/messageProcessor.js
import logger from "../lib/logger.js";
import {
  sendTextMessage,
  sendMediaMessage,
  sendAudioMessage,
  sendButtonsMessage,
  sendListMessage,
  sendPollMessage,
  // Importar outras funções de envio conforme necessário
} from "../services/evolutionApi.js";
import config from "../config/index.js";

// Função helper para introduzir delay (rate limiting entre chamadas API)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Garante que o número de telefone esteja no formato E.164 (apenas dígitos) 
 * e adiciona o código do país (55) se não estiver presente e for um número brasileiro.
 * Remove o @c.us se existir.
 * @param {string} phoneRaw
 * @returns {string | null} Número formatado ou null se inválido.
 */
const formatPhoneNumber = (phoneRaw) => {
  if (!phoneRaw) return null;
  // Remover caracteres não numéricos, exceto o '+' inicial se houver
  let number = phoneRaw.replace(/[^0-9+]/g, "");

  // Remover sufixo @c.us se existir
  number = number.replace(/@c.us$/, "");

  // Verificar se começa com '+' (padrão internacional)
  if (number.startsWith("+")) {
    // Remover o '+' para consistência interna, a API pode ou não precisar dele
    // A API Evolution /sendText geralmente NÃO quer o '+'
    number = number.substring(1);
  }

  // Heurística simples para números brasileiros sem código do país
  // Se tiver 10 ou 11 dígitos (sem 55) e não começar com 55, adiciona 55
  if (
    (number.length === 10 || number.length === 11) &&
    !number.startsWith("55")
  ) {
    // Verificar se o DDD é válido (exemplo simples, pode ser mais complexo)
    const ddd = parseInt(number.substring(0, 2), 10);
    if (ddd >= 11 && ddd <= 99) { // DDDs brasileiros válidos
      logger.debug(`Adicionando código do país 55 ao número ${number}`);
      number = "55" + number;
    }
  }

  // Validar comprimento final (ex: 55 + 10 ou 11 dígitos)
  if (number.startsWith("55") && (number.length === 12 || number.length === 13)) {
    return number;
  } else if (number.length >= 10 && number.length <= 15) { // Permitir outros formatos internacionais básicos
    return number;
  }

  logger.warn(`Número de telefone inválido ou não formatado: ${phoneRaw} -> ${number}`);
  return null; // Retorna null se não conseguir formatar
};


/**
 * Processa um job de envio de mensagem da fila BullMQ.
 * @param {import("bullmq").Job} job O objeto do job contendo os dados.
 */
const processMessageJob = async (job) => {
  const { id, data, attemptsMade } = job;
  const { instanceName, phone: rawPhone, type, ...messageData } = data;

  logger.info(
    `Iniciando processamento do job ${id} (Tentativa ${attemptsMade}/${config.queue.defaultJobOptions.attempts}). Tipo: ${type}, Destinatário Raw: ${rawPhone}, Instância: ${instanceName}`
  );

  // 1. Formatar o número de telefone
  const formattedNumber = formatPhoneNumber(rawPhone);
  if (!formattedNumber) {
    logger.error(`Job ${id}: Número de telefone inválido após formatação: ${rawPhone}. Job será marcado como falho.`);
    // Lança um erro para que o job não seja tentado novamente por este motivo
    throw new Error(`Número de telefone inválido: ${rawPhone}`);
  }

  logger.debug(`Job ${id}: Número formatado para API: ${formattedNumber}`);

  try {
    // 2. Implementar Rate Limiting (Delay antes da chamada à API)
    if (config.worker.apiCallDelay > 0) {
      logger.debug(`Job ${id}: Aguardando ${config.worker.apiCallDelay}ms (rate limit)`);
      await delay(config.worker.apiCallDelay);
    }

    // 3. Construir o payload CORRETO para a API Evolution
    let response;
    switch (type) {
      case "text":
        const textPayload = {
          options: { presence: "paused", delay: 1200 },
          number: formattedNumber,
          text: messageData.message,
        };
        response = await sendTextMessage(instanceName, textPayload);
        break;
      case "media":
        const mediaPayload = {
          options: { presence: "paused", delay: 1200 },
          number: formattedNumber,
          mediatype: messageData.mediatype,
          mimetype: messageData.mimetype,
          caption: messageData.caption,
          media: messageData.mediaUrl,
          fileName: messageData.fileName,
          delay: messageData.delay,
          linkPreview: messageData.linkPreview,
        };
        response = await sendMediaMessage(instanceName, mediaPayload);
        break;
      case "audio":
        const audioPayload = {
          options: { presence: "paused", delay: 1200 },
          number: formattedNumber,
          audio: messageData.audioUrl,
          delay: messageData.delay,
          linkPreview: messageData.linkPreview,
        };
        response = await sendAudioMessage(instanceName, audioPayload);
        break;
      case "buttons":
        const buttonsPayload = {
          options: { presence: "paused", delay: 1200 },
          number: formattedNumber,
          title: messageData.title,
          description: messageData.description,
          footer: messageData.footer,
          buttons: messageData.buttons,
          delay: messageData.delay,
          linkPreview: messageData.linkPreview,
        };
        response = await sendButtonsMessage(instanceName, buttonsPayload);
        break;
      case "list":
        const listPayload = {
          options: { presence: "paused", delay: 1200 },
          number: formattedNumber,
          title: messageData.title,
          description: messageData.description,
          buttonText: messageData.buttonText,
          footerText: messageData.footerText,
          values: messageData.values,
          delay: messageData.delay,
          linkPreview: messageData.linkPreview,
        };
        response = await sendListMessage(instanceName, listPayload);
        break;
      case "poll":
        const pollPayload = {
          options: { presence: "paused", delay: 1200 },
          number: formattedNumber,
          name: messageData.name,
          selectableCount: messageData.selectableCount,
          values: messageData.values,
          delay: messageData.delay,
          linkPreview: messageData.linkPreview,
        };
        response = await sendPollMessage(instanceName, pollPayload);
        break;
      default:
        logger.warn(`Job ${id}: Tipo de mensagem desconhecido ou não suportado: ${type}`);
        throw new Error(`Tipo de mensagem desconhecido: ${type}`);
    }

    // 4. Logar sucesso e retornar resultado
    logger.info(
      `Job ${id} concluído com sucesso para ${formattedNumber}. Resposta API: ${JSON.stringify(response?.key || response)}`
    );
    return response;

  } catch (error) {
    // 5. Logar erro e re-lançar para BullMQ tratar retentativas
    // O log no evolutionApi.js já deve ter registrado detalhes do erro HTTP
    logger.error(
      `Falha ao processar job ${id} (Tentativa ${attemptsMade}/${config.queue.defaultJobOptions.attempts}) para ${formattedNumber}: ${error.message}`,
      { errorCode: error.statusCode } // Adiciona o código de status se disponível
    );
    throw error;
  }
};

export default processMessageJob;

