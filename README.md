# Backend de Disparos WhatsApp com Fastify e BullMQ

Este projeto implementa um backend robusto para gerenciamento e disparo de mensagens WhatsApp em massa, utilizando Fastify como framework web, BullMQ para gerenciamento de filas assíncronas e Redis como backend da fila. A integração com o WhatsApp é feita através da Evolution API.

## Funcionalidades Principais

- **API RESTful:** Endpoints para gerenciar instâncias da Evolution API, enviar mensagens individuais e em lote, e monitorar o status da fila e dos jobs.
- **Processamento Assíncrono:** Utiliza BullMQ e workers dedicados para processar o envio de mensagens em segundo plano, evitando bloqueios na API e permitindo lidar com grandes volumes.
- **Gerenciamento de Filas:** Sistema de filas persistente (Redis) com suporte a retentativas automáticas, backoff exponencial e rate limiting configurável.
- **Escalabilidade:** Arquitetura projetada para escalar horizontalmente os workers de processamento.
- **Configurabilidade:** Gerenciamento de configurações via variáveis de ambiente (`.env`).
- **Logging Estruturado:** Logs detalhados usando Pino para fácil monitoramento e depuração.
- **Integração com Evolution API:** Camada de serviço dedicada para interagir com a Evolution API para envio de mensagens e gerenciamento de instâncias.

## Pré-requisitos

Antes de começar, garanta que você tenha instalado:

- [Node.js](https://nodejs.org/) (versão 18 ou superior recomendada)
- [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)
- Um servidor [Redis](https://redis.io/) acessível (localmente ou na nuvem como Redis Cloud).
- Acesso a uma instância da [Evolution API](https://doc.evolution-api.com/) com URL e API Key.

## Instalação

1.  **Clone o repositório** (ou descompacte o arquivo .zip fornecido):
    ```bash
    # git clone <url_do_repositorio>
    # cd whatsapp-dispatcher-backend
    ```
2.  **Instale as dependências:**
    ```bash
    npm install
    # ou
    yarn install
    ```

## Configuração

1.  **Crie o arquivo `.env`:** Copie o arquivo `.env.example` para um novo arquivo chamado `.env` na raiz do projeto.
    ```bash
    cp .env.example .env
    ```
2.  **Edite o arquivo `.env`:** Preencha as variáveis de ambiente com suas configurações:

    - `PORT`: Porta para o servidor API (padrão: 3001).
    - `HOST`: Host para o servidor API (padrão: 0.0.0.0).
    - `NODE_ENV`: Ambiente (`development` ou `production`).
    - `LOG_LEVEL`: Nível de log (`info`, `debug`, `warn`, `error`).
    - `EVOLUTION_API_URL`: URL base da sua instância Evolution API.
    - `EVOLUTION_API_KEY`: Sua chave de API da Evolution API.
    - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Detalhes da sua conexão Redis.
    - `QUEUE_NAME`: Nome da fila BullMQ (padrão: `message-dispatch-queue`).
    - `JOB_ATTEMPTS`: Número de tentativas para jobs falhados (padrão: 3).
    - `JOB_BACKOFF_DELAY`: Delay inicial para retentativas (padrão: 5000ms).
    - `JOB_REMOVE_ON_COMPLETE`: **Importante para histórico!**
      - `false`: Mantém todos os jobs concluídos.
      - `<numero>` (ex: `1000`): Mantém os últimos N jobs concluídos.
      - `true`: Remove jobs concluídos imediatamente (não recomendado se precisar de histórico).
    - `JOB_REMOVE_ON_FAIL`: Tempo (ms) ou número de jobs falhados a manter (padrão: 1000).
    - `WORKER_CONCURRENCY`: Quantos jobs um worker processa em paralelo (padrão: 5).
    - `WORKER_API_CALL_DELAY`: Delay (ms) entre chamadas à API Evolution dentro de um job (padrão: 1000ms).

3.  **(Importante) Configuração do Redis Cloud:** Se estiver usando Redis Cloud, acesse o painel de controle da sua instância e **altere a política de evicção (eviction policy) para `noeviction`**. Isso é crucial para garantir que o Redis não remova dados da fila BullMQ.

## Executando a Aplicação

Você precisa executar dois processos separadamente:

1.  **Servidor API (Fastify):**

    - Para desenvolvimento (com hot-reload e logs formatados):
      ```bash
      npm run dev
      ```
    - Para produção:
      `bash
    npm start
    `
      O servidor API estará acessível em `http://<HOST>:<PORT>` (ex: `http://localhost:3001`).

2.  **Worker da Fila (BullMQ):**
    - Execute em um terminal separado:
      `bash
    npm run worker
    `
      Este processo ficará escutando a fila Redis e processando os jobs de envio de mensagem.

## Estrutura do Projeto

```
/whatsapp-dispatcher-backend
|-- src/
|   |-- routes/         # Definição das rotas da API (Fastify)
|   |-- services/       # Lógica de negócios (Fila, Evolution API, Instâncias)
|   |-- workers/        # Processadores de jobs da fila (BullMQ)
|   |-- lib/            # Bibliotecas compartilhadas (Redis, Logger)
|   |-- config/         # Carregamento de configurações (.env)
|   |-- plugins/        # Plugins Fastify (opcional)
|-- .env.example      # Exemplo de variáveis de ambiente
|-- .env              # Variáveis de ambiente (não versionado)
|-- .gitignore
|-- app.js            # Configuração da aplicação Fastify
|-- server.js         # Ponto de entrada para iniciar o servidor API
|-- worker.js         # Ponto de entrada para iniciar o(s) worker(s)
|-- package.json
```

## Endpoints da API

Todos os endpoints estão prefixados com `/api/v1`.

**(Consulte o arquivo `testing_guide.md` para exemplos detalhados de `curl` para cada endpoint)**

- **Health Check:**
  - `GET /health`: Verifica se a API está online.
- **Instâncias (`/instances`):**
  - `GET /`: Lista todas as instâncias.
  - `POST /`: Cria uma nova instância.
  - `GET /:instanceName/connect`: Inicia a conexão (retorna QR code se necessário).
  - `GET /:instanceName/status`: Verifica o status da conexão.
  - `DELETE /:instanceName/logout`: Desconecta a instância.
  - `DELETE /:instanceName`: Deleta a instância.
- **Disparos (`/dispatch`):**
  - `POST /single`: Envia uma mensagem única (adiciona job à fila).
  - `POST /bulk`: Envia mensagens em lote (adiciona múltiplos jobs à fila).
- **Fila (`/queue`):**
  - `GET /status`: Obtém o status geral da fila (contagem de jobs por estado).
  - `GET /jobs/:jobId/status`: Obtém o status detalhado de um job específico.

## Sistema de Filas (BullMQ)

- **Fila Principal:** `message-dispatch-queue` (ou o nome definido em `QUEUE_NAME`).
- **Processamento:** O `worker.js` consome jobs desta fila.
- **Persistência:** Os jobs são armazenados no Redis.
- **Retentativas:** Jobs falhados são tentados novamente conforme `JOB_ATTEMPTS` e `JOB_BACKOFF_DELAY`.
- **Histórico:** O histórico de jobs concluídos é mantido conforme `JOB_REMOVE_ON_COMPLETE`.

## Logging

- Logs são gerados usando Pino e exibidos no console.
- Em desenvolvimento (`npm run dev`), os logs são formatados por `pino-pretty`.
- O nível de log pode ser ajustado via `LOG_LEVEL` no `.env` (`debug` mostra mais detalhes).
- Logs importantes incluem:
  - Requisições recebidas pela API.
  - Jobs adicionados à fila.
  - Início e fim do processamento de jobs pelo worker.
  - Payloads enviados para a Evolution API (nível `WARN` ou `DEBUG`).
  - Respostas e erros da Evolution API (nível `ERROR`).

## Troubleshooting

- **Erro `Bad Request` (400) da Evolution API:**
  - Verifique os logs do worker (nível `WARN` ou `DEBUG`) para ver o payload exato enviado (`[EVOLUTION_API_REQUEST]`).
  - Verifique os logs de erro (`[EVOLUTION_API_ERROR]`) para a resposta detalhada da API.
  - Confirme se o número de telefone está no formato correto (ex: `5511999999999`).
  - Confirme se a estrutura do payload (`textMessage`, `mediaMessage`, etc.) está correta conforme a documentação da Evolution API.
  - Verifique se a instância (`instanceName`) está conectada.
- **Jobs não são processados:**
  - Certifique-se de que o `worker.js` está rodando.
  - Verifique a conexão com o Redis (logs do worker e da API).
  - Confirme se o nome da fila no worker e na API (`QUEUE_NAME`) são os mesmos.
- **Histórico de jobs incompleto:**
  - Verifique a configuração `JOB_REMOVE_ON_COMPLETE` no `.env`. Defina como `false` ou um número para manter o histórico.
- **Aviso `Eviction policy is volatile-lru`:**
  - **Ação Crítica:** Altere a política de evicção no seu Redis para `noeviction` para evitar perda de jobs.

## Possíveis Melhorias Futuras

- Implementar autenticação na API.
- Adicionar endpoints para gerenciar contatos.
- Implementar webhooks para receber status de entrega e mensagens recebidas da Evolution API.
- Adicionar testes automatizados.
- Implementar UI de monitoramento (ex: `bullmq-board`).
- Melhorar a lógica de substituição de variáveis para mensagens em lote.
- Adicionar suporte a mais tipos de mensagens.
