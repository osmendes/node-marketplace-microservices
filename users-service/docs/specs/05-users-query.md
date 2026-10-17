# Spec: Endpoints de consulta de usuários no users-service

## Contexto

O `users-service` já possui scaffold NestJS, PostgreSQL com TypeORM, entidade `User` (`id`, `email`, `password`, `firstName`, `lastName`, `role`, `status`, `createdAt`, `updatedAt`), registro via `POST /auth/register`, login via `POST /auth/login` com JWT e proteção de rotas com `JwtAuthGuard` global e decorator `@Public()`.

Já estão disponíveis:

- `UsersModule` (ainda sem controller nem service de consulta)
- Entidade `User` e enums `UserRole` (`seller` | `buyer`) e `UserStatus` (`active` | `inactive`)
- Usuário autenticado em `req.user` com `{ id, email, role }` após validação do JWT
- Formato público de usuário (sem `password`) já usado em register e login

Esta spec define os **endpoints essenciais de consulta de usuários** para o marketplace: perfil do usuário autenticado, listagem de vendedores ativos e busca de usuário por ID.

Todos os endpoints desta spec são **protegidos** pelo `JwtAuthGuard` global (exigem token JWT válido). Nenhum deve ser marcado com `@Public()`.

CRUD completo, update, delete, listagem paginada, alteração de senha e filtros avançados ficam fora desta entrega.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência da entidade `User` |
| PostgreSQL | 15 (Compose existente) |
| Autenticação | `JwtAuthGuard` global (já ativo) |
| Identidade | `req.user` com `{ id, email, role }` |

## Requisitos funcionais

### RF-01 — UsersService e UsersController

Devem existir no `UsersModule`:

- Um **UsersService** responsável pelas consultas de usuários no banco
- Um **UsersController** responsável por expor os endpoints HTTP desta spec
- Registro de ambos no `UsersModule` existente

O módulo deve reutilizar a entidade `User` já existente, sem duplicar o modelo de dados nem alterar o schema.

### RF-02 — Ordem de declaração das rotas

A ordem de declaração das rotas no controller **importa**.

Rotas estáticas devem ser declaradas **antes** da rota dinâmica:

1. `GET /users/profile`
2. `GET /users/sellers`
3. `GET /users/:id`

Se `GET /users/:id` for declarado antes das rotas estáticas, caminhos como `profile` e `sellers` seriam interpretados como valores de `:id` e quebrariam o contrato.

### RF-03 — GET /users/profile

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/users/profile`
- **Autenticação:** obrigatória (JWT)
- **Comportamento:** retorna os dados completos e atualizados do usuário autenticado

O serviço deve:

1. Obter o `id` do usuário a partir de `req.user.id` (vindo do token JWT)
2. Buscar esse usuário no banco pelo ID
3. Retornar os dados públicos do usuário encontrado

A resposta **nunca** deve incluir o campo `password` (nem o hash).

Se o usuário do token não existir mais no banco, a API deve responder **404**.

### RF-04 — GET /users/sellers

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/users/sellers`
- **Autenticação:** obrigatória (JWT)
- **Comportamento:** retorna a lista de todos os usuários que sejam vendedores ativos

Critérios de filtro obrigatórios (ambos devem ser satisfeitos):

- `role` igual a `seller`
- `status` igual a `active`

Uso esperado: frontend e `products-service` para listar vendedores disponíveis no marketplace.

A resposta deve ser um **array** de usuários públicos. Cada item **nunca** deve incluir o campo `password`.

Lista vazia (nenhum seller ativo) deve retornar **200** com array vazio `[]`.

Não há paginação, ordenação customizada nem filtros adicionais nesta entrega.

### RF-05 — GET /users/:id

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/users/:id`
- **Autenticação:** obrigatória (JWT)
- **Parâmetro:** `id` — UUID do usuário
- **Comportamento:** retorna os dados públicos do usuário correspondente ao ID informado

Regras:

- Se o usuário existir, retornar **200** com os dados públicos
- Se o usuário **não** existir, retornar **404**
- A resposta **nunca** deve incluir o campo `password`

Este endpoint retorna o usuário independentemente de `role` ou `status` (não aplica o filtro de sellers ativos).

### RF-06 — Resposta sem senha

Qualquer resposta de sucesso dos três endpoints **nunca** deve incluir o campo `password` (nem o hash).

O formato público do usuário deve ser o **mesmo** já usado em register e login:

| Campo | Presente |
|---|---|
| `id` | Sim |
| `email` | Sim |
| `firstName` | Sim |
| `lastName` | Sim |
| `role` | Sim |
| `status` | Sim |
| `createdAt` | Sim |
| `updatedAt` | Sim |
| `password` | **Não** |

### RF-07 — Proteção JWT em todos os endpoints

Os três endpoints desta spec **não** devem ser marcados com `@Public()`.

Comportamento esperado (já garantido pelo `JwtAuthGuard` global):

- Token ausente, inválido ou expirado → **401 Unauthorized**
- Token válido → requisição segue para o handler com `req.user` preenchido

## Respostas esperadas

### 200 OK

| Endpoint | Corpo |
|---|---|
| `GET /users/profile` | Objeto do usuário público autenticado |
| `GET /users/sellers` | Array de usuários públicos com `role=seller` e `status=active` (pode ser vazio) |
| `GET /users/:id` | Objeto do usuário público correspondente ao ID |

### 401 Unauthorized

Deve ocorrer em qualquer um dos três endpoints quando:

- Header `Authorization` ausente
- Formato do header inválido
- Token com assinatura inválida
- Token expirado

Tratado automaticamente pelo `JwtAuthGuard` global. O controller não é executado.

### 404 Not Found

| Endpoint | Quando |
|---|---|
| `GET /users/profile` | Usuário do token não existe mais no banco |
| `GET /users/:id` | Nenhum usuário com o `id` informado |
| `GET /users/sellers` | **Não** aplica 404 por lista vazia (retorna 200 com `[]`) |

## Estrutura esperada (alto nível)

```text
users-service/
├── src/
│   └── users/
│       ├── entities/           # User (já existente)
│       ├── enums/              # UserRole, UserStatus (já existentes)
│       ├── users.service.ts    # Métodos de consulta
│       ├── users.controller.ts # Endpoints GET profile, sellers, :id
│       └── users.module.ts     # Registro de service e controller
└── docs/
    └── specs/
        └── 05-users-query.md
```

A organização interna deve seguir o padrão já usado no serviço. Nomes de pastas e arquivos podem variar desde que as responsabilidades acima estejam cobertas.

## Fora de escopo

Esta spec **não** inclui:

- Update de usuário (`PATCH` / `PUT`)
- Delete de usuário
- Listagem geral de usuários com paginação
- Alteração de senha
- Filtros adicionais (por nome, e-mail, status, etc.) além do filtro fixo de sellers ativos
- Ordenação customizada ou query params de busca
- RoleGuard ou autorização por papel (qualquer usuário autenticado pode chamar os três endpoints)
- Criação de novos usuários fora do fluxo de `POST /auth/register` já existente
- Integração com API Gateway, RabbitMQ ou outros serviços
- Alteração do schema da entidade `User`
- Alteração dos contratos de register, login ou guards

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — UsersService e UsersController registrados**  
   Existem `UsersService` e `UsersController` registrados no `UsersModule`.

2. **CA-02 — Ordem das rotas**  
   As rotas estáticas `profile` e `sellers` estão declaradas antes da rota dinâmica `:id`, de modo que `GET /users/profile` e `GET /users/sellers` não sejam capturados por `:id`.

3. **CA-03 — Profile com token válido**  
   `GET /users/profile` com JWT válido retorna **200** com os dados públicos do usuário cujo `id` é `req.user.id`, refletindo o estado atual no banco.

4. **CA-04 — Profile sem senha**  
   A resposta de `GET /users/profile` **não** contém o campo `password`.

5. **CA-05 — Profile sem token**  
   `GET /users/profile` sem token (ou com token inválido/expirado) retorna **401**.

6. **CA-06 — Sellers filtra role e status**  
   `GET /users/sellers` com JWT válido retorna **200** com um array contendo **apenas** usuários com `role=seller` **e** `status=active`.

7. **CA-07 — Sellers sem senha**  
   Nenhum item da lista de `GET /users/sellers` contém o campo `password`.

8. **CA-08 — Sellers lista vazia**  
   Quando não houver sellers ativos, `GET /users/sellers` retorna **200** com `[]`.

9. **CA-09 — Sellers sem token**  
   `GET /users/sellers` sem token (ou com token inválido/expirado) retorna **401**.

10. **CA-10 — Get by id com sucesso**  
    `GET /users/:id` com JWT válido e ID existente retorna **200** com os dados públicos desse usuário.

11. **CA-11 — Get by id 404**  
    `GET /users/:id` com JWT válido e ID inexistente retorna **404**.

12. **CA-12 — Get by id sem senha**  
    A resposta de `GET /users/:id` **não** contém o campo `password`.

13. **CA-13 — Get by id sem token**  
    `GET /users/:id` sem token (ou com token inválido/expirado) retorna **401**.

14. **CA-14 — Formato público consistente**  
    As respostas de sucesso dos três endpoints usam o mesmo formato público de usuário já usado em register/login (`id`, `email`, `firstName`, `lastName`, `role`, `status`, `createdAt`, `updatedAt`).

15. **CA-15 — Escopo respeitado**  
    Não há endpoints de update, delete, listagem paginada, alteração de senha nem RoleGuard nesta entrega.

## Ordem sugerida de implementação

1. Criar o `UsersService` com os métodos de consulta (perfil pelo ID do token, sellers ativos, usuário por ID)  
2. Criar o `UsersController` declarando as rotas na ordem: `profile` → `sellers` → `:id`  
3. Registrar service e controller no `UsersModule`  
4. Garantir que nenhum dos três endpoints use `@Public()`  
5. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e)  
6. Validar manualmente: profile, sellers (com e sem resultados), get by id (200 e 404), e 401 sem token em todos

## Commits

Faça sempre um commit após a implementação de cada item desta spec.
