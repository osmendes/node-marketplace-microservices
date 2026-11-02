# Spec: Integração do checkout-service ao api-gateway

## Contexto

O `checkout-service` (pasta `checkout/`, porta HTTP **3003**) já está completo com:

- Gerenciamento de carrinho protegido por JWT: `POST /cart/items`, `GET /cart`, `DELETE /cart/items/:itemId`
- Finalização de compra e consulta de pedidos protegidos por JWT: `POST /cart/checkout`, `GET /orders`, `GET /orders/:id`
- Validação de tokens emitidos pelo `users-service` (mesmo `JWT_SECRET`)
- Health público (`GET /health`) e Swagger em `/api`
- Publicação assíncrona de `PaymentOrderMessage` no RabbitMQ após o checkout (processamento no `payments-service`)

O `api-gateway` (porta **3005**) já possui:

- `ProxyModule` com `ProxyService` (circuit breaker, retry, timeout e fallback)
- Tratamento de erros **4xx**: status e body do backend são **repassados** ao consumidor (sem retry e sem acionar o circuit breaker)
- `AuthModule` com `JwtAuthGuard` e decorator `@Public()`
- Controllers de proxy para `users-service` e `products-service`
- Configuração de checkout em `gateway.config.ts`: `{ url: 'http://localhost:3003', timeout: 10000 }` (via `CHECKOUT_SERVICE_URL`)
- `ProxyService` já aceita `checkout` como `serviceName`, com fallback de erro configurado
- Health checks que consultam `GET /health` nos serviços configurados (incluindo checkout)
- Swagger

### Lacuna desta entrega

A configuração e a resiliência para o checkout já existem no gateway, mas **não há controllers de proxy** expondo `/cart/*` e `/orders/*` na porta 3005. O consumidor ainda não consegue operar carrinho e pedidos passando pelo api-gateway.

Esta spec define a **exposição ponta a ponta** das rotas de carrinho e pedidos do checkout-service via api-gateway, reutilizando o `ProxyService` e o `JwtAuthGuard` já existentes, sem alterar o mecanismo de proxy nem o checkout-service.

Rotas de **payments** ficam fora desta entrega (outra spec).

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no gateway e no checkout-service |
| checkout-service | Porta HTTP 3003 |
| api-gateway | Porta HTTP 3005 |
| users-service | Porta HTTP 3000 (login JWT usado no fluxo E2E) |
| products-service | Porta HTTP 3001 (produto necessário para adicionar item ao carrinho no E2E) |
| Autenticação | JWT Bearer (mesmo contrato já usado no marketplace) |
| Proxy | `ProxyService.proxyRequest('checkout', ...)` já existente (sem alteração de mecanismo) |
| Configuração | `CHECKOUT_SERVICE_URL` / entrada `checkout` em `gateway.config.ts` (já presentes) |
| Referência de padrão | Controllers finos de products/users no gateway |

## Requisitos funcionais — api-gateway

### RF-01 — CheckoutModule no gateway

Deve existir um `CheckoutModule` no api-gateway responsável por expor as rotas de carrinho e pedidos via proxy para o checkout-service.

Responsabilidades mínimas:

1. Declarar / registrar os dois controllers de proxy desta entrega (`CartProxyController` e `OrdersProxyController`)
2. Depender da infraestrutura de proxy já existente (`ProxyService` / `ProxyModule`), sem reimplementar resiliência
3. Ser registrado no `AppModule` do gateway (RF-04)

O módulo **não** deve alterar o checkout-service nem o mecanismo interno do `ProxyService`.

### RF-02 — CartProxyController

Deve existir um `CartProxyController` no gateway com:

- Prefixo de controller: `cart` (`@Controller('cart')`)
- Proteção: `JwtAuthGuard` em todas as rotas do controller (`@UseGuards(JwtAuthGuard)`)
- Encaminhamento via `ProxyService` com `serviceName = 'checkout'`

Rotas mínimas:

| Método | Caminho no gateway | Destino no checkout-service | Autenticação no gateway |
|---|---|---|---|
| `POST` | `/cart/items` | `POST /cart/items` | Protegida (`JwtAuthGuard`); repassar `Authorization` |
| `GET` | `/cart` | `GET /cart` | Protegida (`JwtAuthGuard`); repassar `Authorization` |
| `DELETE` | `/cart/items/:itemId` | `DELETE /cart/items/:itemId` | Protegida (`JwtAuthGuard`); repassar `Authorization` |

Regras:

1. Paths, métodos HTTP e contratos de sucesso/erro para o consumidor devem permanecer **compatíveis** com os já definidos no checkout-service (specs 02 e 03 do checkout)
2. O corpo da requisição, quando houver (`POST /cart/items`), deve ser encaminhado ao checkout-service
3. O parâmetro de rota `itemId` deve ser preservado no path de destino
4. Sem token (ou com token inválido/expirado), o gateway deve responder **401** antes ou no fluxo autenticado, de forma consistente com as demais rotas protegidas do gateway

### RF-03 — OrdersProxyController

Deve existir um `OrdersProxyController` no gateway com:

- Proteção: `JwtAuthGuard` em todas as rotas do controller (`@UseGuards(JwtAuthGuard)`)
- Encaminhamento via `ProxyService` com `serviceName = 'checkout'`

Rotas mínimas:

| Método | Caminho no gateway | Destino no checkout-service | Autenticação no gateway |
|---|---|---|---|
| `POST` | `/cart/checkout` | `POST /cart/checkout` | Protegida (`JwtAuthGuard`); repassar `Authorization` |
| `GET` | `/orders` | `GET /orders` | Protegida (`JwtAuthGuard`); repassar `Authorization` |
| `GET` | `/orders/:id` | `GET /orders/:id` | Protegida (`JwtAuthGuard`); repassar `Authorization` |

Regras:

1. Paths, métodos HTTP e contratos de sucesso/erro para o consumidor devem permanecer **compatíveis** com os já definidos no checkout-service (spec 03)
2. O corpo da requisição de checkout (`paymentMethod`) deve ser encaminhado ao checkout-service
3. O parâmetro de rota `id` em `GET /orders/:id` deve ser preservado no path de destino
4. Sem token (ou com token inválido/expirado), o acesso autenticado falha com **401**
5. A organização de prefixos NestJS dos controllers pode variar, desde que os **caminhos HTTP públicos** acima sejam respeitados e não haja colisão que impeça `POST /cart/checkout`, `GET /orders` ou `GET /orders/:id`

### RF-04 — Registrar CheckoutModule no AppModule

O `CheckoutModule` deve ser importado/registrado no `AppModule` do gateway, de forma que as rotas de `CartProxyController` e `OrdersProxyController` fiquem ativas na porta **3005**.

Após o registro:

- As rotas listadas nos RF-02 e RF-03 devem responder no gateway
- O restante dos módulos já existentes (Proxy, Auth, Health, products, users) deve continuar funcionando

### RF-05 — Repasse do header Authorization

Em **todas** as requisições proxyadas desta entrega do gateway para o checkout-service:

1. O header `Authorization` enviado pelo cliente deve ser **repassado** ao checkout-service
2. Isso é obrigatório para que o checkout-service valide o JWT e resolva o usuário dono do carrinho/pedido (`req.user`)
3. Headers auxiliares já usados em outros proxies do gateway (por exemplo `Content-Type` quando houver body) devem seguir o mesmo padrão já adotado para products/users, sem redesenhar o mecanismo

### RF-06 — Preservação de erros 4xx do checkout-service

Nas rotas proxyadas de carrinho e pedidos:

1. Erros **4xx** retornados pelo checkout-service devem chegar ao cliente com **status code e body preservados** (comportamento já existente no `ProxyService`)
2. Erros **4xx** **não** devem acionar retry nem o circuit breaker
3. Esta entrega **reutiliza** esse comportamento; não redesenha as camadas de resiliência

Exemplos esperados via gateway (quando o request chega ao checkout):

| Cenário | Resultado esperado |
|---|---|
| `POST /cart/items` com produto inexistente | **404** (ou status/body já definidos no checkout) |
| `POST /cart/checkout` com carrinho vazio / sem carrinho ativo | Erro 4xx já definido no checkout, preservado |
| `POST /cart/checkout` com `paymentMethod` inválido | **400** preservado |
| `GET /orders/:id` de pedido inexistente ou de outro usuário | **404** preservado |

### RF-07 — Configuração CHECKOUT_SERVICE_URL (verificação)

O gateway deve continuar apontando para o checkout-service na porta correta:

| Variável | Valor esperado (desenvolvimento local) |
|---|---|
| `CHECKOUT_SERVICE_URL` | `http://localhost:3003` |

A entrada `checkout` em `gateway.config.ts` e a documentação em `.env.example` já existem e devem permanecer corretas. Esta entrega **verifica** a configuração; não exige recriar o que já está pronto, salvo se estiver ausente ou incorreto no ambiente local (`.env`).

## Fluxo completo esperado via gateway (porta 3005)

Todos os passos abaixo devem funcionar passando pelo **api-gateway** (`http://localhost:3005`), com:

- users-service em `http://localhost:3000`
- products-service em `http://localhost:3001`
- checkout-service em `http://localhost:3003`
- gateway em `http://localhost:3005`

Pré-condição do E2E: existir ao menos um produto ativo no products-service (criado previamente via gateway ou direto no products-service) para uso em `POST /cart/items`.

### Fluxo 1 — Login

1. Cliente envia `POST /auth/login` ao gateway (porta 3005) com e-mail e senha válidos
2. Gateway encaminha a requisição ao users-service (proxy já existente)
3. users-service autentica e retorna o token JWT
4. Cliente recebe o token para uso nas próximas chamadas autenticadas

### Fluxo 2 — Adicionar item ao carrinho

1. Cliente envia `POST /cart/items` ao gateway com `Authorization: Bearer <token>` e corpo válido (`productId`, `quantity`)
2. Gateway valida o token (`JwtAuthGuard`)
3. Gateway encaminha a requisição (com `Authorization`) ao checkout-service via `ProxyService` (`serviceName = 'checkout'`)
4. checkout-service valida o token, resolve o produto no products-service, adiciona o item e retorna o carrinho atualizado
5. Cliente recebe a resposta de sucesso já definida no checkout-service

### Fluxo 3 — Consultar carrinho

1. Cliente envia `GET /cart` ao gateway com `Authorization: Bearer <token>`
2. Gateway valida o token e encaminha ao checkout-service com `Authorization`
3. checkout-service retorna o carrinho ativo do usuário (com o item adicionado)
4. Cliente recebe **200** com o carrinho

### Fluxo 4 — Finalizar checkout

1. Cliente envia `POST /cart/checkout` ao gateway com `Authorization: Bearer <token>` e body `{ "paymentMethod": "pix" }` (ou outro valor permitido: `credit_card`, `debit_card`, `boleto`)
2. Gateway valida o token e encaminha ao checkout-service com `Authorization` e body
3. checkout-service cria a Order `pending`, marca o carrinho como `completed` e publica a mensagem de pagamento
4. Cliente recebe **201** com a Order criada

### Fluxo 5 — Listar pedidos

1. Cliente envia `GET /orders` ao gateway com `Authorization: Bearer <token>`
2. Gateway valida o token e encaminha ao checkout-service com `Authorization`
3. checkout-service retorna os pedidos do usuário autenticado
4. Cliente recebe **200** com array contendo ao menos a Order criada no fluxo 4

### Fluxo auxiliar — Detalhe do pedido

1. Cliente envia `GET /orders/:id` ao gateway com o `id` da Order criada e Bearer token
2. Gateway encaminha ao checkout-service
3. Cliente recebe **200** com a Order correspondente

### Fluxo auxiliar — Remover item (opcional no smoke principal)

1. Em um carrinho ainda ativo (antes do checkout), `DELETE /cart/items/:itemId` via gateway com Bearer token remove o item
2. Resposta compatível com o contrato do checkout-service

### Fluxo auxiliar — Health

1. Com checkout-service no ar e `CHECKOUT_SERVICE_URL` correta, o health check do gateway consegue obter resposta saudável de `GET /health` do checkout-service (`{ "status": "ok", "service": "checkout-service" }`)

## Respostas esperadas (via gateway)

### Fluxo E2E principal

| Passo | Endpoint no gateway | Resultado esperado |
|---|---|---|
| Login | `POST /auth/login` | Token JWT válido |
| Add to cart | `POST /cart/items` com Bearer token | Sucesso compatível com checkout (carrinho com item) |
| View cart | `GET /cart` com Bearer token | **200** com carrinho ativo e itens |
| Checkout | `POST /cart/checkout` com Bearer token e `paymentMethod` válido | **201** com Order `pending` |
| View orders | `GET /orders` com Bearer token | **200** com array contendo a Order criada |
| Order detail | `GET /orders/:id` com Bearer token | **200** com a Order correspondente |

### Falhas autenticadas / 4xx via gateway

| Cenário | Resultado esperado |
|---|---|
| Qualquer rota de cart/orders desta spec sem token (ou token inválido) | **401** |
| `POST /cart/checkout` com `paymentMethod` inválido | **400** preservado do checkout |
| `GET /orders/:id` inexistente ou de outro usuário | **404** preservado do checkout |
| Demais 4xx do checkout nas rotas proxyadas | Status e body preservados; sem retry; circuit breaker não acionado |

## Estrutura esperada (alto nível)

```text
gateway/
├── .env                          # CHECKOUT_SERVICE_URL=http://localhost:3003 (verificar)
├── .env.example                  # Já documenta CHECKOUT_SERVICE_URL
├── docs/
│   └── specs/
│       └── 01-checkout-integration.md
└── src/
    ├── app.module.ts             # Registrar CheckoutModule
    └── ...                       # CheckoutModule + CartProxyController + OrdersProxyController
                                  # reutilizando ProxyService existente
```

A organização interna de arquivos deve seguir o padrão já usado no gateway para controllers de proxy. Esta spec descreve **o que** entregar, sem prescrever a implementação.

## Fora de escopo

Esta spec **não** inclui:

- Alteração do mecanismo interno de resiliência do `ProxyService` / `RetryService` / `CircuitBreakerService` / fallbacks
- Alteração dos guards de autenticação do api-gateway (JWT ou Session) além do uso de `JwtAuthGuard` nas rotas desta entrega
- Qualquer mudança no `checkout-service` (controllers, services, entidades, DTOs, EventsModule, RabbitMQ)
- Rotas de **payments** no gateway (`/payments/*` ou equivalentes) — outra spec
- Session management
- Novos endpoints de carrinho/pedidos além dos já existentes no checkout e listados aqui (ex.: PATCH de quantidade, cancelamento de pedido)
- Alteração dos contratos de sucesso/erro já definidos nas specs do checkout-service
- Processamento síncrono de pagamento ou alteração de status da Order para `paid`/`failed` no gateway
- Mudança de portas canônicas (checkout 3003, gateway 3005, users 3000, products 3001)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (curl, Postman ou equivalente), preferencialmente passando pelo gateway na porta **3005**.

1. **CA-01 — CheckoutModule registrado**  
   O `CheckoutModule` existe no gateway e está registrado no `AppModule`.

2. **CA-02 — CartProxyController expõe as três rotas**  
   Via gateway: `POST /cart/items`, `GET /cart` e `DELETE /cart/items/:itemId` existem e exigem JWT (`401` sem token).

3. **CA-03 — OrdersProxyController expõe as três rotas**  
   Via gateway: `POST /cart/checkout`, `GET /orders` e `GET /orders/:id` existem e exigem JWT (`401` sem token).

4. **CA-04 — Proxy usa serviceName checkout**  
   As seis rotas encaminham para o checkout-service via `ProxyService` com `serviceName = 'checkout'` (destino efetivo `CHECKOUT_SERVICE_URL` / porta 3003).

5. **CA-05 — Authorization repassado**  
   Com Bearer token válido, as operações autenticadas de cart/orders via gateway funcionam; sem token, falham com **401**.

6. **CA-06 — Login via gateway**  
   `POST http://localhost:3005/auth/login` retorna token JWT válido.

7. **CA-07 — Add to cart via gateway**  
   `POST http://localhost:3005/cart/items` com token e `productId` válido adiciona o item com sucesso.

8. **CA-08 — View cart via gateway**  
   `GET http://localhost:3005/cart` com token retorna **200** com o carrinho contendo o item adicionado.

9. **CA-09 — Checkout via gateway**  
   `POST http://localhost:3005/cart/checkout` com token e `paymentMethod` válido retorna **201** com Order `pending`.

10. **CA-10 — View orders via gateway**  
    `GET http://localhost:3005/orders` com token retorna **200** com array contendo a Order criada.

11. **CA-11 — Order detail via gateway**  
    `GET http://localhost:3005/orders/:id` com token e id da Order criada retorna **200** com a Order.

12. **CA-12 — Remoção de item via gateway**  
    `DELETE http://localhost:3005/cart/items/:itemId` com token remove o item de um carrinho ativo (verificável antes do checkout em um fluxo auxiliar).

13. **CA-13 — 4xx preservados**  
    Ao menos um erro 4xx do checkout (ex.: `paymentMethod` inválido → **400**, ou order inexistente → **404**) chega ao cliente via gateway com status/body preservados.

14. **CA-14 — CHECKOUT_SERVICE_URL correta**  
    O ambiente do gateway aponta checkout para `http://localhost:3003` (`.env` / `gateway.config.ts` / `.env.example`).

15. **CA-15 — Health do checkout visível ao gateway**  
    Com checkout-service no ar, o health check do gateway obtém resposta saudável de `/health` do checkout.

16. **CA-16 — Escopo respeitado**  
    Não houve alteração do mecanismo de proxy nem do checkout-service; não foram criadas rotas de payments; contratos existentes de cart/orders do checkout permanecem compatíveis para o consumidor via gateway.

17. **CA-17 — E2E completo**  
    O fluxo **login → add to cart → view cart → checkout → view orders** (e detalhe opcional) funciona integralmente via porta **3005**.

## Ordem sugerida de implementação

1. Criar o `CheckoutModule` no gateway  
2. Implementar `CartProxyController` com as três rotas de carrinho, `JwtAuthGuard` e repasse de `Authorization` via `ProxyService` (`checkout`)  
3. Implementar `OrdersProxyController` com `POST /cart/checkout`, `GET /orders` e `GET /orders/:id`, `JwtAuthGuard` e repasse de `Authorization`  
4. Registrar `CheckoutModule` no `AppModule`  
5. Verificar `CHECKOUT_SERVICE_URL` / config local  
6. Validar o fluxo E2E completo via gateway (login → add to cart → view cart → checkout → view orders) com curl ou Postman  
7. Validar `401` sem token, preservação de ao menos um 4xx do checkout, e health do checkout no gateway  

## Commits

Faça sempre um commit após a implementação de cada item desta spec.

Antes de cada commit, rode o lint do serviço afetado (`gateway`) e corrija eventuais problemas introduzidos pela mudança.

Sugestão de granularidade dos commits:

1. `CheckoutModule` + registro no `AppModule`  
2. `CartProxyController` (POST/GET/DELETE de carrinho via proxy)  
3. `OrdersProxyController` (checkout + listagem/detalhe de orders via proxy)  
4. Cobertura de aceite / smoke E2E documentado ou automatizado, se aplicável à entrega  
