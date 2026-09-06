# node-marketplace-microservices

Repositório unificado dos microserviços do **Marketplace**.

Este projeto contém a arquitetura de microserviços responsável por autenticação/roteamento, checkout, pagamentos e infraestrutura de mensageria.

## Estrutura do repositório

```text
node-marketplace-microservices/
├── gateway/       # API Gateway (entrada única da aplicação)
├── checkout/      # Serviço de Checkout
├── payments/      # Serviço de Pagamentos
└── messaging/     # Infraestrutura de mensageria (RabbitMQ)
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

**Stack principal:** NestJS 11 · Biome · Vitest · Lefthook · pnpm

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

### 4. `messaging`
Infraestrutura de mensageria baseada em **RabbitMQ**.

Contém o `compose.yaml` para subir o broker localmente com Podman/Docker.

---

## Como desenvolver

Cada serviço é independente. Para trabalhar em um deles:

```bash
# Exemplo com o gateway
cd gateway
pnpm install          # ou npm / yarn, dependendo do serviço
pnpm run start:dev
```

### Observações importantes

- O **gateway** usa **pnpm** + Biome + Vitest + Lefthook.
- Os serviços `checkout` e `payments` usam o padrão clássico do NestJS (ESLint + Prettier + Jest).
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
| TypeORM + PostgreSQL | Persistência (checkout e payments)   |
| RabbitMQ         | Mensageria entre serviços                |
| JWT + Passport   | Autenticação no Gateway                  |
| Biome            | Linter/Formatter (Gateway)               |
| Vitest           | Testes (Gateway)                         |
| Jest             | Testes (Checkout e Payments)             |

---

## Próximos passos

No futuro este repositório pode evoluir para um **monorepo** completo com:

- pnpm workspaces
- Turborepo
- Código compartilhado (`packages/shared`)
- Docker Compose unificado
- CI/CD único

---

## Licença

MIT
