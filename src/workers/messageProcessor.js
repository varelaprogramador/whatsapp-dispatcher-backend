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

// Função simples para substituir variáveis (exemplo) - Movida de src/routes/dispatch.js
const replaceVariables = (template, variables) => {
  if (!variables || !template) return template;
  let result = template;
  for (const key in variables) {
    const regex = new RegExp(`{{\s*${key}\s*}}`, "g");
    result = result.replace(regex, variables[key]);
  }
  return result;
};

/**
 * Processa um job de envio de mensagem da fila BullMQ.
 * Diferencia entre jobs de mensagem única ('sendMessage') e jobs de lote ('sendBulkMessage').
 * @param {import("bullmq").Job} job O objeto do job contendo os dados.
 */
const processMessageJob = async (job) => {
  const { id, name, data, attemptsMade } = job; // Incluir name na desestruturação
  const { instanceName, type, delayInMs = 0, ...jobSpecificData } = data; // Extrair instanceName, type, delayInMs e resto dos dados

  logger.info(
    `Iniciando processamento do job ${id} (nome: ${name}, Tentativa ${attemptsMade}/${config.queue.defaultJobOptions.attempts}). Tipo: ${type}, Instância: ${instanceName}`
  );

  // Adicionar um try/catch principal para capturar erros gerais no processamento do job
  try {
    // Diferenciar o processamento com base no nome do job
    if (name === 'sendMessage') {
      // Lógica para processar job de mensagem única
      const { phone: rawPhone, ...messageData } = jobSpecificData; // phone está no nível superior para jobs únicos

      // 1. Formatar o número de telefone
      const formattedNumber = formatPhoneNumber(rawPhone);
      if (!formattedNumber) {
        logger.error(`Job ${id}: Número de telefone inválido após formatação: ${rawPhone}. Job será marcado como falho.`);
        throw new Error(`Número de telefone inválido: ${rawPhone}`);
      }

      logger.debug(`Job ${id}: Número formatado para API: ${formattedNumber}`);

      // 2. Implementar Rate Limiting (Delay antes da chamada à API)
      if (config.worker.apiCallDelay > 0) {
        logger.debug(`Job ${id}: Aguardando ${config.worker.apiCallDelay}ms (rate limit)`);
        await delay(config.worker.apiCallDelay);
      }

      // 3. Construir o payload CORRETO para a API Evolution e enviar
      let response;
      // Adapte a lógica do switch/case para construir o payload baseado em messageData e formattedNumber
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
            caption: replaceVariables(messageData.caption, messageData.variables), // Aplicar variáveis na legenda
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
            title: replaceVariables(messageData.title, messageData.variables), // Aplicar variáveis no título
            description: replaceVariables(messageData.description, messageData.variables), // Aplicar variáveis na descrição
            footer: replaceVariables(messageData.footer, messageData.variables), // Aplicar variáveis no rodapé
            buttons: messageData.buttons, // TODO: Aplicar variáveis nos botões se necessário
            delay: messageData.delay,
            linkPreview: messageData.linkPreview,
          };
          response = await sendButtonsMessage(instanceName, buttonsPayload);
          break;
        case "list":
          const listPayload = {
            options: { presence: "paused", delay: 1200 },
            number: formattedNumber,
            title: replaceVariables(messageData.title, messageData.variables), // Aplicar variáveis no título
            description: replaceVariables(messageData.description, messageData.variables), // Aplicar variáveis na descrição
            buttonText: replaceVariables(messageData.buttonText, messageData.variables), // Aplicar variáveis no texto do botão
            footerText: replaceVariables(messageData.footerText, messageData.variables), // Aplicar variáveis no rodapé
            values: messageData.values, // TODO: Aplicar variáveis nas seções e linhas da lista se necessário
            delay: messageData.delay,
            linkPreview: messageData.linkPreview,
          };
          response = await sendListMessage(instanceName, listPayload);
          break;
        case "poll":
          const pollPayload = {
            options: { presence: "paused", delay: 1200 },
            number: formattedNumber,
            name: replaceVariables(messageData.name, messageData.variables), // Aplicar variáveis no nome da enquete
            selectableCount: messageData.selectableCount,
            values: messageData.values, // TODO: Aplicar variáveis nas opções da enquete se necessário
            delay: messageData.delay,
            linkPreview: messageData.linkPreview,
          };
          response = await sendPollMessage(instanceName, pollPayload);
          break;
        default:
          logger.warn(`Job ${id}: Tipo de mensagem desconhecido ou não suportado: ${type}`);
          throw new Error(`Tipo de mensagem desconhecido: ${type}`);
      }

      // Logar sucesso para job único
      logger.info(
        `Job ${id} de mensagem única concluído com sucesso para ${formattedNumber}. Resposta API: ${JSON.stringify(response?.key || response)}`
      );
      return response;

    } else if (name === 'sendBulkMessage') {
      // Lógica para processar job de lote
      const { recipients, messageTemplate, captionTemplate, mediaUrl, audioUrl } = jobSpecificData; // Dados específicos do lote

      if (!Array.isArray(recipients) || recipients.length === 0) {
        logger.error(`Job ${id}: Job de lote recebido sem destinatários ou com recipients inválido.`);
        throw new Error("Job de lote sem destinatários.");
      }

      logger.info(`Job de Lote ${id}: Iniciando processamento para ${recipients.length} destinatários. Delay entre mensagens: ${delayInMs}ms.`);

      let successfulDispatches = 0;
      let failedDispatches = 0;
      const results = [];

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const recipientPhoneRaw = recipient.phone; // Telefone do destinatário atual
        const recipientVariables = recipient.variables || {}; // Variáveis do destinatário atual

        logger.debug(`Job de Lote ${id}: Processando destinatário ${i + 1}/${recipients.length}: ${recipientPhoneRaw}`);

        // Aplicar variáveis ao template da mensagem
        const messageToSend = replaceVariables(messageTemplate, recipientVariables);
        // Aplicar variáveis ao template da legenda (se existir)
        const captionToSend = replaceVariables(captionTemplate, recipientVariables);

        // Formatar o número de telefone do destinatário
        const formattedNumber = formatPhoneNumber(recipientPhoneRaw);

        if (!formattedNumber) {
          logger.warn(`Job de Lote ${id}: Número de telefone inválido para destinatário ${i + 1} (${recipientPhoneRaw}). Pulando.`);
          failedDispatches++;
          results.push({ phone: recipientPhoneRaw, success: false, error: "Número de telefone inválido." });
          continue; // Pula para o próximo destinatário
        }

        try {
          // Construir o payload para o destinatário atual no lote
          let response;
          switch (type) {
            case "text":
              const textPayload = {
                options: { presence: "paused", delay: 1200 },
                number: formattedNumber,
                text: messageToSend,
              };
              response = await sendTextMessage(instanceName, textPayload);
              break;
            case "media":
              const mediaPayload = {
                options: { presence: "paused", delay: 1200 },
                number: formattedNumber,
                // mediatype, mimetype, fileName, linkPreview viriam do jobSpecificData, se suportado em lote
                caption: captionToSend,
                media: mediaUrl, // mediaUrl é o mesmo para todo o lote
                // delay específico do lote não é usado aqui, o delay é entre envios
              };
               //TODO: Adicionar suporte para mediatype, mimetype, fileName, linkPreview se a API Evolution suportar envio em lote.
              response = await sendMediaMessage(instanceName, mediaPayload);
              break;
            case "audio":
              const audioPayload = {
                options: { presence: "paused", delay: 1200 },
                number: formattedNumber,
                audio: audioUrl, // audioUrl é o mesmo para todo o lote
                // delay específico do lote não é usado aqui
              };
              //TODO: Adicionar suporte para linkPreview se a API Evolution suportar envio em lote.
              response = await sendAudioMessage(instanceName, audioPayload);
              break;
            // TODO: Adicionar suporte para outros tipos (buttons, list, etc.) se a API Evolution suportar envio em lote.
            default:
              logger.warn(`Job de Lote ${id}: Tipo de mensagem desconhecido ou não suportado para envio individual no lote: ${type}. Pulando destinatário ${i + 1}.`);
              failedDispatches++;
              results.push({ phone: recipientPhoneRaw, success: false, error: `Tipo de mensagem não suportado em lote: ${type}` });
              continue; // Pula para o próximo destinatário
          }

          logger.debug(`Job de Lote ${id}: Mensagem enviada com sucesso para ${formattedNumber}. Resposta API: ${JSON.stringify(response?.key || response)}`);
          successfulDispatches++;
          results.push({ phone: recipientPhoneRaw, success: true, response: response?.key || response });

        } catch (apiError) {
          logger.error(`Job de Lote ${id}: Falha ao enviar mensagem para ${formattedNumber} (destinatário ${i + 1}): ${apiError.message}`, { apiErrorCode: apiError.statusCode });
          failedDispatches++;
          results.push({ phone: recipientPhoneRaw, success: false, error: apiError.message, apiErrorCode: apiError.statusCode });
        }

        // Aplicar delay ANTES de processar o próximo destinatário, se não for o último
        if (delayInMs > 0 && i < recipients.length - 1) {
          logger.debug(`Job de Lote ${id}: Aguardando ${delayInMs}ms antes do próximo destinatário...`);
          await delay(delayInMs);
        }
      }

      logger.info(`Processamento do job de lote ${id} concluído. Sucessos: ${successfulDispatches}, Falhas: ${failedDispatches}.`);
      // O job de lote é considerado concluído com sucesso se chegou ao fim da iteração
      // Os resultados individuais de sucesso/falha estão nos logs e no array `results` (embora `results` não seja retornado por padrão pelo worker)
      return { successfulDispatches, failedDispatches, results }; // Retornar um resumo

    } else {
      // Tratar outros tipos de job desconhecidos, se houver
      logger.warn(`Job ${id}: Nome de job desconhecido: ${name}`);
      throw new Error(`Nome de job desconhecido: ${name}`);
    }

  } catch (error) {
    // 5. Logar erro e re-lançar para BullMQ tratar retentativas (para erros que não são tratados no nível individual do destinatário)
    // Erros de validação inicial (ex: recipients inválido) ou erros inesperados aqui.
    logger.error(
      `Erro fatal ao processar job ${id} (nome: ${name}, Tentativa ${attemptsMade}/${config.queue.defaultJobOptions.attempts}): ${error.message}`,
      { stack: error.stack } // Incluir stack trace para erros fatais
    );
    throw error; // BullMQ tentará retentar este job
  }
};

export default processMessageJob;

export {
  formatPhoneNumber,
  replaceVariables,
  delay
};

