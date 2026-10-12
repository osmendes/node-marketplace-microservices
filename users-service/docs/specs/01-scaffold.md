# Spec: Scaffold do users-service

## Contexto

O marketplace-ms já possui `api-gateway` (porta 3005), `checkout-service` (porta 3003), `payments-service` (porta 3004) e `messaging-service` (RabbitMQ).

Esta spec define o scaffold do **users-service** (porta 3000), responsável por gerenciar usuários do marketplace.

O escopo é enxuto: apenas o essencial para o serviço existir, conectar ao banco e registrar a entidade de usuário. Endpoints, autenticação e lógica de negócio ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Mesma linha dos demais serviços do monorepo |
| TypeORM | Persistência |
| PostgreSQL | 15 |
| Driver | `pg` |
| Config | `@nestjs/config` |
| Validação | `class-validator` + `class-transformer` |

## Requisitos funcionais

### RF-01 — Projeto NestJS com dependências

O serviço deve estar estruturado como projeto NestJS independente, alinhado ao padrão de `checkout` e `payments`, e deve incluir as dependências:

- `@nestjs/typeorm` e `typeorm`
- `pg`
- `@nestjs/config`
- `class-validator` e `class-transformer`

### RF-02 — Docker Compose com PostgreSQL 15

Deve existir um arquivo de compose na raiz do serviço que suba um PostgreSQL 15 com:

- Database: `users_db`
- Porta publicada no host: `5433` (mapeada para `5432` no container)
- Volume persistente para os dados
- Healthcheck habilitado
- Rede isolada do serviço

### RF-03 — Configuração de conexão com o banco

A conexão com o PostgreSQL deve ser feita via variáveis de ambiente, com valores padrão adequados para desenvolvimento local.

A configuração deve:

- Usar o tipo `postgres`
- Carregar entidades automaticamente
- Habilitar `synchronize` apenas fora de produção
- Habilitar logging apenas em desenvolvimento

O módulo de configuração da aplicação deve estar disponível globalmente.

### RF-04 — Módulo de usuários básico

Deve existir um módulo de usuários registrado na aplicação, contendo:

- Entidade `User` mapeada no TypeORM
- Módulo NestJS de usuários importado no módulo raiz

Neste scaffold **não** devem existir controllers, endpoints HTTP, DTOs de API, serviços de negócio, autenticação ou autorização.

### RF-05 — ValidationPipe global

A aplicação deve iniciar com `ValidationPipe` global habilitado, com:

- Transformação automática de tipos (`transform`)
- Remoção de propriedades não declaradas (`whitelist`)
- Rejeição de propriedades não permitidas (`forbidNonWhitelisted`)

A aplicação deve escutar na porta definida por `PORT`, com fallback para `3000`.

## Estrutura de dados

### Entidade: User

A entidade `User` deve conter **apenas** os campos abaixo.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | Gerado automaticamente |
| `email` | string | Único |
| `password` | string | Armazena hash (sem regra de hashing neste scaffold) |
| `firstName` | string | Obrigatório |
| `lastName` | string | Obrigatório |
| `role` | enum | Valores: `seller`, `buyer` |
| `status` | enum | Valores: `active`, `inactive` — default: `active` |
| `createdAt` | timestamp | Preenchido automaticamente na criação |
| `updatedAt` | timestamp | Atualizado automaticamente em alterações |

Enums necessários:

- `UserRole`: `seller` \| `buyer`
- `UserStatus`: `active` \| `inactive`

## Variáveis de ambiente

| Variável | Descrição | Exemplo local |
|---|---|---|
| `PORT` | Porta HTTP do serviço | `3000` |
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5433` |
| `DB_USERNAME` | Usuário do banco | `postgres` |
| `DB_PASSWORD` | Senha do banco | `postgres` |
| `DB_DATABASE` | Nome do database | `users_db` |

Deve existir um arquivo de exemplo de ambiente (por exemplo `.env.example`) documentando essas variáveis, sem commitar segredos reais.

## Estrutura esperada do serviço (alto nível)

```text
users-service/
├── compose.yaml
├── docs/
│   └── specs/
│       └── scaffold.md
├── src/
│   ├── config/          # configuração de banco / ambiente
│   ├── users/           # módulo + entidade User
│   ├── app.module.ts
│   └── main.ts
├── package.json
└── ...
```

A organização interna deve seguir o padrão já usado em `checkout` e `payments`.

## Fora de escopo

Esta spec **não** inclui:

- Endpoints HTTP (CRUD ou autenticação)
- Hash de senha, JWT, guards ou Passport
- Integração com RabbitMQ / messaging
- Integração com o API Gateway
- Migrations versionadas (usar synchronize apenas em desenvolvimento)
- Lógica de negócio de usuários
- Testes de endpoints (não há endpoints neste scaffold)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Projeto inicia**  
   Com as dependências instaladas, o comando de start em modo desenvolvimento sobe a aplicação sem erros de compilação.

2. **CA-02 — Porta padrão**  
   Sem `PORT` definido, o serviço escuta na porta `3000`.

3. **CA-03 — Banco sobe via Compose**  
   Ao executar o compose do serviço, o container PostgreSQL 15 fica healthy e a porta `5433` fica acessível no host, com database `users_db`.

4. **CA-04 — Conexão com o banco**  
   Com o banco no ar e as variáveis de ambiente configuradas, a aplicação conecta ao PostgreSQL sem erro na inicialização.

5. **CA-05 — Entidade User criada**  
   Após a subida da aplicação em ambiente de desenvolvimento, a tabela correspondente à entidade `User` existe no banco com as colunas: `id`, `email`, `password`, `firstName`, `lastName`, `role`, `status`, `createdAt`, `updatedAt`.

6. **CA-06 — Constraints e defaults**  
   - `id` é UUID  
   - `email` possui constraint de unicidade  
   - `role` aceita apenas `seller` e `buyer`  
   - `status` aceita apenas `active` e `inactive`  
   - o default de `status` é `active`

7. **CA-07 — Módulo de usuários presente**  
   O módulo de usuários está registrado na aplicação e a entidade `User` está mapeada no TypeORM. Não existem controllers ou rotas HTTP de usuários.

8. **CA-08 — ValidationPipe global**  
   O `ValidationPipe` global está habilitado com `transform`, `whitelist` e `forbidNonWhitelisted`.

9. **CA-09 — Variáveis de ambiente**  
   Existe documentação/exemplo das variáveis `PORT`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE`.

10. **CA-10 — Escopo respeitado**  
    Não há implementação de endpoints, autenticação, hashing de senha ou integração com messaging/gateway neste scaffold.

## Ordem sugerida de implementação

1. Garantir dependências do scaffold instaladas  
2. Criar Compose do PostgreSQL 15  
3. Configurar variáveis de ambiente e conexão TypeORM  
4. Criar enums, entidade `User` e módulo de usuários  
5. Registrar módulo e configuração no módulo raiz  
6. Habilitar ValidationPipe global e porta `3000`  
7. Validar os critérios de aceite

## Commits

Faça sempre um commit após a implementação de cada item desta spec.
