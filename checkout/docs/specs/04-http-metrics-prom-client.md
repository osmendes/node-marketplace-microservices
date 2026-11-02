# Spec: Métricas HTTP com prom-client no checkout-service

## Contexto

O `checkout-service` (pasta `checkout/`, porta HTTP `3003`) já possui autenticação JWT com `JwtAuthGuard` global (`APP_GUARD`) e decorator `@Public()` para rotas abertas (raiz e health).

A stack de observabilidade (`observability-stack/`) já está rodando. O Prometheus está configurado para fazer scrape de `GET /metrics` em `host.docker.internal:3003` a cada `15s`. Os targets aparecem no Prometheus, porém ficam **DOWN** enquanto o serviço não expõe `/metrics` no formato Prometheus.

Esta spec define a **instrumentação HTTP** do `checkout-service` com `prom-client`: registry, counter e histogram de requisições HTTP, métricas padrão do Node.js, interceptor global e endpoint público `GET /metrics`.

Métricas de negócio customizadas (ex.: checkouts, pedidos por status, itens de carrinho) e dashboards no Grafana ficam para specs futuras. Prometheus e Grafana **não** devem ser alterados nesta entrega.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| prom-client | Biblioteca oficial de métricas Prometheus para Node.js |
| Interceptor global | Via `APP_INTERCEPTOR` |
| Auth | `JwtAuthGuard` global já existente; `/metrics` deve ser `@Public()` |
| Package manager | Bun (padrão do monorepo) |

## Requisitos funcionais

### RF-01 — Dependência `prom-client`

O serviço deve declarar `prom-client` como dependência de produção e instalá-la com o gerenciador de pacotes do projeto (Bun).

### RF-02 — `MetricsModule` global

Deve existir um `MetricsModule` marcado como **`@Global()`**, responsável por concentrar a instrumentação HTTP Prometheus deste serviço.

O módulo deve registrar:

1. `MetricsService`
2. `HttpMetricsInterceptor` como interceptor global (`APP_INTERCEPTOR`)
3. `MetricsController` (endpoint `GET /metrics`)

Após importar o `MetricsModule` no `AppModule`, o restante da aplicação não precisa reimportá-lo para consumir o `MetricsService`.

### RF-03 — `MetricsService`

Deve existir um `MetricsService` que:

1. Possua um **registry** Prometheus dedicado (ou o registry padrão do `prom-client`, de forma consistente e única no processo)
2. Exponha o counter **`http_requests_total`** com labels:
   - `method` — método HTTP (ex.: `GET`, `POST`)
   - `route` — rota/template da rota (ex.: `/cart/items`, `/orders/:id`)
   - `status_code` — código de status HTTP como string (ex.: `200`, `401`)
3. Exponha o histogram **`http_request_duration_seconds`** com os mesmos labels `method`, `route` e `status_code`, medindo a duração da requisição em segundos
4. Ative **`collectDefaultMetrics`** do `prom-client` no mesmo registry (métricas padrão do processo Node.js)
5. Disponibilize um método para serializar todas as métricas do registry no formato de exposição Prometheus (texto)

Regras:

1. Os nomes das métricas HTTP customizadas desta entrega são exatamente `http_requests_total` e `http_request_duration_seconds`
2. Não criar métricas de negócio (checkouts, pedidos, carrinho, mensagens RabbitMQ, etc.) nesta entrega
3. Buckets do histogram podem usar valores padrão razoáveis para latência HTTP de API

### RF-04 — `HttpMetricsInterceptor` global

Deve existir um interceptor HTTP registrado como **`APP_INTERCEPTOR`** que, para cada requisição elegível:

1. Meça a duração desde o início até a conclusão da resposta (sucesso ou erro)
2. Identifique `method`, `route` e `status_code`
3. Incremente `http_requests_total` com esses labels
4. Observe a duração em `http_request_duration_seconds` com os mesmos labels

Regras de rota:

1. Preferir o path/template da rota NestJS (ex.: `/orders/:id`) em vez do path bruto com IDs concretos, para evitar cardinalidade explosiva de labels
2. Se a rota não puder ser determinada, usar um valor fallback estável e documentado (ex.: `unknown`)
3. Requisições que resultem em erro HTTP (4xx/5xx) **também** devem ser contabilizadas, com o `status_code` correspondente

### RF-05 — `MetricsController` — `GET /metrics` público

Deve existir um controller que exponha:

| Método | Caminho | Auth | Content-Type esperado |
|---|---|---|---|
| `GET` | `/metrics` | Público (`@Public()`) | Formato de exposição Prometheus (texto) |

Regras:

1. A rota **deve** ser marcada com `@Public()`, pois o `JwtAuthGuard` global protege todas as rotas por padrão
2. Sem token JWT, `GET /metrics` deve responder **200** com o body das métricas
3. O body deve ser o texto serializado do registry (compatível com scrape do Prometheus)
4. O endpoint existe exclusivamente para scrape/observabilidade; não altera contratos de carrinho/pedidos

### RF-06 — Exclusão de `/metrics` da contagem (anti-loop)

Requisições ao próprio endpoint `GET /metrics` **não** devem incrementar `http_requests_total` nem observar `http_request_duration_seconds`.

Motivo: o Prometheus faz scrape a cada 15s; contabilizar o scrape criaria ruído e um efeito de autoalimentação nas séries HTTP.

A exclusão aplica-se ao path de métricas Prometheus deste serviço (`/metrics`). Demais rotas públicas (`GET /`, `GET /health`) **continuam** sendo instrumentadas normalmente.

### RF-07 — Registro no `AppModule`

O `AppModule` do `checkout-service` deve importar o `MetricsModule`.

Regras:

1. Não remover nem alterar o `JwtAuthGuard` global
2. Não alterar contratos existentes de cart, orders, events ou health
3. A ordem de providers/guards existentes permanece válida; o interceptor de métricas coexiste com o guard JWT

### RF-08 — Validação no Prometheus

Com o `checkout-service` no ar na porta `3003` e a stack `observability-stack` no ar:

1. O target do job `checkout-service` no Prometheus deve ficar **UP**
2. Queries simples devem retornar séries de `http_requests_total` e/ou `http_request_duration_seconds` após gerar tráfego HTTP no serviço
3. Métricas default do Node.js coletadas via `collectDefaultMetrics` devem aparecer no endpoint `/metrics`

Esta entrega **não** altera `observability-stack/prometheus/prometheus.yml` nem o Grafana.

## Métricas expostas

| Métrica | Tipo | Labels | Origem |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Interceptor HTTP |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Interceptor HTTP |
| Métricas padrão Node.js | Variados | Conforme `prom-client` | `collectDefaultMetrics` |

## Estrutura esperada (alto nível)

```text
checkout/
├── src/
│   ├── metrics/                    # MetricsModule, MetricsService, interceptor, controller
│   └── app.module.ts               # importa MetricsModule
└── docs/
    └── specs/
        └── 04-http-metrics-prom-client.md
```

A organização interna de arquivos pode variar desde que as responsabilidades (módulo global, service, interceptor, controller público) estejam cobertas.

## Fora de escopo

Esta spec **não** inclui:

- Métricas de negócio customizadas (checkouts, pedidos por status, itens de carrinho, publish RabbitMQ, etc.)
- Dashboards ou provisioning de dashboards no Grafana
- Alteração do Prometheus (`prometheus.yml`, regras, Alertmanager)
- Alteração do Grafana (datasource, alerting, contact points)
- OpenTelemetry, tracing distribuído, Loki/logs
- Métricas de banco (Postgres exporter) ou de RabbitMQ
- Mudança de portas, JWT, guards existentes (além de marcar `/metrics` como `@Public()`)
- Autenticação ou basic-auth no endpoint `/metrics` (permanece público em desenvolvimento)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (`curl`, UI/API do Prometheus ou testes).

1. **CA-01 — Dependência instalada**  
   `prom-client` consta nas dependências de produção do `checkout-service`.

2. **CA-02 — MetricsModule global**  
   Existe `MetricsModule` `@Global()` importado no `AppModule`, registrando service, interceptor global e controller.

3. **CA-03 — Counter e histogram**  
   O registry expõe `http_requests_total` (counter) e `http_request_duration_seconds` (histogram) com labels `method`, `route` e `status_code`.

4. **CA-04 — collectDefaultMetrics**  
   `GET /metrics` inclui métricas padrão do processo Node.js coletadas via `collectDefaultMetrics`.

5. **CA-05 — Endpoint público**  
   `GET http://localhost:3003/metrics` **sem** header `Authorization` responde **200** com texto no formato Prometheus.

6. **CA-06 — JWT não bloqueia scrape**  
   A rota `/metrics` está marcada com `@Public()`; acesso sem token não retorna **401**.

7. **CA-07 — Instrumentação de outras rotas**  
   Após chamar uma rota de negócio (ex.: `GET /` ou `GET /health`), o texto de `/metrics` reflete incremento em `http_requests_total` (e observação no histogram) com labels coerentes.

8. **CA-08 — Anti-loop em `/metrics`**  
   Chamadas repetidas a `GET /metrics` **não** aumentam `http_requests_total` / `http_request_duration_seconds` para a própria rota `/metrics`.

9. **CA-09 — Target UP no Prometheus**  
   Com serviço e Prometheus no ar, o target `checkout-service` (`host.docker.internal:3003` / `/metrics`) aparece como **UP** em Status → Targets (ou API `/api/v1/targets`).

10. **CA-10 — Escopo respeitado**  
    Não há métricas de negócio novas; não há alteração em Prometheus/Grafana; não há dashboards provisionados nesta entrega.

## Ordem sugerida de implementação

1. Instalar `prom-client`  
2. Criar `MetricsService` (registry, counter, histogram, `collectDefaultMetrics`, serialização)  
3. Criar `HttpMetricsInterceptor` com exclusão de `/metrics`  
4. Criar `MetricsController` com `GET /metrics` e `@Public()`  
5. Criar `MetricsModule` `@Global()` e registrar interceptor via `APP_INTERCEPTOR`  
6. Importar `MetricsModule` no `AppModule`  
7. Validar localmente com `curl http://localhost:3003/metrics`  
8. Gerar tráfego em outra rota e confirmar labels/contadores  
9. Confirmar que scrape de `/metrics` não polui as séries HTTP  
10. Validar target **UP** no Prometheus (`http://localhost:9090`)

## Commits

Esta aula entrega **apenas a SPEC**. A implementação deve ser feita em entrega posterior, a partir de um plano em português aprovado.

Quando for implementar:

- Preferir **um commit por item/RF** com lint (Biome) antes de cada commit, no padrão do serviço
- Não misturar dashboards Grafana, métricas de negócio ou mudanças na stack `observability-stack/` nesses commits
