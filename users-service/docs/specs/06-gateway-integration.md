# Spec: Integração do users-service ao api-gateway

## Contexto

O `users-service` (porta **3000**) já está completo com:

- Registro (`POST /auth/register`) e login JWT (`POST /auth/login`)
- Proteção de rotas com `JwtAuthGuard` global e decorator `@Public()`
- Endpoints de consulta protegidos: `GET /users/profile`, `GET /users/sellers`, `GET /users/:id`
- Usuário autenticado em `req.user` com `{ id, email, role }` após validação do JWT

O `api-gateway` (porta **3005**) já possui:

- Proxy service com circuit breaker, retry e timeout
- Guards de autenticação (JWT e Session)
- Health checks que consultam `GET /health` nos serviços configurados
- Swagger
- Configuração de `USERS_SERVICE_URL` via variável de ambiente
- Infraestrutura para rotear requisições `/auth/*` e `/users/*` para o users-service

Esta spec finaliza a **integração ponta a ponta** entre users-service e api-gateway: endpoints auxiliares no users-service necessários ao gateway (validação de token e health), documentação OpenAPI do users-service, configuração correta da URL no gateway e verificação do fluxo completo passando pela porta 3005.

Não se deve alterar o mecanismo de proxy nem os guards do gateway — eles já funcionam. Session management fica fora desta entrega.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente em ambos os serviços |
| users-service | Porta HTTP 3000 |
| api-gateway | Porta HTTP 3005 |
| Autenticação | JWT Bearer (mesmo contrato já usado no users-service) |
| Proxy | Infraestrutura existente no gateway (sem alteração de mecanismo) |
| Documentação | Swagger / OpenAPI no users-service |
| Configuração | Variável de ambiente `USERS_SERVICE_URL` no gateway |

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

### RF-04 — Rotas públicas e protegidas desta entrega

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

### RF-06 — Encaminhamento das rotas /auth/* e /users/*

Deve ser verificado que a infraestrutura de proxy já existente no gateway encaminha corretamente para o users-service:

| Prefixo no gateway | Destino |
|---|---|
| `/auth/*` | users-service (`USERS_SERVICE_URL`) |
| `/users/*` | users-service (`USERS_SERVICE_URL`) |

Não se deve alterar o mecanismo de proxy nem os guards do gateway nesta entrega. O requisito é **garantir** que o encaminhamento e a configuração estejam corretos para o fluxo E2E.

### RF-07 — Repasse do header Authorization

Nas requisições proxyadas do gateway para o users-service, o header `Authorization` enviado pelo cliente deve ser **repassado** ao serviço de destino.

Isso é necessário para que rotas protegidas do users-service (por exemplo `GET /users/profile` e `GET /auth/validate-token`) recebam o Bearer token original.

## Fluxo completo esperado via gateway (porta 3005)

Todos os passos abaixo devem funcionar passando pelo **api-gateway** (`http://localhost:3005`), com o users-service em execução em `http://localhost:3000`.

### Fluxo 1 — Registro

1. Cliente envia `POST /auth/register` ao gateway (porta 3005)
2. Gateway encaminha a requisição ao users-service
3. users-service registra o usuário
4. Cliente recebe a resposta de sucesso do registro (mesmo contrato já definido na spec de register)

### Fluxo 2 — Login

1. Cliente envia `POST /auth/login` ao gateway (porta 3005) com e-mail e senha
2. Gateway encaminha a requisição ao users-service
3. users-service autentica e retorna o token JWT
4. Cliente recebe o token para uso nas próximas chamadas

### Fluxo 3 — Perfil autenticado

1. Cliente envia `GET /users/profile` ao gateway (porta 3005) com `Authorization: Bearer <token>`
2. Gateway valida o token
3. Gateway encaminha a requisição (com o header `Authorization`) ao users-service
4. users-service retorna o perfil do usuário autenticado
5. Cliente recebe os dados públicos do perfil

### Fluxo 4 — Listagem de sellers

1. Cliente envia `GET /users/sellers` ao gateway (porta 3005) com `Authorization: Bearer <token>`
2. Gateway valida o token
3. Gateway encaminha a requisição (com o header `Authorization`) ao users-service
4. users-service retorna a lista de sellers ativos
5. Cliente recebe o array de sellers (pode ser vazio)

### Fluxo auxiliar — Health

1. Gateway (ou cliente) consulta a saúde do users-service via `GET /health` no users-service
2. Resposta: `{ "status": "ok", "service": "users-service" }`
3. O health check do gateway deve conseguir marcar o serviço `users` como saudável quando o users-service estiver no ar e configurado corretamente

### Fluxo auxiliar — Validate token

1. Com um JWT válido, `GET /auth/validate-token` no users-service (direto ou via gateway, conforme o encaminhamento `/auth/*`) retorna `{ userId, email, role }`
2. Sem token ou com token inválido/expirado, retorna **401**

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

## Estrutura esperada (alto nível)

```text
users-service/
├── src/                          # Endpoints validate-token, health e setup Swagger
└── docs/
    └── specs/
        └── 06-gateway-integration.md

gateway/
├── .env                          # USERS_SERVICE_URL=http://localhost:3000
└── .env.example                  # Documentação da variável (se aplicável)
```

A organização interna de arquivos e módulos deve seguir o padrão já usado em cada serviço. Esta spec descreve **o que** entregar, sem prescrever a implementação.

## Fora de escopo

Esta spec **não** inclui:

- Alteração do mecanismo de proxy do api-gateway
- Alteração dos guards de autenticação do api-gateway (JWT ou Session)
- Implementação de session management (criação, validação ou invalidação de sessões)
- Novos endpoints de CRUD de usuários além dos já existentes e dos definidos nesta spec
- RoleGuard ou autorização por papel além do já existente
- Refresh tokens, logout ou rotação de JWT
- Integração com RabbitMQ, products, checkout ou payments
- Alteração dos contratos já definidos de register, login e consulta de usuários
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
   `POST http://localhost:3005/auth/register` registra um usuário com sucesso (encaminhamento ao users-service).

7. **CA-07 — Login via gateway**  
   `POST http://localhost:3005/auth/login` retorna token JWT válido.

8. **CA-08 — Profile via gateway**  
   `GET http://localhost:3005/users/profile` com o token obtido no login retorna **200** com o perfil do usuário.

9. **CA-09 — Sellers via gateway**  
   `GET http://localhost:3005/users/sellers` com o token obtido no login retorna **200** com a lista de sellers (array, possivelmente vazio).

10. **CA-10 — Authorization repassado**  
    Requisições autenticadas via gateway para rotas protegidas do users-service funcionam apenas quando o cliente envia o Bearer token; sem token, o acesso autenticado falha com **401** (comportamento consistente no fluxo E2E).

11. **CA-11 — Health check do gateway enxerga o users-service**  
    Com users-service no ar e `USERS_SERVICE_URL` correta, o health check do gateway consegue obter resposta saudável de `/health` do users-service.

12. **CA-12 — Escopo respeitado**  
    Proxy e guards do gateway não foram redesenhados; session management não foi implementado nesta entrega.

## Ordem sugerida de implementação

1. Expor `GET /health` como rota pública no users-service  
2. Expor `GET /auth/validate-token` como rota protegida no users-service  
3. Configurar Swagger/OpenAPI do users-service em `/api` (título, versão e Bearer Auth)  
4. Configurar `USERS_SERVICE_URL=http://localhost:3000` no ambiente do gateway  
5. Verificar encaminhamento de `/auth/*` e `/users/*` e o repasse do header `Authorization`  
6. Validar o fluxo E2E completo via gateway (register → login → profile → sellers) com curl ou Postman  
7. Confirmar health check do gateway contra o users-service  

## Commits

Faça sempre um commit após a implementação de cada item desta spec.

Antes de cada commit, rode o lint do serviço afetado e corrija eventuais problemas introduzidos pela mudança.

Sugestão de granularidade dos commits:

1. `GET /health` no users-service  
2. `GET /auth/validate-token` no users-service  
3. Swagger/OpenAPI do users-service  
4. Configuração de `USERS_SERVICE_URL` no gateway  
5. Ajustes de verificação/encaminhamento necessários para o E2E (sem alterar o mecanismo de proxy/guards)  
6. Cobertura de aceite / smoke E2E documentado ou automatizado, se aplicável à entrega  
