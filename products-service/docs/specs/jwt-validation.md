# Spec: Validação JWT no products-service

## Contexto

O `products-service` (porta `3001`) já possui scaffold NestJS, Docker Compose com PostgreSQL (`products_db`, porta host `5436`), TypeORM configurado e a entidade `Product`.

O `users-service` (porta `3000`) já possui login funcionando e emite tokens JWT com payload:

| Claim | Tipo | Descrição |
|---|---|---|
| `sub` | UUID | Identificador do usuário |
| `email` | string | E-mail do usuário |
| `role` | `"seller"` \| `"buyer"` | Papel do usuário |

O `JWT_SECRET` é **compartilhado** entre os serviços (mesmo valor). O `products-service` **não** faz login nem registro: ele apenas **valida** tokens emitidos pelo `users-service`.

Esta spec define a **proteção de rotas com autenticação JWT** no `products-service`: AuthModule com JwtStrategy, JwtAuthGuard global e decorator `@Public()`, seguindo **exatamente** o mesmo padrão já adotado no `users-service` (spec `04-jwt-guards`).

Endpoints de login/registro, RoleGuard, CRUD de produtos e integração com o gateway ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| JWT | `@nestjs/jwt` |
| Passport | `@nestjs/passport`, `passport`, `passport-jwt` |
| Guards | Guard global via `APP_GUARD` |
| Metadata | Decorator de rota pública via metadata do NestJS |
| Config | `@nestjs/config` (já presente) para ler `JWT_SECRET` |

As versões das dependências JWT/Passport devem alinhar-se às usadas no `users-service` / monorepo (`@nestjs/jwt` ^11, `passport-jwt` ^4, etc.).

## Requisitos funcionais

### RF-01 — AuthModule de validação (sem login/register)

Deve existir um `AuthModule` no `products-service` responsável **apenas** pela validação de JWT.

O módulo deve:

1. Configurar o `JwtModule` com o secret obtido de `JWT_SECRET` (via configuração de ambiente)
2. Registrar Passport com a estratégia JWT
3. Expor a JwtStrategy necessária ao guard
4. **Não** criar controllers nem endpoints de autenticação (`/auth/login`, `/auth/register` ou equivalentes)
5. Seguir a mesma abordagem estrutural do AuthModule do `users-service`, omitindo o que for exclusivo de emissão de token (login, register, hashing de senha, repositório de usuários)

### RF-02 — JwtStrategy (Passport)

Deve existir uma estratégia Passport JWT responsável por:

1. Extrair o token JWT do header `Authorization` no formato `Bearer <token>`
2. Validar automaticamente a assinatura do token com o mesmo secret do `users-service` (`JWT_SECRET`)
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

A ausência de `JWT_SECRET` na configuração deve impedir a inicialização correta da estratégia (falha explícita), no mesmo espírito do `users-service`.

### RF-03 — JwtAuthGuard global

Deve existir um guard de autenticação JWT que:

1. Utilize a estratégia Passport JWT
2. Antes de exigir autenticação, verifique se a rota possui o metadata `isPublic`
3. Se a rota for pública (`isPublic`), permita o acesso **sem** exigir token
4. Se a rota **não** for pública, exija e valide o token normalmente
5. Em caso de sucesso na validação, garanta que os dados do usuário autenticado estejam em `req.user`

O guard deve ser registrado como **guard global** (`APP_GUARD`), de forma que **todas** as rotas da aplicação fiquem protegidas por padrão, salvo as explicitamente marcadas como públicas.

Não deve ser necessário anotar cada rota protegida com um decorator de autenticação: a proteção é automática.

### RF-04 — Decorator `@Public()`

Deve existir um decorator `@Public()` que:

1. Marque uma rota (ou controller) como pública
2. Utilize metadata do NestJS (`isPublic`) para comunicar essa intenção ao JwtAuthGuard
3. Permita acesso à rota sem header `Authorization` e sem token válido

### RF-05 — Rotas públicas existentes

A rota raiz existente (`GET /`, Hello World) **deve** ser marcada com `@Public()`, para permanecer acessível sem autenticação após a ativação do guard global.

Qualquer outra rota existente ou futura **sem** `@Public()` passa a exigir JWT válido.

Nesta entrega **não** existem endpoints de produtos nem de autenticação; a proteção global prepara o serviço para specs futuras de CRUD.

### RF-06 — Variável de ambiente `JWT_SECRET`

O serviço deve passar a exigir/documentar a variável `JWT_SECRET`:

| Variável | Descrição | Observação |
|---|---|---|
| `JWT_SECRET` | Secret compartilhado com o `users-service` para validar tokens | Mesmo valor usado na emissão no `users-service` |

O arquivo de exemplo de ambiente (`.env.example`) deve documentar `JWT_SECRET`, sem commitar segredos reais.

### RF-07 — Integração no AppModule

O AuthModule e o JwtAuthGuard devem integrar-se à aplicação:

- Importar o AuthModule no módulo raiz
- Registrar o guard global de forma que proteja toda a aplicação
- Não alterar o schema da entidade `Product`
- Não criar endpoints de login, registro ou CRUD de produtos
- Não implementar RoleGuard (verificação de `role` ficará diretamente nos controllers/services em specs futuras)

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

Tokens emitidos pelo `users-service` com o secret compartilhado devem ser aceitos pelo `products-service` sem reemissão local.

## Respostas esperadas

### 401 Unauthorized (rotas protegidas)

Deve ocorrer quando:

- Header `Authorization` ausente
- Formato do header inválido (não é `Bearer <token>`)
- Token com assinatura inválida
- Token expirado
- Payload do token incompleto ou inválido

Nesses casos, a rota protegida não deve ser processada.

### Resposta normal da rota protegida

Quando o token for válido:

- A requisição segue para o handler da rota
- `req.user` contém `id`, `email` e `role`
- O status e o corpo da resposta são os definidos pela própria rota

### Rota pública

`GET /` deve continuar respondendo como hoje **sem** exigir token (Hello World).

## Estrutura esperada (alto nível)

```text
products-service/
├── src/
│   ├── auth/
│   │   ├── strategies/          # JwtStrategy (Passport)
│   │   ├── guards/              # JwtAuthGuard
│   │   ├── decorators/          # @Public()
│   │   └── auth.module.ts       # JwtModule + Passport + strategy (sem controllers de auth)
│   ├── products/                # inalterado nesta spec
│   ├── app.controller.ts        # rota raiz marcada como @Public()
│   └── app.module.ts            # AuthModule + registro do guard global (APP_GUARD)
├── .env.example                 # inclui JWT_SECRET
└── docs/
    └── specs/
        └── jwt-validation.md
```

A organização interna deve espelhar o padrão do `users-service` (`strategies/`, `guards/`, `decorators/`). Nomes de pastas e arquivos podem variar desde que as responsabilidades acima estejam cobertas.

## Fora de escopo

Esta spec **não** inclui:

- Endpoints de login ou registro (responsabilidade exclusiva do `users-service`)
- RoleGuard, SessionGuard ou qualquer guard baseado em papéis/permissões
- Verificação de `role` nos controllers/services (fica para specs futuras; nesta entrega o `role` apenas chega em `req.user`)
- CRUD de produtos ou qualquer endpoint novo de negócio
- Refresh tokens
- Sessions / cookies de sessão
- Logout / invalidação de token no servidor
- Blacklist de tokens
- Integração com API Gateway, RabbitMQ ou outros serviços
- Alteração do schema da entidade `Product`
- Alteração do payload JWT (`sub`, `email`, `role`) ou da política de expiração definida no `users-service`
- Emissão local de JWT (o `products-service` só valida)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — AuthModule presente**  
   Existe um AuthModule no `products-service` com JwtModule/Passport/JwtStrategy, **sem** controllers ou endpoints de login/register.

2. **CA-02 — Guard global ativo**  
   Existe um JwtAuthGuard registrado como `APP_GUARD`, de modo que rotas sem `@Public()` exijam autenticação automaticamente.

3. **CA-03 — Decorator `@Public()`**  
   O decorator `@Public()` existe e marca a rota com metadata `isPublic` reconhecido pelo guard.

4. **CA-04 — Rota raiz permanece pública**  
   `GET /` sem token continua acessível e responde como hoje.

5. **CA-05 — Rota protegida sem token**  
   Qualquer rota sem `@Public()` acessada sem token responde **401**.

6. **CA-06 — Token inválido**  
   Rota protegida com token de assinatura inválida responde **401**.

7. **CA-07 — Token expirado**  
   Rota protegida com token expirado responde **401**.

8. **CA-08 — Token válido injeta `req.user`**  
   Com token válido emitido com o `JWT_SECRET` compartilhado, a estratégia disponibiliza em `req.user` um objeto contendo `id` (igual ao `sub` do payload), `email` e `role`.

9. **CA-09 — Extração Bearer**  
   O token é lido exclusivamente do header `Authorization` no formato `Bearer <token>`.

10. **CA-10 — Secret compartilhado documentado**  
    `.env.example` documenta `JWT_SECRET`; a validação usa o mesmo secret configurado no `users-service`.

11. **CA-11 — Interoperabilidade com users-service**  
    Um JWT obtido via `POST /auth/login` no `users-service` (mesmo `JWT_SECRET`) é aceito pelo `products-service` em rota protegida.

12. **CA-12 — Escopo respeitado**  
    Não há endpoints de login/register, RoleGuard, SessionGuard, CRUD de produtos, refresh tokens, sessions ou logout nesta entrega.

> **Nota de verificação (CA-05..CA-09):** enquanto não houver endpoint de negócio protegido em produção, os critérios de rota protegida podem ser exercidos via testes unitários do guard/strategy e/ou rota harness-only de e2e (por exemplo `GET /__test/protected` registrada apenas no TestingModule), no mesmo espírito do `users-service`.

## Ordem sugerida de implementação

1. Adicionar dependências `@nestjs/jwt`, `@nestjs/passport`, `passport` e `passport-jwt` (versões alinhadas ao monorepo)  
2. Documentar `JWT_SECRET` no `.env.example` e garantir leitura via configuração  
3. Criar o AuthModule com JwtModule + Passport (somente validação)  
4. Criar a JwtStrategy conforme RF-02 (`Bearer`, assinatura/expiração, `{ id, email, role }` em `req.user`)  
5. Criar o decorator `@Public()` com metadata `isPublic`  
6. Criar o JwtAuthGuard com bypass para rotas públicas e validação JWT para as demais  
7. Registrar AuthModule e JwtAuthGuard como `APP_GUARD` no AppModule  
8. Marcar `GET /` com `@Public()`  
9. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e, incluindo harness de rota protegida se necessário)  
10. Validar manualmente: `GET /` sem token; rota protegida sem token / token inválido / expirado (**401**); token válido do `users-service` (`req.user` preenchido)

## Commits

Faça um commit após a implementação de cada item desta spec.
