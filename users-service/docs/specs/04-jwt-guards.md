# Spec: Guards JWT e proteção de rotas no users-service

## Contexto

O `users-service` já possui scaffold NestJS, PostgreSQL com TypeORM, entidade `User`, registro via `POST /auth/register` e login via `POST /auth/login` com geração de JWT.

Já estão disponíveis:

- `JwtModule` configurado no AuthModule (secret via `JWT_SECRET`, expiração de 24h)
- Dependências `@nestjs/passport`, `passport` e `passport-jwt`
- Payload do JWT com claims `sub`, `email` e `role`
- Estratégia Passport JWT iniciada no AuthModule (sem guards de rota aplicados)

Esta spec define a **proteção de rotas com JWT**: estratégia Passport validando o Bearer token, guard global que exige autenticação por padrão, e decorator para marcar rotas públicas.

Novos endpoints autenticados, RoleGuard, SessionGuard, refresh tokens e logout ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| JWT | `@nestjs/jwt` (já configurado no AuthModule) |
| Passport | `@nestjs/passport`, `passport`, `passport-jwt` (já instalados) |
| Guards | Guard global via `APP_GUARD` |
| Metadata | Decorator de rota pública via metadata do NestJS |

## Requisitos funcionais

### RF-01 — JwtStrategy (Passport)

Deve existir uma estratégia Passport JWT responsável por:

1. Extrair o token JWT do header `Authorization` no formato `Bearer <token>`
2. Validar automaticamente a assinatura do token com o secret configurado (`JWT_SECRET`)
3. Validar automaticamente a expiração do token (tokens expirados devem ser rejeitados)
4. Em caso de token válido, disponibilizar um objeto de usuário autenticado derivado do payload

O objeto disponibilizado após a validação deve conter:

| Campo | Origem |
|---|---|
| `id` | Claim `sub` do payload |
| `email` | Claim `email` do payload |
| `role` | Claim `role` do payload |

Esse objeto deve ficar disponível em `req.user` em todas as rotas protegidas que passarem pelo guard.

Payload incompleto ou inválido (ausência de `sub`, `email` ou `role`) deve resultar em falha de autenticação.

### RF-02 — JwtAuthGuard global

Deve existir um guard de autenticação JWT que:

1. Utilize a estratégia Passport JWT (AuthGuard do Passport)
2. Antes de exigir autenticação, verifique se a rota possui o metadata `isPublic`
3. Se a rota for pública (`isPublic`), permita o acesso **sem** exigir token
4. Se a rota **não** for pública, exija e valide o token normalmente
5. Em caso de sucesso na validação, garanta que os dados do usuário autenticado estejam em `req.user`

O guard deve ser registrado como **guard global** (`APP_GUARD`), de forma que **todas** as rotas da aplicação fiquem protegidas por padrão, salvo as explicitamente marcadas como públicas.

Não deve ser necessário anotar cada rota protegida com um decorator de autenticação: a proteção é automática.

### RF-03 — Decorator `@Public()`

Deve existir um decorator `@Public()` que:

1. Marque uma rota (ou controller) como pública
2. Utilize metadata do NestJS (`isPublic`) para comunicar essa intenção ao JwtAuthGuard
3. Permita acesso à rota sem header `Authorization` e sem token válido

### RF-04 — Rotas públicas existentes

As seguintes rotas existentes **devem** ser marcadas com `@Public()`:

| Método | Caminho | Motivo |
|---|---|---|
| `POST` | `/auth/register` | Cadastro de novos usuários (pré-autenticação) |
| `POST` | `/auth/login` | Obtenção do token JWT (pré-autenticação) |

A rota raiz existente (`GET /`, Hello World) também deve ser marcada como pública, para permanecer acessível sem autenticação após a ativação do guard global.

Qualquer outra rota existente ou futura **sem** `@Public()` passa a exigir JWT válido.

### RF-05 — Integração no AuthModule / AppModule

A JwtStrategy e o JwtAuthGuard devem integrar-se à estrutura já existente de autenticação:

- Reutilizar o AuthModule e a configuração JWT já presentes
- Registrar o guard global de forma que proteja toda a aplicação
- Não criar um segundo módulo de autenticação paralelo
- Não alterar o schema da entidade `User`
- Não alterar o contrato de `POST /auth/register` nem de `POST /auth/login` (corpo e respostas permanecem os mesmos)

## Fluxo esperado de uma requisição

### Rota pública (`@Public()`)

1. Requisição chega ao serviço
2. JwtAuthGuard identifica o metadata `isPublic`
3. Acesso é liberado sem validação de token
4. Controller processa a requisição normalmente

### Rota protegida (sem `@Public()`)

1. Requisição chega ao serviço
2. JwtAuthGuard verifica que a rota **não** é pública
3. Extrai o token do header `Authorization: Bearer <token>`
4. JwtStrategy valida assinatura e expiração
5. Em caso de sucesso, injeta `{ id, email, role }` em `req.user`
6. Controller processa a requisição com acesso aos dados do usuário autenticado

### Rota protegida com falha de autenticação

1. Requisição chega sem token, com token expirado, com assinatura inválida, ou com payload incompleto
2. JwtAuthGuard / JwtStrategy rejeitam a autenticação
3. A API responde **401 Unauthorized**
4. O controller **não** é executado

## Respostas esperadas para rotas protegidas

### 401 Unauthorized

Deve ocorrer quando:

- Header `Authorization` ausente
- Formato do header inválido (não é `Bearer <token>`)
- Token com assinatura inválida
- Token expirado
- Payload do token incompleto ou inválido

Nesses casos, a rota protegida não deve ser processada.

### Resposta normal da rota

Quando o token for válido:

- A requisição segue para o handler da rota
- `req.user` contém `id`, `email` e `role`
- O status e o corpo da resposta são os definidos pela própria rota (esta spec não cria novos endpoints)

### Rotas públicas

`POST /auth/register`, `POST /auth/login` e `GET /` devem continuar respondendo como hoje **sem** exigir token:

- Register: **201** (sucesso), **400**, **409** conforme spec `02-register`
- Login: **200** (sucesso), **400**, **401** conforme spec `03-login-jwt`
- Hello World: resposta atual da rota raiz

## Estrutura esperada (alto nível)

```text
users-service/
├── src/
│   ├── auth/
│   │   ├── strategies/          # JwtStrategy (Passport)
│   │   ├── guards/              # JwtAuthGuard
│   │   ├── decorators/          # @Public()
│   │   ├── auth.controller.ts   # register e login marcados como @Public()
│   │   └── auth.module.ts       # integração da strategy (já existente)
│   ├── app.controller.ts        # rota raiz marcada como @Public()
│   └── app.module.ts            # registro do guard global (APP_GUARD)
└── docs/
    └── specs/
        └── 04-jwt-guards.md
```

A organização interna deve seguir o padrão já usado no serviço. Nomes de pastas e arquivos podem variar desde que as responsabilidades acima estejam cobertas.

## Fora de escopo

Esta spec **não** inclui:

- RoleGuard, SessionGuard ou qualquer guard baseado em papéis/permissões
- Criação de novos endpoints (perfil, listagem, CRUD de usuários, etc.)
- Refresh tokens
- Sessions / cookies de sessão
- Logout / invalidação de token no servidor
- Blacklist de tokens
- Recuperação ou redefinição de senha
- Verificação de e-mail
- Integração com API Gateway, RabbitMQ ou outros serviços
- Alteração do schema da entidade `User`
- Alteração do payload JWT (`sub`, `email`, `role`) ou da expiração de 24h
- Alteração dos contratos de resposta de register e login

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Guard global ativo**  
   Existe um JwtAuthGuard registrado como `APP_GUARD`, de modo que rotas sem `@Public()` exijam autenticação automaticamente.

2. **CA-02 — Decorator `@Public()`**  
   O decorator `@Public()` existe e marca a rota com metadata `isPublic` reconhecido pelo guard.

3. **CA-03 — Register permanece público**  
   `POST /auth/register` sem header `Authorization` continua funcionando conforme a spec de registro (ex.: **201** em cadastro válido).

4. **CA-04 — Login permanece público**  
   `POST /auth/login` sem header `Authorization` continua funcionando conforme a spec de login (ex.: **200** com `user` e `token` em credenciais válidas).

5. **CA-05 — Rota raiz permanece pública**  
   `GET /` sem token continua acessível e responde como hoje.

6. **CA-06 — Rota protegida sem token**  
   Qualquer rota sem `@Public()` acessada sem token responde **401**.

7. **CA-07 — Token inválido**  
   Rota protegida com token de assinatura inválida responde **401**.

8. **CA-08 — Token expirado**  
   Rota protegida com token expirado responde **401**.

9. **CA-09 — Token válido injeta `req.user`**  
   Com token válido, a estratégia disponibiliza em `req.user` um objeto contendo `id` (igual ao `sub` do payload), `email` e `role`.

10. **CA-10 — Extração Bearer**  
    O token é lido exclusivamente do header `Authorization` no formato `Bearer <token>`.

11. **CA-11 — Escopo respeitado**  
    Não há RoleGuard, SessionGuard, novos endpoints, refresh tokens, sessions ou logout nesta entrega.

## Ordem sugerida de implementação

1. Garantir que a JwtStrategy atenda ao RF-01 (extração Bearer, validação de assinatura/expiração, objeto `{ id, email, role }` em `req.user`)  
2. Criar o decorator `@Public()` com metadata `isPublic`  
3. Criar o JwtAuthGuard com bypass para rotas públicas e validação JWT para as demais  
4. Registrar o JwtAuthGuard como guard global (`APP_GUARD`)  
5. Marcar `POST /auth/register`, `POST /auth/login` e `GET /` com `@Public()`  
6. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e)  
7. Validar manualmente: rotas públicas sem token, rota protegida sem token (**401**), com token inválido/expirado (**401**) e com token válido (`req.user` preenchido)

## Commits

Faça sempre um commit após a implementação de cada item desta spec.
