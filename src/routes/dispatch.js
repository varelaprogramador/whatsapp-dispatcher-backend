// src/routes/dispatch.js
import { addMessageDispatchJob } from "../services/queue.js";
import { Type } from "@sinclair/typebox";
import { replaceVariables } from '../workers/messageProcessor.js';
import config from '../config/index.js'; // Importar o objeto de configuração

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
      type: Type.Enum({ text: "text", media: "media", audio: "audio" }), // Expandido para incluir audio, pode expandir mais se necessário
      mediaUrl: Type.Optional(Type.String({ format: "uri" })),
      audioUrl: Type.Optional(Type.String({ format: "uri" })), // Adicionado para audio em lote
      caption: Type.Optional(Type.String()),
      delayInMs: Type.Optional(Type.Integer({ minimum: 0, description: "Atraso em milissegundos entre o envio de cada mensagem dentro do lote." })), // Adicionado campo para delay
      // Adicionar outros campos se o envio em lote suportar mais tipos complexos (buttons, list, etc.)
      // Nota: A API Evolution pode ter limitações no que suporta em lote.
    },
    { additionalProperties: false }
  ),
};

// Schema para validação de um bloco de mensagem individual dentro de multiple-blocks
const MessageBlockSchema = Type.Object({
  order: Type.Integer({ minimum: 1, description: "Ordem de envio do bloco" }),
  type: Type.Enum(
    {
      text: "text",
      media: "media",
      buttons: "buttons",
      list: "list",
      audio: "audio",
      // Adicionar outros tipos conforme suportado pelo worker
    },
    { description: "Tipo de mensagem do bloco" }
  ),
  // Campos específicos por tipo (combinando com SingleDispatchRequestSchema)
  message: Type.Optional(Type.String()), // Para texto
  mediaUrl: Type.Optional(Type.String({ format: "uri" })), // Para mídia
  audioUrl: Type.Optional(Type.String({ format: "uri" })), // Para áudio
  caption: Type.Optional(Type.String()), // Para mídia/áudio
  buttons: Type.Optional(
    Type.Array(Type.Object({ displayText: Type.String() })) // Para botões
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
  ), // Para listas
  buttonText: Type.Optional(Type.String()), // Para listas
  footerText: Type.Optional(Type.String()), // Para botões e listas
  // TODO: Adicionar outros campos conforme necessário para outros tipos suportados nos blocos
});

// Schema para validação do corpo da requisição de envio de múltiplos blocos
const MultipleBlocksRequestSchema = {
  body: Type.Object(
    {
      instanceName: Type.String(),
      phone: Type.String({ description: "Número do destinatário (formato internacional com código do país, ex: 5511999999999)" }),
      messageBlocks: Type.Array(MessageBlockSchema, { minItems: 1, description: "Array de blocos de mensagem a serem enviados em sequência." }),
      delayBeforeStartMs: Type.Optional(Type.Integer({ minimum: 0, description: "Atraso em milissegundos antes de enviar o primeiro bloco." })), // Corresponde ao delayInMs do payload fornecido
      delayBetweenBlocksMs: Type.Optional(Type.Integer({ minimum: 0, description: "Atraso em milissegundos entre o envio de cada bloco." })),
      serverControlled: Type.Optional(Type.Boolean({ description: "Indica se o servidor deve controlar a ordem e delays." })), // Assumimos true se presente e usado
      // TODO: Adicionar campos globais se necessário (ex: variáveis que se aplicam a todos os blocos)
    },
    { additionalProperties: false }
  ),
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

        const job = await addMessageDispatchJob(jobData, 'sendMessage', `${jobData.instanceName}-${jobData.phone}-${Date.now()}`); // Gerar jobId para single
        reply.send({ success: true, message: "Job único adicionado à fila.", jobId: job.id });
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
      try {
        // Extrair dados da requisição
        const {
          instanceName,
          recipients,
          message: messageTemplate,
          type,
          mediaUrl,
          audioUrl,
          caption: captionTemplate,
          delayInMs = 0, // Valor padrão
        } = request.body;

        if (!Array.isArray(recipients) || recipients.length === 0) {
          return reply.status(400).send({
            success: false,
            message: "A lista de destinatários é obrigatória e não pode estar vazia.",
          });
        }

        fastify.log.info(
          `Recebida requisição de envio em lote para ${recipients.length} destinatários. Instância: ${instanceName}.` +
          (delayInMs ? ` Com delay solicitado de ${delayInMs}ms entre mensagens.` : "")
        );

        // Preparar dados do job de lote
        const bulkJobData = {
          instanceName,
          recipients,
          messageTemplate,
          type,
          mediaUrl,
          audioUrl,
          captionTemplate,
          delayInMs,
        };

        // Gerar um jobId único
        const bulkJobId = `bulk-${instanceName}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

        // Adicionar job à fila
        const job = await addMessageDispatchJob(bulkJobData, "sendBulkMessage", bulkJobId);

        fastify.log.info(`Job de lote ${job.id} (nome: sendBulkMessage) adicionado à fila ${config.queue.name} para ${recipients.length} destinatários.`);

        // REMOVER delay de debug em produção
        // const end = Date.now() + 50; while (Date.now() < end);

        // Resposta de sucesso
        return reply.send({
          success: true,
          message: `Job de lote adicionado à fila para ${recipients.length} destinatários.`,
          bulkJobId: job.id,
        });

      } catch (error) {
        // Log detalhado do erro
        fastify.log.error(
          `Erro na rota /bulk: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`,
          {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        );
        
        return reply.status(500).send({
          success: false,
          message: "Falha ao adicionar job de lote à fila.",
        });
      }
    }
  );

  // Rota para Envio de Múltiplos Blocos
  fastify.post(
    "/multiple-blocks",
    { schema: MultipleBlocksRequestSchema },
    async (request, reply) => {
      const jobData = request.body;
      const { instanceName, phone, messageBlocks, delayBeforeStartMs = 0, delayBetweenBlocksMs = 0 } = jobData; // Extrair dados relevantes

      fastify.log.info(`Recebida requisição de envio de múltiplos blocos para ${phone}. Instância: ${instanceName}, Blocos: ${messageBlocks.length}, Delay entre blocos: ${delayBetweenBlocksMs}ms.`);

      try {
        // Adicionar um ÚNICO job para processar os múltiplos blocos
        // Gerar um jobId único para este job (ex: timestamp + random)
        const multipleBlocksJobId = `multi-${instanceName}-${phone}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

        // Chamar addMessageDispatchJob com o jobName correto para múltiplos blocos e jobId
        const job = await addMessageDispatchJob(jobData, 'sendMultipleBlocks', multipleBlocksJobId);

        fastify.log.info(`Job de múltiplos blocos ${job.id} (nome: sendMultipleBlocks) adicionado à fila ${config.queue.name} para ${phone}.`);

        // Retornar o ID do job criado
        reply.send({
          success: true,
          message: `Job de múltiplos blocos adicionado à fila para ${phone}.`,
          jobId: job.id,
        });

      } catch (error) {
        // Logar erro e retornar resposta 500
        fastify.log.error('Erro ao adicionar job de múltiplos blocos à fila:', error);
        reply
          .status(500)
          .send({ success: false, message: "Falha ao adicionar job de múltiplos blocos à fila." });
      }
    }
  );
}

export default dispatchRoutes;

