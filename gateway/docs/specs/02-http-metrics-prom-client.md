# Spec: Métricas HTTP com prom-client no api-gateway

## Contexto

O `api-gateway` (pasta `gateway/`, porta HTTP `3005`) é a entrada HTTP do marketplace: proxy para users, products, checkout e payments, health agregado, rate limiting e resiliência.

Diferente dos demais serviços NestJS do monorepo, o padrão de autenticação do gateway **não** usa `JwtAuthGuard` como `APP_GUARD` global:

| Mecanismo | Como funciona no gateway |
|---|---|
| `APP_GUARD` global | `CustomThrottlerGuard` (rate limit) |
| JWT | `JwtAuthGuard` aplicado **por controller** via `@UseGuards(JwtAuthGuard)` nos proxies |
| Rotas públicas nos proxies | Decorator `@Public()` (metadata `isPublic`) ignora JWT **apenas** onde o `JwtAuthGuard` está ativo |
| Health | Controllers de health sem `JwtAuthGuard` de controller |

A stack de observabilidade (`observability-stack/`) já está rodando. O Prometheus está configurado para fazer scrape de `GET /metrics` em `host.docker.internal:3005` a cada `15s`. Os targets aparecem no Prometheus, porém ficam **DOWN** enquanto o gateway não expõe `/metrics` no formato Prometheus.

Esta spec define a **instrumentação HTTP** do `api-gateway` com `prom-client`: registry, counter e histogram de requisições HTTP, métricas padrão do Node.js, interceptor global e endpoint público `GET /metrics`, respeitando o padrão de guards do gateway.

Métricas de negócio customizadas (ex.: proxies por serviço, circuit breaker trips) e dashboards no Grafana ficam para specs futuras. Prometheus e Grafana **não** devem ser alterados nesta entrega.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no gateway |
| prom-client | Biblioteca oficial de métricas Prometheus para Node.js |
| Interceptor global | Via `APP_INTERCEPTOR` |
| Auth / throttling | JWT por controller; throttler global; `/metrics` sem JWT e sem bloqueio indevido de scrape |
| Package manager | Bun (padrão do monorepo) |

## Requisitos funcionais

### RF-01 — Dependência `prom-client`

O gateway deve declarar `prom-client` como dependência de produção e instalá-la com o gerenciador de pacotes do projeto (Bun).

### RF-02 — `MetricsModule` global

Deve existir um `MetricsModule` marcado como **`@Global()`**, responsável por concentrar a instrumentação HTTP Prometheus do gateway.

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
   - `route` — rota/template da rota (ex.: `/products/:id`, `/health`)
   - `status_code` — código de status HTTP como string (ex.: `200`, `401`, `429`)
3. Exponha o histogram **`http_request_duration_seconds`** com os mesmos labels `method`, `route` e `status_code`, medindo a duração da requisição em segundos
4. Ative **`collectDefaultMetrics`** do `prom-client` no mesmo registry (métricas padrão do processo Node.js)
5. Disponibilize um método para serializar todas as métricas do registry no formato de exposição Prometheus (texto)

Regras:

1. Os nomes das métricas HTTP customizadas desta entrega são exatamente `http_requests_total` e `http_request_duration_seconds`
2. Não criar métricas de negócio (circuit breaker, retries, proxies por upstream, etc.) nesta entrega
3. Buckets do histogram podem usar valores padrão razoáveis para latência HTTP de API/gateway

### RF-04 — `HttpMetricsInterceptor` global

Deve existir um interceptor HTTP registrado como **`APP_INTERCEPTOR`** que, para cada requisição elegível:

1. Meça a duração desde o início até a conclusão da resposta (sucesso ou erro)
2. Identifique `method`, `route` e `status_code`
3. Incremente `http_requests_total` com esses labels
4. Observe a duração em `http_request_duration_seconds` com os mesmos labels

Regras de rota:

1. Preferir o path/template da rota NestJS (ex.: `/orders/:id`) em vez do path bruto com IDs concretos, para evitar cardinalidade explosiva de labels
2. Se a rota não puder ser determinada, usar um valor fallback estável e documentado (ex.: `unknown`)
3. Requisições que resultem em erro HTTP (4xx/5xx, inclusive **429** do throttler) **também** devem ser contabilizadas, com o `status_code` correspondente

### RF-05 — `MetricsController` — `GET /metrics` público (padrão do gateway)

Deve existir um controller que exponha:

| Método | Caminho | Auth | Content-Type esperado |
|---|---|---|---|
| `GET` | `/metrics` | Público | Formato de exposição Prometheus (texto) |

Regras específicas do gateway (diferente dos outros serviços):

1. O `MetricsController` **não** deve usar `@UseGuards(JwtAuthGuard)` — o JWT no gateway é opt-in por controller; não aplicar o guard já torna a rota acessível sem token
2. Não é obrigatório usar `@Public()` neste controller **para fins de JWT**, porque o bypass `@Public()` só é avaliado quando o `JwtAuthGuard` está ativo no controller/rota
3. O scrape do Prometheus (a cada 15s, tipicamente de um único collector) **não** deve ser rejeitado por rate limit de forma que o target fique DOWN. Garantir que `GET /metrics` permaneça estável para scrape em desenvolvimento — por exemplo, isentando a rota do throttler (`SkipThrottle` ou equivalente já usado no projeto), se o limite global puder interferir
4. Sem token JWT, `GET /metrics` deve responder **200** com o body das métricas
5. O body deve ser o texto serializado do registry (compatível com scrape do Prometheus)

### RF-06 — Exclusão de `/metrics` da contagem (anti-loop)

Requisições ao próprio endpoint `GET /metrics` **não** devem incrementar `http_requests_total` nem observar `http_request_duration_seconds`.

Motivo: o Prometheus faz scrape a cada 15s; contabilizar o scrape criaria ruído e um efeito de autoalimentação nas séries HTTP.

A exclusão aplica-se ao path de métricas Prometheus do gateway (`/metrics`). Demais rotas (health, proxies, raiz) **continuam** sendo instrumentadas normalmente.

### RF-07 — Registro no `AppModule`

O `AppModule` do gateway deve importar o `MetricsModule`.

Regras:

1. Manter o `CustomThrottlerGuard` como `APP_GUARD` global
2. Não transformar o `JwtAuthGuard` em guard global nesta entrega
3. Não alterar contratos de proxy, health, auth proxy ou resiliência
4. O interceptor de métricas coexiste com middleware de logging, throttler e guards por controller

### RF-08 — Validação no Prometheus

Com o `api-gateway` no ar na porta `3005` e a stack `observability-stack` no ar:

1. O target do job `api-gateway` no Prometheus deve ficar **UP**
2. Queries simples devem retornar séries de `http_requests_total` e/ou `http_request_duration_seconds` após gerar tráfego HTTP no gateway
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
gateway/
├── src/
│   ├── metrics/                    # MetricsModule, MetricsService, interceptor, controller
│   └── app.module.ts               # importa MetricsModule; mantém throttler como APP_GUARD
└── docs/
    └── specs/
        └── 02-http-metrics-prom-client.md
```

A organização interna de arquivos pode variar desde que as responsabilidades (módulo global, service, interceptor, controller público sem JwtAuthGuard de controller) estejam cobertas.

## Fora de escopo

Esta spec **não** inclui:

- Métricas de negócio/resiliência customizadas (circuit breaker, retries, timeouts, fallbacks, proxies por upstream)
- Dashboards ou provisioning de dashboards no Grafana
- Alteração do Prometheus (`prometheus.yml`, regras, Alertmanager)
- Alteração do Grafana (datasource, alerting, contact points)
- OpenTelemetry, tracing distribuído, Loki/logs
- Transformar JWT em `APP_GUARD` global no gateway
- Autenticação ou basic-auth no endpoint `/metrics` (permanece público em desenvolvimento)
- Mudança de portas ou contratos de proxy existentes

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (`curl`, UI/API do Prometheus ou testes).

1. **CA-01 — Dependência instalada**  
   `prom-client` consta nas dependências de produção do gateway.

2. **CA-02 — MetricsModule global**  
   Existe `MetricsModule` `@Global()` importado no `AppModule`, registrando service, interceptor global e controller.

3. **CA-03 — Counter e histogram**  
   O registry expõe `http_requests_total` (counter) e `http_request_duration_seconds` (histogram) com labels `method`, `route` e `status_code`.

4. **CA-04 — collectDefaultMetrics**  
   `GET /metrics` inclui métricas padrão do processo Node.js coletadas via `collectDefaultMetrics`.

5. **CA-05 — Endpoint público sem JWT**  
   `GET http://localhost:3005/metrics` **sem** header `Authorization` responde **200** com texto no formato Prometheus.

6. **CA-06 — Padrão de guards do gateway respeitado**  
   O `MetricsController` não aplica `JwtAuthGuard` via `@UseGuards`; o `CustomThrottlerGuard` permanece como `APP_GUARD` global; JWT continua opt-in por controller nos proxies.

7. **CA-07 — Scrape estável (throttling)**  
   Scrapes repetidos de `/metrics` no intervalo do Prometheus (15s) não fazem o target ficar DOWN por rate limit; a rota de métricas permanece utilizável para coleta contínua em desenvolvimento.

8. **CA-08 — Instrumentação de outras rotas**  
   Após chamar uma rota do gateway (ex.: `GET /health`), o texto de `/metrics` reflete incremento em `http_requests_total` (e observação no histogram) com labels coerentes.

9. **CA-09 — Anti-loop em `/metrics`**  
   Chamadas repetidas a `GET /metrics` **não** aumentam `http_requests_total` / `http_request_duration_seconds` para a própria rota `/metrics`.

10. **CA-10 — Target UP no Prometheus**  
    Com gateway e Prometheus no ar, o target `api-gateway` (`host.docker.internal:3005` / `/metrics`) aparece como **UP** em Status → Targets (ou API `/api/v1/targets`).

11. **CA-11 — Escopo respeitado**  
    Não há métricas de negócio/resiliência novas; não há alteração em Prometheus/Grafana; não há dashboards provisionados nesta entrega.

## Ordem sugerida de implementação

1. Instalar `prom-client`  
2. Criar `MetricsService` (registry, counter, histogram, `collectDefaultMetrics`, serialização)  
3. Criar `HttpMetricsInterceptor` com exclusão de `/metrics`  
4. Criar `MetricsController` com `GET /metrics` **sem** `@UseGuards(JwtAuthGuard)` e com isenção de throttling se necessário  
5. Criar `MetricsModule` `@Global()` e registrar interceptor via `APP_INTERCEPTOR`  
6. Importar `MetricsModule` no `AppModule` (mantendo throttler global)  
7. Validar localmente com `curl http://localhost:3005/metrics`  
8. Gerar tráfego em outra rota (ex.: `/health`) e confirmar labels/contadores  
9. Confirmar anti-loop e estabilidade do scrape sob throttler  
10. Validar target **UP** no Prometheus (`http://localhost:9090`)

## Commits

Esta aula entrega **apenas a SPEC**. A implementação deve ser feita em entrega posterior, a partir de um plano em português aprovado.

Quando for implementar:

- Preferir **um commit por item/RF** com lint (Biome) antes de cada commit, no padrão do gateway
- Não misturar dashboards Grafana, métricas de negócio/resiliência ou mudanças na stack `observability-stack/` nesses commits
