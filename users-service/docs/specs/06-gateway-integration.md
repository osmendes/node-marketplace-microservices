# Spec: Integração do users-service ao api-gateway

## Contexto

O `users-service` (porta **3000**) já está completo com:

- Registro (`POST /auth/register`) e login JWT (`POST /auth/login`)
- Proteção de rotas com `JwtAuthGuard` global e decorator `@Public()`
- Endpoints de consulta protegidos: `GET /users/profile`, `GET /users/sellers`, `GET /users/:id`
- Usuário autenticado em `req.user` com `{ id, email, role }` após validação do JWT

O `api-gateway` (porta **3005**) já possui:

- Proxy service com circuit breaker, retry, timeout e fallback
- Tratamento de erros **4xx** no `ProxyService` / `RetryService` / `CircuitBreakerService`: erros de cliente do backend são **repassados** ao consumidor (sem retry e sem acionar o circuit breaker)
- Guards de autenticação (JWT e Session)
- Health checks que consultam `GET /health` nos serviços configurados
- Swagger
- Configuração de `USERS_SERVICE_URL` via variável de ambiente
- Padrão de integração via proxy já aplicado em `/products/*` (referência: controller/módulo de products no gateway que usa `ProxyService.proxyRequest()`)

### Problema arquitetural a corrigir

Hoje as rotas `/auth/*` no api-gateway **não** passam pelo `ProxyService`. O `AuthController` do gateway delega para um `AuthService` que faz chamadas HTTP **diretas** ao users-service via `HttpService`, contornando a infraestrutura de resiliência (circuit breaker, retry, timeout, fallback) e engolindo erros do backend — por exemplo, um **409 Conflict** na rota de registro vira um **401** genérico.

O padrão correto já está estabelecido na integração do products-service (`products-service/docs/specs/05-gateway-integration.md`): o controller do gateway usa `ProxyService.proxyRequest()` para todas as rotas do domínio.

Esta spec finaliza a **integração ponta a ponta** entre users-service e api-gateway: endpoints auxiliares no users-service necessários ao gateway (validação de token e health), documentação OpenAPI do users-service, configuração correta da URL no gateway e **refatoração das rotas `/auth/*` e `/users/*` do gateway para o `ProxyService`**, com preservação de paths/métodos para o consumidor e repasse correto de erros 4xx.

Session management continua fora desta entrega. Os guards JWT existentes do gateway devem ser **reutilizados**, não redesenhados.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente em ambos os serviços |
| users-service | Porta HTTP 3000 |
| api-gateway | Porta HTTP 3005 |
| Autenticação | JWT Bearer (mesmo contrato já usado no users-service) |
| Proxy | `ProxyService.proxyRequest()` (resiliência + repasse de 4xx já existentes) |
| Documentação | Swagger / OpenAPI no users-service |
| Configuração | Variável de ambiente `USERS_SERVICE_URL` no gateway |
| Referência de padrão | Controller/módulo de products no gateway (`ProxyService.proxyRequest` para o domínio) |

## Requisitos funcionais — users-service

### RF-01 — GET /auth/validate-token

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/auth/validate-token`
- **Autenticação:** obrigatória (JWT válido no header `Authorization: Bearer <token>`)
- **Visibilidade:** rota **protegida** (não deve ser marcada como pública)
- **Uso:** consumo interno pelo api-gateway para validar tokens

Comportamento:

1. Exigir token JWT válido
2. Em caso de sucesso, retornar os dados do usuário autenticado derivados do token
3. Em caso de token ausente, inválido ou expirado, retornar **401 Unauthorized**

Corpo de sucesso (**200**):

| Campo | Tipo | Descrição |
|---|---|---|
| `userId` | string (UUID) | Identificador do usuário autenticado |
| `email` | string | E-mail do usuário |
| `role` | string | Papel do usuário (`seller` ou `buyer`) |

A resposta **não** deve incluir senha nem outros campos sensíveis além dos listados.

### RF-02 — GET /health

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/health`
- **Autenticação:** **não** requerida (rota pública)
- **Uso:** health check do api-gateway (`GET {USERS_SERVICE_URL}/health`)

Corpo de sucesso (**200**):

```json
{
  "status": "ok",
  "service": "users-service"
}
```

O endpoint deve responder mesmo sem header `Authorization`.

### RF-03 — Documentação Swagger / OpenAPI

O users-service deve expor documentação OpenAPI automática com:

| Item | Valor / regra |
|---|---|
| Caminho de acesso | `/api` |
| Título | `Users Service` |
| Versão | `1.0` |
| Autenticação no Swagger | Suporte a Bearer Auth (JWT) para experimentar rotas protegidas |

A documentação deve refletir os endpoints existentes do serviço (auth, users e os novos desta spec).

### RF-04 — Rotas públicas e protegidas desta entrega (users-service)

| Método | Caminho | Autenticação |
|---|---|---|
| `GET` | `/auth/validate-token` | Obrigatória (JWT) |
| `GET` | `/health` | Pública |
| Documentação | `/api` | Pública (acesso à UI/docs) |

As rotas já existentes (`POST /auth/register`, `POST /auth/login`, `GET /`, endpoints `/users/*`) devem manter o comportamento de autenticação já definido nas specs anteriores.

## Requisitos funcionais — api-gateway

### RF-05 — Configurar USERS_SERVICE_URL

O gateway deve apontar para o users-service na porta correta via ambiente:

| Variável | Valor esperado (desenvolvimento local) |
|---|---|
| `USERS_SERVICE_URL` | `http://localhost:3000` |

A configuração deve estar disponível no `.env` do gateway (e documentada no `.env.example` do gateway, se o arquivo existir ou for criado para este fim).

O valor padrão legado apontando para outra porta **não** deve impedir o fluxo local: o ambiente deve garantir `http://localhost:3000`.

### RF-06 — Encaminhar `/auth/*` e `/users/*` via ProxyService

As rotas de autenticação e de usuários no gateway devem passar pelo `ProxyService`, no mesmo padrão já usado para products (controller fino que chama `ProxyService.proxyRequest('users', ...)`).

Deve existir um controller de users no gateway (equivalente ao controller de products) que exponha:

| Método | Caminho no gateway | Destino no users-service | Autenticação no gateway |
|---|---|---|---|
| `POST` | `/auth/register` | `POST /auth/register` | Pública (sem autenticação) |
| `POST` | `/auth/login` | `POST /auth/login` | Pública (sem autenticação) |
| `GET` | `/auth/validate-token` | `GET /auth/validate-token` | Protegida (`JwtAuthGuard`); repassar `Authorization` e `userInfo` |
| `GET` | `/users/profile` | `GET /users/profile` | Protegida (`JwtAuthGuard`); repassar `Authorization` e `userInfo` |
| `GET` | `/users/sellers` | `GET /users/sellers` | Protegida (`JwtAuthGuard`); repassar `Authorization` e `userInfo` |
| `GET` | `/users/:id` | `GET /users/:id` | Protegida (`JwtAuthGuard`); repassar `Authorization` e `userInfo` |

Regras:

- Todas as chamadas acima devem usar `ProxyService.proxyRequest('users', method, path, ...)`
- Rotas públicas **não** exigem token no gateway
- Rotas protegidas devem usar o `JwtAuthGuard` já existente (sem redesenhar guards)
- Paths, métodos HTTP e contrato de sucesso para o consumidor devem permanecer **compatíveis** com o que o gateway já expõe hoje
- A ordem de declaração das rotas estáticas (`profile`, `sellers`) deve vir **antes** de `:id`

Não se deve redesenhar o mecanismo interno de resiliência do `ProxyService` nesta entrega: ele já repassa 4xx sem retry e sem acionar circuit breaker. O requisito é **adotar** esse proxy nas rotas de users/auth.

### RF-07 — Remover ou refatorar AuthController e AuthService atuais

O `AuthController` e o `AuthService` atuais do gateway, que fazem chamadas HTTP diretas ao users-service para registro/login (e engolem erros do backend), devem ser **removidos ou refatorados** de forma que o fluxo de `/auth/register` e `/auth/login` deixe de contornar o `ProxyService`.

Após esta entrega:

- O consumidor continua usando os mesmos paths (`POST /auth/register`, `POST /auth/login`)
- O encaminhamento dessas rotas ocorre via `ProxyService`
- Não deve restar um caminho paralelo de HTTP direto para register/login que mascara status/body do users-service

A validação de JWT usada pelos guards do gateway pode continuar consumindo o endpoint `GET /auth/validate-token` do users-service; o que esta spec elimina é o desvio de register/login (e demais rotas listadas no RF-06) fora do proxy.

### RF-08 — Repasse do header Authorization e preservação de erros 4xx

Nas requisições proxyadas do gateway para o users-service:

1. O header `Authorization` enviado pelo cliente deve ser **repassado** ao serviço de destino nas rotas protegidas
2. Erros **4xx** retornados pelo users-service devem chegar ao cliente com **status code e body preservados** (sem virar 401/500 genéricos do gateway)
3. Erros **4xx** **não** devem acionar retry nem o circuit breaker (comportamento já existente nas camadas de resiliência do proxy)

## Fluxo completo esperado via gateway (porta 3005)

Todos os passos abaixo devem funcionar passando pelo **api-gateway** (`http://localhost:3005`), com o users-service em execução em `http://localhost:3000`, e com o encaminhamento feito via **ProxyService**.

### Fluxo 1 — Registro

1. Cliente envia `POST /auth/register` ao gateway (porta 3005)
2. Gateway encaminha a requisição ao users-service via `ProxyService`
3. users-service registra o usuário
4. Cliente recebe a resposta de sucesso do registro (mesmo contrato já definido na spec de register)

### Fluxo 2 — Login

1. Cliente envia `POST /auth/login` ao gateway (porta 3005) com e-mail e senha
2. Gateway encaminha a requisição ao users-service via `ProxyService`
3. users-service autentica e retorna o token JWT
4. Cliente recebe o token para uso nas próximas chamadas

### Fluxo 3 — Perfil autenticado

1. Cliente envia `GET /users/profile` ao gateway (porta 3005) com `Authorization: Bearer <token>`
2. Gateway valida o token (`JwtAuthGuard`)
3. Gateway encaminha a requisição (com o header `Authorization` e `userInfo`) ao users-service via `ProxyService`
4. users-service retorna o perfil do usuário autenticado
5. Cliente recebe os dados públicos do perfil

### Fluxo 4 — Listagem de sellers

1. Cliente envia `GET /users/sellers` ao gateway (porta 3005) com `Authorization: Bearer <token>`
2. Gateway valida o token (`JwtAuthGuard`)
3. Gateway encaminha a requisição (com o header `Authorization` e `userInfo`) ao users-service via `ProxyService`
4. users-service retorna a lista de sellers ativos
5. Cliente recebe o array de sellers (pode ser vazio)

### Fluxo auxiliar — Health

1. Gateway (ou cliente) consulta a saúde do users-service via `GET /health` no users-service
2. Resposta: `{ "status": "ok", "service": "users-service" }`
3. O health check do gateway deve conseguir marcar o serviço `users` como saudável quando o users-service estiver no ar e configurado corretamente

### Fluxo auxiliar — Validate token

1. Com um JWT válido, `GET /auth/validate-token` (direto no users-service ou via gateway pelo proxy `/auth/*`) retorna `{ userId, email, role }`
2. Sem token ou com token inválido/expirado, retorna **401**

### Fluxo auxiliar — Erros 4xx preservados via gateway

1. `POST /auth/register` com e-mail já existente → cliente recebe **409** do users-service (não 401 genérico)
2. `POST /auth/login` com credenciais inválidas → cliente recebe **401** com a mensagem real do users-service
3. Nessas falhas 4xx, o circuit breaker do proxy de users **não** é acionado

## Respostas esperadas (novos endpoints do users-service)

### 200 OK

| Endpoint | Corpo |
|---|---|
| `GET /auth/validate-token` | `{ "userId": "<uuid>", "email": "<email>", "role": "seller\|buyer" }` |
| `GET /health` | `{ "status": "ok", "service": "users-service" }` |

### 401 Unauthorized

Deve ocorrer em `GET /auth/validate-token` quando:

- Header `Authorization` ausente
- Formato do header inválido
- Token com assinatura inválida
- Token expirado

### Documentação

| Caminho | Resultado |
|---|---|
| `GET /api` (UI Swagger) | Documentação acessível com título "Users Service", versão 1.0 e opção de Bearer Auth |

### Erros via gateway (após refatoração do proxy)

| Cenário via gateway | Resultado esperado |
|---|---|
| Registro com e-mail duplicado | **409 Conflict** (status e body do users-service preservados) |
| Login com credenciais inválidas | **401** com mensagem real do users-service |
| Demais 4xx do users-service nas rotas proxyadas | Status e body preservados; sem retry; circuit breaker não acionado |

## Estrutura esperada (alto nível)

```text
users-service/
├── src/                          # Endpoints validate-token, health e setup Swagger
└── docs/
    └── specs/
        └── 06-gateway-integration.md

gateway/
├── .env                          # USERS_SERVICE_URL=http://localhost:3000
├── .env.example                  # Documentação da variável (se aplicável)
└── src/                          # Controller fino de users/auth via ProxyService
                                  # (mesmo padrão do controller de products)
                                  # AuthController/AuthService de HTTP direto removidos ou refatorados
```

A organização interna de arquivos e módulos deve seguir o padrão já usado no gateway para products. Esta spec descreve **o que** entregar, sem prescrever a implementação.

## Fora de escopo

Esta spec **não** inclui:

- Redesign das camadas internas de resiliência do `ProxyService` / `RetryService` / `CircuitBreakerService` (o repasse de 4xx já está corrigido e deve ser reutilizado)
- Alteração dos guards de autenticação do api-gateway (JWT ou Session) além do uso já previsto (`JwtAuthGuard`, rotas públicas)
- Implementação de session management (criação, validação ou invalidação de sessões)
- Novos endpoints de CRUD de usuários além dos já existentes e dos definidos nesta spec
- RoleGuard ou autorização por papel além do já existente
- Refresh tokens, logout ou rotação de JWT
- Integração com RabbitMQ, products, checkout ou payments
- Alteração dos contratos de sucesso já definidos de register, login e consulta de usuários para o consumidor
- Mudança de portas canônicas (users-service 3000, gateway 3005)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (curl, Postman ou equivalente), preferencialmente passando pelo gateway na porta **3005**.

1. **CA-01 — Validate-token com JWT válido**  
   `GET /auth/validate-token` com Bearer token válido retorna **200** com `userId`, `email` e `role`.

2. **CA-02 — Validate-token sem token**  
   `GET /auth/validate-token` sem token (ou com token inválido/expirado) retorna **401**.

3. **CA-03 — Health público**  
   `GET /health` no users-service **sem** autenticação retorna **200** com `{ "status": "ok", "service": "users-service" }`.

4. **CA-04 — Swagger acessível**  
   A documentação em `/api` no users-service está acessível, com título "Users Service", versão 1.0 e suporte a Bearer Auth.

5. **CA-05 — USERS_SERVICE_URL configurada**  
   O gateway está configurado com `USERS_SERVICE_URL=http://localhost:3000` (via `.env` / ambiente).

6. **CA-06 — Registro via gateway**  
   `POST http://localhost:3005/auth/register` registra um usuário com sucesso (encaminhamento ao users-service via `ProxyService`).

7. **CA-07 — Login via gateway**  
   `POST http://localhost:3005/auth/login` retorna token JWT válido (via `ProxyService`).

8. **CA-08 — Profile via gateway**  
   `GET http://localhost:3005/users/profile` com o token obtido no login retorna **200** com o perfil do usuário.

9. **CA-09 — Sellers via gateway**  
   `GET http://localhost:3005/users/sellers` com o token obtido no login retorna **200** com a lista de sellers (array, possivelmente vazio).

10. **CA-10 — Authorization repassado**  
    Requisições autenticadas via gateway para rotas protegidas do users-service funcionam apenas quando o cliente envia o Bearer token; sem token, o acesso autenticado falha com **401** (comportamento consistente no fluxo E2E).

11. **CA-11 — Health check do gateway enxerga o users-service**  
    Com users-service no ar e `USERS_SERVICE_URL` correta, o health check do gateway consegue obter resposta saudável de `/health` do users-service.

12. **CA-12 — Registro duplicado preserva 409**  
    `POST /auth/register` via gateway com e-mail já existente retorna **409 Conflict** (não 401 genérico). Status e body do users-service são preservados.

13. **CA-13 — Login inválido preserva 401 real**  
    `POST /auth/login` via gateway com credenciais inválidas retorna **401** com a mensagem real do users-service (não uma mensagem genérica que oculte o erro original).

14. **CA-14 — 4xx preservados e sem circuit breaker**  
    Erros 4xx do users-service nas rotas proxyadas chegam ao cliente com status/body preservados; o circuit breaker do proxy de users **não** é acionado por esses 4xx.

15. **CA-15 — Compatibilidade de contrato para o consumidor**  
    Paths e métodos já expostos (`/auth/register`, `/auth/login`, `/users/profile`, `/users/sellers`, `/users/:id`) permanecem os mesmos; o comportamento de sucesso para o consumidor permanece compatível.

16. **CA-16 — Escopo respeitado**  
    `/auth/*` e `/users/*` passam pelo `ProxyService`; `AuthController`/`AuthService` de HTTP direto para register/login foram removidos ou refatorados; guards não foram redesenhados; session management não foi implementado nesta entrega.

## Ordem sugerida de implementação

1. Expor `GET /health` como rota pública no users-service  
2. Expor `GET /auth/validate-token` como rota protegida no users-service  
3. Configurar Swagger/OpenAPI do users-service em `/api` (título, versão e Bearer Auth)  
4. Configurar `USERS_SERVICE_URL=http://localhost:3000` no ambiente do gateway  
5. Expor `/auth/*` e `/users/*` no gateway via controller fino sobre `ProxyService` (padrão products), com rotas públicas e protegidas conforme RF-06  
6. Remover ou refatorar `AuthController`/`AuthService` de HTTP direto para register/login  
7. Validar o fluxo E2E completo via gateway (register → login → profile → sellers) com curl ou Postman  
8. Validar preservação de 4xx (registro duplicado → 409; login inválido → 401 real) e que o circuit breaker não é acionado  
9. Confirmar health check do gateway contra o users-service  

## Commits

Faça sempre um commit após a implementação de cada item desta spec.

Antes de cada commit, rode o lint do serviço afetado e corrija eventuais problemas introduzidos pela mudança.

Sugestão de granularidade dos commits:

1. `GET /health` no users-service  
2. `GET /auth/validate-token` no users-service  
3. Swagger/OpenAPI do users-service  
4. Configuração de `USERS_SERVICE_URL` no gateway  
5. Controller fino de `/auth/*` e `/users/*` via `ProxyService`  
6. Remoção/refatoração do `AuthController`/`AuthService` de HTTP direto  
7. Cobertura de aceite / smoke E2E (incluindo 409/401 preservados), se aplicável à entrega  
