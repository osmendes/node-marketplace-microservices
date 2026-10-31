# Spec: Gerenciamento de carrinho no checkout-service

## Contexto

O `checkout-service` (pasta `checkout/`, porta HTTP `3003`) já possui:

- Scaffold NestJS com PostgreSQL (`checkout_db`, porta host `5434`) e TypeORM
- Entidades de domínio `Cart`, `CartItem` e `Order` (tabelas `carts`, `cart_items`, `orders`)
- `CartModule` e `OrdersModule` registrados (sem controllers/endpoints de negócio ainda)
- Autenticação JWT funcionando: AuthModule de validação, JwtAuthGuard global, decorator `@Public()`, e `req.user` com `{ id, email, role }` após token válido
- Integração com RabbitMQ (`EventsModule` / `PaymentQueueService`) — **não** alterar nesta entrega
- Health check público (`GET /health`) e Swagger em `/api`

O `products-service` (porta `3001`) já possui o endpoint público:

- `GET /products/:id` — retorna o produto completo (`id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt`, `updatedAt`) ou **404** se não existir

O carrinho é **por usuário**: cada usuário tem no máximo um carrinho com status `"active"`. Tanto `seller` quanto `buyer` podem ter e manipular carrinho (não há restrição de papel nesta entrega).

Esta spec define **apenas o gerenciamento do carrinho**: cliente HTTP para o products-service, adicionar item, consultar carrinho e remover item. Finalização/checkout, alteração dedicada de quantidade, pedidos e integração com gateway ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência das entidades `Cart` e `CartItem` já mapeadas |
| PostgreSQL | Já presente (`checkout_db`, host `5434`) |
| HTTP client | `HttpModule` do NestJS (`@nestjs/axios`) para falar com o products-service |
| Validação | `class-validator` + `class-transformer` (ValidationPipe global já habilitado) |
| Autenticação | JwtAuthGuard global já ativo; rotas de carrinho **não** são públicas |
| Config | `@nestjs/config` (já presente) para ler `PRODUCTS_SERVICE_URL` |

## Requisitos funcionais

### RF-01 — ProductsClientService (comunicação HTTP com products-service)

Deve existir um serviço cliente responsável pela comunicação HTTP com o `products-service`.

Responsabilidades mínimas nesta entrega:

1. Expor o método `getProduct(productId)` que busca um produto via `GET /products/:id` no products-service
2. Utilizar o `HttpModule` do NestJS (`@nestjs/axios`)
3. Obter a URL base do products-service a partir da variável de ambiente `PRODUCTS_SERVICE_URL`
4. Em caso de produto inexistente no products-service, sinalizar a falha de forma que o fluxo de carrinho possa responder **404**
5. Em caso de falha de comunicação / indisponibilidade do products-service, sinalizar erro adequado (sem mascarar como “produto não encontrado”)

O cliente **não** deve autenticar a chamada a `GET /products/:id` (endpoint público no products-service).

### RF-02 — Variável de ambiente `PRODUCTS_SERVICE_URL`

O serviço deve passar a exigir/documentar a variável:

| Variável | Descrição | Exemplo local |
|---|---|---|
| `PRODUCTS_SERVICE_URL` | URL base do products-service | `http://localhost:3001` |

O arquivo `.env.example` deve documentar `PRODUCTS_SERVICE_URL` (mantendo as variáveis já existentes), sem commitar segredos reais.

### RF-03 — POST /cart/items — adicionar item ao carrinho

Deve existir o endpoint:

- **Método:** `POST`
- **Caminho:** `/cart/items`
- **Autenticação:** obrigatória (rota **sem** `@Public()`; protegida pelo JwtAuthGuard global)
- **Corpo:** `productId` (UUID) e `quantity` (inteiro ≥ 1)
- **Comportamento:** validar entrada, buscar o produto no products-service, garantir carrinho ativo do usuário autenticado, adicionar ou somar o item, recalcular totais e retornar o carrinho completo

Fluxo esperado (sucesso):

1. Obter o usuário autenticado em `req.user.id`
2. Validar o corpo da requisição
3. Buscar o produto via `ProductsClientService.getProduct(productId)`
4. Validar que o produto existe e está ativo (`isActive: true`)
5. Obter o carrinho ativo do usuário (`status = "active"`); se não existir, criar um novo carrinho ativo para esse usuário
6. Se o produto **já** estiver no carrinho: somar a `quantity` informada à quantidade existente, atualizar o snapshot de `productName` e `price` com os dados atuais do produto, e recalcular o `subtotal` do item
7. Se o produto **não** estiver no carrinho: criar um novo `CartItem` com snapshot de `productName` e `price`, `quantity` informada e `subtotal = price × quantity`
8. Recalcular o `total` do carrinho como a soma de todos os subtotais dos itens
9. Retornar **HTTP 200** (ou **201**, desde que consistente e documentado) com o carrinho completo (itens e total)

### RF-04 — GET /cart — ver carrinho do usuário

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/cart`
- **Autenticação:** obrigatória (rota **sem** `@Public()`)
- **Comportamento:** retornar o carrinho ativo do usuário autenticado com itens e total

Se o usuário **não** tiver carrinho ativo, a API deve responder **200** com uma representação de **carrinho vazio** (sem itens e total `0`), **sem** exigir a criação prévia de um registro no banco apenas para a consulta.

### RF-05 — DELETE /cart/items/:itemId — remover item

Deve existir o endpoint:

- **Método:** `DELETE`
- **Caminho:** `/cart/items/:itemId`
- **Autenticação:** obrigatória (rota **sem** `@Public()`)
- **Comportamento:** remover o item indicado do carrinho ativo do usuário autenticado, recalcular o total e retornar o carrinho atualizado

Regras:

1. O `itemId` deve pertencer ao carrinho ativo do usuário autenticado
2. Após a remoção, o `total` do carrinho deve ser recalculado (soma dos subtotais restantes; se não houver itens, total `0`)
3. Retornar **HTTP 200** com o carrinho completo atualizado (itens restantes e total)

### RF-06 — Controllers e services de carrinho

O `CartModule` existente deve passar a expor o gerenciamento de carrinho nesta entrega.

Responsabilidades mínimas:

- **Controller de carrinho:** expor `POST /cart/items`, `GET /cart` e `DELETE /cart/items/:itemId`, lendo o usuário autenticado de `req.user`
- **Service de carrinho:** orquestrar criação/obtenção do carrinho ativo, adição/soma/remoção de itens, snapshot de produto, recálculo de subtotais/total e regras de propriedade
- **ProductsClientService:** registrado e disponível para o fluxo de adição de item

Nesta entrega **não** é necessário expor endpoints de Order nem alterar o `OrdersModule` além do que já existe.

### RF-07 — Validação de entrada

Os dados de entrada devem ser validados.

Em caso de dados inválidos, a API deve responder com **HTTP 400 (Bad Request)** e mensagens de erro claras (campo e motivo).

Campos obrigatórios ausentes, tipos incorretos, limites violados e propriedades extras devem resultar em 400 (comportamento já esperado do ValidationPipe global com `forbidNonWhitelisted`).

### RF-08 — Autorização de propriedade do carrinho

O usuário autenticado **só** pode manipular o próprio carrinho.

- Todas as operações usam `req.user.id` como dono do carrinho
- Não é permitido informar `userId` no body/query para agir em nome de outro usuário
- Em `DELETE /cart/items/:itemId`, se o item não pertencer ao carrinho ativo do usuário autenticado, a operação deve falhar com **404** (item inexistente para aquele usuário), sem vazar existência de itens de outros usuários

Não há restrição por `role` nesta entrega: `seller` e `buyer` podem usar os três endpoints.

## Regras de negócio

1. Cada usuário tem **no máximo um** carrinho com status `"active"`
2. O preço (`price`) e o nome (`productName`) do produto são salvos no `CartItem` no momento da adição (**snapshot**); alterações posteriores no products-service não atualizam automaticamente itens já existentes, exceto quando o mesmo produto é adicionado de novo (soma de quantidade), momento em que o snapshot do item é atualizado com os dados atuais do produto
3. `subtotal` do item = `price × quantity` (usando o preço do snapshot após a operação)
4. `total` do carrinho = soma de todos os `subtotal` dos itens
5. O usuário só manipula o próprio carrinho (`userId = req.user.id`)
6. Produto inativo (`isActive: false`) **não** pode ser adicionado ao carrinho
7. Não existe endpoint de alteração de quantidade nesta entrega: para mudar a quantidade, o cliente remove o item e adiciona novamente (ou adiciona de novo o mesmo produto para somar)
8. Carrinho vazio na consulta: se não houver carrinho ativo, retornar representação vazia com total `0` e lista de itens vazia

## Estrutura de dados

### DTO de adição (corpo de `POST /cart/items`)

| Campo | Obrigatório | Regras |
|---|---|---|
| `productId` | Sim | UUID válido |
| `quantity` | Sim | Número inteiro; mínimo `1` |

Campos **não** aceitos no corpo (entre outros): `id`, `userId`, `price`, `productName`, `subtotal`, `cartId`, `total`.

### Parâmetro de rota — remoção

| Campo | Obrigatório | Regras |
|---|---|---|
| `itemId` | Sim | UUID do `CartItem` a remover |

### Contrato esperado do products-service (`GET /products/:id`)

Campos mínimos usados pelo checkout nesta entrega:

| Campo | Uso |
|---|---|
| `id` | Identidade do produto (`productId` no item) |
| `name` | Snapshot em `CartItem.productName` |
| `price` | Snapshot em `CartItem.price` e base do `subtotal` |
| `isActive` | Validação: deve ser `true` para permitir adição |
| `stock` | **Não** validado nesta entrega (fora de escopo) |

### Resposta de sucesso — carrinho completo

A resposta dos endpoints de carrinho deve incluir, no mínimo:

| Campo | Presente | Observação |
|---|---|---|
| `id` | Sim (quando houver carrinho persistido) | UUID do carrinho; na representação vazia sem registro, pode ser `null`/ausente desde que documentado e consistente |
| `userId` | Sim | Igual a `req.user.id` |
| `status` | Sim | `"active"` quando houver carrinho; na representação vazia, `"active"` ou equivalente documentado |
| `total` | Sim | Decimal; soma dos subtotais (ou `0` se vazio) |
| `items` | Sim | Array de itens (vazio se não houver itens) |
| `createdAt` / `updatedAt` | Sim quando houver carrinho persistido | Timestamps do carrinho |

Cada item em `items` deve incluir, no mínimo:

| Campo | Presente |
|---|---|
| `id` | Sim |
| `productId` | Sim |
| `productName` | Sim (snapshot) |
| `price` | Sim (snapshot) |
| `quantity` | Sim |
| `subtotal` | Sim |
| `createdAt` | Sim |

## Fluxo esperado de uma requisição

### Adicionar item — sucesso (produto novo no carrinho)

1. `POST /cart/items` com `Authorization: Bearer <token>` e body válido
2. JwtAuthGuard valida o token e injeta `{ id, email, role }` em `req.user`
3. ValidationPipe valida o body
4. Checkout busca o produto no products-service
5. Produto existe e `isActive = true`
6. Carrinho ativo do usuário é obtido ou criado
7. Novo `CartItem` é criado com snapshot de nome/preço, quantidade e subtotal
8. `total` do carrinho é recalculado
9. API responde com o carrinho completo

### Adicionar item — produto já no carrinho

1. Mesmos passos de autenticação, validação e busca do produto
2. Item existente do mesmo `productId` tem a quantidade somada
3. Snapshot de nome/preço do item é atualizado com os dados atuais do produto
4. `subtotal` do item e `total` do carrinho são recalculados
5. API responde com o carrinho completo (sem duplicar o produto em dois itens)

### Adicionar item — produto inexistente

1. products-service responde que o produto não existe
2. Checkout responde **404**; nenhum item é criado/alterado

### Adicionar item — produto inativo

1. Produto existe com `isActive = false`
2. Checkout responde **400** (ou **422**, desde que consistente e documentado) indicando que o produto não está ativo
3. Nenhum item é criado/alterado

### Consultar carrinho — com itens

1. `GET /cart` autenticado
2. Checkout localiza o carrinho ativo do usuário
3. Responde **200** com carrinho, itens e total

### Consultar carrinho — sem carrinho ativo

1. `GET /cart` autenticado
2. Não existe carrinho ativo para o usuário
3. Responde **200** com carrinho vazio (`items: []`, `total: 0`)

### Remover item — sucesso

1. `DELETE /cart/items/:itemId` autenticado
2. Item pertence ao carrinho ativo do usuário
3. Item é removido; total recalculado
4. Responde **200** com o carrinho atualizado

### Remover item — inexistente / de outro usuário

1. `itemId` não existe no carrinho ativo do usuário autenticado
2. Responde **404**
3. Nenhum dado de outro usuário é revelado

### Sem autenticação ou token inválido

1. Qualquer um dos três endpoints sem token válido
2. JwtAuthGuard rejeita
3. Responde **401**; o handler de negócio **não** é executado

## Respostas esperadas

### 200 OK — carrinho retornado / atualizado

- `GET /cart` com ou sem carrinho ativo
- `POST /cart/items` após adição/soma bem-sucedida (se a implementação optar por 200)
- `DELETE /cart/items/:itemId` após remoção bem-sucedida

Corpo: carrinho completo conforme a estrutura acima.

### 201 Created — item adicionado (opcional)

Aceitável para `POST /cart/items` no lugar de 200, desde que a escolha seja única, documentada no Swagger e coberta pelos critérios de aceite.

### 400 Bad Request

Deve ocorrer quando:

- `productId` ausente, inválido (não UUID) ou malformado
- `quantity` ausente, menor que 1, não inteiro ou não numérico
- Propriedades não permitidas no body
- Produto encontrado porém inativo (`isActive: false`)

### 401 Unauthorized

Deve ocorrer quando:

- Header `Authorization` ausente
- Formato do header inválido
- Token com assinatura inválida
- Token expirado
- Payload do token incompleto ou inválido

### 404 Not Found

Deve ocorrer quando:

- `POST /cart/items` com `productId` inexistente no products-service
- `DELETE /cart/items/:itemId` com item inexistente no carrinho ativo do usuário autenticado

### Falha de comunicação com products-service

Quando o products-service estiver indisponível ou retornar erro inesperado na busca do produto, o checkout deve responder com erro adequado de dependência (por exemplo **502** ou **503**), **sem** tratar a falha como “produto não encontrado” (**404**).

## Variáveis de ambiente

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

## Estrutura esperada (alto nível)

```text
checkout/
├── docs/
│   └── specs/
│       ├── 01-entities-and-jwt.md
│       └── 02-cart-management.md
├── src/
│   ├── cart/
│   │   ├── entities/              # Cart, CartItem (já existentes)
│   │   ├── dto/                   # DTOs de entrada do carrinho
│   │   ├── cart.controller.ts     # POST/GET/DELETE do carrinho
│   │   ├── cart.service.ts        # regras de negócio do carrinho
│   │   └── cart.module.ts         # registra controller/service/cliente
│   ├── products/                  # (ou pasta equivalente)
│   │   └── products-client...     # ProductsClientService + HttpModule
│   ├── auth/                      # inalterado nesta spec (já funcional)
│   ├── orders/                    # inalterado nesta spec
│   ├── events/                    # inalterado nesta spec
│   └── ...
├── .env.example                   # inclui PRODUCTS_SERVICE_URL
└── ...
```

A organização interna de pastas/arquivos pode variar desde que as responsabilidades acima estejam cobertas. Nomes exatos de arquivos são orientação, não obrigação rígida.

## Fora de escopo

Esta spec **não** inclui:

- Finalização de compra / checkout / criação de `Order`
- Endpoint dedicado de alteração de quantidade (PATCH/PUT de item)
- Validação de estoque (`stock`) na adição ao carrinho
- Limpeza automática de carrinhos abandonados ou mudança de status para `completed` / `abandoned`
- Integração com api-gateway (proxy de rotas de checkout)
- Alteração do `EventsModule`, `PaymentQueueService`, RabbitMQ ou filas
- RoleGuard ou restrição por papel (`seller` / `buyer`) no carrinho
- Cupons, frete, impostos, múltiplos carrinhos por usuário
- Atualização em background de snapshots quando o preço do produto muda no products-service
- Soft delete de itens
- Paginação de itens do carrinho

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — ProductsClientService**  
   Existe um cliente HTTP que busca produto por id via `GET {PRODUCTS_SERVICE_URL}/products/:id` usando `HttpModule` (`@nestjs/axios`).

2. **CA-02 — `PRODUCTS_SERVICE_URL` documentada**  
   `.env.example` documenta `PRODUCTS_SERVICE_URL`; o cliente usa essa variável como base da URL.

3. **CA-03 — POST /cart/items autenticado**  
   `POST /cart/items` existe, exige JWT válido e, sem token, responde **401**.

4. **CA-04 — Validação do body de adição**  
   Body sem `productId`, sem `quantity`, com `quantity < 1`, com UUID inválido ou com propriedades extras responde **400**.

5. **CA-05 — Produto inexistente**  
   Ao adicionar com `productId` inexistente no products-service, a API responde **404** e não altera o carrinho.

6. **CA-06 — Produto inativo**  
   Ao adicionar produto com `isActive: false`, a API responde **400** (ou o código de negócio documentado na implementação) e não altera o carrinho.

7. **CA-07 — Criação do carrinho ativo**  
   Na primeira adição bem-sucedida de um usuário sem carrinho ativo, um carrinho `status = "active"` é criado para `userId = req.user.id`.

8. **CA-08 — Snapshot no item**  
   O `CartItem` persistido contém `productName` e `price` iguais aos valores retornados pelo products-service no momento da adição (ou da soma, quando o produto já existia no carrinho).

9. **CA-09 — Subtotal e total**  
   `subtotal = price × quantity` no item; `total` do carrinho = soma de todos os subtotais após a operação.

10. **CA-10 — Soma de quantidade para produto repetido**  
    Adicionar novamente o mesmo `productId` não cria um segundo item; a quantidade é somada e o subtotal/total são recalculados.

11. **CA-11 — GET /cart com itens**  
    Usuário autenticado com carrinho ativo recebe **200** com itens e total corretos.

12. **CA-12 — GET /cart vazio**  
    Usuário autenticado sem carrinho ativo recebe **200** com representação vazia (`items` vazio e `total` `0`).

13. **CA-13 — DELETE remove item e recalcula**  
    `DELETE /cart/items/:itemId` remove o item do carrinho do usuário, recalcula o total e retorna **200** com o carrinho atualizado.

14. **CA-14 — DELETE de item inexistente / alheio**  
    Remover `itemId` inexistente no carrinho ativo do usuário responde **404**.

15. **CA-15 — Propriedade do carrinho**  
    Usuário A não consegue alterar/remover itens do carrinho do usuário B; tentativas resultam em **404** (ou falha equivalente sem vazamento).

16. **CA-16 — Sellers e buyers**  
    Usuários com `role` `"seller"` e `"buyer"` conseguem usar `POST /cart/items`, `GET /cart` e `DELETE /cart/items/:itemId` com token válido (sem 403 por papel).

17. **CA-17 — Um carrinho ativo por usuário**  
    Após múltiplas adições do mesmo usuário, existe no máximo um carrinho com `status = "active"` para aquele `userId`.

18. **CA-18 — Swagger atualizado**  
    A documentação em `/api` reflete os três endpoints de carrinho e o Bearer Auth necessário.

19. **CA-19 — EventsModule e Orders intactos**  
    `EventsModule` / RabbitMQ e o módulo de Orders permanecem sem alteração de comportamento nesta entrega; não há endpoint de finalização/checkout.

20. **CA-20 — Escopo respeitado**  
    Não há endpoint de alteração de quantidade, finalização de pedido, validação de estoque nem proxy de gateway nesta entrega.

## Ordem sugerida de implementação

1. Documentar `PRODUCTS_SERVICE_URL` no `.env.example` (e configurar no `.env` local)  
2. Criar o `ProductsClientService` com `HttpModule` e método `getProduct`  
3. Criar DTOs de entrada (`productId`, `quantity`, validação de `itemId` na rota)  
4. Implementar o service de carrinho: obter/criar carrinho ativo, adicionar/somar item, snapshot, recálculo de totais, remover item, consulta com representação vazia  
5. Expor o controller com `POST /cart/items`, `GET /cart` e `DELETE /cart/items/:itemId`  
6. Registrar controller, services e `HttpModule` no `CartModule` (e imports necessários)  
7. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e), mockando o products-service quando apropriado  
8. Validar manualmente o fluxo feliz e os erros (401, 400, 404) com products-service e JWT reais  
9. Conferir Swagger em `/api`

## Commits

Faça um único commit com tudo desta aula (spec). A implementação desta spec virá em entrega posterior, a partir do plano de implementação.
