# Spec: Métricas HTTP com prom-client no payments-service

## Contexto

O `payments-service` (pasta `payments/`, porta HTTP `3004`) processa pagamentos via RabbitMQ e expõe consulta HTTP (`GET /payments/:orderId`) e health (`GET /health`). **Não** há `JwtAuthGuard` global neste serviço.

Hoje já existe um endpoint **`GET /metrics`** no `EventsModule` que devolve **JSON** com métricas internas do consumer RabbitMQ (`totalProcessed`, `totalSuccess`, `totalFailed`, etc.). Esse contrato **não** é o formato de exposição Prometheus.

A stack de observabilidade (`observability-stack/`) já está rodando. O Prometheus está configurado para fazer scrape de `GET /metrics` em `host.docker.internal:3004` a cada `15s`, esperando o **formato texto Prometheus**. Enquanto `/metrics` continuar sendo JSON do consumer (ou inexistente no formato certo), o target permanece incompatível / **DOWN**.

Esta spec define a **instrumentação HTTP** do `payments-service` com `prom-client` e **libera o path `/metrics`** para o Prometheus, realocando o endpoint JSON do consumer para outro caminho.

Métricas de negócio Prometheus (pagamentos aprovados/rejeitados, latência do gateway falso, filas) e dashboards no Grafana ficam para specs futuras. Prometheus e Grafana **não** devem ser alterados nesta entrega.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| prom-client | Biblioteca oficial de métricas Prometheus para Node.js |
| Interceptor global | Via `APP_INTERCEPTOR` |
| Auth | Sem JWT global; `/metrics` permanece acessível sem autenticação |
| Package manager | Bun (padrão do monorepo) |

## Conflito de path existente

| Path atual | Formato | Problema |
|---|---|---|
| `GET /metrics` (consumer JSON) | JSON de negócio/ops do consumer | Colide com o path canônico do scrape Prometheus |

Resolução obrigatória nesta entrega: o path **`/metrics`** passa a ser exclusivo do formato Prometheus. O endpoint JSON do consumer deve ser **movido** (ver RF-09).

## Requisitos funcionais

### RF-01 — Dependência `prom-client`

O serviço deve declarar `prom-client` como dependência de produção e instalá-la com o gerenciador de pacotes do projeto (Bun).

### RF-02 — `MetricsModule` global

Deve existir um `MetricsModule` marcado como **`@Global()`**, responsável por concentrar a instrumentação HTTP Prometheus deste serviço.

O módulo deve registrar:

1. `MetricsService`
2. `HttpMetricsInterceptor` como interceptor global (`APP_INTERCEPTOR`)
3. `MetricsController` Prometheus (endpoint `GET /metrics`)

Após importar o `MetricsModule` no `AppModule`, o restante da aplicação não precisa reimportá-lo para consumir o `MetricsService`.

O controller Prometheus deste módulo **não** deve ser confundido com o controller JSON do consumer (que deixa de ocupar `/metrics`).

### RF-03 — `MetricsService`

Deve existir um `MetricsService` que:

1. Possua um **registry** Prometheus dedicado (ou o registry padrão do `prom-client`, de forma consistente e única no processo)
2. Exponha o counter **`http_requests_total`** com labels:
   - `method` — método HTTP (ex.: `GET`, `POST`)
   - `route` — rota/template da rota (ex.: `/payments/:orderId`, `/health`)
   - `status_code` — código de status HTTP como string (ex.: `200`, `404`)
3. Exponha o histogram **`http_request_duration_seconds`** com os mesmos labels `method`, `route` e `status_code`, medindo a duração da requisição em segundos
4. Ative **`collectDefaultMetrics`** do `prom-client` no mesmo registry (métricas padrão do processo Node.js)
5. Disponibilize um método para serializar todas as métricas do registry no formato de exposição Prometheus (texto)

Regras:

1. Os nomes das métricas HTTP customizadas desta entrega são exatamente `http_requests_total` e `http_request_duration_seconds`
2. Não criar métricas Prometheus de negócio (pagamentos aprovados, rejeitados, retries de fila, etc.) nesta entrega
3. Buckets do histogram podem usar valores padrão razoáveis para latência HTTP de API

### RF-04 — `HttpMetricsInterceptor` global

Deve existir um interceptor HTTP registrado como **`APP_INTERCEPTOR`** que, para cada requisição elegível:

1. Meça a duração desde o início até a conclusão da resposta (sucesso ou erro)
2. Identifique `method`, `route` e `status_code`
3. Incremente `http_requests_total` com esses labels
4. Observe a duração em `http_request_duration_seconds` com os mesmos labels

Regras de rota:

1. Preferir o path/template da rota NestJS (ex.: `/payments/:orderId`) em vez do path bruto com IDs concretos, para evitar cardinalidade explosiva de labels
2. Se a rota não puder ser determinada, usar um valor fallback estável e documentado (ex.: `unknown`)
3. Requisições que resultem em erro HTTP (4xx/5xx) **também** devem ser contabilizadas, com o `status_code` correspondente

### RF-05 — `MetricsController` — `GET /metrics` (Prometheus)

Deve existir um controller que exponha:

| Método | Caminho | Auth | Content-Type esperado |
|---|---|---|---|
| `GET` | `/metrics` | Público (sem auth no serviço) | Formato de exposição Prometheus (texto) |

Regras:

1. Sem autenticação, `GET /metrics` deve responder **200** com o body das métricas
2. O body deve ser o texto serializado do registry (compatível com scrape do Prometheus)
3. O endpoint existe exclusivamente para scrape/observabilidade Prometheus
4. **Não** deve retornar o JSON antigo do consumer

### RF-06 — Exclusão de `/metrics` da contagem (anti-loop)

Requisições ao próprio endpoint Prometheus `GET /metrics` **não** devem incrementar `http_requests_total` nem observar `http_request_duration_seconds`.

Motivo: o Prometheus faz scrape a cada 15s; contabilizar o scrape criaria ruído e um efeito de autoalimentação nas séries HTTP.

A exclusão aplica-se ao path Prometheus (`/metrics`). O novo path do consumer JSON (RF-09) e demais rotas (`GET /`, `GET /health`, `GET /payments/:orderId`) **continuam** sendo instrumentadas normalmente.

### RF-07 — Registro no `AppModule`

O `AppModule` do `payments-service` deve importar o `MetricsModule`.

Regras:

1. Não alterar contratos de `GET /payments/:orderId`, health, DLQ ou fluxo RabbitMQ de pagamento/resultado
2. O interceptor de métricas coexiste com `PaymentsModule` e `EventsModule`

### RF-08 — Validação no Prometheus

Com o `payments-service` no ar na porta `3004` e a stack `observability-stack` no ar:

1. O target do job `payments-service` no Prometheus deve ficar **UP**
2. Queries simples devem retornar séries de `http_requests_total` e/ou `http_request_duration_seconds` após gerar tráfego HTTP no serviço
3. Métricas default do Node.js coletadas via `collectDefaultMetrics` devem aparecer no endpoint `/metrics`

Esta entrega **não** altera `observability-stack/prometheus/prometheus.yml` nem o Grafana.

### RF-09 — Realocar métricas JSON do consumer

O endpoint JSON atual do consumer **deve deixar de ocupar** `GET /metrics`.

Novo path canônico:

| Método | Caminho novo | Formato | Conteúdo |
|---|---|---|---|
| `GET` | `/consumer-metrics` | JSON | Mesmo contrato de campos já exposto pelo consumer (totais, success rate, uptime, status, etc.) |

Regras:

1. O comportamento e os campos do JSON do consumer permanecem equivalentes ao que existia em `/metrics` (sem regressão de informação)
2. `GET /metrics` passa a responder **somente** no formato Prometheus
3. Atualizar referências internas (README do serviço, comentários, testes e2e/unitários que apontem para o path antigo) para o novo path
4. O controller/JSON do consumer pode ser renomeado para evitar colisão de nome com o `MetricsController` Prometheus, desde que a responsabilidade fique clara
5. **Não** converter o JSON do consumer em métricas Prometheus nesta entrega (isso é métrica de negócio / ops de fila — spec futura)

## Métricas expostas

| Métrica | Tipo | Labels | Origem |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Interceptor HTTP |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Interceptor HTTP |
| Métricas padrão Node.js | Variados | Conforme `prom-client` | `collectDefaultMetrics` |

Endpoints auxiliares (fora do scrape Prometheus):

| Endpoint | Formato | Observação |
|---|---|---|
| `GET /consumer-metrics` | JSON | Métricas internas do consumer RabbitMQ (realocado) |

## Estrutura esperada (alto nível)

```text
payments/
├── src/
│   ├── metrics/                    # MetricsModule Prometheus (service, interceptor, controller)
│   ├── events/
│   │   └── metrics/                # controller JSON do consumer → path /consumer-metrics
│   └── app.module.ts               # importa MetricsModule
└── docs/
    └── specs/
        └── 02-http-metrics-prom-client.md
```

A organização interna de arquivos pode variar desde que as responsabilidades e os paths finais (`/metrics` Prometheus, `/consumer-metrics` JSON) estejam cobertos.

## Fora de escopo

Esta spec **não** inclui:

- Métricas Prometheus de negócio (pagamentos aprovados/rejeitados, latência do FakePaymentGateway, retries, DLQ)
- Conversão do JSON do consumer em séries Prometheus
- Dashboards ou provisioning de dashboards no Grafana
- Alteração do Prometheus (`prometheus.yml`, regras, Alertmanager)
- Alteração do Grafana (datasource, alerting, contact points)
- OpenTelemetry, tracing distribuído, Loki/logs
- Introdução de JWT no payments-service
- Autenticação ou basic-auth no endpoint `/metrics`

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (`curl`, UI/API do Prometheus ou testes).

1. **CA-01 — Dependência instalada**  
   `prom-client` consta nas dependências de produção do `payments-service`.

2. **CA-02 — MetricsModule global**  
   Existe `MetricsModule` `@Global()` importado no `AppModule`, registrando service, interceptor global e controller Prometheus.

3. **CA-03 — Counter e histogram**  
   O registry expõe `http_requests_total` (counter) e `http_request_duration_seconds` (histogram) com labels `method`, `route` e `status_code`.

4. **CA-04 — collectDefaultMetrics**  
   `GET /metrics` inclui métricas padrão do processo Node.js coletadas via `collectDefaultMetrics`.

5. **CA-05 — Endpoint Prometheus**  
   `GET http://localhost:3004/metrics` responde **200** com texto no formato Prometheus (não JSON).

6. **CA-06 — Consumer realocado**  
   `GET http://localhost:3004/consumer-metrics` responde **200** com o JSON das métricas do consumer; `GET /metrics` **não** devolve esse JSON.

7. **CA-07 — Instrumentação de outras rotas**  
   Após chamar uma rota de negócio (ex.: `GET /health`), o texto de `/metrics` reflete incremento em `http_requests_total` (e observação no histogram) com labels coerentes.

8. **CA-08 — Anti-loop em `/metrics`**  
   Chamadas repetidas a `GET /metrics` **não** aumentam `http_requests_total` / `http_request_duration_seconds` para a própria rota `/metrics`.

9. **CA-09 — Target UP no Prometheus**  
   Com serviço e Prometheus no ar, o target `payments-service` (`host.docker.internal:3004` / `/metrics`) aparece como **UP** em Status → Targets (ou API `/api/v1/targets`).

10. **CA-10 — Escopo respeitado**  
    Não há métricas Prometheus de negócio novas; não há alteração em Prometheus/Grafana; não há dashboards provisionados nesta entrega.

11. **CA-11 — Sem regressão de informação do consumer**  
    O JSON em `/consumer-metrics` mantém as informações que antes estavam em `/metrics` (totais, taxas derivadas, uptime/status conforme o contrato atual).

## Ordem sugerida de implementação

1. Instalar `prom-client`  
2. Realocar o endpoint JSON do consumer de `/metrics` para `/consumer-metrics` e ajustar testes/docs locais  
3. Criar `MetricsService` (registry, counter, histogram, `collectDefaultMetrics`, serialização)  
4. Criar `HttpMetricsInterceptor` com exclusão de `/metrics`  
5. Criar `MetricsController` Prometheus com `GET /metrics`  
6. Criar `MetricsModule` `@Global()` e registrar interceptor via `APP_INTERCEPTOR`  
7. Importar `MetricsModule` no `AppModule`  
8. Validar `curl http://localhost:3004/metrics` (texto Prometheus) e `curl http://localhost:3004/consumer-metrics` (JSON)  
9. Gerar tráfego em outra rota e confirmar labels/contadores  
10. Confirmar anti-loop e target **UP** no Prometheus (`http://localhost:9090`)

## Commits

Esta aula entrega **apenas a SPEC**. A implementação deve ser feita em entrega posterior, a partir de um plano em português aprovado.

Quando for implementar:

- Preferir **um commit por item/RF** com lint (Biome) antes de cada commit, no padrão do serviço
- O commit de realocação do consumer (`/consumer-metrics`) pode preceder o da exposição Prometheus para evitar dois handlers no mesmo path
- Não misturar dashboards Grafana, métricas Prometheus de negócio ou mudanças na stack `observability-stack/` nesses commits
