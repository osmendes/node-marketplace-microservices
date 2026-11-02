# Spec: Integração do payments-service ao api-gateway e E2E completo do marketplace

## Contexto

O `payments-service` (pasta `payments/`, porta HTTP **3004**) já está completo com:

- Entidade `Payment` persistida no PostgreSQL (`payments_db`, host `5435`)
- `FakePaymentGatewayService` com regras determinísticas de aprovação/rejeição
- Consumer funcional que processa `PaymentOrderMessage` da fila RabbitMQ após o checkout
- Endpoint de consulta `GET /payments/:orderId`
- Health check público `GET /health` (`{ "status": "ok", "service": "payments-service" }`)

O `api-gateway` (porta HTTP **3005**) já possui:

- `ProxyModule` com `ProxyService` (circuit breaker, retry, timeout e fallback)
- Tratamento de erros **4xx**: status e body do backend são **repassados** ao consumidor
- `AuthModule` com `JwtAuthGuard` e decorator `@Public()`
- Controllers de proxy para `users-service`, `products-service` e `checkout-service`
- Configuração de payments em `gateway.config.ts`: `{ url: 'http://localhost:3004', timeout: 10000 }` (via `PAYMENTS_SERVICE_URL`)
- `ProxyService` já aceita `payments` como `serviceName`, com fallback de erro configurado
- Health checks que consultam `GET /health` nos serviços configurados (incluindo payments)
- Swagger

O `checkout-service` (porta HTTP **3003**) já possui carrinho, checkout e pedidos via gateway. Qualquer endpoint de teste residual no `AppController` (por exemplo `POST /test/send-message`) deve ser removido nesta entrega, mantendo apenas `GET /` e `GET /health`.

### Lacuna desta entrega

A configuração e a resiliência para payments já existem no gateway, mas **não há controller de proxy** expondo `GET /payments/:orderId` na porta 3005. O consumidor ainda não consegue consultar o pagamento passando pelo api-gateway.

Esta spec define:

1. A exposição ponta a ponta da consulta de pagamento via api-gateway
2. A limpeza do endpoint de teste no checkout-service
3. O teste E2E completo do marketplace via gateway (registro → catálogo → carrinho → checkout → pagamento aprovado e rejeitado)

Sem alterar o mecanismo interno do `ProxyService`, sem alterar o payments-service além do uso já existente, e **sem** implementar webhook de atualização de status do pedido.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no gateway, checkout e payments |
| api-gateway | Porta HTTP 3005 |
| users-service | Porta HTTP 3000 (registro/login JWT) |
| products-service | Porta HTTP 3001 (catálogo e criação de produtos) |
| checkout-service | Porta HTTP 3003 (carrinho, checkout, pedidos) |
| payments-service | Porta HTTP 3004 (consulta de pagamento) |
| RabbitMQ | Porta 5672 (mensagem assíncrona checkout → payments) |
| Autenticação | JWT Bearer (mesmo contrato já usado no marketplace) |
| Proxy | `ProxyService.proxyRequest('payments', ...)` já existente (sem alteração de mecanismo) |
| Configuração | `PAYMENTS_SERVICE_URL` / entrada `payments` em `gateway.config.ts` (já presentes) |
| Referência de padrão | Controllers finos de checkout/products/users no gateway |

## Requisitos funcionais — api-gateway

### RF-01 — PaymentsModule com PaymentsProxyController

Deve existir um `PaymentsModule` no api-gateway responsável por expor a consulta de pagamento via proxy para o payments-service.

Responsabilidades mínimas:

1. Declarar / registrar o `PaymentsProxyController`
2. Depender da infraestrutura de proxy já existente (`ProxyService` / `ProxyModule`), sem reimplementar resiliência
3. Ser registrado no `AppModule` do gateway (RF-03)

O módulo **não** deve alterar o payments-service nem o mecanismo interno do `ProxyService`.

### RF-02 — GET /payments/:orderId via proxy (protegido por JWT)

Deve existir um `PaymentsProxyController` no gateway com:

- Prefixo de controller adequado para expor o caminho público `GET /payments/:orderId`
- Proteção: `JwtAuthGuard` na rota (`@UseGuards(JwtAuthGuard)`)
- Encaminhamento via `ProxyService` com `serviceName = 'payments'`

Rota mínima:

| Método | Caminho no gateway | Destino no payments-service | Autenticação no gateway |
|---|---|---|---|
| `GET` | `/payments/:orderId` | `GET /payments/:orderId` | Protegida (`JwtAuthGuard`); repassar `Authorization` |

Regras:

1. Path, método HTTP e contrato de sucesso/erro para o consumidor devem permanecer **compatíveis** com o já definido no payments-service (`GET /payments/:orderId`)
2. O parâmetro de rota `orderId` deve ser preservado no path de destino
3. Sem token (ou com token inválido/expirado), o gateway deve responder **401**, de forma consistente com as demais rotas protegidas do gateway
4. O header `Authorization` enviado pelo cliente deve ser **repassado** ao payments-service
5. Erros **4xx** retornados pelo payments-service devem chegar ao cliente com **status code e body preservados** (comportamento já existente no `ProxyService`); erros 4xx **não** devem acionar retry nem o circuit breaker

### RF-03 — Registrar PaymentsModule no AppModule

O `PaymentsModule` deve ser importado/registrado no `AppModule` do gateway, de forma que a rota `GET /payments/:orderId` fique ativa na porta **3005**.

Após o registro:

- A rota listada no RF-02 deve responder no gateway
- O restante dos módulos já existentes (Proxy, Auth, Health, users, products, checkout) deve continuar funcionando

### RF-04 — Configuração PAYMENTS_SERVICE_URL (verificação)

O gateway deve continuar apontando para o payments-service na porta correta:

| Variável | Valor esperado (desenvolvimento local) |
|---|---|
| `PAYMENTS_SERVICE_URL` | `http://localhost:3004` |

A entrada `payments` em `gateway.config.ts` e a documentação em `.env.example` já existem e devem permanecer corretas. Esta entrega **verifica** a configuração; não exige recriar o que já está pronto, salvo se estiver ausente ou incorreto no ambiente local (`.env`).

## Requisitos funcionais — checkout-service (limpeza)

### RF-05 — Remover endpoint de teste POST /test/send-message

O `AppController` do checkout-service deve **não** expor endpoint de teste de mensageria.

Em particular:

1. Remover `POST /test/send-message` (e qualquer rota equivalente de teste de publish) se ainda existir
2. Manter apenas:
   - `GET /` (hello)
   - `GET /health`
3. Não alterar controllers de negócio (cart, orders), `EventsModule`, `PaymentQueueService`, entidades ou contratos de checkout/pedidos

Se o endpoint de teste já tiver sido removido no estado atual do repositório, a entrega apenas **confirma** que ele permanece ausente e que o `AppController` continua limitado a `GET /` e `GET /health`.

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

### Fluxo D — Checkout e pagamento aprovado

1. Buyer finaliza o checkout via `POST /cart/checkout` com `paymentMethod` válido (ex.: `pix`)
2. Gateway retorna a Order criada (status inicial compatível com o checkout, tipicamente `pending`)
3. Buyer consulta o pedido via `GET /orders/:id` e confirma a Order
4. Após o processamento assíncrono pelo payments-service (consumer + FakePaymentGateway), buyer consulta o pagamento via `GET /payments/:orderId` no gateway
5. O pagamento correspondente ao produto de preço normal deve estar **aprovado** (`status = approved`, com `transactionId` preenchido)

### Fluxo E — Checkout e pagamento rejeitado (.99)

1. Buyer adiciona o produto com preço **`.99`** ao carrinho via `POST /cart/items`
2. Consulta o carrinho via `GET /cart`
3. Finaliza o checkout via `POST /cart/checkout` com `paymentMethod` válido
4. Consulta o pedido via `GET /orders/:id`
5. Após o processamento assíncrono, consulta o pagamento via `GET /payments/:orderId` no gateway
6. O pagamento correspondente ao produto `.99` deve estar **rejeitado** (`status = rejected`, com `rejectionReason` compatível com `"Cartão recusado pela operadora"`)

### Observações do E2E

1. Toda a navegação autenticada e as consultas de pagamento passam pela porta **3005**
2. O intervalo entre checkout e consulta de pagamento deve considerar a latência simulada do FakePaymentGateway (500 ms–2000 ms) mais o tempo de consumo da fila; a verificação pode incluir espera/retry até o registro existir ou o status deixar de ser `pending`
3. Esta entrega **não** exige que o status da Order no checkout mude para `paid`/`failed` (webhook fora de escopo); a validação de aprovação/rejeição é feita pela consulta em `GET /payments/:orderId`

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
| Checkout (normal) | `POST /cart/checkout` | **201** com Order |
| View order | `GET /orders/:id` | **200** com a Order |
| View payment (approved) | `GET /payments/:orderId` | **200** com Payment `approved` |
| Add to cart (.99) | `POST /cart/items` | Carrinho com o item `.99` |
| Checkout (.99) | `POST /cart/checkout` | **201** com Order |
| View payment (rejected) | `GET /payments/:orderId` | **200** com Payment `rejected` e motivo de cartão recusado |

### Falhas autenticadas / 4xx via gateway

| Cenário | Resultado esperado |
|---|---|
| `GET /payments/:orderId` sem token (ou token inválido) | **401** |
| `GET /payments/:orderId` com `orderId` inexistente (quando o request chega ao payments) | **4xx** preservado do payments-service (ex.: **404**) |
| Demais 4xx do payments nas rotas proxyadas | Status e body preservados; sem retry; circuit breaker não acionado |

## Estrutura esperada (alto nível)

```text
docs/specs/
└── gateway-payments-integration-and-e2e.md

gateway/
├── .env                          # PAYMENTS_SERVICE_URL=http://localhost:3004 (verificar)
├── .env.example                  # Já documenta PAYMENTS_SERVICE_URL
└── src/
    ├── app.module.ts             # Registrar PaymentsModule
    └── ...                       # PaymentsModule + PaymentsProxyController
                                  # reutilizando ProxyService existente

checkout/
└── src/
    └── app.controller.ts         # Apenas GET / e GET /health (sem POST /test/send-message)
```

A organização interna de arquivos no gateway deve seguir o padrão já usado para controllers de proxy (ex.: checkout). Esta spec descreve **o que** entregar, sem prescrever a implementação.

## Fora de escopo

Esta spec **não** inclui:

- Alteração do mecanismo interno de resiliência do `ProxyService` / `RetryService` / `CircuitBreakerService` / fallbacks
- Alteração dos guards de autenticação do api-gateway além do uso de `JwtAuthGuard` na rota desta entrega
- Qualquer mudança no `payments-service` (entidade, FakePaymentGateway, consumer, endpoints existentes)
- Qualquer mudança no `checkout-service` **além** da limpeza do endpoint de teste no `AppController` (RF-05)
- Webhook ou notificação do payments-service para atualizar o status do pedido no checkout (`paid` / `failed`)
- Novos endpoints de pagamento além de `GET /payments/:orderId` (criação síncrona, listagem, estorno, etc.)
- Integração com gateway de pagamento real (Stripe, PagSeguro, etc.)
- Session management
- Mudança de portas canônicas (users 3000, products 3001, checkout 3003, payments 3004, gateway 3005, RabbitMQ 5672)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (curl, Postman ou equivalente), preferencialmente passando pelo gateway na porta **3005**.

1. **CA-01 — PaymentsModule registrado**  
   O `PaymentsModule` existe no gateway e está registrado no `AppModule`.

2. **CA-02 — PaymentsProxyController expõe a rota**  
   Via gateway: `GET /payments/:orderId` existe e exige JWT (`401` sem token).

3. **CA-03 — Proxy usa serviceName payments**  
   A rota encaminha para o payments-service via `ProxyService` com `serviceName = 'payments'` (destino efetivo `PAYMENTS_SERVICE_URL` / porta 3004).

4. **CA-04 — Authorization repassado**  
   Com Bearer token válido, a consulta de pagamento via gateway funciona quando o pagamento existe; sem token, falha com **401**.

5. **CA-05 — PAYMENTS_SERVICE_URL correta**  
   O ambiente do gateway aponta payments para `http://localhost:3004` (`.env` / `gateway.config.ts` / `.env.example`).

6. **CA-06 — Checkout sem endpoint de teste**  
   O `AppController` do checkout-service expõe apenas `GET /` e `GET /health`; `POST /test/send-message` (ou equivalente) não existe.

7. **CA-07 — Registro seller e buyer via gateway**  
   `POST http://localhost:3005/auth/register` cria seller e buyer com sucesso.

8. **CA-08 — Seller cria produtos via gateway**  
   Com token de seller, `POST http://localhost:3005/products` cria um produto de preço normal e um produto com preço `.99`.

9. **CA-09 — Buyer navega e usa o carrinho via gateway**  
   Com token de buyer: `GET /products`, `POST /cart/items` (produto normal) e `GET /cart` funcionam via porta 3005.

10. **CA-10 — Checkout e pedido via gateway**  
    `POST /cart/checkout` retorna Order; `GET /orders/:id` retorna a Order correspondente.

11. **CA-11 — Pagamento aprovado via gateway**  
    Após o processamento assíncrono do checkout com produto de preço normal, `GET /payments/:orderId` via gateway retorna Payment com `status = approved`.

12. **CA-12 — Pagamento rejeitado via gateway (.99)**  
    Após o processamento assíncrono do checkout com produto de preço `.99`, `GET /payments/:orderId` via gateway retorna Payment com `status = rejected` e motivo compatível com `"Cartão recusado pela operadora"`.

13. **CA-13 — 4xx preservados na rota de payments**  
    Ao menos um erro 4xx do payments (ex.: `orderId` inexistente → **404**, ou ausência de token → **401** no gateway) é verificável de forma objetiva.

14. **CA-14 — Health do payments visível ao gateway**  
    Com payments-service no ar, o health check do gateway obtém resposta saudável de `/health` do payments.

15. **CA-15 — Escopo respeitado**  
    Não houve alteração do mecanismo de proxy; payments-service não foi alterado; checkout-service só sofreu a limpeza do endpoint de teste (se ainda existia); não foi implementado webhook de atualização de status do pedido.

16. **CA-16 — E2E completo**  
    O fluxo **registrar seller/buyer → login seller → criar produtos (normal e .99) → login buyer → catálogo → carrinho → checkout → consultar pedido → consultar pagamento aprovado → repetir com .99 → consultar pagamento rejeitado** funciona integralmente via porta **3005**.

## Ordem sugerida de implementação

1. Confirmar limpeza do `AppController` no checkout-service (remover `POST /test/send-message` se existir; manter só `GET /` e `GET /health`)
2. Criar o `PaymentsModule` no gateway
3. Implementar `PaymentsProxyController` com `GET /payments/:orderId`, `JwtAuthGuard` e repasse de `Authorization` via `ProxyService` (`payments`)
4. Registrar `PaymentsModule` no `AppModule`
5. Verificar `PAYMENTS_SERVICE_URL` / config local
6. Validar `401` sem token e preservação de ao menos um 4xx do payments
7. Validar health do payments no gateway
8. Executar o fluxo E2E completo via gateway (Fluxos A–E), incluindo aprovação e rejeição

## Commits

Faça sempre um commit após a implementação de cada item desta spec.

Antes de cada commit, rode o lint do serviço afetado (`gateway` e, se houver mudança, `checkout`) e corrija eventuais problemas introduzidos pela mudança.

Sugestão de granularidade dos commits:

1. Limpeza do endpoint de teste no checkout-service (se ainda necessário)
2. `PaymentsModule` + `PaymentsProxyController` + registro no `AppModule`
3. Cobertura de aceite / smoke E2E documentado ou automatizado, se aplicável à entrega
