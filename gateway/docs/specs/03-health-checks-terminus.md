# Spec: Health checks avançados com @nestjs/terminus no api-gateway

## Contexto

O `api-gateway` (pasta `gateway/`, porta HTTP `3005`) é a entrada HTTP do marketplace. Hoje possui:

| Endpoint / peça | Comportamento atual |
|---|---|
| `GET /health` | Status local do processo (`status: "ok"`, uptime, memória) **sem** Terminus |
| `GET /health/services` | Agrega health dos downstream via `HealthCheckService` custom (`HttpService` + cache/circuit) |
| `GET /health/services/:serviceName` | Cache por serviço |
| Rotas `ready` / `live` | Já existem no controller atual |

O gateway **não** possui banco próprio. A saúde operacional relevante é a dos **quatro serviços downstream**:

| Serviço | Porta host | Health esperado |
|---|---|---|
| `users-service` | `3000` | `GET /health` |
| `products-service` | `3001` | `GET /health` |
| `checkout-service` | `3003` | `GET /health` |
| `payments-service` | `3004` | `GET /health` |

Esta spec define a adoção de **`@nestjs/terminus`** no gateway, com `HttpHealthIndicator` (via `@nestjs/axios`, já presente) para verificar os quatro downstream.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente |
| `@nestjs/terminus` | Health checks oficiais |
| `@nestjs/axios` / `HttpModule` | Já presente no gateway |
| `HttpHealthIndicator` | Ping HTTP dos downstream |
| Auth / throttling | JWT por controller; throttler global; health sem JWT e estável para smoke |
| Package manager | Bun |

## Pré-condições

1. URLs/base dos serviços downstream já configuradas no gateway (env / config existentes)
2. Specs de health Terminus dos quatro serviços entregues ou em implementação coordenada (os pings apontam para `GET /health` de cada um)
3. Métricas HTTP do gateway (`GET /metrics`) já entregues — **não** alterar nesta entrega

## Requisitos funcionais

### RF-01 — Dependência `@nestjs/terminus`

Declarar e instalar `@nestjs/terminus` com Bun. **Não** é necessário reinstalar `@nestjs/axios` se já estiver no `package.json`.

### RF-02 — `HealthModule` com `HealthController` (Terminus)

O gateway deve concentrar o health Terminus em um `HealthModule` com `HealthController` (evoluir o módulo/controller já existentes em `src/health/` **ou** substituir de forma equivalente e clara).

O `AppModule` continua importando o módulo de health do gateway.

### RF-03 — `GET /health` com Terminus + HttpHealthIndicator

O endpoint principal **`GET /health`** deve passar a usar Terminus e verificar os quatro downstream via `HttpHealthIndicator`.

Indicadores obrigatórios (chaves sugeridas):

| Chave | Indicador | Alvo |
|---|---|---|
| `users-service` | `HttpHealthIndicator` | Health HTTP do users (`:3000/health` ou URL configurada) |
| `products-service` | `HttpHealthIndicator` | Health HTTP do products (`:3001/health`) |
| `checkout-service` | `HttpHealthIndicator` | Health HTTP do checkout (`:3003/health`) |
| `payments-service` | `HttpHealthIndicator` | Health HTTP do payments (`:3004/health`) |

Regras:

1. Path canônico do health Terminus: **`GET /health`**
2. Endpoint **público** (sem `JwtAuthGuard`); se o throttler puder atrapalhar smoke frequente, isentar health de forma alinhada ao que já se faz com `/metrics` (`SkipThrottle` ou equivalente), se necessário
3. Sucesso → HTTP **200** somente quando **os quatro** pings HTTP forem bem-sucedidos
4. Se **qualquer** downstream falhar (timeout, conexão recusada, status HTTP de erro de health) → HTTP de falha de health (tipicamente **503**) e detalhe Terminus identificando o(s) serviço(s)
5. Timeouts de ping devem ser curtos e adequados a health (evitar travar o gateway por dezenas de segundos)
6. URLs devem vir da configuração já usada pelo gateway para os serviços (não hardcodar credenciais)
7. O corpo segue o formato padrão do Terminus
8. Eliminar o payload “ok local” de `GET /health` que não valida downstream como contrato principal de saúde do gateway

### RF-04 — Relação com `/health/services` e health customizado

Regras de convivência:

1. O objetivo desta entrega é o health Terminus em **`GET /health`** com os quatro downstream
2. Endpoints auxiliares já existentes (`/health/services`, `/health/services/:serviceName`) podem:
   - permanecer temporariamente se ainda forem úteis ao smoke/E2E, **desde que** não contradigam o contrato Terminus de `GET /health`, ou
   - ser alinhados/simplificados para não duplicar lógica de forma divergente
3. Não é obrigatório reescrever o circuit breaker do `HealthCheckService` custom nesta entrega; a fonte de verdade do health Terminus é o `HttpHealthIndicator`
4. Documentar no README do gateway, em alto nível, qual endpoint usar para “gateway + dependências” (`GET /health`)

### RF-05 — Readiness / liveness (fora de escopo de novas probes)

Esta entrega **não** implementa nem redesenha probes de readiness/liveness no sentido Kubernetes.

1. **Não** adicionar novos endpoints `/ready`, `/live`, `/healthz`, `/readyz` motivados por Kubernetes
2. Se rotas `ready`/`live` já existirem no código atual, **não** expandir o escopo para transformá-las em probes K8s; podem permanecer como estão ou receber apenas ajuste mínimo de compilação/registro se a refatoração do controller exigir — sem novos requisitos de aceite de probe

### RF-06 — Coexistência com métricas e proxy

1. `GET /metrics` e resiliência de proxy (circuit/retry/timeout/fallback) permanecem
2. `GET /health` continua nas séries HTTP do interceptor
3. Alerting Prometheus fica na spec da `observability-stack`

## Respostas esperadas

### Sucesso (quatro downstream saudáveis)

- HTTP **200**
- Quatro indicadores HTTP ok no corpo Terminus

### Falha (um ou mais downstream indisponíveis)

- HTTP tipicamente **503**
- Indicadores em erro nomeando o(s) serviço(s) afetado(s)

## Estrutura esperada (alto nível)

```text
gateway/
├── src/
│   ├── health/                 # HealthModule + HealthController (Terminus + HttpHealthIndicator)
│   └── app.module.ts
└── docs/
    └── specs/
        └── 03-health-checks-terminus.md
```

## Fora de escopo

- Readiness/liveness probes Kubernetes (novas ou redesenho)
- Banco de dados no gateway
- RabbitMQ no health do gateway
- Notificações externas (Slack, e-mail)
- Alteração de métricas ou dashboards existentes além do painel de alertas na spec da stack
- Redesign completo do `HealthCheckService` / circuit de health custom (salvo o necessário para não conflitar com Terminus em `GET /health`)

## Critérios de aceite

1. **CA-01 — Dependência** — `@nestjs/terminus` no `package.json` do gateway
2. **CA-02 — HealthModule Terminus** — `HealthModule`/`HealthController` usam Terminus e estão registrados no app
3. **CA-03 — Público** — `GET http://localhost:3005/health` sem JWT não retorna **401**
4. **CA-04 — Quatro HttpHealthIndicator** — users, products, checkout e payments são verificados via HTTP
5. **CA-05 — Sucesso com todos up** — com os quatro serviços saudáveis, `GET /health` retorna **200** e Terminus ok
6. **CA-06 — Falha parcial** — com um downstream parado, `GET /health` falha (tipicamente **503**) e identifica o serviço
7. **CA-07 — Sem banco / sem RMQ no gateway** — indicadores do Terminus do gateway são apenas HTTP downstream
8. **CA-08 — Sem novas probes K8s** — nenhum endpoint novo de readiness/liveness Kubernetes nesta entrega
9. **CA-09 — Métricas preservadas** — `GET /metrics` intacto
10. **CA-10 — Testes alinhados** — testes de health do gateway atualizados e passando (mocks de HTTP/indicadores aceitáveis no unitário)

## Ordem sugerida de implementação

1. Instalar `@nestjs/terminus`
2. Evoluir `HealthModule`/`HealthController` para Terminus + `HttpHealthIndicator` nos quatro alvos
3. Garantir publicidade / throttling adequado em `GET /health`
4. Ajustar convivência com `/health/services` se necessário
5. Atualizar testes
6. Validar: todos up; um serviço down

## Commits

Esta aula entrega **apenas a SPEC**. Implementação posterior com plano em português aprovado; lint antes dos commits de código.
