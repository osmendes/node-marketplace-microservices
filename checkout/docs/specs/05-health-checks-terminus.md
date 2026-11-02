# Spec: Health checks avançados com @nestjs/terminus no checkout-service

## Contexto

O `checkout-service` (porta HTTP `3003`, pasta `checkout/`) expõe hoje um `GET /health` simples que retorna `{ status: "ok", service: "checkout-service" }` **sem** verificar dependências.

Dependências críticas do serviço:

| Dependência | Uso |
|---|---|
| PostgreSQL (`checkout_db`, host tipicamente `5434`) | TypeORM — carrinho, pedidos |
| RabbitMQ (`RABBITMQ_URL`, tipicamente `amqp://admin:admin@localhost:5672`) | Publicação de ordens de pagamento e consumo do resultado |

Esta spec define health checks reais com **`@nestjs/terminus`**: PostgreSQL via `TypeOrmHealthIndicator` e RabbitMQ via `MicroserviceHealthIndicator`.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente |
| `@nestjs/terminus` | Health checks oficiais |
| TypeORM | `TypeOrmHealthIndicator` |
| RabbitMQ / microservices | `MicroserviceHealthIndicator` (transporte RMQ / ping conforme Terminus) |
| Auth | JWT global já existente; `GET /health` deve ser `@Public()` |
| Package manager | Bun |

## Pré-condições

1. Postgres e RabbitMQ acessíveis na configuração local do serviço
2. Métricas HTTP e de negócio (`orders_created_total`, `rabbitmq_messages_published_total`) já entregues — **não** alterar nesta entrega
3. URL/credenciais RabbitMQ já usadas pelo `RabbitmqService` (env `RABBITMQ_URL`)

## Requisitos funcionais

### RF-01 — Dependência `@nestjs/terminus`

Declarar e instalar `@nestjs/terminus` com Bun. Se a checagem RMQ do Terminus exigir `@nestjs/microservices` (ou peer já alinhado ao monorepo), declarar a dependência necessária de forma mínima e explícita — sem redesenhar o client `amqplib` existente.

### RF-02 — `HealthModule` com `HealthController`

`HealthModule` + `HealthController`, importados no `AppModule`.

### RF-03 — `GET /health` com Terminus (PostgreSQL + RabbitMQ)

Indicadores obrigatórios:

| Chave sugerida | Indicador | O que verifica |
|---|---|---|
| `database` | `TypeOrmHealthIndicator` | PostgreSQL via TypeORM |
| `rabbitmq` | `MicroserviceHealthIndicator` | Disponibilidade do broker RabbitMQ |

Regras:

1. Path canônico: **`GET /health`**
2. Rota **pública** (`@Public()`)
3. Sucesso somente quando **ambos** os indicadores passarem → HTTP **200**
4. Se database **ou** RabbitMQ falhar → HTTP de falha de health (tipicamente **503**) e detalhe do(s) indicador(es) em erro
5. Corpo no formato padrão do Terminus
6. Eliminar o health fake `{ status: "ok" }` sem checagem
7. Reutilizar a configuração de URL do RabbitMQ já adotada pelo serviço (`RABBITMQ_URL` / equivalente), sem hardcode secreto novo
8. Sem novas rotas de readiness/liveness Kubernetes

### RF-04 — Testes e referências

Atualizar testes que esperavam o JSON simples; mocks dos indicadores Terminus são aceitáveis em unitário; e2e/smoke devem cobrir ao menos o caminho feliz com dependências up.

### RF-05 — Coexistência com métricas e mensageria

1. Não alterar counters de negócio nem o fluxo de publish/consume
2. `GET /metrics` intacto
3. `GET /health` continua nas séries HTTP
4. Alerting fica na spec da `observability-stack`

## Respostas esperadas

### Sucesso

- HTTP **200**
- Indicadores `database` e `rabbitmq` saudáveis

### Falha parcial ou total

- HTTP de erro de health (tipicamente **503**)
- Ao menos um indicador em erro, identificável no corpo Terminus

## Estrutura esperada (alto nível)

```text
checkout/
├── src/
│   ├── health/                 # HealthModule + HealthController
│   └── app.module.ts
└── docs/
    └── specs/
        └── 05-health-checks-terminus.md
```

## Fora de escopo

- Readiness/liveness probes Kubernetes
- Alerting / notificações externas
- Exporter RabbitMQ ou métricas de broker além do que já existe
- Alteração de dashboards/métricas existentes (exceto o painel de alertas na spec da stack)
- Mudança de contratos de cart/orders/checkout

## Critérios de aceite

1. **CA-01 — Dependência** — `@nestjs/terminus` no `package.json`
2. **CA-02 — HealthModule** — importado no `AppModule` com `HealthController`
3. **CA-03 — Público** — `GET http://localhost:3003/health` sem token não retorna **401**
4. **CA-04 — Sucesso com DB + RabbitMQ up** — **200** + ambos indicadores ok
5. **CA-05 — TypeOrmHealthIndicator** — PostgreSQL verificado de fato
6. **CA-06 — MicroserviceHealthIndicator** — RabbitMQ verificado de fato
7. **CA-07 — Falha de DB** — com RabbitMQ up e DB down, health falha e aponta database
8. **CA-08 — Falha de RabbitMQ** — com DB up e broker down, health falha e aponta rabbitmq
9. **CA-09 — Sem probes K8s** — nenhum endpoint novo de readiness/liveness Kubernetes
10. **CA-10 — Métricas/negócio preservados** — `/metrics` e counters de pedido/publish intactos
11. **CA-11 — Testes alinhados** — testes de health atualizados e passando

## Ordem sugerida de implementação

1. Instalar `@nestjs/terminus` (+ peer mínimo se necessário)
2. Criar health com TypeORM + RMQ
3. Registrar no `AppModule` e remover health fake
4. Garantir `@Public()`
5. Atualizar testes
6. Validar: ambos up; DB down; RabbitMQ down

## Commits

Esta aula entrega **apenas a SPEC**. Implementação posterior com plano em português aprovado; lint antes dos commits de código.
