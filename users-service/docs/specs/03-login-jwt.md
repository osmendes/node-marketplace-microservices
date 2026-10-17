# Spec: Login com JWT no users-service

## Contexto

O `users-service` já possui scaffold NestJS, PostgreSQL com TypeORM, entidade `User` e o fluxo de registro via `POST /auth/register` (AuthModule com controller e service).

Esta spec define o **login com JWT**: autenticação por e-mail e senha, geração de token JWT e retorno dos dados públicos do usuário autenticado.

Proteção de rotas (guards), refresh tokens, sessions e demais mecanismos avançados de autenticação ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência da entidade `User` |
| PostgreSQL | 15 (Compose existente) |
| Validação | `class-validator` + `class-transformer` (ValidationPipe global já habilitado) |
| Hash de senha | `bcryptjs` (já usado no registro) |
| JWT | `@nestjs/jwt` |
| Passport | `@nestjs/passport`, `passport`, `passport-jwt` |

## Requisitos funcionais

### RF-01 — Extensão do AuthModule para login

O AuthModule existente deve passar a cobrir também o fluxo de login, reutilizando:

- Controller e service de autenticação já existentes
- Entidade `User` e módulo de usuários já existentes

Não deve haver duplicação do modelo de dados nem criação de um segundo módulo de autenticação.

### RF-02 — Endpoint de login

Deve existir o endpoint:

- **Método:** `POST`
- **Caminho:** `/auth/login`
- **Corpo:** credenciais do usuário (DTO descrito abaixo)
- **Comportamento:** valida a entrada, autentica o usuário e, em caso de sucesso, retorna os dados públicos do usuário junto com um token JWT

### RF-03 — Autenticação por e-mail e senha

O fluxo de autenticação deve:

1. Buscar o usuário no banco pelo `email` informado
2. Comparar a senha fornecida com o hash armazenado em `password` usando `bcryptjs`
3. Prosseguir apenas se a senha coincidir com o hash

### RF-04 — Verificação de conta ativa

Após validar as credenciais, o serviço deve verificar se o `status` do usuário é `active`.

- Conta com `status` diferente de `active` (por exemplo `inactive`) deve ser rejeitada
- A mensagem de erro nesse caso deve ser específica: **"Conta inativa"**

### RF-05 — Mensagem genérica para credenciais inválidas

Para falhas de autenticação por e-mail inexistente **ou** senha incorreta, a API deve retornar a **mesma** mensagem genérica: **"Credenciais inválidas"**.

Isso evita revelar qual dos dois campos está incorreto (enumeração de contas).

### RF-06 — Geração de token JWT

Quando e-mail, senha e status forem válidos, o serviço deve gerar um token JWT com:

- **Expiração:** 24 horas
- **Secret:** obtido da variável de ambiente `JWT_SECRET`
- **Payload:** conforme a estrutura descrita nesta spec (`sub`, `email`, `role`)

### RF-07 — Resposta de sucesso com usuário e token

A resposta de login bem-sucedido deve conter:

- O objeto do usuário **sem** o campo `password` (mesmo formato público usado no registro)
- O token JWT gerado

### RF-08 — Configuração do JWT via ambiente

O secret usado para assinar o JWT deve vir da variável de ambiente `JWT_SECRET`.

Essa variável deve constar na documentação de ambiente do serviço (por exemplo `.env.example`), sem valor sensível real versionado.

### RF-09 — Validação de entrada

Os dados de entrada devem ser validados conforme o DTO de login.

Em caso de dados inválidos, a API deve responder com **HTTP 400 (Bad Request)** e uma lista clara dos erros de validação (campo e motivo).

## Estrutura de dados

### DTO de login (corpo de `POST /auth/login`)

| Campo | Obrigatório | Regras |
|---|---|---|
| `email` | Sim | Deve ser um e-mail válido |
| `password` | Sim | Mínimo de 6 caracteres |

Campos **não** aceitos no corpo do login (entre outros): `id`, `firstName`, `lastName`, `role`, `status`, `createdAt`, `updatedAt`, `token`.

### Payload do JWT

| Claim | Conteúdo |
|---|---|
| `sub` | ID do usuário (UUID) |
| `email` | E-mail do usuário |
| `role` | Role do usuário (`seller` ou `buyer`) |

O token deve expirar em **24 horas** a partir da emissão.

### Resposta de sucesso

| Campo | Presente | Observação |
|---|---|---|
| `user` | Sim | Objeto público do usuário (sem `password`) |
| `token` | Sim | String do JWT assinado |

#### Campos de `user` na resposta

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

### Entidade persistida (reuso)

Nenhuma alteração de schema na entidade `User` é necessária. O login apenas lê os campos já existentes (`email`, `password`, `status`, `role`, etc.).

## Respostas esperadas

### 200 OK — login bem-sucedido

- Credenciais válidas e conta com `status` igual a `active`
- Corpo: `{ user: { ...dados públicos }, token: "<jwt>" }`
- `user` **não** contém `password`
- `token` é um JWT válido com payload contendo `sub`, `email` e `role`, e expiração de 24 horas

### 400 Bad Request — dados inválidos

- Autenticação não realizada
- Corpo: lista de erros de validação com indicação do campo e da regra violada
- Exemplos de cenários: e-mail ausente ou inválido, senha ausente ou com menos de 6 caracteres, propriedades extras não permitidas

### 401 Unauthorized — credenciais inválidas

- E-mail inexistente **ou** senha incorreta
- Corpo: mensagem **"Credenciais inválidas"**
- A mesma mensagem deve ser usada nos dois casos (e-mail errado e senha errada)

### 401 Unauthorized — conta inativa

- Credenciais corretas, porém `status` diferente de `active`
- Corpo: mensagem **"Conta inativa"**

## Estrutura esperada (alto nível)

```text
users-service/
├── src/
│   ├── auth/                 # AuthModule existente: estender com login e JWT
│   ├── users/                # entidade User e módulo já existentes (reuso)
│   ├── app.module.ts         # AuthModule já registrado
│   └── ...
├── .env.example              # incluir JWT_SECRET
└── docs/
    └── specs/
        └── 03-login-jwt.md
```

A organização interna deve seguir o padrão já usado no serviço e nos demais microserviços do monorepo. Estratégias Passport/JWT e configuração do módulo JWT devem ficar sob o AuthModule, sem criar um segundo módulo de autenticação.

## Fora de escopo

Esta spec **não** inclui:

- Guards ou proteção de rotas autenticadas
- Refresh tokens
- Sessions / cookies de sessão
- Logout / invalidação de token no servidor
- Recuperação ou redefinição de senha
- Verificação de e-mail / confirmação de conta
- Endpoints de perfil, listagem, atualização ou exclusão de usuários
- Integração com API Gateway, RabbitMQ ou outros serviços
- Alteração do schema da entidade `User`
- Rate limiting ou bloqueio por tentativas de login

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Endpoint de login**  
   `POST /auth/login` está disponível e aceita o DTO de login descrito nesta spec.

2. **CA-02 — Login com sucesso**  
   Com e-mail e senha corretos de um usuário `active`, a API responde **200** com `user` (dados públicos) e `token` (string JWT).

3. **CA-03 — Senha ausente na resposta**  
   O objeto `user` na resposta de sucesso **não** contém o campo `password`.

4. **CA-04 — Payload do JWT**  
   O token retornado, ao ser decodificado, contém `sub` (UUID do usuário), `email` e `role` (`seller` ou `buyer`).

5. **CA-05 — Expiração do JWT**  
   O token possui expiração de 24 horas.

6. **CA-06 — Secret via ambiente**  
   A assinatura do JWT usa o valor de `JWT_SECRET`, e essa variável está documentada no `.env.example` do serviço.

7. **CA-07 — E-mail inexistente**  
   Login com e-mail não cadastrado responde **401** com a mensagem **"Credenciais inválidas"**.

8. **CA-08 — Senha incorreta**  
   Login com e-mail existente e senha errada responde **401** com a mensagem **"Credenciais inválidas"** (idêntica à do CA-07).

9. **CA-09 — Conta inativa**  
   Login com credenciais corretas de usuário com `status` igual a `inactive` responde **401** com a mensagem **"Conta inativa"**.

10. **CA-10 — Validação de e-mail**  
    E-mail ausente ou inválido resulta em **400** com erro apontando o campo `email`.

11. **CA-11 — Validação de senha**  
    Senha ausente ou com menos de 6 caracteres resulta em **400** com erro apontando o campo `password`.

12. **CA-12 — Propriedades extras rejeitadas**  
    Envio de campos não permitidos no corpo do login resulta em **400**.

13. **CA-13 — Dependências JWT/Passport**  
    O serviço utiliza `@nestjs/jwt`, `@nestjs/passport`, `passport` e `passport-jwt` conforme a stack desta spec.

14. **CA-14 — Escopo respeitado**  
    Não há implementação de guards de rota, refresh tokens, sessions ou logout nesta entrega.

## Ordem sugerida de implementação

1. Adicionar dependências JWT/Passport (`@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`) e tipagens necessárias  
2. Documentar `JWT_SECRET` no `.env.example` e carregar a configuração no AuthModule  
3. Criar DTO de login com regras de validação  
4. Implementar fluxo de login no AuthService: buscar por e-mail → comparar senha → checar status → gerar JWT  
5. Expor `POST /auth/login` no AuthController  
6. Definir formato da resposta `{ user, token }` reutilizando o DTO público de usuário  
7. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e)  
8. Validar manualmente os status HTTP 200, 400 e 401 (credenciais inválidas e conta inativa)

## Commits

Faça sempre um commit após a implementação de cada item desta spec.
