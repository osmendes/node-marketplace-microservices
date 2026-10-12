# Spec: Registro de usuário no users-service

## Contexto

O `users-service` já possui scaffold NestJS, Docker Compose com PostgreSQL 15, TypeORM configurado e a entidade `User` (`id`, `email`, `password`, `firstName`, `lastName`, `role`, `status`, `createdAt`, `updatedAt`).

Esta spec define o **registro de novos usuários** via endpoint HTTP. O escopo é limitado ao cadastro: hash de senha, validação de entrada, verificação de e-mail duplicado e resposta sem expor a senha.

Login, JWT, guards, refresh token e demais endpoints de autenticação ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência da entidade `User` |
| PostgreSQL | 15 (Compose existente) |
| Validação | `class-validator` + `class-transformer` (ValidationPipe global já habilitado) |
| Hash de senha | `bcryptjs` com **10 salt rounds** |

## Requisitos funcionais

### RF-01 — Módulo de autenticação

Deve existir um módulo de autenticação (`AuthModule`) responsável pelo fluxo de registro, contendo:

- Controller de autenticação
- Service de autenticação
- Registro do módulo na aplicação

O módulo de autenticação deve reutilizar a entidade `User` e o módulo de usuários já existentes, sem duplicar o modelo de dados.

Neste escopo, o módulo de autenticação expõe **apenas** o endpoint de registro.

### RF-02 — Endpoint de registro

Deve existir o endpoint:

- **Método:** `POST`
- **Caminho:** `/auth/register`
- **Corpo:** dados de criação do usuário (DTO descrito abaixo)
- **Comportamento:** valida a entrada, verifica unicidade do e-mail, persiste o usuário e retorna os dados públicos do usuário criado

### RF-03 — Hash de senha

A senha recebida no cadastro **nunca** deve ser armazenada em texto plano.

Antes da persistência:

- A senha deve ser transformada em hash com `bcryptjs`
- O custo (salt rounds) deve ser **10**
- Apenas o hash deve ser gravado no campo `password` da entidade `User`

### RF-04 — Unicidade de e-mail

Antes de cadastrar, o serviço deve verificar se já existe um usuário com o mesmo `email`.

- Se o e-mail já estiver cadastrado, a operação deve falhar com **HTTP 409 (Conflict)**
- A mensagem de erro deve indicar claramente que o e-mail já está em uso
- Nenhum registro novo deve ser criado nesse caso

### RF-05 — Resposta sem senha

Qualquer resposta de sucesso do registro **nunca** deve incluir o campo `password` (nem o hash).

Os demais campos públicos do usuário devem estar presentes na resposta.

### RF-06 — Status automático

No registro, o `status` do usuário deve ser definido automaticamente como `active`.

O cliente **não** deve enviar `status` no corpo da requisição. Se enviar, a validação deve rejeitar a propriedade não permitida (comportamento já esperado do ValidationPipe global com `forbidNonWhitelisted`).

### RF-07 — Validação de entrada

Os dados de entrada devem ser validados conforme o DTO de criação.

Em caso de dados inválidos, a API deve responder com **HTTP 400 (Bad Request)** e uma lista clara dos erros de validação (campo e motivo).

## Estrutura de dados

### DTO de criação (corpo de `POST /auth/register`)

| Campo | Obrigatório | Regras |
|---|---|---|
| `email` | Sim | Deve ser um e-mail válido |
| `password` | Sim | Mínimo de 6 caracteres |
| `firstName` | Sim | Máximo de 100 caracteres |
| `lastName` | Sim | Máximo de 100 caracteres |
| `role` | Sim | Apenas `seller` ou `buyer` |

Campos **não** aceitos no corpo do registro (entre outros): `id`, `status`, `createdAt`, `updatedAt`, `password` já hasheado pelo cliente.

### Entidade persistida (reuso)

A persistência continua na entidade `User` já existente:

| Campo | Origem no registro |
|---|---|
| `id` | Gerado automaticamente (UUID) |
| `email` | Vindo do DTO |
| `password` | Hash bcrypt da senha do DTO |
| `firstName` | Vindo do DTO |
| `lastName` | Vindo do DTO |
| `role` | Vindo do DTO (`seller` \| `buyer`) |
| `status` | Definido pelo serviço como `active` |
| `createdAt` | Preenchido automaticamente |
| `updatedAt` | Preenchido automaticamente |

### Resposta de sucesso (usuário público)

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

## Respostas esperadas

### 201 Created — usuário criado com sucesso

- Usuário persistido no banco
- Corpo: dados públicos do usuário (sem `password`)
- `status` igual a `active`
- `password` no banco armazenado apenas como hash bcrypt

### 400 Bad Request — dados inválidos

- Nenhum usuário criado
- Corpo: lista de erros de validação com indicação do campo e da regra violada
- Exemplos de cenários: e-mail inválido, senha com menos de 6 caracteres, `firstName`/`lastName` ausentes ou acima de 100 caracteres, `role` fora de `seller`/`buyer`, propriedades extras não permitidas

### 409 Conflict — e-mail já cadastrado

- Nenhum usuário novo criado
- Corpo: mensagem clara indicando conflito de e-mail

## Estrutura esperada (alto nível)

```text
users-service/
├── src/
│   ├── auth/                 # AuthModule, controller e service de registro
│   ├── users/                # entidade User e módulo já existentes (reuso)
│   ├── app.module.ts         # registra AuthModule
│   └── ...
└── docs/
    └── specs/
        └── 02-register.md
```

A organização interna deve seguir o padrão já usado no serviço e nos demais microserviços do monorepo.

## Fora de escopo

Esta spec **não** inclui:

- Login / autenticação com senha
- JWT, refresh token, guards ou Passport
- Endpoints de perfil, listagem, atualização ou exclusão de usuários
- Recuperação ou redefinição de senha
- Verificação de e-mail / confirmação de conta
- Integração com API Gateway, RabbitMQ ou outros serviços
- Alteração do schema da entidade `User` (exceto o uso correto dos campos já existentes)
- Alteração de `status` pelo cliente no momento do registro

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — AuthModule presente**  
   Existe um módulo de autenticação com controller e service, registrado na aplicação.

2. **CA-02 — Endpoint de registro**  
   `POST /auth/register` está disponível e aceita o DTO de criação descrito nesta spec.

3. **CA-03 — Criação com sucesso**  
   Com payload válido e e-mail inédito, a API responde **201** e retorna `id`, `email`, `firstName`, `lastName`, `role`, `status`, `createdAt` e `updatedAt`.

4. **CA-04 — Senha ausente na resposta**  
   A resposta de sucesso **não** contém o campo `password`.

5. **CA-05 — Senha hasheada no banco**  
   O valor persistido em `password` é um hash bcrypt (não coincide com a senha em texto plano) gerado com 10 salt rounds.

6. **CA-06 — Status automático**  
   Todo usuário criado via registro possui `status` igual a `active`, sem o cliente enviar esse campo.

7. **CA-07 — Conflito de e-mail**  
   Ao tentar registrar um e-mail já existente, a API responde **409** e não cria um segundo registro.

8. **CA-08 — Validação de e-mail**  
   E-mail ausente ou inválido resulta em **400** com erro apontando o campo `email`.

9. **CA-09 — Validação de senha**  
   Senha ausente ou com menos de 6 caracteres resulta em **400** com erro apontando o campo `password`.

10. **CA-10 — Validação de nomes**  
    `firstName` ou `lastName` ausentes ou com mais de 100 caracteres resultam em **400** com erro no campo correspondente.

11. **CA-11 — Validação de role**  
    `role` ausente ou diferente de `seller`/`buyer` resulta em **400** com erro apontando o campo `role`.

12. **CA-12 — Propriedades extras rejeitadas**  
    Envio de campos não permitidos (por exemplo `status` ou `id`) resulta em **400**.

13. **CA-13 — Escopo respeitado**  
    Não há implementação de login, JWT, guards ou outros endpoints de autenticação nesta entrega.

## Ordem sugerida de implementação

1. Adicionar dependência de hash (`bcryptjs`) e tipagens necessárias  
2. Criar DTO de registro com regras de validação  
3. Criar AuthModule, AuthService e AuthController  
4. Implementar fluxo: validar → checar e-mail → hashear senha → persistir → responder sem senha  
5. Registrar AuthModule na aplicação  
6. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e)  
7. Validar manualmente os três status HTTP (201, 400, 409)

## Commits

Faça sempre um commit após a implementação de cada item desta spec.
