# Spec: Finalização de checkout e consulta de pedidos no checkout-service

## Contexto

O `checkout-service` (pasta `checkout/`, porta HTTP `3003`) já possui:

- Scaffold NestJS com PostgreSQL (`checkout_db`, porta host `5434`) e TypeORM
- Entidades de domínio `Cart`, `CartItem` e `Order` (tabelas `carts`, `cart_items`, `orders`)
- Gerenciamento de carrinho funcional: `POST /cart/items`, `GET /cart`, `DELETE /cart/items/:itemId`
- Autenticação JWT: AuthModule de validação, JwtAuthGuard global, decorator `@Public()`, e `req.user` com `{ id, email, role }` após token válido
- Integração com RabbitMQ via `EventsModule` / `PaymentQueueService` (método `publishPaymentOrder`)
- Health check público (`GET /health`) e Swagger em `/api`
- `OrdersModule` registrado apenas com `TypeOrmModule.forFeature([Order])` — sem controller nem service de negócio

O `PaymentQueueService` publica mensagens no exchange configurado no serviço com routing key `payment.order`. O `payments-service` consome a queue `payment_queue` de forma assíncrona.

A interface `PaymentOrderMessage` (já existente no checkout) espera:

| Campo | Obrigatório | Descrição |
|---|---|---|
| `orderId` | Sim | Identificador do pedido criado |
| `userId` | Sim | Identificador do usuário |
| `amount` | Sim | Valor total do pedido (número) |
| `items` | Sim | Array de `{ productId, quantity, price }` |
| `paymentMethod` | Sim | Método de pagamento escolhido |
| `description` | Não | Descrição opcional |
| `createdAt` | Não | Data de criação (o publisher pode enriquecer) |

O fluxo desta entrega é: **checkout → cria Order → publica no RabbitMQ → payments-service processa depois (assíncrono)**.

Esta spec define a **finalização do carrinho** (`POST /cart/checkout`), a **listagem de pedidos** (`GET /orders`) e o **detalhe de pedido** (`GET /orders/:id`), além da evolução do `OrdersModule` para importar `CartModule` e `EventsModule`. Processamento de pagamento, cancelamento de pedido e verificação de estoque ficam fora de escopo.

## Tipagem obrigatória

Todas as funções, variáveis e parâmetros introduzidos ou alterados nesta entrega devem ser **explicitamente tipados**.

Isso inclui, no mínimo:

- Parâmetros e retornos de métodos de controllers e services
- Variáveis locais relevantes ao fluxo de negócio
- DTOs de entrada e tipos/contratos de resposta documentados
- Payloads montados para `PaymentOrderMessage`
- Identificadores obtidos de `req.user` e parâmetros de rota

Tipos implícitos ou `any` sem justificativa documentada **não** são aceitos nesta entrega.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência das entidades `Cart`, `CartItem` e `Order` já mapeadas |
| PostgreSQL | Já presente (`checkout_db`, host `5434`) |
| RabbitMQ | Já presente via `EventsModule` / `PaymentQueueService` |
| Validação | `class-validator` + `class-transformer` (ValidationPipe global já habilitado) |
| Autenticação | JwtAuthGuard global já ativo; rotas desta entrega **não** são públicas |
| Documentação | Swagger / OpenAPI já presente em `/api` |

## Requisitos funcionais

### RF-01 — POST /cart/checkout — finalizar carrinho

Deve existir o endpoint:

- **Método:** `POST`
- **Caminho:** `/cart/checkout`
- **Autenticação:** obrigatória (rota **sem** `@Public()`; protegida pelo JwtAuthGuard global)
- **Corpo:** `paymentMethod` com um dos valores: `credit_card`, `debit_card`, `pix`, `boleto`
- **Comportamento:** validar entrada, garantir carrinho ativo não vazio do usuário autenticado, criar `Order`, marcar o carrinho como `completed`, publicar `PaymentOrderMessage` no RabbitMQ e retornar a Order criada

Fluxo esperado (sucesso):

1. Obter o usuário autenticado em `req.user.id`
2. Validar o corpo da requisição (`paymentMethod` obrigatório e restrito aos valores permitidos)
3. Obter o carrinho ativo do usuário (`status = "active"`)
4. Validar que o carrinho existe e **não** está vazio (possui ao menos um item)
5. Criar uma `Order` com:
   - `userId` = usuário autenticado
   - `cartId` = id do carrinho ativo
   - `total` = total do carrinho
   - `paymentMethod` = valor informado no body
   - `status` = `"pending"`
6. Alterar o status do carrinho de `"active"` para `"completed"`
7. Publicar no RabbitMQ, via `PaymentQueueService.publishPaymentOrder`, uma `PaymentOrderMessage` contendo no mínimo:
   - `orderId` = id da Order criada
   - `userId` = usuário autenticado
   - `amount` = total do pedido (numérico)
   - `items` = itens do carrinho no formato `{ productId, quantity, price }`
   - `paymentMethod` = método informado
8. Retornar **HTTP 201** com a Order criada

### RF-02 — GET /orders — listar pedidos do usuário

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/orders`
- **Autenticação:** obrigatória (rota **sem** `@Public()`)
- **Comportamento:** retornar todos os pedidos do usuário autenticado, ordenados por data (mais recentes primeiro)

Regras:

1. Filtrar exclusivamente por `userId = req.user.id`
2. Ordenar do mais recente para o mais antigo (por data de criação)
3. Retornar **HTTP 200** com a lista (array vazio se o usuário não tiver pedidos)

### RF-03 — GET /orders/:id — detalhe do pedido

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/orders/:id`
- **Autenticação:** obrigatória (rota **sem** `@Public()`)
- **Comportamento:** retornar um pedido específico do usuário autenticado

Regras:

1. O `id` deve ser um UUID válido
2. O pedido deve existir **e** pertencer ao usuário autenticado (`userId = req.user.id`)
3. Se o pedido não existir **ou** não pertencer ao usuário autenticado, responder **404** (sem vazar existência de pedidos de outros usuários)
4. Em sucesso, retornar **HTTP 200** com a Order encontrada

### RF-04 — OrdersModule (CartModule + EventsModule)

O `OrdersModule` existente deve passar a orquestrar a finalização e a consulta de pedidos nesta entrega.

Responsabilidades mínimas:

1. Importar `CartModule` (para acessar o carrinho ativo e suas regras/serviços já existentes)
2. Importar `EventsModule` (para acessar `PaymentQueueService` e publicar a mensagem de pagamento)
3. Expor controller(s) e service(s) necessários para:
   - `POST /cart/checkout` (finalização)
   - `GET /orders` (listagem)
   - `GET /orders/:id` (detalhe)
4. Manter o registro TypeORM da entidade `Order`

A organização exata de controllers (ex.: checkout no cart vs. orders) pode variar, desde que os caminhos HTTP acima sejam respeitados e o `OrdersModule` importe `CartModule` e `EventsModule`.

### RF-05 — Validação de entrada

Os dados de entrada devem ser validados.

Em caso de dados inválidos, a API deve responder com **HTTP 400 (Bad Request)** e mensagens de erro claras (campo e motivo).

Campos obrigatórios ausentes, valores fora do enum permitido, tipos incorretos, UUID inválido em parâmetro de rota e propriedades extras devem resultar em 400 (comportamento já esperado do ValidationPipe global com `forbidNonWhitelisted`), salvo quando o critério de aceite desta spec definir **404** para recurso inexistente/alheio.

### RF-06 — Autorização de propriedade

O usuário autenticado **só** pode finalizar o próprio carrinho e consultar os próprios pedidos.

- Todas as operações usam `req.user.id` como dono
- Não é permitido informar `userId` no body/query para agir em nome de outro usuário
- Em `GET /orders/:id`, pedido inexistente ou de outro usuário resulta em **404**, sem vazamento

Não há restrição por `role` nesta entrega: `seller` e `buyer` podem usar os três endpoints.

### RF-07 — Publicação assíncrona de pagamento

Após criar a Order com sucesso, o checkout deve publicar a `PaymentOrderMessage` via `PaymentQueueService` já existente.

Regras:

1. Usar o método `publishPaymentOrder` (ou equivalente já exposto pelo serviço) — **não** reimplementar o publisher
2. A publicação ocorre **depois** da criação da Order e da marcação do carrinho como `completed` no fluxo feliz descrito no RF-01
3. O processamento do pagamento permanece responsabilidade exclusiva do `payments-service` (assíncrono); o checkout **não** altera o status da Order para `paid` / `failed` nesta entrega
4. Esta spec **não** exige alterar o `EventsModule`, o exchange, a routing key ou a interface `PaymentOrderMessage` além do uso correto do contrato já existente

## Regras de negócio

1. Só é possível finalizar um carrinho com `status = "active"` e com **pelo menos um** item
2. Após o checkout bem-sucedido, o carrinho passa a `status = "completed"` e deixa de ser o carrinho ativo do usuário
3. A Order nasce com `status = "pending"` e `paymentMethod` igual ao valor validado do body
4. O `total` da Order é o `total` do carrinho no momento da finalização
5. Os itens publicados na mensagem RabbitMQ refletem o snapshot dos itens do carrinho no momento do checkout (`productId`, `quantity`, `price`)
6. O usuário só acessa pedidos com `userId = req.user.id`
7. Listagem de pedidos ordenada do mais recente para o mais antigo
8. Falha ao publicar no RabbitMQ após persistir Order/carrinho deve ser tratada de forma explícita e documentada na implementação (sem silenciar o erro); o critério mínimo é que a falha seja observável (erro retornado ou log/erro propagado), sem processar pagamento localmente

## Estrutura de dados

### DTO de checkout (corpo de `POST /cart/checkout`)

| Campo | Obrigatório | Regras |
|---|---|---|
| `paymentMethod` | Sim | Um de: `credit_card`, `debit_card`, `pix`, `boleto` |

Campos **não** aceitos no corpo (entre outros): `id`, `userId`, `cartId`, `total`, `status`, `items`, `orderId`, `amount`.

### Parâmetro de rota — detalhe do pedido

| Campo | Obrigatório | Regras |
|---|---|---|
| `id` | Sim | UUID da `Order` |

### Contrato da mensagem publicada (`PaymentOrderMessage`)

| Campo | Origem nesta entrega |
|---|---|
| `orderId` | `Order.id` recém-criada |
| `userId` | `req.user.id` / `Order.userId` |
| `amount` | Total do pedido (numérico, derivado do total do carrinho/Order) |
| `items[].productId` | Itens do carrinho finalizado |
| `items[].quantity` | Itens do carrinho finalizado |
| `items[].price` | Preço snapshot do item no carrinho |
| `paymentMethod` | Body do checkout |
| `description` | Opcional; pode ser omitido |
| `createdAt` | Opcional; o publisher existente pode enriquecer |

### Resposta de sucesso — Order

A resposta de criação/consulta de pedido deve incluir, no mínimo:

| Campo | Presente | Observação |
|---|---|---|
| `id` | Sim | UUID do pedido |
| `userId` | Sim | Igual a `req.user.id` |
| `cartId` | Sim | UUID do carrinho finalizado |
| `total` | Sim | Decimal do pedido |
| `status` | Sim | Na criação: `"pending"` |
| `paymentMethod` | Sim | Valor informado no checkout |
| `createdAt` | Sim | Timestamp de criação |
| `updatedAt` | Sim | Timestamp de atualização |

### Resposta de sucesso — lista de pedidos

`GET /orders` retorna um **array** de Orders no formato acima (possivelmente vazio), ordenado do mais recente para o mais antigo.

## Fluxo esperado de uma requisição

### Checkout — sucesso

1. `POST /cart/checkout` com `Authorization: Bearer <token>` e body `{ "paymentMethod": "pix" }` (ou outro valor permitido)
2. JwtAuthGuard valida o token e injeta `{ id, email, role }` em `req.user`
3. ValidationPipe valida o body
4. Checkout localiza o carrinho ativo do usuário com itens
5. Order é criada com status `pending`
6. Carrinho ativo muda para `completed`
7. `PaymentOrderMessage` é publicada via `PaymentQueueService.publishPaymentOrder`
8. API responde **201** com a Order criada

### Checkout — carrinho vazio ou inexistente

1. Usuário autenticado sem carrinho ativo, ou com carrinho ativo sem itens
2. API responde **400** (carrinho vazio / sem itens para finalizar)
3. Nenhuma Order é criada; nenhuma mensagem é publicada; status de carrinho permanece inalterado

### Checkout — paymentMethod inválido

1. Body sem `paymentMethod`, com valor fora do conjunto permitido, ou com propriedades extras
2. API responde **400**
3. Nenhuma Order é criada; nenhuma mensagem é publicada

### Listar pedidos — com resultados

1. `GET /orders` autenticado
2. Checkout retorna **200** com todos os pedidos do usuário, mais recentes primeiro

### Listar pedidos — sem resultados

1. `GET /orders` autenticado
2. Usuário sem pedidos
3. Responde **200** com array vazio

### Detalhe do pedido — sucesso

1. `GET /orders/:id` autenticado
2. Pedido existe e pertence ao usuário
3. Responde **200** com a Order

### Detalhe do pedido — inexistente ou alheio

1. `id` inexistente ou pertencente a outro usuário
2. Responde **404**
3. Nenhum dado de outro usuário é revelado

### Sem autenticação ou token inválido

1. Qualquer um dos três endpoints sem token válido
2. JwtAuthGuard rejeita
3. Responde **401**; o handler de negócio **não** é executado

## Respostas esperadas

### 201 Created — pedido criado

- `POST /cart/checkout` após finalização bem-sucedida

Corpo: Order criada conforme a estrutura acima.

### 200 OK — pedidos retornados

- `GET /orders` (lista, inclusive vazia)
- `GET /orders/:id` (pedido encontrado e pertencente ao usuário)

### 400 Bad Request

Deve ocorrer quando:

- `paymentMethod` ausente, inválido ou fora de `credit_card` | `debit_card` | `pix` | `boleto`
- Propriedades não permitidas no body
- Carrinho ativo inexistente ou sem itens na finalização
- Parâmetro `id` malformado (não UUID), quando a validação de rota/DTO aplicar 400

### 401 Unauthorized

Deve ocorrer quando:

- Header `Authorization` ausente
- Formato do header inválido
- Token com assinatura inválida
- Token expirado
- Payload do token incompleto ou inválido

### 404 Not Found

Deve ocorrer quando:

- `GET /orders/:id` com pedido inexistente para o usuário autenticado
- `GET /orders/:id` com pedido de outro usuário (mesma resposta 404)

## Variáveis de ambiente

Nenhuma variável de ambiente **nova** é exigida nesta entrega. Permanecem as já documentadas:

| Variável | Descrição | Exemplo local |
|---|---|---|
| `PORT` | Porta HTTP do serviço | `3003` |
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5434` |
| `DB_USERNAME` | Usuário do banco | `postgres` |
| `DB_PASSWORD` | Senha do banco | `postgres` |
| `DB_DATABASE` | Nome do database | `checkout_db` |
| `JWT_SECRET` | Secret compartilhado para validar JWT | Mesmo valor do `users-service` |
| `PRODUCTS_SERVICE_URL` | URL base do products-service | `http://localhost:3001` |
| Variáveis RabbitMQ já usadas pelo `EventsModule` | Conexão com o broker | Conforme `.env.example` existente |

## Estrutura esperada (alto nível)

```text
checkout/
├── docs/
│   └── specs/
│       ├── 01-entities-and-jwt.md
│       ├── 02-cart-management.md
│       └── 03-checkout-and-orders.md
├── src/
│   ├── cart/                      # carrinho já existente; pode expor ou colaborar no checkout
│   ├── orders/
│   │   ├── entities/              # Order (já existente)
│   │   ├── dto/                   # DTOs de checkout / params de pedido
│   │   ├── orders.controller.ts   # GET /orders, GET /orders/:id (e/ou checkout, se colocado aqui)
│   │   ├── orders.service.ts      # regras de Order + orquestração do checkout
│   │   └── orders.module.ts       # importa CartModule + EventsModule
│   ├── events/                    # inalterado em comportamento; apenas consumido
│   ├── auth/                      # inalterado nesta spec
│   └── ...
└── ...
```

A organização interna de pastas/arquivos pode variar desde que as responsabilidades e os caminhos HTTP acima estejam cobertos. Nomes exatos de arquivos são orientação, não obrigação rígida.

## Fora de escopo

Esta spec **não** inclui:

- Processamento de pagamento (responsabilidade do `payments-service`)
- Alteração de status da Order para `paid`, `failed` ou `cancelled`
- Cancelamento de pedido
- Verificação de estoque
- Endpoint dedicado de alteração de quantidade no carrinho
- Integração com api-gateway (proxy de rotas de checkout/orders)
- Alteração do contrato interno do `EventsModule` / exchange / routing key / interface `PaymentOrderMessage`
- RoleGuard ou restrição por papel (`seller` / `buyer`)
- Cupons, frete, impostos, múltiplos carrinhos ativos
- Webhooks ou callbacks do payments-service para o checkout
- Paginação/filtros avançados na listagem de pedidos (além da ordenação por data)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — POST /cart/checkout autenticado**  
   `POST /cart/checkout` existe, exige JWT válido e, sem token, responde **401**.

2. **CA-02 — Validação de paymentMethod**  
   Body sem `paymentMethod`, com valor fora de `credit_card` | `debit_card` | `pix` | `boleto`, ou com propriedades extras responde **400**.

3. **CA-03 — Carrinho vazio / inexistente**  
   Finalizar sem carrinho ativo ou com carrinho ativo sem itens responde **400**; nenhuma Order é criada e nenhuma mensagem é publicada.

4. **CA-04 — Criação da Order**  
   No checkout bem-sucedido, existe uma Order com `userId` do autenticado, `cartId` do carrinho finalizado, `total` igual ao total do carrinho, `paymentMethod` informado e `status = "pending"`.

5. **CA-05 — Carrinho completed**  
   Após checkout bem-sucedido, o carrinho utilizado passa de `"active"` para `"completed"`.

6. **CA-06 — Publicação RabbitMQ**  
   Após checkout bem-sucedido, `PaymentQueueService.publishPaymentOrder` é chamado com `PaymentOrderMessage` contendo `orderId`, `userId`, `amount`, `items` (com `productId`, `quantity`, `price`) e `paymentMethod`.

7. **CA-07 — Resposta 201**  
   `POST /cart/checkout` bem-sucedido responde **201** com a Order criada (campos mínimos da estrutura de resposta).

8. **CA-08 — GET /orders autenticado**  
   `GET /orders` existe, exige JWT e, sem token, responde **401**.

9. **CA-09 — Listagem do próprio usuário**  
   `GET /orders` retorna **apenas** pedidos com `userId = req.user.id`.

10. **CA-10 — Ordenação por data**  
    Em `GET /orders`, os pedidos vêm do mais recente para o mais antigo.

11. **CA-11 — Lista vazia**  
    Usuário sem pedidos recebe **200** com array vazio.

12. **CA-12 — GET /orders/:id autenticado**  
    `GET /orders/:id` existe, exige JWT e, sem token, responde **401**.

13. **CA-13 — Detalhe do próprio pedido**  
    Usuário autenticado consulta o próprio pedido e recebe **200** com a Order.

14. **CA-14 — Detalhe inexistente / alheio**  
    Consultar `id` inexistente ou de outro usuário responde **404**.

15. **CA-15 — Propriedade no checkout**  
    Usuário A não finaliza carrinho nem acessa pedidos do usuário B.

16. **CA-16 — Sellers e buyers**  
    Usuários com `role` `"seller"` e `"buyer"` conseguem usar os três endpoints com token válido (sem 403 por papel).

17. **CA-17 — OrdersModule com imports**  
    `OrdersModule` importa `CartModule` e `EventsModule`.

18. **CA-18 — Tipagem**  
    Funções, variáveis e parâmetros introduzidos nesta entrega estão tipados; não há uso injustificado de `any`.

19. **CA-19 — Swagger atualizado**  
    A documentação em `/api` reflete `POST /cart/checkout`, `GET /orders`, `GET /orders/:id` e o Bearer Auth necessário.

20. **CA-20 — Escopo respeitado**  
    Não há processamento de pagamento no checkout, cancelamento de pedido, verificação de estoque, alteração de status da Order para `paid`/`failed`/`cancelled`, nem proxy de gateway nesta entrega.

21. **CA-21 — Sem segundo carrinho ativo após checkout**  
    Após finalizar, o usuário deixa de ter aquele carrinho como `active`; um novo carrinho ativo só nasce em fluxo futuro de adição de itens (já coberto pela spec 02), não automaticamente no checkout.

## Ordem sugerida de implementação

1. Evoluir o `OrdersModule` para importar `CartModule` e `EventsModule`  
2. Criar DTOs tipados de entrada (`paymentMethod`, param `id`)  
3. Implementar o service de pedidos/checkout: validar carrinho ativo não vazio, criar Order `pending`, marcar carrinho `completed`, montar e publicar `PaymentOrderMessage`  
4. Expor `POST /cart/checkout`, `GET /orders` e `GET /orders/:id`  
5. Garantir tipagem explícita em funções, variáveis e parâmetros do fluxo  
6. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e), mockando `PaymentQueueService` quando apropriado  
7. Validar manualmente o fluxo feliz e os erros (401, 400, 404)  
8. Conferir Swagger em `/api`

## Commits

Faça um único commit com tudo desta aula (spec). A implementação desta spec virá em entrega posterior, a partir do plano de implementação.
