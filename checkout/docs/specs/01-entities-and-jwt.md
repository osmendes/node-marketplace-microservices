# Spec: Entidades de domínio e autenticação JWT no checkout-service

## Contexto

O `checkout-service` (pasta `checkout/`, porta HTTP `3003`) já possui:

- Scaffold NestJS
- PostgreSQL via Docker Compose (`checkout_db`, porta host `5434`)
- TypeORM configurado (`database.config.ts`, `synchronize` fora de produção)
- Integração com RabbitMQ (`EventsModule` com `PaymentQueueService`)

O serviço **não** possui entidades de domínio — o TypeORM não cria tabelas de negócio. O serviço **não** possui autenticação JWT.

O `users-service` (porta `3000`) gera tokens JWT com payload:

| Claim | Tipo | Descrição |
|---|---|---|
| `sub` | UUID | Identificador do usuário |
| `email` | string | E-mail do usuário |
| `role` | `"seller"` \| `"buyer"` | Papel do usuário |

O `JWT_SECRET` é **compartilhado** entre os serviços (mesmo valor). O `products-service` já implementou validação JWT seguindo o padrão: `AuthModule`, `JwtStrategy`, `JwtAuthGuard` global e decorator `@Public()`. Esta spec deve **copiar a mesma abordagem** no checkout.

Esta entrega define as **entidades de domínio** (Cart, CartItem, Order), os **módulos** `CartModule` e `OrdersModule`, a **autenticação JWT**, o **health check público**, o **Swagger básico** e o **registro no AppModule**. Endpoints CRUD de carrinho/pedido ficam para specs futuras. O `EventsModule` existente **não** deve ser alterado.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Já presente; entidades novas registradas via `forFeature` |
| PostgreSQL | Já presente (`checkout_db`, host `5434`) |
| JWT | `@nestjs/jwt` (já presente ou alinhado ao monorepo) |
| Passport | `@nestjs/passport`, `passport`, `passport-jwt` (já presentes ou alinhados) |
| Guards | Guard global via `APP_GUARD` |
| Metadata | Decorator de rota pública via metadata do NestJS |
| Documentação | Swagger / OpenAPI (`@nestjs/swagger`) |
| Config | `@nestjs/config` (já presente) para ler `JWT_SECRET` |

As versões das dependências JWT/Passport/Swagger devem alinhar-se às usadas no `products-service` / monorepo.

## Requisitos funcionais

### RF-01 — Entidade Cart

Deve existir a entidade TypeORM `Cart` com **apenas** os campos abaixo.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | Gerado automaticamente |
| `userId` | UUID | Identificador do usuário dono do carrinho; sem FK para outro serviço |
| `status` | enum | Valores: `active`, `completed`, `abandoned`; default `active` |
| `total` | decimal | Precisão `(10,2)`; default `0` |
| `items` | OneToMany → `CartItem` | Relação com cascade e eager loading |
| `createdAt` | timestamp | Preenchido automaticamente na criação |
| `updatedAt` | timestamp | Atualizado automaticamente em alterações |

### RF-02 — Entidade CartItem

Deve existir a entidade TypeORM `CartItem` com **apenas** os campos abaixo.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | Gerado automaticamente |
| `cart` | ManyToOne → `Cart` | Relação com `onDelete: CASCADE` |
| `cartId` | UUID | Chave estrangeira para o carrinho |
| `productId` | UUID | Identificador do produto; sem FK para o products-service |
| `productName` | varchar | Máximo 255 caracteres |
| `price` | decimal | Precisão `(10,2)` |
| `quantity` | int | Default `1` |
| `subtotal` | decimal | Precisão `(10,2)` |
| `createdAt` | timestamp | Preenchido automaticamente na criação |

### RF-03 — Entidade Order

Deve existir a entidade TypeORM `Order` com **apenas** os campos abaixo.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | Gerado automaticamente |
| `userId` | UUID | Identificador do usuário; sem FK para outro serviço |
| `cartId` | UUID | Identificador do carrinho associado; sem exigência de FK formal nesta entrega |
| `total` | decimal | Precisão `(10,2)` |
| `status` | enum | Valores: `pending`, `paid`, `failed`, `cancelled`; default `pending` |
| `paymentMethod` | varchar | Máximo 50 caracteres |
| `createdAt` | timestamp | Preenchido automaticamente na criação |
| `updatedAt` | timestamp | Atualizado automaticamente em alterações |

### RF-04 — CartModule

Deve existir um `CartModule` que:

1. Registre as entidades `Cart` e `CartItem` no TypeORM via `TypeOrmModule.forFeature`
2. Seja importado no módulo raiz da aplicação
3. **Não** exponha controllers, endpoints HTTP, DTOs de API ou serviços de negócio nesta entrega

### RF-05 — OrdersModule

Deve existir um `OrdersModule` que:

1. Registre a entidade `Order` no TypeORM via `TypeOrmModule.forFeature`
2. Seja importado no módulo raiz da aplicação
3. **Não** exponha controllers, endpoints HTTP, DTOs de API ou serviços de negócio nesta entrega

### RF-06 — AuthModule de validação (sem login/register)

Deve existir um `AuthModule` no checkout responsável **apenas** pela validação de JWT, seguindo o mesmo padrão do `products-service`.

O módulo deve:

1. Configurar o `JwtModule` com o secret obtido de `JWT_SECRET`
2. Registrar Passport com a estratégia JWT
3. Expor a `JwtStrategy` necessária ao guard
4. **Não** criar controllers nem endpoints de autenticação (`/auth/login`, `/auth/register` ou equivalentes)
5. Seguir a mesma abordagem estrutural do AuthModule do `products-service`

### RF-07 — JwtStrategy (Passport)

Deve existir uma estratégia Passport JWT responsável por:

1. Extrair o token JWT do header `Authorization` no formato `Bearer <token>`
2. Validar a assinatura do token com o mesmo secret do `users-service` (`JWT_SECRET`)
3. Validar a expiração do token (tokens expirados devem ser rejeitados)
4. Em caso de token válido, disponibilizar um objeto de usuário autenticado derivado do payload

O objeto disponibilizado após a validação deve conter:

| Campo | Origem |
|---|---|
| `id` | Claim `sub` do payload |
| `email` | Claim `email` do payload |
| `role` | Claim `role` do payload |

Esse objeto deve ficar disponível em `req.user` em todas as rotas protegidas que passarem pelo guard.

Payload incompleto ou inválido (ausência de `sub`, `email` ou `role`) deve resultar em falha de autenticação.

A ausência de `JWT_SECRET` na configuração deve impedir a inicialização correta da estratégia (falha explícita).

### RF-08 — JwtAuthGuard global

Deve existir um guard de autenticação JWT que:

1. Utilize a estratégia Passport JWT
2. Antes de exigir autenticação, verifique se a rota possui o metadata `isPublic`
3. Se a rota for pública (`isPublic`), permita o acesso **sem** exigir token
4. Se a rota **não** for pública, exija e valide o token normalmente
5. Em caso de sucesso na validação, garanta que os dados do usuário autenticado estejam em `req.user`

O guard deve ser registrado como **guard global** (`APP_GUARD`), de forma que **todas** as rotas da aplicação fiquem protegidas por padrão, salvo as explicitamente marcadas como públicas.

### RF-09 — Decorator `@Public()`

Deve existir um decorator `@Public()` que:

1. Marque uma rota (ou controller) como pública
2. Utilize metadata do NestJS (`isPublic`) para comunicar essa intenção ao JwtAuthGuard
3. Permita acesso à rota sem header `Authorization` e sem token válido

### RF-10 — Rotas públicas nesta entrega

As rotas abaixo **devem** ser públicas (`@Public()`):

| Método | Caminho | Observação |
|---|---|---|
| `GET` | `/` | Hello World existente; permanece acessível sem autenticação |
| `GET` | `/health` | Health check (RF-11) |

Qualquer outra rota existente ou futura **sem** `@Public()` passa a exigir JWT válido.

### RF-11 — GET /health

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/health`
- **Autenticação:** **não** requerida (rota pública)
- **Uso:** health check do serviço / futuro uso pelo api-gateway

Corpo de sucesso (**200**):

```json
{
  "status": "ok",
  "service": "checkout-service"
}
```

O endpoint deve responder mesmo sem header `Authorization`.

### RF-12 — Swagger básico

O checkout deve expor documentação OpenAPI automática com:

| Item | Valor / regra |
|---|---|
| Caminho de acesso | `/api` |
| Título | `Checkout Service` |
| Versão | `1.0` |
| Autenticação no Swagger | Suporte a Bearer Auth (JWT) para experimentar rotas protegidas futuras |

A configuração do Swagger deve ser feita no bootstrap da aplicação (`main.ts`). Nesta entrega, a documentação deve refletir pelo menos as rotas públicas existentes (`GET /`, `GET /health`).

### RF-13 — Variável de ambiente `JWT_SECRET`

O serviço deve passar a exigir/documentar a variável `JWT_SECRET`:

| Variável | Descrição | Observação |
|---|---|---|
| `JWT_SECRET` | Secret compartilhado com o `users-service` para validar tokens | Mesmo valor usado na emissão no `users-service` |

O arquivo de exemplo de ambiente (`.env.example`) deve documentar `JWT_SECRET` (e manter as variáveis de banco/porta já existentes), sem commitar segredos reais.

### RF-14 — Integração no AppModule

O módulo raiz deve registrar:

1. `CartModule`
2. `OrdersModule`
3. `AuthModule`
4. `JwtAuthGuard` como guard global (`APP_GUARD`)

Regras desta entrega:

- **Não** alterar o `EventsModule` existente (RabbitMQ / `PaymentQueueService`)
- **Não** criar endpoints CRUD de carrinho, item ou pedido
- **Não** criar endpoints de login/register
- **Não** implementar RoleGuard
- Manter `ConfigModule` global e TypeORM root já existentes

## Fluxo esperado de uma requisição autenticada

### Rota pública (`@Public()`)

1. Requisição chega ao serviço
2. JwtAuthGuard identifica o metadata `isPublic`
3. Acesso é liberado sem validação de token
4. Controller processa a requisição normalmente

### Rota protegida (sem `@Public()`)

1. Requisição chega ao serviço
2. JwtAuthGuard verifica que a rota **não** é pública
3. Extrai o token do header `Authorization: Bearer <token>`
4. JwtStrategy valida assinatura e expiração com `JWT_SECRET`
5. Em caso de sucesso, injeta `{ id, email, role }` em `req.user`
6. Controller processa a requisição com acesso aos dados do usuário autenticado

### Rota protegida com falha de autenticação

1. Requisição chega sem token, com token expirado, com assinatura inválida, ou com payload incompleto
2. JwtAuthGuard / JwtStrategy rejeitam a autenticação
3. A API responde **401 Unauthorized**
4. O controller **não** é executado

## Validação do token

| Aspecto | Comportamento esperado |
|---|---|
| Origem do token | Header `Authorization: Bearer <token>` |
| Assinatura | Validada com o mesmo `JWT_SECRET` do `users-service` |
| Expiração | Validada automaticamente; token expirado → **401** |
| Payload válido | Claims `sub`, `email` e `role` presentes |
| Resultado em sucesso | `req.user` = `{ id, email, role }` (`id` derivado de `sub`) |
| Resultado em falha | **401 Unauthorized**; handler da rota não executa |

Tokens emitidos pelo `users-service` com o secret compartilhado devem ser aceitos pelo checkout sem reemissão local.

## Estrutura de dados (resumo)

### Enums

| Enum | Valores | Default na entidade |
|---|---|---|
| Status do carrinho | `active`, `completed`, `abandoned` | `active` (`Cart`) |
| Status do pedido | `pending`, `paid`, `failed`, `cancelled` | `pending` (`Order`) |

### Relacionamentos

| De | Para | Cardinalidade | Observações |
|---|---|---|---|
| `Cart` | `CartItem` | OneToMany | Cascade + eager |
| `CartItem` | `Cart` | ManyToOne | `onDelete: CASCADE`; expõe `cartId` |

Não há FK entre bancos de serviços distintos (`userId`, `productId` e `cartId` em Order são UUIDs de referência lógica).

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

## Estrutura esperada (alto nível)

```text
checkout/
├── docs/
│   └── specs/
│       └── 01-entities-and-jwt.md
├── src/
│   ├── auth/
│   │   ├── strategies/          # JwtStrategy (Passport)
│   │   ├── guards/              # JwtAuthGuard
│   │   ├── decorators/          # @Public()
│   │   └── auth.module.ts       # JwtModule + Passport + strategy (sem controllers de auth)
│   ├── cart/
│   │   ├── entities/            # Cart, CartItem
│   │   └── cart.module.ts       # TypeOrmModule.forFeature([Cart, CartItem])
│   ├── orders/
│   │   ├── entities/            # Order
│   │   └── orders.module.ts     # TypeOrmModule.forFeature([Order])
│   ├── events/                  # inalterado nesta spec
│   ├── app.controller.ts        # GET / e GET /health públicos
│   ├── app.module.ts            # CartModule + OrdersModule + AuthModule + APP_GUARD
│   └── main.ts                  # Swagger em /api
├── .env.example                 # inclui JWT_SECRET
└── ...
```

A organização interna deve espelhar o padrão do `products-service` para auth (`strategies/`, `guards/`, `decorators/`). Nomes de pastas e arquivos podem variar desde que as responsabilidades acima estejam cobertas.

## Respostas esperadas

### GET /health (público)

- **200** com corpo `{ "status": "ok", "service": "checkout-service" }`
- Acessível sem token

### GET / (público)

- Continua respondendo como hoje **sem** exigir token (Hello World)

### 401 Unauthorized (rotas protegidas)

Deve ocorrer quando:

- Header `Authorization` ausente
- Formato do header inválido (não é `Bearer <token>`)
- Token com assinatura inválida
- Token expirado
- Payload do token incompleto ou inválido

Nesses casos, a rota protegida não deve ser processada.

### Documentação Swagger

- UI/docs acessível em `/api`
- Título `Checkout Service`, versão `1.0`
- Bearer Auth configurado para uso futuro

## Fora de escopo

Esta spec **não** inclui:

- Endpoints CRUD de carrinho, item de carrinho ou pedido
- Controllers ou services de negócio para Cart/Order
- Endpoints de login ou registro (responsabilidade exclusiva do `users-service`)
- RoleGuard, SessionGuard ou qualquer guard baseado em papéis/permissões
- Verificação de `role` nos controllers/services (fica para specs futuras; nesta entrega o `role` apenas chega em `req.user`)
- Alteração do `EventsModule`, `PaymentQueueService`, RabbitMQ ou filas existentes
- Integração com api-gateway (proxy de rotas de checkout)
- Refresh tokens, sessions, logout, blacklist de tokens
- Alteração do payload JWT (`sub`, `email`, `role`) ou da política de expiração definida no `users-service`
- Emissão local de JWT (o checkout só valida)
- Migração formal de schema (usa-se `synchronize` já existente fora de produção)
- FK entre `Order.cartId` e a tabela de carrinhos (referência lógica por UUID nesta entrega)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Entidade Cart**  
   Existe a entidade `Cart` com os campos e regras do RF-01 (incluindo enum de status com default `active`, `total` decimal `(10,2)` default `0`, e relação OneToMany com cascade + eager para `CartItem`).

2. **CA-02 — Entidade CartItem**  
   Existe a entidade `CartItem` com os campos e regras do RF-02 (incluindo ManyToOne para `Cart` com `onDelete: CASCADE`, `productName` varchar 255, `quantity` default `1` e decimais `(10,2)`).

3. **CA-03 — Entidade Order**  
   Existe a entidade `Order` com os campos e regras do RF-03 (incluindo enum de status com default `pending` e `paymentMethod` varchar 50).

4. **CA-04 — Tabelas criadas no banco**  
   Com o serviço em execução contra `checkout_db` (porta host `5434`) e `synchronize` habilitado fora de produção, as tabelas correspondentes a Cart, CartItem e Order existem no PostgreSQL com as colunas esperadas.

5. **CA-05 — CartModule e OrdersModule**  
   Existem `CartModule` e `OrdersModule` registrando as entidades via `TypeOrmModule.forFeature`, importados no AppModule, **sem** controllers/endpoints CRUD nesta entrega.

6. **CA-06 — AuthModule presente**  
   Existe um AuthModule com JwtModule/Passport/JwtStrategy, **sem** controllers ou endpoints de login/register, no mesmo padrão do `products-service`.

7. **CA-07 — Guard global ativo**  
   Existe um JwtAuthGuard registrado como `APP_GUARD`, de modo que rotas sem `@Public()` exijam autenticação automaticamente.

8. **CA-08 — Decorator `@Public()`**  
   O decorator `@Public()` existe e marca a rota com metadata `isPublic` reconhecido pelo guard.

9. **CA-09 — Rotas públicas**  
   `GET /` e `GET /health` sem token continuam acessíveis; `GET /health` responde **200** com `{ "status": "ok", "service": "checkout-service" }`.

10. **CA-10 — Rota protegida sem token**  
    Qualquer rota sem `@Public()` acessada sem token responde **401**.

11. **CA-11 — Token inválido**  
    Rota protegida com token de assinatura inválida responde **401**.

12. **CA-12 — Token expirado**  
    Rota protegida com token expirado responde **401**.

13. **CA-13 — Token válido injeta `req.user`**  
    Com token válido emitido com o `JWT_SECRET` compartilhado, a estratégia disponibiliza em `req.user` um objeto contendo `id` (igual ao `sub` do payload), `email` e `role`.

14. **CA-14 — Extração Bearer**  
    O token é lido exclusivamente do header `Authorization` no formato `Bearer <token>`.

15. **CA-15 — Secret compartilhado documentado**  
    `.env.example` documenta `JWT_SECRET`; a validação usa o mesmo secret configurado no `users-service`.

16. **CA-16 — Interoperabilidade com users-service**  
    Um JWT obtido via `POST /auth/login` no `users-service` (mesmo `JWT_SECRET`) é aceito pelo checkout em rota protegida.

17. **CA-17 — Swagger básico**  
    A documentação está acessível em `/api`, com título `Checkout Service`, versão `1.0` e suporte a Bearer Auth.

18. **CA-18 — EventsModule intacto**  
    O `EventsModule` existente (RabbitMQ / `PaymentQueueService`) permanece sem alterações de comportamento ou contrato nesta entrega.

19. **CA-19 — Escopo respeitado**  
    Não há endpoints CRUD de Cart/CartItem/Order, login/register, RoleGuard, SessionGuard, refresh tokens, sessions ou logout nesta entrega.

> **Nota de verificação (CA-10..CA-13):** enquanto não houver endpoint de negócio protegido em produção, os critérios de rota protegida podem ser exercidos via testes unitários do guard/strategy e/ou rota harness-only de e2e (por exemplo `GET /__test/protected` registrada apenas no TestingModule), no mesmo espírito do `products-service` e do `users-service`.

## Ordem sugerida de implementação

1. Garantir dependências JWT/Passport/Swagger alinhadas ao monorepo (adicionar apenas o que faltar)  
2. Documentar `JWT_SECRET` no `.env.example`  
3. Criar enums e entidades `Cart`, `CartItem` e `Order` conforme RF-01..RF-03  
4. Criar `CartModule` e `OrdersModule` com `TypeOrmModule.forFeature`  
5. Criar o AuthModule com JwtModule + Passport (somente validação)  
6. Criar a JwtStrategy conforme RF-07  
7. Criar o decorator `@Public()` e o JwtAuthGuard com bypass para rotas públicas  
8. Registrar CartModule, OrdersModule, AuthModule e JwtAuthGuard (`APP_GUARD`) no AppModule **sem** alterar o EventsModule  
9. Expor `GET /health` público e marcar `GET /` com `@Public()`  
10. Configurar Swagger básico em `main.ts` (`/api`, título, versão, Bearer Auth)  
11. Subir o serviço e verificar criação das tabelas no PostgreSQL (`checkout_db` / host `5434`)  
12. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e, incluindo harness de rota protegida se necessário)  
13. Validar manualmente: `GET /` e `GET /health` sem token; `/api` com Swagger; rota protegida sem token / token inválido / expirado (**401**); token válido do `users-service` (`req.user` preenchido)

## Commits

Faça um único commit com tudo desta aula (spec). A implementação desta spec virá em entrega posterior, a partir do plano de implementação.
