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
// Importar a função formatPhoneNumber se ela for reutilizável (melhor mover para um utils)
import { formatPhoneNumber, replaceVariables, delay } from "./messageProcessor.js"; // Reutilizando helpers de messageProcessor

/**
 * Processa um job de envio de mensagem em lote da fila BullMQ.
 * Este job contém uma lista de destinatários e dados de mensagem.
 * @param {import("bullmq").Job} job O objeto do job contendo os dados do lote.
 */
const processBulkMessageJob = async (job) => {
  const { id, data, attemptsMade } = job;
  const {
    instanceName,
    recipients,
    messageTemplate,
    type,
    mediaUrl,
    audioUrl,
    captionTemplate,
    delayInMs,
  } = data;

  logger.info(
    `Iniciando processamento do job de lote ${id} (Tentativa ${attemptsMade}/${config.queue.defaultJobOptions.attempts}). Tipo: ${type}, Total Destinatários: ${recipients.length}, Instância: ${instanceName}, Delay: ${delayInMs}ms`
  );

  const results = [];
  let successfulSends = 0;
  let failedSends = 0;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const recipientPhoneRaw = recipient.phone;
    const recipientVariables = recipient.variables;

    logger.debug(
      `Job de Lote ${id}: Processando destinatário ${i + 1}/${recipients.length}: ${recipientPhoneRaw}`
    );

    // Substituir variáveis na mensagem e legenda para o destinatário atual
    const finalMessage = messageTemplate
      ? replaceVariables(messageTemplate, recipientVariables)
      : undefined;
    const finalCaption = captionTemplate
      ? replaceVariables(captionTemplate, recipientVariables)
      : undefined;

    // Formatar o número de telefone
    const formattedNumber = formatPhoneNumber(recipientPhoneRaw);
    if (!formattedNumber) {
      logger.warn(
        `Job de Lote ${id}: Destinatário ${i + 1}/${recipients.length} (${recipientPhoneRaw}): Número de telefone inválido após formatação. Ignorando.`
      );
      failedSends++;
      results.push({ phone: recipientPhoneRaw, success: false, message: 'Número de telefone inválido.' });
      // Não há necessidade de delay para números inválidos que são pulados
      continue; // Pula para o próximo destinatário
    }

    try {
      // Construir o payload CORRETO para a API Evolution para este destinatário
      let response;
      const basePayload = {
        options: { presence: "paused", delay: 1200 }, // Manter delay da API se necessário
        number: formattedNumber,
      };

      switch (type) {
        case "text":
          const textPayload = { ...basePayload, text: finalMessage };
          textPayload.delay = data.delay;
          textPayload.linkPreview = data.linkPreview;
          textPayload.mentionsEveryOne = data.mentionsEveryOne;
          textPayload.mentioned = data.mentioned;
          response = await sendTextMessage(instanceName, textPayload);
          break;
        case "media":
          const mediaPayload = { ...basePayload, mediatype: data.mediatype, mimetype: data.mimetype, caption: finalCaption, media: data.mediaUrl, fileName: data.fileName, linkPreview: data.linkPreview };
          mediaPayload.delay = data.delay;
          mediaPayload.mentionsEveryOne = data.mentionsEveryOne;
          mediaPayload.mentioned = data.mentioned;
          response = await sendMediaMessage(instanceName, mediaPayload);
          break;
        case "audio":
          const audioPayload = { ...basePayload, audio: data.audioUrl, linkPreview: data.linkPreview };
          audioPayload.delay = data.delay;
          audioPayload.mentionsEveryOne = data.mentionsEveryOne;
          audioPayload.mentioned = data.mentioned;
          response = await sendAudioMessage(instanceName, audioPayload);
          break;
        case "buttons":
          const buttonsPayload = {
            ...basePayload,
            title: replaceVariables(data.title, recipientVariables),
            description: replaceVariables(data.description, recipientVariables),
            footer: replaceVariables(data.footer, recipientVariables),
            buttons: data.buttons,
            delay: data.delay,
            linkPreview: data.linkPreview,
            mentionsEveryOne: data.mentionsEveryOne,
            mentioned: data.mentioned,
          };
          response = await sendButtonsMessage(instanceName, buttonsPayload);
          break;
        case "list":
          const listPayload = {
            ...basePayload,
            title: replaceVariables(data.title, recipientVariables),
            description: replaceVariables(data.description, recipientVariables),
            buttonText: replaceVariables(data.buttonText, recipientVariables),
            footerText: replaceVariables(data.footerText, recipientVariables),
            values: data.values,
            delay: data.delay,
            linkPreview: data.linkPreview,
            mentionsEveryOne: data.mentionsEveryOne,
            mentioned: data.mentioned,
          };
          response = await sendListMessage(instanceName, listPayload);
          break;
        case "poll":
          const pollPayload = {
            ...basePayload,
            name: replaceVariables(data.name, recipientVariables),
            selectableCount: data.selectableCount,
            values: Array.isArray(data.values) ? data.values.map(value => ({ optionName: value })) : [],
            delay: data.delay,
            linkPreview: data.linkPreview,
            mentionsEveryOne: data.mentionsEveryOne,
            mentioned: data.mentioned,
          };
          response = await sendPollMessage(instanceName, pollPayload);
          break;
        default:
            logger.warn(`Job de Lote ${id}: Tipo de mensagem desconhecido ou não suportado para envio em lote: ${type}. Ignorando destinatário ${formattedNumber}.`);
            failedSends++;
            results.push({ phone: recipientPhoneRaw, success: false, message: `Tipo de mensagem não suportado para lote: ${type}` });
            // Não há necessidade de delay para tipos não suportados que são pulados
            continue; // Pula para o próximo destinatário
      }

      // Verificar a resposta da API (depende da estrutura de retorno da sua API Evolution)
      if (response && (response.status === true || response.key?.id)) { // Exemplo: verifica status bool ou se key.id existe
        logger.debug(
          `Job de Lote ${id}: Mensagem enviada com sucesso para ${formattedNumber}. Resposta API: ${JSON.stringify(response?.key || response)}`
        );
        successfulSends++;
        results.push({ phone: recipientPhoneRaw, success: true, result: response });
      } else {
        logger.error(
          `Job de Lote ${id}: Falha ao enviar mensagem para ${formattedNumber}. Resposta API: ${JSON.stringify(response)}`
        );
        failedSends++;
        results.push({ phone: recipientPhoneRaw, success: false, message: 'Falha na resposta da API.', result: response });
      }

    } catch (error) {
      logger.error(
        `Job de Lote ${id}: Erro inesperado ao processar destinatário ${formattedNumber}: ${error.message}`,
        { error: error, stack: error.stack, recipient: recipientPhoneRaw, jobData: data }
      );
      failedSends++;
      results.push({ phone: recipientPhoneRaw, success: false, message: `Erro inesperado: ${error.message}` });
    }

    // Aplicar delay APÓS processar o destinatário atual, se não for o último
    if (delayInMs > 0 && i < recipients.length - 1) {
      logger.debug(
        `Job de Lote ${id}: Aguardando ${delayInMs}ms antes do próximo destinatário...`
      );
      await delay(delayInMs);
    }
  }

  // Marcar job como concluído com resultados resumidos
  logger.info(
    `Processamento do job de lote ${id} concluído. Sucessos: ${successfulSends}, Falhas: ${failedSends}.`
  );

  // Você pode retornar um resumo ou os resultados detalhados
  return { success: failedSends === 0, totalRecipients: recipients.length, successfulSends, failedSends, resultsSummary: results.map(r => `${r.phone}: ${r.success ? 'Sucesso' : `Falha (${r.message})`}`) };

  // TODO: Considerar como lidar com falhas parciais. 
  // Se houver falhas parciais, o job BullMQ em si será marcado como 'completed'.
  // Se quiser que o job de lote falhe se houver QUALQUER falha de envio individual, lance um erro aqui se failedSends > 0.
  // Isso faria o BullMQ tentar novamente o lote inteiro.
};

export default processBulkMessageJob;