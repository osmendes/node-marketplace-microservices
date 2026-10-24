# Spec: Integração do products-service ao api-gateway

## Contexto

O `products-service` (porta **3001**) já está completo com:

- Entidade `Product` e persistência PostgreSQL (`products_db`, porta host `5436`)
- Autenticação JWT (validação de tokens emitidos pelo users-service), `JwtAuthGuard` global e decorator `@Public()`
- Criação de produto: `POST /products` (seller only; `sellerId` derivado do JWT)
- Consultas públicas: `GET /products`, `GET /products/seller/:sellerId`, `GET /products/:id`

O `api-gateway` (porta **3005**) já possui:

- Proxy service com circuit breaker, retry e timeout
- Health checks que consultam `GET /health` nos serviços configurados
- Swagger
- Variável de ambiente `PRODUCTS_SERVICE_URL`
- Infraestrutura para rotear requisições `/products/*` para o products-service

Esta spec finaliza a **integração ponta a ponta** entre products-service e api-gateway: endpoint de health e documentação OpenAPI no products-service, configuração correta da URL no gateway, verificação do encaminhamento de `/products/*` (incluindo o header `Authorization`) e validação do fluxo completo passando pela porta 3005.

Não se deve alterar o mecanismo de proxy nem os guards do gateway — eles já funcionam.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente em ambos os serviços |
| products-service | Porta HTTP 3001 |
| api-gateway | Porta HTTP 3005 |
| users-service | Porta HTTP 3000 (login JWT usado no fluxo E2E) |
| Autenticação | JWT Bearer (mesmo contrato já usado no marketplace) |
| Proxy | Infraestrutura existente no gateway (sem alteração de mecanismo) |
| Documentação | Swagger / OpenAPI no products-service |
| Configuração | Variável de ambiente `PRODUCTS_SERVICE_URL` no gateway |

## Requisitos funcionais — products-service

### RF-01 — GET /health

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/health`
- **Autenticação:** **não** requerida (rota pública)
- **Uso:** health check do api-gateway (`GET {PRODUCTS_SERVICE_URL}/health`)

Corpo de sucesso (**200**):

```json
{
  "status": "ok",
  "service": "products-service"
}
```

O endpoint deve responder mesmo sem header `Authorization`.

### RF-02 — Documentação Swagger / OpenAPI

O products-service deve expor documentação OpenAPI automática com:

| Item | Valor / regra |
|---|---|
| Caminho de acesso | `/api` |
| Título | `Products Service` |
| Versão | `1.0` |
| Autenticação no Swagger | Suporte a Bearer Auth (JWT) para experimentar rotas protegidas |

A documentação deve refletir os endpoints existentes do serviço (produtos e o novo `GET /health`).

### RF-03 — Rotas públicas e protegidas desta entrega

| Método | Caminho | Autenticação |
|---|---|---|
| `GET` | `/health` | Pública |
| Documentação | `/api` | Pública (acesso à UI/docs) |

As rotas já existentes devem manter o comportamento de autenticação já definido nas specs anteriores:

| Método | Caminho | Autenticação |
|---|---|---|
| `POST` | `/products` | Obrigatória (JWT); seller only |
| `GET` | `/products` | Pública |
| `GET` | `/products/seller/:sellerId` | Pública |
| `GET` | `/products/:id` | Pública |
| `GET` | `/` | Pública |

## Requisitos funcionais — api-gateway

### RF-04 — Configurar PRODUCTS_SERVICE_URL

O gateway deve apontar para o products-service na porta correta via ambiente:

| Variável | Valor esperado (desenvolvimento local) |
|---|---|
| `PRODUCTS_SERVICE_URL` | `http://localhost:3001` |

A configuração deve estar disponível no `.env` do gateway (e documentada no `.env.example` do gateway, se o arquivo existir ou for criado/atualizado para este fim).

O valor padrão legado apontando para outra porta **não** deve impedir o fluxo local: o ambiente deve garantir `http://localhost:3001`.

### RF-05 — Encaminhamento das rotas /products/*

Deve ser verificado que a infraestrutura de proxy já existente no gateway encaminha corretamente para o products-service:

| Prefixo no gateway | Destino |
|---|---|
| `/products/*` | products-service (`PRODUCTS_SERVICE_URL`) |

Cobertura mínima do encaminhamento nesta entrega:

| Método | Caminho no gateway | Destino no products-service |
|---|---|---|
| `POST` | `/products` | `POST /products` |
| `GET` | `/products` | `GET /products` |
| `GET` | `/products/:id` | `GET /products/:id` |

Não se deve alterar o mecanismo de proxy nem os guards do gateway nesta entrega. O requisito é **garantir** que o encaminhamento e a configuração estejam corretos para o fluxo E2E.

As regras de autenticação já definidas no products-service devem ser respeitadas no fluxo via gateway: consultas públicas continuam acessíveis sem token; criação exige Bearer token de seller.

### RF-06 — Repasse do header Authorization

Nas requisições proxyadas do gateway para o products-service, o header `Authorization` enviado pelo cliente deve ser **repassado** ao serviço de destino.

Isso é necessário para que `POST /products` (protegido e seller only) receba o Bearer token original obtido no login.

## Fluxo completo esperado via gateway (porta 3005)

Todos os passos abaixo devem funcionar passando pelo **api-gateway** (`http://localhost:3005`), com:

- users-service em execução em `http://localhost:3000`
- products-service em execução em `http://localhost:3001`
- gateway em execução em `http://localhost:3005`

### Fluxo 1 — Login

1. Cliente envia `POST /auth/login` ao gateway (porta 3005) com e-mail e senha de um usuário **seller**
2. Gateway encaminha a requisição ao users-service
3. users-service autentica e retorna o token JWT
4. Cliente recebe o token para uso nas próximas chamadas autenticadas

### Fluxo 2 — Criação de produto

1. Cliente envia `POST /products` ao gateway (porta 3005) com `Authorization: Bearer <token>` e corpo válido de criação
2. Gateway encaminha a requisição (com o header `Authorization`) ao products-service
3. products-service valida o token, aplica a regra seller-only, persiste o produto e retorna o produto criado
4. Cliente recebe a resposta de sucesso da criação (mesmo contrato já definido na spec de create-product)

### Fluxo 3 — Listagem do catálogo

1. Cliente envia `GET /products` ao gateway (porta 3005)
2. Gateway encaminha a requisição ao products-service
3. products-service retorna o catálogo de produtos ativos
4. Cliente recebe **200** com o array de produtos (possivelmente vazio, ou contendo o produto criado no fluxo 2)

### Fluxo 4 — Detalhe por ID

1. Cliente envia `GET /products/:id` ao gateway (porta 3005), com o `id` do produto criado no fluxo 2
2. Gateway encaminha a requisição ao products-service
3. products-service retorna o produto correspondente
4. Cliente recebe **200** com o objeto do produto

### Fluxo auxiliar — Health

1. Gateway (ou cliente) consulta a saúde do products-service via `GET /health` no products-service
2. Resposta: `{ "status": "ok", "service": "products-service" }`
3. O health check do gateway deve conseguir marcar o serviço `products` como saudável quando o products-service estiver no ar e `PRODUCTS_SERVICE_URL` estiver correta

## Respostas esperadas (novos endpoints / configuração)

### 200 OK — products-service

| Endpoint | Corpo |
|---|---|
| `GET /health` | `{ "status": "ok", "service": "products-service" }` |

### Documentação — products-service

| Caminho | Resultado |
|---|---|
| `GET /api` (UI Swagger) | Documentação acessível com título "Products Service", versão 1.0 e opção de Bearer Auth |

### Fluxo E2E via gateway

| Passo | Endpoint no gateway | Resultado esperado |
|---|---|---|
| Login (seller) | `POST /auth/login` | Token JWT válido |
| Criar produto | `POST /products` com Bearer token | Sucesso de criação (contrato já existente) |
| Listar produtos | `GET /products` | **200** com array de produtos |
| Detalhe | `GET /products/:id` | **200** com o produto correspondente |

### Falhas autenticadas no fluxo via gateway

| Cenário | Resultado esperado |
|---|---|
| `POST /products` sem token (ou token inválido) via gateway | Acesso autenticado falha com **401** |
| `POST /products` com token de buyer via gateway | **403** (seller only), se o encaminhamento e o repasse do token estiverem corretos |

## Estrutura esperada (alto nível)

```text
products-service/
├── src/                          # Endpoint health e setup Swagger
└── docs/
    └── specs/
        └── 05-gateway-integration.md

gateway/
├── .env                          # PRODUCTS_SERVICE_URL=http://localhost:3001
└── .env.example                  # Documentação da variável (se aplicável)
```

A organização interna de arquivos e módulos deve seguir o padrão já usado em cada serviço. Esta spec descreve **o que** entregar, sem prescrever a implementação.

## Fora de escopo

Esta spec **não** inclui:

- Alteração do mecanismo de proxy do api-gateway
- Alteração dos guards de autenticação do api-gateway (JWT ou Session)
- Implementação de session management
- Novos endpoints de CRUD de produtos além dos já existentes e do `GET /health` desta spec
- Atualização, exclusão, paginação, filtros avançados ou busca por texto de produtos
- Alteração dos contratos já definidos de create-product e query-products
- Emissão local de JWT no products-service (continua sendo responsabilidade exclusiva do users-service)
- Integração com RabbitMQ, checkout ou payments
- Mudança de portas canônicas (products-service 3001, users-service 3000, gateway 3005)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (curl, Postman ou equivalente), preferencialmente passando pelo gateway na porta **3005**.

1. **CA-01 — Health público no products-service**  
   `GET /health` no products-service **sem** autenticação retorna **200** com `{ "status": "ok", "service": "products-service" }`.

2. **CA-02 — Swagger acessível**  
   A documentação em `/api` no products-service está acessível, com título "Products Service", versão 1.0 e suporte a Bearer Auth.

3. **CA-03 — PRODUCTS_SERVICE_URL configurada**  
   O gateway está configurado com `PRODUCTS_SERVICE_URL=http://localhost:3001` (via `.env` / ambiente).

4. **CA-04 — Login via gateway**  
   `POST http://localhost:3005/auth/login` com credenciais de seller retorna token JWT válido.

5. **CA-05 — Criação de produto via gateway**  
   `POST http://localhost:3005/products` com o token obtido no login e corpo válido cria o produto com sucesso (encaminhamento ao products-service).

6. **CA-06 — Listagem via gateway**  
   `GET http://localhost:3005/products` retorna **200** com o catálogo (array de produtos).

7. **CA-07 — Detalhe via gateway**  
   `GET http://localhost:3005/products/:id` com o `id` do produto criado retorna **200** com o objeto do produto.

8. **CA-08 — Authorization repassado**  
   `POST /products` via gateway funciona com Bearer token válido de seller; sem token (ou com token inválido) o acesso autenticado falha com **401**.

9. **CA-09 — Health check do gateway enxerga o products-service**  
   Com products-service no ar e `PRODUCTS_SERVICE_URL` correta, o health check do gateway consegue obter resposta saudável de `/health` do products-service.

10. **CA-10 — Escopo respeitado**  
    Proxy e guards do gateway não foram redesenhados; contratos existentes de create/query de produtos não foram alterados nesta entrega.

## Ordem sugerida de implementação

1. Expor `GET /health` como rota pública no products-service  
2. Configurar Swagger/OpenAPI do products-service em `/api` (título, versão e Bearer Auth)  
3. Configurar `PRODUCTS_SERVICE_URL=http://localhost:3001` no ambiente do gateway  
4. Verificar encaminhamento de `/products/*` e o repasse do header `Authorization`  
5. Validar o fluxo E2E completo via gateway (login → criar produto → listar → detalhe) com curl ou Postman  
6. Confirmar health check do gateway contra o products-service  

## Commits

Faça sempre um commit após a implementação de cada item desta spec.

Antes de cada commit, rode o lint do serviço afetado e corrija eventuais problemas introduzidos pela mudança.

Sugestão de granularidade dos commits:

1. `GET /health` no products-service  
2. Swagger/OpenAPI do products-service  
3. Configuração de `PRODUCTS_SERVICE_URL` no gateway  
4. Ajustes de verificação/encaminhamento necessários para o E2E (sem alterar o mecanismo de proxy/guards)  
5. Cobertura de aceite / smoke E2E documentado ou automatizado, se aplicável à entrega  
