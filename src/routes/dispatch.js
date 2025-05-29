// src/routes/dispatch.js
import { addMessageDispatchJob } from "../services/queue.js";
import { Type } from "@sinclair/typebox";

// Schema para validação do corpo da requisição de envio único
const SingleDispatchRequestSchema = {
  body: Type.Object(
    {
      instanceName: Type.String(),
      phone: Type.String({
        description: "Número com código do país, ex: 5511999999999",
      }),
      message: Type.Optional(Type.String()),
      type: Type.Enum(
        {
          text: "text",
          media: "media",
          buttons: "buttons",
          list: "list",
          audio: "audio", // Adicionado tipo audio
        },
        { description: "Tipo de mensagem a ser enviada" }
      ),
      // Campos específicos por tipo (ex: mediaUrl, caption, buttons, sections)
      mediaUrl: Type.Optional(Type.String({ format: "uri" })),
      audioUrl: Type.Optional(Type.String({ format: "uri" })), // Adicionado para audio
      caption: Type.Optional(Type.String()),
      buttons: Type.Optional(
        Type.Array(Type.Object({ displayText: Type.String() }))
      ),
      sections: Type.Optional(
        Type.Array(
          Type.Object({
            title: Type.String(),
            rows: Type.Array(
              Type.Object({
                title: Type.String(),
                description: Type.Optional(Type.String()),
              })
            ),
          })
        )
      ),
      buttonText: Type.Optional(Type.String()), // Para listas
      footerText: Type.Optional(Type.String()), // Para botões e listas
      // Adicionar outros campos da API Evolution conforme necessário
    },
    { additionalProperties: false }
  ),
};

// Schema para validação do corpo da requisição de envio em lote
const BulkRecipientSchema = Type.Object({
  phone: Type.String(),
  // Adicionar campos para variáveis, se necessário (ex: name: Type.String())
  variables: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const BulkDispatchRequestSchema = {
  body: Type.Object(
    {
      instanceName: Type.String(),
      recipients: Type.Array(BulkRecipientSchema, { minItems: 1 }),
      message: Type.Optional(Type.String()), // Mensagem base, pode conter variáveis
      type: Type.Enum({ text: "text", media: "media" }), // Simplificado para lote, expandir se necessário
      mediaUrl: Type.Optional(Type.String({ format: "uri" })),
      caption: Type.Optional(Type.String()),
      // Adicionar outros campos se o envio em lote suportar mais tipos
    },
    { additionalProperties: false }
  ),
};

// Função simples para substituir variáveis (exemplo)
const replaceVariables = (template, variables) => {
  if (!variables) return template;
  let result = template;
  for (const key in variables) {
    const regex = new RegExp(`{{\s*${key}\s*}}`, "g");
    result = result.replace(regex, variables[key]);
  }
  return result;
};

async function dispatchRoutes(fastify, options) {
  // Rota para Envio Único
  fastify.post(
    "/single",
    { schema: SingleDispatchRequestSchema },
    async (request, reply) => {
      const jobData = request.body;
      try {
        // Validação adicional específica por tipo
        if (jobData.type === "media" && !jobData.mediaUrl) {
          return reply
            .status(400)
            .send({ success: false, message: "mediaUrl é obrigatório para type=media" });
        }
        if (jobData.type === "audio" && !jobData.audioUrl) {
          return reply
            .status(400)
            .send({ success: false, message: "audioUrl é obrigatório para type=audio" });
        }
        // Adicionar mais validações para buttons, list, etc.

        const job = await addMessageDispatchJob(jobData);
        reply.send({ success: true, message: "Job adicionado à fila.", jobId: job.id });
      } catch (error) {
        fastify.log.error("Erro ao adicionar job único:", error);
        reply
          .status(500)
          .send({ success: false, message: "Falha ao adicionar job à fila." });
      }
    }
  );

  // Rota para Envio em Lote
  fastify.post(
    "/bulk",
    { schema: BulkDispatchRequestSchema },
    async (request, reply) => {
      const {
        instanceName,
        recipients,
        message: messageTemplate,
        type,
        mediaUrl,
        caption: captionTemplate,
      } = request.body;
      const jobIds = [];
      let failedCount = 0;

      fastify.log.info(
        `Recebida requisição de envio em lote para ${recipients.length} destinatários.`
      );

      for (const recipient of recipients) {
        // Substituir variáveis na mensagem e legenda
        const finalMessage = messageTemplate
          ? replaceVariables(messageTemplate, recipient.variables)
          : undefined;
        const finalCaption = captionTemplate
          ? replaceVariables(captionTemplate, recipient.variables)
          : undefined;

        const jobData = {
          instanceName,
          phone: recipient.phone,
          message: finalMessage,
          type,
          mediaUrl,
          caption: finalCaption,
          // Passar outros dados necessários
        };

        try {
          const job = await addMessageDispatchJob(jobData);
          jobIds.push(job.id);
        } catch (error) {
          failedCount++;
          fastify.log.error(
            `Falha ao enfileirar job para ${recipient.phone}:`,
            error
          );
        }
      }

      const successCount = jobIds.length;
      fastify.log.info(
        `Envio em lote concluído: ${successCount} jobs adicionados, ${failedCount} falhas ao enfileirar.`
      );

      reply.send({
        success: true,
        message: `${successCount} jobs adicionados à fila.${failedCount > 0 ? ` ${failedCount} falharam ao serem adicionados.` : ""}`,
        jobIds,
      });
    }
  );
}

export default dispatchRoutes;

