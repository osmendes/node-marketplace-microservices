# Spec: Integração do payments-service ao api-gateway, callback assíncrono de pagamento e E2E completo do marketplace

## Contexto

O `payments-service` (pasta `payments/`, porta HTTP **3004**) já está completo com:

- Entidade `Payment` persistida no PostgreSQL (`payments_db`, host `5435`)
- `FakePaymentGatewayService` com regras determinísticas de aprovação/rejeição
- Consumer funcional que processa `PaymentOrderMessage` da fila RabbitMQ após o checkout (exchange `payment`, routing key `payment.order`)
- Endpoint de consulta `GET /payments/:orderId`
- Health check público `GET /health` (`{ "status": "ok", "service": "payments-service" }`)

O `api-gateway` (porta HTTP **3005**) já possui:

- `ProxyModule` com `ProxyService` (circuit breaker, retry, timeout e fallback)
- Tratamento de erros **4xx**: status e body do backend são **repassados** ao consumidor
- `AuthModule` com `JwtAuthGuard` e decorator `@Public()`
- Controllers de proxy para `users-service`, `products-service`, `checkout-service` e **payments-service**
- `PaymentsModule` + `PaymentsProxyController` com `GET /payments/:orderId` protegido por JWT
- Configuração de payments em `gateway.config.ts`: `{ url: 'http://localhost:3004', timeout: 10000 }` (via `PAYMENTS_SERVICE_URL`)
- Health checks que consultam `GET /health` nos serviços configurados (incluindo payments)
- Swagger

O `checkout-service` (porta HTTP **3003**) já possui:

- Carrinho, checkout e pedidos via gateway
- Publicação de `PaymentOrderMessage` no RabbitMQ após `POST /cart/checkout`
- Entidade `Order` com status `pending` | `paid` | `failed` (hoje a Order permanece `pending` após o pagamento)
- `AppController` limitado a `GET /` e `GET /health` (sem endpoint de teste de mensageria)

### Lacuna desta entrega

O fluxo **checkout → RabbitMQ → payments** já processa e persiste o `Payment`, e o cliente já consulta o resultado via gateway (`GET /payments/:orderId`). **Falta o caminho de volta**: o payments-service ainda **não notifica** o checkout-service do resultado, e a Order **não** muda para `paid` / `failed`.

Esta entrega (evolução desta spec) define:

1. Publicação assíncrona do **resultado do pagamento** pelo payments-service no RabbitMQ, assim que o `Payment` for registrado com status final (`approved` ou `rejected`)
2. Nova fila / consumo no checkout-service que recebe esse resultado e **atualiza o status da Order** no banco
3. Extensão do E2E via gateway para validar Order `paid` (aprovado) e Order `failed` (rejeitado), além da consulta ao Payment

O proxy de payments no gateway e a limpeza do `AppController` do checkout **já estão entregues** e devem permanecer; esta etapa **não** redesenha o `ProxyService`.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no gateway, checkout e payments |
| api-gateway | Porta HTTP 3005 (proxy de payments já existente) |
| users-service | Porta HTTP 3000 (registro/login JWT) |
| products-service | Porta HTTP 3001 (catálogo e criação de produtos) |
| checkout-service | Porta HTTP 3003 (carrinho, checkout, pedidos + **novo consumer** de resultado) |
| payments-service | Porta HTTP 3004 (processamento + **nova publicação** de resultado) |
| RabbitMQ | Porta 5672 (ida: checkout → payments; **volta: payments → checkout**) |
| Autenticação | JWT Bearer (mesmo contrato já usado no marketplace) |
| Proxy | `ProxyService.proxyRequest('payments', ...)` já existente (sem alteração de mecanismo) |
| Status Order | `pending` → `paid` (pagamento aprovado) ou `failed` (pagamento rejeitado) |
| Status Payment | `pending` → `approved` ou `rejected` (já existentes) |

## Requisitos já entregues (manter)

Os itens abaixo **já existem** em main e **não** devem ser removidos nesta evolução:

### RF-01 — PaymentsModule com PaymentsProxyController (já entregue)

`PaymentsModule` + `PaymentsProxyController` no api-gateway, registrados no `AppModule`.

### RF-02 — GET /payments/:orderId via proxy JWT (já entregue)

`GET /payments/:orderId` no gateway → payments-service, com `JwtAuthGuard` e repasse de `Authorization`.

### RF-03 — Registro no AppModule (já entregue)

### RF-04 — PAYMENTS_SERVICE_URL (já entregue)

`http://localhost:3004` em config / `.env` / `.env.example`.

### RF-05 — Checkout sem endpoint de teste (já entregue)

`AppController` do checkout apenas com `GET /` e `GET /health`.

## Requisitos funcionais — callback assíncrono (nova entrega)

### RF-06 — Contrato da mensagem de resultado de pagamento

Deve existir um contrato lógico de mensagem (nome sugerido: `PaymentResultMessage`) publicado pelo payments-service e consumido pelo checkout-service, contendo no mínimo:

| Campo | Descrição |
|---|---|
| `orderId` | UUID da Order no checkout (mesmo da `PaymentOrderMessage` original) |
| `paymentId` | Identificador do `Payment` persistido |
| `status` | Resultado final do pagamento: `approved` ou `rejected` |
| `transactionId` | Identificador da transação simulada (quando houver) |
| `rejectionReason` | Motivo da rejeição (obrigatório quando `status = rejected`; ausente ou nulo quando aprovado) |
| `processedAt` | Momento em que o pagamento foi concluído no payments-service |
| `amount` | Valor processado (alinhado ao pagamento) |
| `userId` | Usuário dono do pedido (mesmo da mensagem original) |

Regras:

1. A mensagem só é publicada **depois** de o `Payment` estar persistido com status final (`approved` ou `rejected`) — nunca com `pending`
2. `orderId` é a chave de correlação com a Order no checkout
3. O contrato deve ser compartilhado de forma coerente entre publisher (payments) e consumer (checkout) — tipagem / interface alinhada nos dois serviços

### RF-07 — payments-service publica o resultado no RabbitMQ

Após `processPayment` concluir com sucesso (Payment final persistido):

1. O payments-service deve **publicar** a `PaymentResultMessage` em um canal RabbitMQ dedicado ao resultado (exchange + routing key + fila distintos do fluxo de ida `payment` / `payment.order` / `payment_queue`)
2. A publicação ocorre **somente** para status final `approved` ou `rejected`
3. Falha ao publicar o resultado deve ser tratada de forma que o operador possa perceber o problema (log / métrica / propagação conforme o padrão de erros do serviço); o Payment já persistido **não** deve ser apagado por falha de publish
4. O fluxo de ida existente (`PaymentOrderMessage` → consumer → FakePaymentGateway → persistência) permanece; esta entrega **acrescenta** a publicação de volta

Nomes lógicos sugeridos (podem ser ajustados na implementação, desde que documentados e consistentes entre os dois serviços):

| Papel | Nome lógico sugerido |
|---|---|
| Exchange de resultado | `payment.result` (ou equivalente claro) |
| Routing key | `payment.result` (ou equivalente claro) |
| Fila no checkout | `order_payment_result_queue` (ou equivalente claro) |

A fila de ida (`payment_queue`) e seus retry/DLQ **não** devem ser reaproveitados como fila de resultado.

### RF-08 — checkout-service consome o resultado e atualiza a Order

O checkout-service deve:

1. Declarar / assinar a **nova fila** de resultado de pagamento
2. Consumir mensagens `PaymentResultMessage` válidas
3. Localizar a Order pelo `orderId` da mensagem
4. Atualizar o status da Order no banco conforme o mapeamento:
   - Payment `approved` → Order `paid`
   - Payment `rejected` → Order `failed`
5. Persistir a alteração

Regras:

1. Se a Order **não** existir, o consumer deve registrar o problema e **não** corromper outros pedidos (NACK/descarta/DLQ conforme o padrão de resiliência escolhido e documentado nos CAs)
2. Se a Order já estiver no status alvo (`paid` ou `failed` coerente com a mensagem), o processamento deve ser **idempotente** (não falhar; manter o status)
3. Transições inválidas (ex.: mensagem `approved` sobre Order já `failed`, se aplicável à política) devem ser tratadas de forma determinística e documentada — política mínima desta entrega: **aplicar o status derivado da mensagem de resultado mais recente válida** para `orderId`, desde que a Order exista
4. Não alterar o contrato HTTP de `POST /cart/checkout`, `GET /orders` e `GET /orders/:id` além do fato de o `status` da Order passar a refletir o resultado após o consumo
5. Manter a publicação existente de `PaymentOrderMessage` no checkout

### RF-09 — Resiliência mínima da fila de resultado

A fila de resultado no checkout deve ter comportamento mínimo alinhado ao ecossistema RabbitMQ do monorepo:

1. Fila durável / exchange durável (padrão já usado nas filas de pagamento)
2. Em falha de processamento recuperável, permitir retry ou envio a DLQ conforme o padrão já adotado no serviço consumidor (ou equivalente documentado)
3. Mensagens inválidas (campos obrigatórios ausentes, `status` fora de `approved`|`rejected`, `orderId` inválido) não devem atualizar Orders arbitrariamente

### RF-10 — Ordem do fluxo ponta a ponta

O fluxo assíncrono completo deve ser:

1. Cliente finaliza checkout → Order criada como `pending` → checkout publica `PaymentOrderMessage`
2. payments consome → processa FakePaymentGateway → persiste Payment `approved` ou `rejected`
3. payments publica `PaymentResultMessage`
4. checkout consome → atualiza Order para `paid` ou `failed`
5. Cliente pode confirmar via gateway: `GET /payments/:orderId` **e** `GET /orders/:id` (status da Order alinhado ao resultado)

## Tipagem obrigatória

Todas as funções, variáveis e parâmetros introduzidos ou alterados por esta entrega (publisher de resultado, consumer no checkout, handlers de atualização de Order, interfaces da mensagem) devem ter tipagem explícita TypeScript. Evitar `any` no caminho feliz e nos contratos da mensagem.

## Fluxo E2E completo via gateway (porta 3005)

Todos os passos abaixo devem funcionar passando pelo **api-gateway** (`http://localhost:3005`), com:

- users-service em `http://localhost:3000`
- products-service em `http://localhost:3001`
- checkout-service em `http://localhost:3003`
- payments-service em `http://localhost:3004`
- RabbitMQ em `5672`
- gateway em `http://localhost:3005`

Pré-condição: stack local saudável (health dos cinco serviços HTTP + RabbitMQ disponível).

### Fluxo A — Registro de seller e buyer

1. Cliente registra um usuário com role **seller** via `POST /auth/register` no gateway
2. Cliente registra um usuário com role **buyer** via `POST /auth/register` no gateway
3. Ambos os registros retornam sucesso compatível com o contrato já existente do users-service via gateway

### Fluxo B — Seller cria produtos (aprovação e rejeição)

1. Cliente faz login como **seller** via `POST /auth/login` no gateway e obtém JWT
2. Com o token do seller, cria um produto com **preço normal** (valor que o FakePaymentGateway aprova — por exemplo sem terminar em `.99` e ≤ 10000) via `POST /products`
3. Com o token do seller, cria um segundo produto com preço terminando em **`.99`** (regra de rejeição do FakePaymentGateway: `"Cartão recusado pela operadora"`) via `POST /products`
4. Ambos os produtos ficam disponíveis no catálogo

### Fluxo C — Buyer navega, adiciona ao carrinho e consulta

1. Cliente faz login como **buyer** via `POST /auth/login` no gateway e obtém JWT
2. Com o token do buyer, lista o catálogo via `GET /products`
3. Adiciona o produto de **preço normal** ao carrinho via `POST /cart/items`
4. Consulta o carrinho via `GET /cart` e confirma o item

### Fluxo D — Checkout, pagamento aprovado e Order paid

1. Buyer finaliza o checkout via `POST /cart/checkout` com `paymentMethod` válido (ex.: `pix`)
2. Gateway retorna a Order criada com status inicial `pending`
3. Após o processamento assíncrono (payments + callback RabbitMQ + consumer no checkout):
   - `GET /payments/:orderId` via gateway → Payment `approved`
   - `GET /orders/:id` via gateway → Order com status **`paid`**

### Fluxo E — Checkout, pagamento rejeitado e Order failed

1. Buyer adiciona o produto com preço **`.99`** ao carrinho via `POST /cart/items`
2. Consulta o carrinho via `GET /cart`
3. Finaliza o checkout via `POST /cart/checkout` com `paymentMethod` válido
4. Após o processamento assíncrono:
   - `GET /payments/:orderId` via gateway → Payment `rejected` com motivo compatível com `"Cartão recusado pela operadora"`
   - `GET /orders/:id` via gateway → Order com status **`failed`**

### Observações do E2E

1. Toda a navegação autenticada, consultas de pagamento e de pedido passam pela porta **3005**
2. O intervalo entre checkout e as consultas deve considerar: latência do FakePaymentGateway (500 ms–2000 ms) + consumo da fila de ida + publicação do resultado + consumo da fila de volta; usar espera/retry até Payment final **e** Order `paid`/`failed`
3. A validação de sucesso desta entrega exige **ambos**: Payment com status final **e** Order atualizada (`paid` / `failed`)

## Respostas esperadas (via gateway)

### Fluxo E2E principal

| Passo | Endpoint no gateway | Resultado esperado |
|---|---|---|
| Register seller | `POST /auth/register` | Sucesso (ex.: **201**) com usuário seller |
| Register buyer | `POST /auth/register` | Sucesso (ex.: **201**) com usuário buyer |
| Login seller | `POST /auth/login` | Token JWT válido |
| Create product (normal) | `POST /products` com Bearer seller | Produto criado com preço aprovável |
| Create product (.99) | `POST /products` com Bearer seller | Produto criado com preço terminando em `.99` |
| Login buyer | `POST /auth/login` | Token JWT válido |
| List products | `GET /products` | Catálogo contendo os dois produtos |
| Add to cart (normal) | `POST /cart/items` | Carrinho com o item |
| View cart | `GET /cart` | **200** com carrinho ativo |
| Checkout (normal) | `POST /cart/checkout` | **201** com Order `pending` |
| View payment (approved) | `GET /payments/:orderId` | **200** com Payment `approved` |
| View order (paid) | `GET /orders/:id` | **200** com Order **`paid`** |
| Add to cart (.99) | `POST /cart/items` | Carrinho com o item `.99` |
| Checkout (.99) | `POST /cart/checkout` | **201** com Order `pending` |
| View payment (rejected) | `GET /payments/:orderId` | **200** com Payment `rejected` e motivo de cartão recusado |
| View order (failed) | `GET /orders/:id` | **200** com Order **`failed`** |

### Falhas autenticadas / 4xx via gateway

| Cenário | Resultado esperado |
|---|---|
| `GET /payments/:orderId` sem token (ou token inválido) | **401** |
| `GET /payments/:orderId` com `orderId` inexistente (quando o request chega ao payments) | **4xx** preservado do payments-service (ex.: **404**) |
| Demais 4xx do payments nas rotas proxyadas | Status e body preservados; sem retry; circuit breaker não acionado |

## Estrutura de dados — PaymentResultMessage

Campos mínimos do contrato lógico:

```text
PaymentResultMessage
├── orderId: string (UUID)
├── paymentId: string (UUID)
├── userId: string (UUID)
├── status: "approved" | "rejected"
├── amount: number
├── transactionId: string | null
├── rejectionReason: string | null
└── processedAt: string (ISO-8601) | Date
```

## Estrutura esperada (alto nível)

```text
docs/specs/
└── gateway-payments-integration-and-e2e.md   # esta spec (evoluída)

payments/
└── ...  # publicar PaymentResultMessage após Payment final

checkout/
└── ...  # consumir PaymentResultMessage e atualizar Order.status

gateway/
└── ...  # proxy GET /payments/:orderId e GET /orders/:id já existentes (sem mudança obrigatória)
```

Esta spec descreve **o que** entregar, sem prescrever a implementação (classes, decorators ou trechos de código).

## Fora de escopo

Esta evolução da spec **não** inclui:

- Alteração do mecanismo interno de resiliência do `ProxyService` / `RetryService` / `CircuitBreakerService` / fallbacks
- Novos endpoints HTTP de pagamento além dos já existentes
- Integração com gateway de pagamento real (Stripe, PagSeguro, etc.)
- Callback HTTP (webhook REST) do payments para o checkout — o canal obrigatório é **RabbitMQ**
- Atualização síncrona da Order dentro do request de checkout
- Mudança de portas canônicas (users 3000, products 3001, checkout 3003, payments 3004, gateway 3005, RabbitMQ 5672)
- Session management
- CRUD de update/delete de users ou products

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (curl, Postman ou equivalente), preferencialmente passando pelo gateway na porta **3005**.

### Já entregues (regressão — devem continuar válidos)

1. **CA-01 — PaymentsModule registrado**  
   O `PaymentsModule` existe no gateway e está registrado no `AppModule`.

2. **CA-02 — PaymentsProxyController expõe a rota**  
   Via gateway: `GET /payments/:orderId` existe e exige JWT (`401` sem token).

3. **CA-03 — Proxy usa serviceName payments**  
   A rota encaminha para o payments-service via `ProxyService` com `serviceName = 'payments'`.

4. **CA-04 — Authorization repassado**  
   Com Bearer token válido, a consulta de pagamento via gateway funciona quando o pagamento existe; sem token, falha com **401**.

5. **CA-05 — PAYMENTS_SERVICE_URL correta**  
   O ambiente do gateway aponta payments para `http://localhost:3004`.

6. **CA-06 — Checkout sem endpoint de teste**  
   O `AppController` do checkout-service expõe apenas `GET /` e `GET /health`.

7. **CA-07..CA-10 — Auth, produtos, carrinho, checkout via gateway**  
   Registro, login, criação de produtos, carrinho e checkout continuam funcionando via porta 3005.

8. **CA-11 — Pagamento aprovado via gateway**  
   Após processamento, `GET /payments/:orderId` retorna Payment `approved`.

9. **CA-12 — Pagamento rejeitado via gateway (.99)**  
   Após processamento, `GET /payments/:orderId` retorna Payment `rejected` com motivo de cartão recusado.

10. **CA-13 — 4xx preservados na rota de payments**  
    Ao menos um 4xx (401 sem token ou 404 de orderId inexistente) é verificável.

11. **CA-14 — Health do payments visível ao gateway**  
    Health aggregation inclui payments saudável.

### Novos (callback assíncrono)

12. **CA-15 — Payments publica resultado após Payment final**  
    Após processar um pagamento com sucesso, o payments-service publica uma `PaymentResultMessage` no RabbitMQ (canal de resultado distinto da fila de ida).

13. **CA-16 — Checkout consome e atualiza Order para paid**  
    Para pagamento `approved`, após o consumo, `GET /orders/:id` via gateway retorna Order com `status = paid`.

14. **CA-17 — Checkout consome e atualiza Order para failed**  
    Para pagamento `rejected` (produto `.99`), após o consumo, `GET /orders/:id` via gateway retorna Order com `status = failed`.

15. **CA-18 — Mapeamento de status**  
    `approved` → `paid` e `rejected` → `failed` de forma consistente e testável.

16. **CA-19 — Idempotência básica**  
    Reprocessar / reentregar a mesma mensagem de resultado (ou equivalente de teste) não corrompe a Order nem lança erro fatal quando o status alvo já está aplicado.

17. **CA-20 — Fila de ida preservada**  
    O fluxo checkout → `payment_queue` → payments continua funcionando; a fila de resultado é adicional e separada.

18. **CA-21 — Sem callback HTTP**  
    A notificação payments → checkout usa RabbitMQ; não há dependência de webhook REST entre os serviços para esta atualização de status.

19. **CA-22 — E2E completo com Order atualizada**  
    O fluxo **registrar → produtos (normal e .99) → carrinho → checkout → Payment approved + Order paid → checkout .99 → Payment rejected + Order failed** funciona integralmente via porta **3005**.

## Ordem sugerida de implementação

1. Definir o contrato `PaymentResultMessage` compartilhado / espelhado entre payments e checkout  
2. No payments-service: publicar o resultado após persistir o Payment final  
3. Declarar exchange / routing key / fila de resultado (e DLQ/retry se aplicável ao padrão do serviço)  
4. No checkout-service: consumer da fila de resultado + atualização da Order (`paid` / `failed`)  
5. Garantir idempotência básica e tratamento de Order inexistente  
6. Validar E2E via gateway: Payment + Order nos dois cenários (aprovado e rejeitado)  
7. Confirmar regressão do proxy `GET /payments/:orderId` e do fluxo de ida RabbitMQ  

## Commits

Faça sempre um commit após a implementação de cada item novo desta spec (RF-06 em diante).

Antes de cada commit, rode o lint do serviço afetado (`payments` e/ou `checkout`) e corrija eventuais problemas introduzidos pela mudança.

Sugestão de granularidade dos commits:

1. Contrato `PaymentResultMessage` (+ tipagem) nos serviços envolvidos  
2. Publisher de resultado no payments-service  
3. Consumer + atualização de Order no checkout-service  
4. Cobertura de aceite / smoke E2E (Payment + Order `paid`/`failed`) via gateway  
