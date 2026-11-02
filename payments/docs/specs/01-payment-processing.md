# Spec: Processamento de pagamento no payments-service

## Contexto

O `payments-service` (pasta `payments/`, porta HTTP `3004`) já possui:

- Scaffold NestJS com PostgreSQL (`payments_db`, porta host `5435`) e TypeORM
- Integração com RabbitMQ via `EventsModule`: consumer que consome a fila `payment_queue` (exchange `payment`, routing key `payment.order`), com retry e DLQ configurados
- Entidade `Payment`, `FakePaymentGatewayService`, `PaymentsService.processPayment` / `findByOrderId`
- `PaymentConsumerService` que valida `PaymentOrderMessage` e processa o pagamento
- Endpoint `GET /payments/:orderId` e health `GET /health`
- Endpoints de DLQ e de métricas do consumer (`GET /metrics`)
- Interface `PaymentOrderMessage` alinhada ao publisher do `checkout-service`

O `checkout-service` publica mensagens no RabbitMQ ao finalizar um pedido (`POST /cart/checkout`). O fluxo assíncrono completo esperado é:

**checkout cria Order (`pending`) → publica `PaymentOrderMessage` → payments consome → processa e persiste `Payment` → publica `PaymentResultMessage` → checkout consome → atualiza Order (`paid` / `failed`)**.

Esta spec cobre, no **payments-service**:

1. Persistência do pagamento, gateway falso, consumer, consulta HTTP e health (entrega original)
2. **Callback assíncrono de volta**: assim que o pagamento for registrado com status final (`approved` ou `rejected`), publicar o resultado via RabbitMQ para o checkout ouvir em fila dedicada e alterar o status da Order

Gateway real (Stripe etc.), webhook **HTTP** para o checkout e alteração dos endpoints existentes de DLQ/métricas ficam fora de escopo. A notificação ao checkout nesta entrega é **somente via RabbitMQ**.

## Tipagem obrigatória

Todas as funções, variáveis e parâmetros introduzidos ou alterados nesta entrega devem ser **explicitamente tipados**.

Isso inclui, no mínimo:

- Parâmetros e retornos de métodos de controllers e services
- Variáveis locais relevantes ao fluxo de negócio
- Contratos de retorno do gateway falso e da consulta de pagamento
- Payload `PaymentOrderMessage` consumido e campos derivados para a entidade `Payment`
- Contrato `PaymentResultMessage` publicado após o Payment final
- Identificadores de rota (`orderId`) e enums de status

Tipos implícitos ou `any` sem justificativa documentada **não** são aceitos nesta entrega.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência da nova entidade `Payment` |
| PostgreSQL | Já presente (`payments_db`, host `5435`) |
| RabbitMQ | Ida: `payment` / `payment.order` / `payment_queue`. Volta: exchange/routing `payment.result` (fila consumida pelo checkout) |
| Validação | `class-validator` + `class-transformer` (ValidationPipe global já habilitado, quando aplicável a DTOs HTTP) |

## Requisitos funcionais

### RF-01 — Entidade Payment

Deve existir a entidade de domínio `Payment`, persistida no PostgreSQL via TypeORM, com os campos abaixo.

| Campo | Tipo lógico | Obrigatório | Observação |
|---|---|---|---|
| `id` | UUID | Sim (gerado) | Identificador do pagamento |
| `orderId` | UUID | Sim | Identificador do pedido originado no checkout |
| `userId` | UUID | Sim | Identificador do usuário dono do pedido |
| `amount` | decimal(10,2) | Sim | Valor do pagamento |
| `status` | enum | Sim | Valores: `pending`, `approved`, `rejected`; default `pending` |
| `paymentMethod` | varchar(50) | Sim | Método informado na mensagem |
| `transactionId` | varchar(255) | Não | Preenchido pelo gateway após a tentativa de processamento |
| `rejectionReason` | varchar(255) | Não | Motivo textual quando `status = rejected` |
| `processedAt` | timestamp | Não | Momento em que o processamento pelo gateway concluiu |
| `createdAt` | timestamp | Sim (automático) | Criação do registro |
| `updatedAt` | timestamp | Sim (automático) | Última atualização do registro |

Regras:

1. O status inicial ao criar o registro, antes da chamada ao gateway, é `pending`
2. Após o gateway responder, o status passa a `approved` ou `rejected`
3. Em aprovação: `transactionId` preenchido; `rejectionReason` permanece nulo
4. Em rejeição: `rejectionReason` preenchido com o motivo retornado pelo gateway; `transactionId` pode ser preenchido se o gateway o devolver
5. `processedAt` é definido quando o processamento pelo gateway termina (aprovado ou rejeitado)

### RF-02 — FakePaymentGatewayService

Deve existir um serviço de gateway de pagamento **falso** (simulado), exclusivo deste serviço, sem integração com provedores reais.

Responsabilidades mínimas:

1. Receber os dados necessários ao processamento (no mínimo o `amount` e o contexto que a implementação precisar para gerar `transactionId`)
2. Simular latência de rede/processamento entre **500 ms e 2000 ms** (inclusive nessa faixa)
3. Aplicar regras de simulação **determinísticas** com base no valor:
   - Se `amount > 10000` → rejeitado, motivo `"Limite excedido"`
   - Se o valor termina em `.99` (parte centavos igual a `99`) → rejeitado, motivo `"Cartão recusado pela operadora"`
   - Todos os demais valores → aprovado
4. Retornar um resultado com o contrato lógico:
   - `approved`: boolean
   - `transactionId`: string
   - `rejectionReason`: string opcional (presente quando rejeitado)

Ordem de avaliação das regras de rejeição: primeiro o limite (`amount > 10000`); se não aplicar, avaliar o sufixo `.99`; caso contrário, aprovar.

Este gateway **não** chama APIs externas, **não** usa chaves de provedor e **não** persiste estado próprio além do retorno síncrono da chamada.

### RF-03 — PaymentsService

Deve existir um serviço de negócio responsável pelo ciclo de vida do pagamento.

#### processPayment(message)

A partir de uma `PaymentOrderMessage` já validada:

1. Criar e persistir um `Payment` com status `pending`, preenchendo `orderId`, `userId`, `amount` e `paymentMethod` a partir da mensagem
2. Chamar o `FakePaymentGatewayService` com o valor (e demais dados necessários)
3. Atualizar o `Payment` com o resultado:
   - `status` = `approved` ou `rejected`
   - `transactionId` conforme retorno do gateway
   - `rejectionReason` quando rejeitado
   - `processedAt` com o momento da conclusão
4. Persistir a atualização e retornar o `Payment` final

#### findByOrderId(orderId)

1. Buscar o pagamento cujo `orderId` corresponde ao informado
2. Se existir, retornar o `Payment`
3. Se não existir, a operação deve resultar em **HTTP 404 (Not Found)** no endpoint que a expõe

Quando houver mais de um registro para o mesmo `orderId` (ex.: reprocessamento via DLQ), a consulta deve retornar o registro mais recente (maior `createdAt` / mais atual), de forma determinística e documentada nos critérios de aceite.

### RF-04 — Completar o PaymentConsumerService

O `PaymentConsumerService` existente deve deixar de apenas validar e logar a mensagem.

Após a validação bem-sucedida da `PaymentOrderMessage`:

1. Invocar `PaymentsService.processPayment` com a mensagem validada
2. Após o `Payment` final persistido, publicar a `PaymentResultMessage` (RF-08 / RF-09)
3. Manter o comportamento atual de métricas de sucesso/falha do consumer
4. Em caso de falha no processamento ou na publicação do resultado (erro lançado), propagar o erro para que o mecanismo existente de NACK / retry / DLQ continue funcionando
5. Mensagens inválidas continuam sendo rejeitadas como hoje (validação prévia)

Não alterar a configuração de filas de **ida** (`payment_queue`), retry/DLQ de ida, nem os endpoints de DLQ e métricas nesta entrega.

### RF-05 — PaymentsController — consulta por orderId

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/payments/:orderId`
- **Comportamento:** consultar o status do pagamento associado ao `orderId` informado

Regras:

1. `orderId` deve ser um UUID válido; valor malformado resulta em **400** quando a validação de rota/DTO aplicar
2. Se existir pagamento para o `orderId`, responder **HTTP 200** com o `Payment` (campos mínimos da estrutura de resposta)
3. Se não existir, responder **HTTP 404**
4. Esta rota **não** exige autenticação JWT nesta entrega (alinhada aos endpoints operacionais já existentes de métricas/DLQ no serviço)

### RF-06 — Health check

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/health`
- **Comportamento:** indicar que o serviço HTTP está no ar

Resposta mínima esperada em sucesso: **HTTP 200** com um corpo que permita identificar o serviço e o estado saudável (ex.: identificação do serviço e status `ok` / equivalente). A rota é pública nesta entrega.

### RF-07 — Módulo de pagamentos

Deve existir (ou ser evoluído) um módulo Nest responsável por registrar entidade, gateway falso, service, controller e a integração necessária para o consumer conseguir chamar `processPayment`.

Responsabilidades mínimas:

1. Registrar a entidade `Payment` no TypeORM (`forFeature`)
2. Disponibilizar `FakePaymentGatewayService` e `PaymentsService`
3. Expor `PaymentsController` (`GET /payments/:orderId`)
4. Permitir que o `PaymentConsumerService` (no `EventsModule` ou via import/export adequado) utilize `PaymentsService`

A organização exata de pastas pode variar, desde que as responsabilidades acima estejam cobertas e os endpoints existentes de DLQ/métricas permaneçam inalterados em caminho e comportamento.

### RF-08 — Contrato PaymentResultMessage

Deve existir o contrato lógico `PaymentResultMessage`, publicado pelo payments-service após o Payment final, para o checkout-service consumir.

| Campo | Descrição |
|---|---|
| `orderId` | UUID da Order no checkout (mesmo da `PaymentOrderMessage` original) |
| `paymentId` | Identificador do `Payment` persistido |
| `userId` | Usuário dono do pedido |
| `status` | Resultado final: `approved` ou `rejected` (nunca `pending`) |
| `amount` | Valor processado |
| `transactionId` | Identificador da transação simulada (quando houver); nulo se ausente |
| `rejectionReason` | Motivo quando `status = rejected`; nulo quando aprovado |
| `processedAt` | Momento da conclusão (string ISO-8601 no fio da mensagem) |

Regras:

1. A mensagem só é publicada **depois** de o `Payment` estar persistido com status final
2. `orderId` é a chave de correlação com a Order no checkout
3. O shape deve permanecer coerente com o consumidor no checkout-service

### RF-09 — Publicar resultado no RabbitMQ após Payment final

Assim que o pagamento for registrado com status `approved` ou `rejected`:

1. O payments-service deve publicar a `PaymentResultMessage` em canal RabbitMQ **dedicado ao resultado**, distinto da fila de ida
2. Nomes canônicos:
   - Exchange: `payment.result`
   - Routing key: `payment.result`
   - Fila consumida pelo checkout: `order_payment_result_queue` (responsabilidade do checkout assinar essa fila)
3. Publicar **somente** status final (`approved` / `rejected`)
4. Falha ao publicar: logar de forma visível e **propagar** o erro (NACK/retry da mensagem de ida); o `Payment` já persistido **não** deve ser apagado
5. Preferir disparar a publicação a partir do fluxo do consumer **após** `processPayment` retornar (evitar ciclo de dependência entre módulo de pagamentos e eventos)

Mapeamento esperado no checkout (fora do código desta pasta, mas contrato de integração):

- Payment `approved` → Order `paid`
- Payment `rejected` → Order `failed`

## Regras de negócio

1. Todo pagamento nasce como `pending` e só muda para `approved` ou `rejected` após a resposta do gateway falso
2. `amount > 10000` → sempre `rejected` com motivo `"Limite excedido"`
3. Valor com centavos `.99` (e que **não** caiu na regra do limite) → sempre `rejected` com motivo `"Cartão recusado pela operadora"`
4. Demais valores → sempre `approved`
5. A latência simulada do gateway está entre 500 ms e 2000 ms por chamada
6. O consumer só processa mensagens que passam na validação já existente (`orderId`, `userId`, `amount` > 0, `paymentMethod`, `items` não vazio)
7. Falhas no `processPayment` ou na publicação do `PaymentResultMessage` continuam acionando retry/DLQ via propagação de erro no consumer
8. Consulta por `orderId` inexistente → 404
9. Endpoints de DLQ e métricas **não** mudam de contrato nesta entrega
10. Todo Payment final (`approved` / `rejected`) deve gerar publicação de `PaymentResultMessage` no canal `payment.result`
11. A fila de ida (`payment_queue`) **não** é reutilizada como fila de resultado

## Estrutura de dados

### Contrato de entrada do consumer (`PaymentOrderMessage` — já existente)

| Campo | Obrigatório | Descrição |
|---|---|---|
| `orderId` | Sim | UUID do pedido |
| `userId` | Sim | UUID do usuário |
| `amount` | Sim | Valor numérico do pagamento |
| `items` | Sim | Array com ao menos um item `{ productId, quantity, price }` |
| `paymentMethod` | Sim | Método de pagamento |
| `description` | Não | Opcional |
| `createdAt` | Não | Opcional |
| `metadata` | Não | Opcional |

Esta spec **não** exige alterar o contrato da mensagem de **ida**.

### Contrato de saída — PaymentResultMessage

| Campo | Obrigatório | Descrição |
|---|---|---|
| `orderId` | Sim | UUID do pedido |
| `paymentId` | Sim | UUID do pagamento persistido |
| `userId` | Sim | UUID do usuário |
| `status` | Sim | `approved` ou `rejected` |
| `amount` | Sim | Valor numérico processado |
| `transactionId` | Não | String ou nulo |
| `rejectionReason` | Não | String ou nulo (obrigatório semanticamente quando rejeitado) |
| `processedAt` | Sim | ISO-8601 do momento da conclusão |

### Resultado do FakePaymentGatewayService

| Campo | Obrigatório | Descrição |
|---|---|---|
| `approved` | Sim | `true` se aprovado; `false` se rejeitado |
| `transactionId` | Sim | Identificador simulado da transação |
| `rejectionReason` | Não | Presente quando `approved = false` |

### Parâmetro de rota — consulta

| Campo | Obrigatório | Regras |
|---|---|---|
| `orderId` | Sim | UUID do pedido cujo pagamento será consultado |

### Resposta de sucesso — Payment

A resposta de `GET /payments/:orderId` (e o objeto persistido ao final de `processPayment`) deve incluir, no mínimo:

| Campo | Presente | Observação |
|---|---|---|
| `id` | Sim | UUID do pagamento |
| `orderId` | Sim | UUID do pedido |
| `userId` | Sim | UUID do usuário |
| `amount` | Sim | Decimal do valor |
| `status` | Sim | `pending`, `approved` ou `rejected` |
| `paymentMethod` | Sim | Método informado |
| `transactionId` | Condicional | Preenchido após processamento pelo gateway |
| `rejectionReason` | Condicional | Preenchido quando rejeitado |
| `processedAt` | Condicional | Preenchido após processamento |
| `createdAt` | Sim | Timestamp de criação |
| `updatedAt` | Sim | Timestamp de atualização |

### Resposta de sucesso — health

`GET /health` retorna **200** com indicação clara de serviço saudável (incluindo identificação do payments-service).

## Fluxo esperado

### Mensagem consumida — aprovação

1. Checkout publica `PaymentOrderMessage` na fila de ida
2. `PaymentConsumerService` valida a mensagem
3. `PaymentsService.processPayment` cria `Payment` com `status = pending`
4. `FakePaymentGatewayService` simula latência e aprova (valor ≤ 10000 e sem sufixo `.99`)
5. `Payment` é atualizado para `approved`, com `transactionId` e `processedAt`
6. Payments publica `PaymentResultMessage` (`status = approved`) em `payment.result`
7. Checkout consome a fila de resultado e atualiza a Order para `paid`
8. Consumer registra sucesso nas métricas
9. `GET /payments/:orderId` retorna **200** com `status = approved`

### Mensagem consumida — rejeição por limite

1. Mensagem com `amount > 10000`
2. Fluxo igual até a chamada ao gateway
3. Gateway rejeita com `"Limite excedido"`
4. `Payment` fica `rejected`, com `rejectionReason` e `processedAt`
5. Payments publica `PaymentResultMessage` (`status = rejected`)
6. Checkout atualiza a Order para `failed`
7. `GET /payments/:orderId` retorna **200** com `status = rejected` e o motivo

### Mensagem consumida — rejeição por sufixo .99

1. Mensagem com valor terminando em `.99` e `amount ≤ 10000`
2. Gateway rejeita com `"Cartão recusado pela operadora"`
3. `Payment` fica `rejected` com o motivo correspondente
4. Payments publica `PaymentResultMessage` (`status = rejected`)
5. Checkout atualiza a Order para `failed`

### Mensagem inválida

1. Mensagem sem campos obrigatórios ou com `amount` inválido
2. Validação do consumer falha
3. Erro é propagado (NACK / retry / DLQ conforme infra já existente)
4. Nenhum `Payment` válido de negócio é concluído a partir dessa mensagem inválida

### Consulta — pagamento inexistente

1. `GET /payments/:orderId` com UUID sem pagamento correspondente
2. API responde **404**

### Health

1. `GET /health`
2. API responde **200** indicando serviço saudável

## Respostas esperadas

### 200 OK

- `GET /payments/:orderId` com pagamento encontrado
- `GET /health` com serviço no ar

### 400 Bad Request

Deve ocorrer quando:

- `orderId` de rota malformado (não UUID), quando a validação de param aplicar 400

### 404 Not Found

Deve ocorrer quando:

- `GET /payments/:orderId` sem pagamento correspondente ao `orderId` informado

## Variáveis de ambiente

Nenhuma variável de ambiente **nova** é exigida nesta entrega. Permanecem as já usadas pelo serviço:

| Variável | Descrição | Exemplo local |
|---|---|---|
| `PORT` | Porta HTTP do serviço | `3004` |
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5435` |
| `DB_USERNAME` | Usuário do banco | `postgres` |
| `DB_PASSWORD` | Senha do banco | `postgres` |
| `DB_DATABASE` | Nome do database | `payments_db` |
| Variáveis RabbitMQ já usadas pelo `EventsModule` | Conexão com o broker | Conforme `.env.example` existente |

## Estrutura esperada (alto nível)

```text
payments/
├── docs/
│   └── specs/
│       └── 01-payment-processing.md
├── src/
│   ├── payments/                         # (ou nome equivalente)
│   │   ├── entities/
│   │   │   └── payment.entity.ts
│   │   ├── enums/                        # status pending/approved/rejected
│   │   ├── fake-payment-gateway.service.ts
│   │   ├── payments.service.ts
│   │   ├── payments.controller.ts        # GET /payments/:orderId
│   │   └── payments.module.ts
│   ├── events/
│   │   ├── payment-consumer/             # processPayment + publish resultado
│   │   ├── payment-result-queue/         # publica PaymentResultMessage
│   │   ├── payment-result.interface.ts
│   │   ├── dlq/                          # inalterado em contrato
│   │   └── metrics/                      # inalterado em contrato
│   ├── app.controller.ts / health        # GET /health
│   └── ...
└── ...
```

A organização interna de pastas/arquivos pode variar desde que as responsabilidades e os caminhos HTTP acima estejam cobertos. Nomes exatos de arquivos são orientação, não obrigação rígida.

## Fora de escopo

Esta spec **não** inclui:

- Gateway de pagamento real (Stripe, PagSeguro, PayPal, etc.)
- Webhook **HTTP** (REST) do payments para o checkout — a notificação obrigatória é RabbitMQ (`PaymentResultMessage`)
- Implementação do **consumer** da fila de resultado e da persistência do status da Order (responsabilidade do `checkout-service`; esta spec só exige o **publish** no payments)
- Alteração dos endpoints existentes de DLQ (stats, reprocess, purge e correlatos)
- Alteração dos endpoints existentes de métricas do consumer
- Autenticação JWT / autorização por usuário na consulta de pagamento
- Integração com api-gateway (proxy de `/payments/*`) — coberta em spec/root à parte
- Idempotência estrita por `orderId` (bloquear segunda criação); a consulta apenas resolve o registro mais recente quando houver mais de um
- Estorno, captura parcial, parcelamento ou antifraude avançado
- Dashboard financeiro ou relatórios agregados de pagamentos

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Entidade Payment**  
   Existe entidade/tabela `Payment` (ou mapeamento equivalente) com `id`, `orderId`, `userId`, `amount` (decimal 10,2), `status` (`pending` \| `approved` \| `rejected`, default `pending`), `paymentMethod`, `transactionId` nullable, `rejectionReason` nullable, `processedAt` nullable, `createdAt` e `updatedAt`.

2. **CA-02 — FakePaymentGatewayService**  
   Existe serviço de gateway falso que simula latência entre 500 ms e 2000 ms e retorna `{ approved, transactionId, rejectionReason? }`.

3. **CA-03 — Rejeição por limite**  
   Para `amount > 10000`, o gateway (e o pagamento persistido) resulta em rejeição com motivo `"Limite excedido"`.

4. **CA-04 — Rejeição por .99**  
   Para valor terminando em `.99` com `amount ≤ 10000`, rejeição com motivo `"Cartão recusado pela operadora"`.

5. **CA-05 — Aprovação padrão**  
   Para valores que não se enquadram em CA-03 nem CA-04, o pagamento fica `approved` com `transactionId` preenchido e sem `rejectionReason`.

6. **CA-06 — processPayment**  
   `PaymentsService.processPayment` cria o registro `pending`, chama o gateway, atualiza status/`transactionId`/`rejectionReason`/`processedAt` e persiste o resultado final.

7. **CA-07 — Consumer completo**  
   Após validar a mensagem, `PaymentConsumerService` chama `PaymentsService.processPayment` e, em seguida, publica o resultado (RF-09).

8. **CA-08 — Propagação de erro**  
   Falha em `processPayment` ou na publicação do `PaymentResultMessage` continua propagando erro no consumer de forma que retry/DLQ existentes possam atuar.

9. **CA-09 — GET /payments/:orderId sucesso**  
   Com pagamento existente, `GET /payments/:orderId` responde **200** com os campos mínimos do `Payment`.

10. **CA-10 — GET /payments/:orderId 404**  
    Sem pagamento para o `orderId`, responde **404**.

11. **CA-11 — Consulta do mais recente**  
    Se houver mais de um `Payment` para o mesmo `orderId`, a consulta retorna o mais recente.

12. **CA-12 — GET /health**  
    `GET /health` responde **200** indicando que o payments-service está saudável.

13. **CA-13 — DLQ e métricas intactos**  
    Caminhos e comportamentos dos endpoints existentes de DLQ e de `GET /metrics` permanecem os mesmos desta entrega (sem regressão de contrato).

14. **CA-14 — Sem gateway real / sem webhook HTTP**  
    Não há integração com provedor real de pagamento nem notificação REST para o checkout; a volta usa RabbitMQ.

15. **CA-15 — Tipagem**  
    Funções, variáveis e parâmetros introduzidos nesta entrega estão tipados; não há uso injustificado de `any`.

16. **CA-16 — Fluxo ponta a ponta (aprovação)**  
    Uma mensagem válida com valor aprovável consumida da fila resulta em `Payment` `approved` consultável via `GET /payments/:orderId`.

17. **CA-17 — Fluxo ponta a ponta (rejeição)**  
    Uma mensagem válida com valor rejeitável (limite ou `.99`) resulta em `Payment` `rejected` com o `rejectionReason` correspondente, consultável via `GET /payments/:orderId`.

18. **CA-18 — Contrato PaymentResultMessage**  
    Existe o contrato tipado com os campos mínimos de RF-08.

19. **CA-19 — Publish após Payment final**  
    Após persistir `approved` ou `rejected`, o payments publica `PaymentResultMessage` em exchange/routing `payment.result`.

20. **CA-20 — Canal de resultado separado**  
    A publicação de resultado **não** reutiliza `payment_queue` / routing `payment.order`.

21. **CA-21 — Falha de publish visível**  
    Falha ao publicar o resultado é logada e propagada (sem apagar o Payment já salvo).

## Ordem sugerida de implementação

### Entrega original (processamento)

1. Criar a entidade `Payment` (enum de status + mapeamento TypeORM)  
2. Implementar `FakePaymentGatewayService` com latência simulada e regras determinísticas  
3. Implementar `PaymentsService` (`processPayment` e `findByOrderId`)  
4. Expor `PaymentsController` com `GET /payments/:orderId`  
5. Registrar o módulo de pagamentos e conectar o `PaymentConsumerService` a `processPayment`  
6. Expor `GET /health`  
7. Garantir tipagem explícita no fluxo  
8. Cobrir os critérios de aceite com testes automatizados  

### Evolução (callback assíncrono — RF-08 / RF-09)

1. Definir o contrato `PaymentResultMessage`  
2. Publicar o resultado após o Payment final (consumer / fila de resultado)  
3. Validar publish em aprovação e rejeição; falha de publish propaga erro  
4. Coordenar com o checkout-service o consumo de `order_payment_result_queue` e o update da Order (`paid` / `failed`) — detalhado na spec raiz `docs/specs/gateway-payments-integration-and-e2e.md`

## Commits

Para a evolução do callback no payments: um commit por item (contrato → publisher / wiring no consumer), com lint antes de cada commit. A implementação correspondente no checkout segue a spec/root e o plano de implementação aprovado.
