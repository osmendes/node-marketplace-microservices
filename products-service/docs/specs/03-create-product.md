# Spec: Criação de produto no products-service

## Contexto

O `products-service` (porta `3001`) já possui:

- Scaffold NestJS com PostgreSQL (`products_db`, porta host `5436`) e TypeORM
- Entidade `Product` (`id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt`, `updatedAt`)
- Autenticação JWT funcionando: AuthModule de validação, JwtAuthGuard global, decorator `@Public()`, e `req.user` com `{ id, email, role }` após token válido

O `sellerId` do produto é o identificador do usuário autenticado. Deve vir do token JWT (`req.user.id`), **nunca** do corpo da requisição.

Apenas usuários com `role` igual a `"seller"` podem criar produtos. Usuários com `role` `"buyer"` (ou qualquer outro valor diferente de `"seller"`) devem receber **403 Forbidden**.

Esta spec define **apenas a criação de produto** via `POST /products`. Consultas, atualização, exclusão, upload de imagens e categorias ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência da entidade `Product` (já mapeada) |
| PostgreSQL | 15 (Compose existente) |
| Validação | `class-validator` + `class-transformer` (ValidationPipe global já habilitado) |
| Autenticação | JwtAuthGuard global já ativo; rota de criação **não** é pública |

## Requisitos funcionais

### RF-01 — ProductsService e ProductsController

Deve existir um serviço de produtos e um controller de produtos, registrados no `ProductsModule` já existente.

Responsabilidades mínimas nesta entrega:

- **ProductsController:** expor o endpoint de criação e orquestrar a leitura do usuário autenticado
- **ProductsService:** aplicar a regra de autorização de papel (`seller`), montar os dados persistidos e gravar o produto no banco

O `ProductsModule` deve continuar exportando o que já exporta hoje e passar a disponibilizar o controller e o service de criação.

### RF-02 — Endpoint de criação

Deve existir o endpoint:

- **Método:** `POST`
- **Caminho:** `/products`
- **Autenticação:** obrigatória (rota **sem** `@Public()`; protegida pelo JwtAuthGuard global)
- **Corpo:** dados de criação do produto (DTO descrito abaixo — **sem** `sellerId`)
- **Comportamento:** validar a entrada, garantir que o usuário autenticado é `seller`, persistir o produto e retornar o produto criado

### RF-03 — `sellerId` a partir do JWT

O campo `sellerId` **não** faz parte do corpo da requisição.

Antes da persistência:

1. O serviço deve obter o identificador do usuário autenticado em `req.user.id`
2. Esse valor deve ser gravado como `sellerId` do produto
3. Se o cliente enviar `sellerId` (ou qualquer outro campo não declarado no DTO) no body, a validação deve rejeitar a propriedade não permitida (comportamento já esperado do ValidationPipe global com `forbidNonWhitelisted`)

### RF-04 — Autorização por papel (`seller`)

Antes de criar o produto, o serviço deve verificar se `req.user.role` é `"seller"`.

- Se o papel **não** for `"seller"`, a operação deve falhar com **HTTP 403 (Forbidden)**
- A mensagem de erro deve indicar claramente que apenas vendedores podem criar produtos
- Nenhum registro novo deve ser criado nesse caso

Essa verificação ocorre **depois** da autenticação JWT bem-sucedida (já garantida pelo guard global). Um buyer autenticado chega ao handler com `req.user` preenchido e ainda assim recebe 403.

Não é necessário criar um RoleGuard genérico nesta entrega: a checagem de papel pode ficar no fluxo de criação de produto (controller ou service), desde que o comportamento e os códigos HTTP estejam corretos.

### RF-05 — `isActive` automático

Na criação, o campo `isActive` deve ser definido automaticamente como `true`.

O cliente **não** deve enviar `isActive` no corpo da requisição. Se enviar, a validação deve rejeitar a propriedade não permitida.

### RF-06 — Validação de entrada

Os dados de entrada devem ser validados conforme o DTO de criação.

Em caso de dados inválidos, a API deve responder com **HTTP 400 (Bad Request)** e mensagens de erro claras (campo e motivo).

Campos obrigatórios ausentes, tipos incorretos, limites violados e propriedades extras devem resultar em 400.

### RF-07 — Persistência e resposta

Com autenticação válida, papel `seller` e body válido, o serviço deve:

1. Persistir um novo registro na tabela de produtos
2. Preencher `id`, `createdAt` e `updatedAt` automaticamente
3. Retornar **HTTP 201 (Created)** com o produto criado, incluindo os campos persistidos (`id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt`, `updatedAt`)

## Estrutura de dados

### DTO de criação (corpo de `POST /products`)

O corpo **não** inclui `sellerId`, `isActive`, `id`, `createdAt` nem `updatedAt`.

| Campo | Obrigatório | Regras |
|---|---|---|
| `name` | Sim | String; máximo de 255 caracteres |
| `description` | Sim | Texto livre (string não vazia) |
| `price` | Sim | Número decimal com até 2 casas; mínimo `0.01` |
| `stock` | Sim | Número inteiro; mínimo `0` |

Campos **não** aceitos no corpo (entre outros): `id`, `sellerId`, `isActive`, `createdAt`, `updatedAt`.

### Entidade persistida (reuso)

A persistência continua na entidade `Product` já existente:

| Campo | Origem na criação |
|---|---|
| `id` | Gerado automaticamente (UUID) |
| `name` | Vindo do DTO |
| `description` | Vindo do DTO |
| `price` | Vindo do DTO |
| `stock` | Vindo do DTO |
| `sellerId` | Definido pelo serviço a partir de `req.user.id` |
| `isActive` | Definido pelo serviço como `true` |
| `createdAt` | Preenchido automaticamente |
| `updatedAt` | Preenchido automaticamente |

### Resposta de sucesso (produto criado)

| Campo | Presente |
|---|---|
| `id` | Sim |
| `name` | Sim |
| `description` | Sim |
| `price` | Sim |
| `stock` | Sim |
| `sellerId` | Sim (igual a `req.user.id` do token) |
| `isActive` | Sim (`true`) |
| `createdAt` | Sim |
| `updatedAt` | Sim |

## Fluxo esperado de uma requisição

### Sucesso (seller autenticado, body válido)

1. Requisição `POST /products` chega com `Authorization: Bearer <token>`
2. JwtAuthGuard valida o token e injeta `{ id, email, role }` em `req.user`
3. ValidationPipe valida o body conforme o DTO de criação
4. O fluxo de criação verifica que `req.user.role === "seller"`
5. O produto é persistido com `sellerId = req.user.id` e `isActive = true`
6. A API responde **201** com o produto criado

### Buyer autenticado

1. Token válido de um usuário com `role: "buyer"`
2. Guard libera a autenticação; `req.user` é preenchido
3. A verificação de papel falha
4. A API responde **403**; nenhum produto é criado

### Sem autenticação ou token inválido

1. Requisição sem token, com token expirado, assinatura inválida ou payload incompleto
2. JwtAuthGuard rejeita a autenticação
3. A API responde **401**; o handler de criação **não** é executado

### Dados inválidos

1. Seller autenticado envia body inválido (campo ausente, tipo errado, limite violado ou propriedade extra)
2. A validação rejeita a entrada
3. A API responde **400** com mensagens claras; nenhum produto é criado

## Respostas esperadas

### 201 Created

Produto criado com sucesso. Corpo contém o produto persistido (incluindo `id`, `sellerId`, `isActive: true`, timestamps).

### 400 Bad Request

Deve ocorrer quando:

- Campos obrigatórios ausentes (`name`, `description`, `price`, `stock`)
- `name` com mais de 255 caracteres
- `description` vazia ou inválida
- `price` menor que `0.01`, sem precisão adequada, ou não numérico
- `stock` negativo, não inteiro, ou não numérico
- Propriedades não permitidas no body (ex.: `sellerId`, `isActive`, `id`)

### 401 Unauthorized

Deve ocorrer quando:

- Header `Authorization` ausente
- Formato do header inválido
- Token com assinatura inválida
- Token expirado
- Payload do token incompleto ou inválido

Nesses casos, o handler de criação não deve ser executado.

### 403 Forbidden

Deve ocorrer quando:

- O token é válido, mas `req.user.role` **não** é `"seller"` (ex.: `"buyer"`)

Nenhum produto deve ser persistido.

## Estrutura esperada (alto nível)

```text
products-service/
├── src/
│   ├── products/
│   │   ├── dto/                 # DTO de criação (sem sellerId)
│   │   ├── entities/            # Product (já existente)
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   └── products.module.ts   # registra controller + service
│   └── auth/                    # inalterado nesta spec
└── docs/
    └── specs/
        └── 03-create-product.md
```

A organização interna deve seguir o padrão já usado no monorepo (`users-service`). Nomes de pastas e arquivos podem variar desde que as responsabilidades acima estejam cobertas.

## Fora de escopo

Esta spec **não** inclui:

- Endpoints de consulta (`GET`), atualização (`PATCH`/`PUT`) ou exclusão (`DELETE`) de produtos
- Upload de imagens
- Categorias de produtos
- RoleGuard genérico reutilizável (a checagem de `seller` nesta entrega fica no fluxo de criação)
- Integração com API Gateway, RabbitMQ ou outros serviços
- Alteração do schema da entidade `Product`
- Soft delete, paginação, busca ou filtros
- Alteração do AuthModule, JwtStrategy, JwtAuthGuard ou do decorator `@Public()`
- Emissão local de JWT (continua sendo responsabilidade exclusiva do `users-service`)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Controller e service registrados**  
   Existem `ProductsController` e `ProductsService` registrados no `ProductsModule`.

2. **CA-02 — Endpoint disponível**  
   `POST /products` existe e responde conforme os casos abaixo.

3. **CA-03 — Criação por seller**  
   Com token JWT válido de um usuário `seller` e body válido, a API responde **201** e o produto é persistido no banco.

4. **CA-04 — `sellerId` do token**  
   O `sellerId` do produto criado é igual a `req.user.id` (claim `sub` do token). Enviar `sellerId` no body resulta em **400**.

5. **CA-05 — `isActive` automático**  
   Todo produto criado nasce com `isActive = true`. Enviar `isActive` no body resulta em **400**.

6. **CA-06 — Buyer recebe 403**  
   Com token JWT válido de um usuário `buyer` e body válido, a API responde **403** e nenhum produto é criado.

7. **CA-07 — Sem token / token inválido**  
   Sem token, com token inválido ou expirado, `POST /products` responde **401**.

8. **CA-08 — Validação de `name`**  
   `name` ausente ou com mais de 255 caracteres resulta em **400** com mensagem clara.

9. **CA-09 — Validação de `description`**  
   `description` ausente ou inválida resulta em **400** com mensagem clara.

10. **CA-10 — Validação de `price`**  
    `price` ausente, menor que `0.01` ou inválido resulta em **400** com mensagem clara.

11. **CA-11 — Validação de `stock`**  
    `stock` ausente, negativo, não inteiro ou inválido resulta em **400** com mensagem clara.

12. **CA-12 — Resposta 201 completa**  
    A resposta de sucesso inclui `id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt` e `updatedAt`.

13. **CA-13 — Escopo respeitado**  
    Não há endpoints de consulta, update ou delete de produtos; não há upload de imagens nem categorias nesta entrega.

## Ordem sugerida de implementação

1. Criar o DTO de criação com as regras de validação (sem `sellerId` / `isActive`)  
2. Implementar `ProductsService` com persistência e definição automática de `sellerId` e `isActive`  
3. Implementar a verificação de papel `seller` (403 para demais)  
4. Implementar `ProductsController` com `POST /products` (rota protegida; sem `@Public()`)  
5. Registrar controller e service no `ProductsModule`  
6. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e)  
7. Validar manualmente os quatro cenários principais: seller → 201; buyer → 403; sem token → 401; body inválido → 400

## Commits

Faça um único commit com a implementação completa desta spec.
