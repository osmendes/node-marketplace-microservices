# Spec: Health checks avançados com @nestjs/terminus no users-service

## Contexto

O `users-service` (porta HTTP `3000`) expõe hoje um `GET /health` simples que retorna `{ status: "ok", service: "users-service" }` **sem** verificar dependências. O serviço usa TypeORM com PostgreSQL (`users_db`, host tipicamente `5433`).

A stack de observabilidade (`observability-stack/`) já coleta métricas HTTP e defaults do Node.js. Alerting e health de dependências ficam em specs complementares desta aula.

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

1. Serviço sobe com TypeORM conectado ao PostgreSQL (compose/`DB_*` locais)
2. Decorator `@Public()` já disponível no serviço
3. Métricas HTTP / `GET /metrics` permanecem inalteradas nesta entrega

## Requisitos funcionais

### RF-01 — Dependência `@nestjs/terminus`

O serviço deve declarar `@nestjs/terminus` como dependência de produção e instalá-la com Bun.

### RF-02 — `HealthModule` com `HealthController`

Deve existir um `HealthModule` responsável pelos health checks do serviço, registrando um `HealthController` que expoe o endpoint de health.

O `AppModule` deve importar o `HealthModule`.

### RF-03 — `GET /health` com Terminus + PostgreSQL

O endpoint principal de saúde deve passar a usar o fluxo do Terminus (`HealthCheckService` + decorators/indicadores do pacote).

Indicador obrigatório:

| Chave sugerida | Indicador | O que verifica |
|---|---|---|
| `database` (ou equivalente claro) | `TypeOrmHealthIndicator` | Conectividade / ping ao PostgreSQL via conexão TypeORM já configurada |

Regras:

1. Path canônico permanece **`GET /health`**
2. A rota deve ser **pública** (`@Public()`), para scrape operacional, gateway e smoke sem JWT
3. Quando **todas** as checagens passarem, a resposta HTTP deve ser **200** e o status agregado do Terminus deve indicar sucesso (`ok` / equivalente Terminus)
4. Quando a checagem de banco **falhar**, a resposta HTTP deve indicar falha (tipicamente **503**) e o corpo deve refletir o erro do indicador de database
5. O corpo segue o formato padrão do Terminus (status agregado + detalhes por indicador: `info` / `error` / `details`, conforme a versão do pacote)
6. Remover ou deixar de servir o health “fake” `{ status: "ok" }` que não consulta dependências — o contrato operacional passa a ser o do Terminus
7. Não adicionar indicadores de RabbitMQ (este serviço não depende de fila nesta arquitetura)
8. Não criar rotas novas de readiness/liveness estilo Kubernetes (`/ready`, `/live`, `/healthz`, etc.)

### RF-04 — Atualização de testes e referências internas

Testes unitários/e2e e assertions que esperavam `{ status: "ok", service: "users-service" }` em `GET /health` devem ser atualizados para o contrato Terminus (sucesso com database up; falha quando o indicador reporta erro — com mocks dos indicadores quando apropriado).

README do serviço, se mencionar o health simples, deve refletir o novo comportamento em alto nível.

### RF-05 — Coexistência com métricas

1. `GET /metrics` e o `MetricsModule` permanecem inalterados em contrato
2. Requisições a `GET /health` **continuam** instrumentadas pelo interceptor HTTP existente (não excluir `/health` das séries)
3. Não alterar dashboards Grafana nem `prometheus.yml` nesta entrega do serviço (alerting é spec da `observability-stack`)

## Respostas esperadas

### Sucesso (PostgreSQL acessível)

- HTTP **200**
- Status agregado Terminus de sucesso
- Detalhe do indicador de database presente e saudável

### Falha (PostgreSQL inacessível)

- HTTP de erro de health (tipicamente **503**)
- Status agregado de erro
- Detalhe do indicador de database descrevendo a falha

## Estrutura esperada (alto nível)

```text
users-service/
├── src/
│   ├── health/                 # HealthModule + HealthController (Terminus)
│   └── app.module.ts           # importa HealthModule
└── docs/
    └── specs/
        └── 08-health-checks-terminus.md
```

A organização interna pode variar desde que `GET /health` use Terminus com `TypeOrmHealthIndicator`.

## Fora de escopo

Esta spec **não** inclui:

- Readiness/liveness probes no sentido Kubernetes
- Verificação de RabbitMQ, Redis ou outros backends
- Alerting Prometheus / Alertmanager / notificações (Slack, e-mail)
- Alteração de métricas HTTP ou de negócio
- Alteração de dashboards Grafana (exceto o que a spec de alerting da stack definir em outro arquivo)
- Mudança de portas, compose do banco ou contratos de auth/users

## Critérios de aceite

1. **CA-01 — Dependência instalada**  
   `package.json` do `users-service` declara `@nestjs/terminus`.

2. **CA-02 — HealthModule registrado**  
   Existe `HealthModule` importado no `AppModule`, com `HealthController`.

3. **CA-03 — Health público**  
   `GET http://localhost:3000/health` **sem** `Authorization` responde sem **401**.

4. **CA-04 — Sucesso com banco up**  
   Com PostgreSQL acessível, `GET /health` retorna **200** e status Terminus de sucesso, com indicador de database saudável.

5. **CA-05 — TypeOrmHealthIndicator**  
   O health verifica PostgreSQL via `TypeOrmHealthIndicator` (não retorna ok fixo sem checar o banco).

6. **CA-06 — Falha com banco down**  
   Com o banco inacessível (parado ou credencial/porta inválida em cenário de teste controlado), `GET /health` deixa de retornar sucesso e reporta falha no indicador de database.

7. **CA-07 — Sem probes K8s novas**  
   Não foram adicionados endpoints dedicados de readiness/liveness Kubernetes nesta entrega.

8. **CA-08 — Métricas preservadas**  
   `GET /metrics` continua no contrato Prometheus existente; séries HTTP não foram removidas.

9. **CA-09 — Testes alinhados**  
   Specs/testes do serviço que cobrem health passam com o novo contrato (ou foram atualizados de forma explícita).

## Ordem sugerida de implementação

1. Instalar `@nestjs/terminus`
2. Criar `HealthModule` + `HealthController` com Terminus e `TypeOrmHealthIndicator`
3. Importar no `AppModule` e desligar o health fake do `AppController`/`AppService` (ou redirecionar responsabilidade)
4. Garantir `@Public()` em `GET /health`
5. Atualizar testes unitários/e2e
6. Validar com banco up (**200**) e, se possível, banco down (falha)

## Commits

Esta aula entrega **apenas a SPEC**. A implementação deve ser feita em entrega posterior, a partir de um plano em português aprovado.

Quando for implementar: preferir commits claros por RF (ou um commit coerente da feature de health), com lint (Biome) antes de cada commit que tocar código; não misturar alerting da stack neste PR do serviço.
