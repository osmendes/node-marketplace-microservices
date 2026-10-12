# node-marketplace-microservices

Repositório unificado dos microserviços do **Marketplace**.

Este projeto contém a arquitetura de microserviços responsável por autenticação/roteamento, checkout, pagamentos e infraestrutura de mensageria.

## Estrutura do repositório

```text
node-marketplace-microservices/
├── gateway/         # API Gateway (entrada única da aplicação)
├── checkout/        # Serviço de Checkout
├── payments/        # Serviço de Pagamentos
├── users-service/   # Serviço de Usuários
└── messaging/       # Infraestrutura de mensageria (RabbitMQ)
```

Cada pasta é um serviço independente, com seu próprio `package.json`, código-fonte e configurações.

---

## Serviços

### 1. `gateway`
**API Gateway** construído com NestJS.

Principais responsabilidades:
- Ponto de entrada único da aplicação
- Autenticação e autorização (JWT + Passport)
- Rate limiting (Throttler)
- Proxy para os demais microserviços
- Resiliência: Circuit Breaker, Retry, Timeout e Fallback
- Health checks
- Logging middleware
- Swagger

**Stack principal:** NestJS 11 · Biome · Vitest · Lefthook · Bun

### 2. `checkout`
Serviço responsável pelo fluxo de checkout.

Principais características:
- NestJS + TypeORM (PostgreSQL)
- Integração com RabbitMQ (filas de pagamento)
- Configuração de banco de dados via TypeORM

### 3. `payments`
Serviço responsável pelo processamento de pagamentos.

Principais características:
- NestJS + TypeORM (PostgreSQL)
- Integração com RabbitMQ
- Estrutura similar ao serviço de checkout

### 4. `users-service`
Serviço responsável pelo gerenciamento de usuários do marketplace.

Principais características:
- NestJS + TypeORM (PostgreSQL) — scaffold em evolução
- Porta padrão: `3000`

### 5. `messaging`
Infraestrutura de mensageria baseada em **RabbitMQ**.

Contém o `compose.yaml` para subir o broker localmente com Podman/Docker.

---

## Como desenvolver

Cada serviço NestJS é independente. Para trabalhar em um deles:

```bash
# Exemplo com o gateway
cd gateway
bun install
bun run start:dev
```

### Observações importantes

- Os serviços NestJS (`gateway`, `checkout`, `payments`, `users-service`) usam **Bun** + **Biome** + **Vitest** + **Lefthook** + **commitlint**.
- O Lefthook do monorepo fica na raiz (`lefthook.yml`) e aplica Biome/commitlint por serviço.
- O serviço `messaging` é apenas a infraestrutura (RabbitMQ).

### Subindo o RabbitMQ (necessário para checkout e payments)

```bash
cd messaging
podman compose up -d
# ou
docker compose up -d
```

---

## Tecnologias utilizadas

| Tecnologia       | Uso                                      |
|------------------|------------------------------------------|
| NestJS 11        | Framework principal de todos os serviços |
| TypeORM + PostgreSQL | Persistência (checkout, payments, users) |
| RabbitMQ         | Mensageria entre serviços                |
| JWT + Passport   | Autenticação no Gateway                  |
| Biome            | Linter/Formatter                         |
| Vitest           | Testes unitários e e2e                   |
| Lefthook         | Git hooks (pre-commit + commit-msg)      |
| Bun              | Gerenciador de pacotes dos serviços NestJS |

---

## Próximos passos

No futuro este repositório pode evoluir para um **monorepo** completo com:

- Bun workspaces
- Turborepo
- Código compartilhado (`packages/shared`)
- Docker Compose unificado
- CI/CD único

---

## Licença

MIT
