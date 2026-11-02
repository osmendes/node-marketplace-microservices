# Spec: Health checks avançados com @nestjs/terminus no products-service

## Contexto

O `products-service` (porta HTTP `3001`) expõe hoje um `GET /health` simples que retorna `{ status: "ok", service: "products-service" }` **sem** verificar dependências. O serviço usa TypeORM com PostgreSQL (`products_db`, host tipicamente `5436`).

Esta spec define a substituição do health superficial por um health check real com **`@nestjs/terminus`**, verificando a conectividade com o **PostgreSQL** via `TypeOrmHealthIndicator`.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| `@nestjs/terminus` | Health checks oficiais NestJS |
| TypeORM | Já presente; indicador `TypeOrmHealthIndicator` |
| Auth | `JwtAuthGuard` global; `GET /health` deve permanecer público (`@Public()`) |
| Package manager | Bun (padrão do monorepo) |

## Pré-condições

1. Serviço sobe com TypeORM conectado ao PostgreSQL
2. Decorator `@Public()` já disponível
3. Métricas HTTP / `GET /metrics` permanecem inalteradas nesta entrega

## Requisitos funcionais

### RF-01 — Dependência `@nestjs/terminus`

O serviço deve declarar `@nestjs/terminus` como dependência de produção e instalá-la com Bun.

### RF-02 — `HealthModule` com `HealthController`

Deve existir um `HealthModule` com `HealthController`, importado pelo `AppModule`.

### RF-03 — `GET /health` com Terminus + PostgreSQL

O endpoint principal de saúde deve usar Terminus.

| Chave sugerida | Indicador | O que verifica |
|---|---|---|
| `database` (ou equivalente claro) | `TypeOrmHealthIndicator` | Conectividade / ping ao PostgreSQL via TypeORM |

Regras:

1. Path canônico: **`GET /health`**
2. Rota **pública** (`@Public()`)
3. Sucesso → HTTP **200** + status Terminus de sucesso
4. Falha de banco → HTTP de falha de health (tipicamente **503**) + detalhe do indicador
5. Corpo no formato padrão do Terminus
6. Eliminar o health fake `{ status: "ok" }` sem checagem de dependência
7. Sem indicador de RabbitMQ
8. Sem novas rotas de readiness/liveness Kubernetes

### RF-04 — Testes e referências

Atualizar testes e menções no README que dependiam do JSON simples `{ status: "ok", service: "products-service" }`.

### RF-05 — Coexistência com métricas

`GET /metrics` e o `MetricsModule` permanecem; `GET /health` continua instrumentado nas séries HTTP; sem mudanças em Prometheus/Grafana nesta entrega do serviço.

## Respostas esperadas

### Sucesso (PostgreSQL acessível)

- HTTP **200**, Terminus ok, indicador de database saudável

### Falha (PostgreSQL inacessível)

- HTTP de erro de health (tipicamente **503**), indicador de database em erro

## Estrutura esperada (alto nível)

```text
products-service/
├── src/
│   ├── health/                 # HealthModule + HealthController (Terminus)
│   └── app.module.ts
└── docs/
    └── specs/
        └── 07-health-checks-terminus.md
```

## Fora de escopo

- Readiness/liveness probes Kubernetes
- RabbitMQ / outros backends
- Alerting e notificações externas
- Alteração de métricas ou dashboards existentes (além do painel de alertas definido na spec da stack)
- Mudança de contratos de produtos/JWT

## Critérios de aceite

1. **CA-01 — Dependência** — `package.json` declara `@nestjs/terminus`
2. **CA-02 — HealthModule** — módulo importado no `AppModule` com `HealthController`
3. **CA-03 — Público** — `GET http://localhost:3001/health` sem token não retorna **401**
4. **CA-04 — Sucesso com DB up** — **200** + Terminus ok + database saudável
5. **CA-05 — TypeOrmHealthIndicator** — health consulta PostgreSQL de fato
6. **CA-06 — Falha com DB down** — health reporta falha no indicador de database
7. **CA-07 — Sem probes K8s** — nenhum endpoint novo de readiness/liveness Kubernetes
8. **CA-08 — Métricas preservadas** — `GET /metrics` intacto
9. **CA-09 — Testes alinhados** — testes de health atualizados e passando

## Ordem sugerida de implementação

1. Instalar `@nestjs/terminus`
2. Criar `HealthModule` + `HealthController` (TypeORM)
3. Registrar no `AppModule` e remover health fake
4. Garantir `@Public()`
5. Atualizar testes
6. Validar DB up / DB down

## Commits

Esta aula entrega **apenas a SPEC**. Implementação posterior a partir de plano em português aprovado; lint antes de commits de código; não misturar alerting da stack no PR deste serviço.
