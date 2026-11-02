# Spec: Health checks avançados com @nestjs/terminus no payments-service

## Contexto

O `payments-service` (porta HTTP `3004`, pasta `payments/`) expõe hoje um `GET /health` simples que retorna `{ status: "ok", service: "payments-service" }` **sem** verificar dependências.

Dependências críticas:

| Dependência | Uso |
|---|---|
| PostgreSQL (`payments_db`, host tipicamente `5435`) | TypeORM — entidade Payment |
| RabbitMQ (`RABBITMQ_URL`) | Consumo de `payment_queue` e publicação de `payment.result` |

Esta spec define health checks reais com **`@nestjs/terminus`**: PostgreSQL via `TypeOrmHealthIndicator` e RabbitMQ via `MicroserviceHealthIndicator`.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente |
| `@nestjs/terminus` | Health checks oficiais |
| TypeORM | `TypeOrmHealthIndicator` |
| RabbitMQ / microservices | `MicroserviceHealthIndicator` |
| Auth | Sem `JwtAuthGuard` global no padrão atual do serviço; health permanece público |
| Package manager | Bun |

## Pré-condições

1. Postgres e RabbitMQ acessíveis na configuração local
2. Métricas HTTP, `GET /consumer-metrics` e counters de negócio (`payments_processed_total`, `payments_approved_total`, `payments_rejected_total`) já entregues — **não** alterar nesta entrega
3. URL RabbitMQ alinhada ao `RabbitmqService` existente

## Requisitos funcionais

### RF-01 — Dependência `@nestjs/terminus`

Declarar e instalar `@nestjs/terminus` com Bun. Incluir peer mínimo (`@nestjs/microservices` ou equivalente) se a checagem RMQ do Terminus exigir — sem redesenhar o consumer atual.

### RF-02 — `HealthModule` com `HealthController`

`HealthModule` + `HealthController`, importados no `AppModule`.

### RF-03 — `GET /health` com Terminus (PostgreSQL + RabbitMQ)

| Chave sugerida | Indicador | O que verifica |
|---|---|---|
| `database` | `TypeOrmHealthIndicator` | PostgreSQL via TypeORM |
| `rabbitmq` | `MicroserviceHealthIndicator` | Broker RabbitMQ |

Regras:

1. Path canônico: **`GET /health`**
2. Endpoint **público** (sem exigir JWT)
3. Sucesso somente com **ambos** os indicadores ok → HTTP **200**
4. Falha de database ou RabbitMQ → HTTP de falha de health (tipicamente **503**) + detalhes Terminus
5. Eliminar o health fake `{ status: "ok" }`
6. Reutilizar `RABBITMQ_URL` / config já adotada
7. Sem novas rotas de readiness/liveness Kubernetes
8. Não alterar `GET /consumer-metrics` nem o fluxo de pagamento

### RF-04 — Testes e referências

Atualizar testes e README que dependiam do JSON simples de health.

### RF-05 — Coexistência com métricas

`GET /metrics` (Prometheus) e counters de pagamento intactos; `GET /health` permanece nas séries HTTP; alerting na spec da stack.

## Respostas esperadas

### Sucesso

- HTTP **200**, `database` e `rabbitmq` saudáveis

### Falha

- HTTP tipicamente **503**, com indicador(es) em erro identificáveis

## Estrutura esperada (alto nível)

```text
payments/
├── src/
│   ├── health/                 # HealthModule + HealthController
│   └── app.module.ts
└── docs/
    └── specs/
        └── 03-health-checks-terminus.md
```

## Fora de escopo

- Readiness/liveness probes Kubernetes
- Alerting / notificações externas (Slack, e-mail)
- Mudança de FakePaymentGateway, DLQ ou contratos de pagamento
- Alteração de métricas/dashboards existentes além do painel de alertas na spec da stack
- Exporter RabbitMQ dedicado

## Critérios de aceite

1. **CA-01 — Dependência** — `@nestjs/terminus` no `package.json`
2. **CA-02 — HealthModule** — importado no `AppModule`
3. **CA-03 — Público** — `GET http://localhost:3004/health` acessível sem autenticação
4. **CA-04 — Sucesso com DB + RabbitMQ up** — **200** + ambos ok
5. **CA-05 — TypeOrmHealthIndicator** — PostgreSQL verificado
6. **CA-06 — MicroserviceHealthIndicator** — RabbitMQ verificado
7. **CA-07 — Falha de DB** — health falha apontando database
8. **CA-08 — Falha de RabbitMQ** — health falha apontando rabbitmq
9. **CA-09 — Sem probes K8s** — nenhum endpoint novo de readiness/liveness Kubernetes
10. **CA-10 — Métricas preservadas** — `/metrics`, counters de pagamento e `/consumer-metrics` intactos
11. **CA-11 — Testes alinhados** — testes de health atualizados e passando

## Ordem sugerida de implementação

1. Instalar `@nestjs/terminus` (+ peer mínimo se necessário)
2. Criar health TypeORM + RMQ
3. Registrar no `AppModule` e remover health fake
4. Atualizar testes
5. Validar caminhos feliz e de falha (DB / RabbitMQ)

## Commits

Esta aula entrega **apenas a SPEC**. Implementação posterior com plano em português aprovado.
