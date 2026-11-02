# Spec: Dashboards Grafana e métricas de negócio

## Contexto

O monorepo `node-marketplace-microservices` já possui:

| Componente | Estado atual |
|---|---|
| Cinco serviços NestJS | `api-gateway` (`3005`), `users-service` (`3000`), `products-service` (`3001`), `checkout-service` (`3003`), `payments-service` (`3004`) |
| Endpoint `/metrics` | Exposição Prometheus (`prom-client`) em todos os cinco serviços |
| `MetricsModule` / `MetricsService` | `@Global()`; registry dedicado; disponível para métricas customizadas |
| Métricas HTTP | `http_requests_total` (Counter), `http_request_duration_seconds` (Histogram) + `collectDefaultMetrics` (Node.js) |
| Labels HTTP | `method`, `route`, `status_code` (+ `job`/`instance` no scrape) |
| Prometheus | Porta host `9090`; scrape a cada `15s` via `host.docker.internal` |
| Grafana | Porta host `3010`; datasource Prometheus já provisionado |

A stack sobe em `observability-stack/` (Compose). Ainda **não** há dashboards versionados nem métricas Prometheus de negócio (pagamentos, pedidos, publicações RabbitMQ).

Esta spec define:

1. Métricas de negócio customizadas em `payments-service` e `checkout-service`
2. Dashboard **Marketplace Overview** (visão global)
3. Dashboard **Service Details** (detalhe por serviço, com variável `$service`)
4. Provisioning dos dashboards via JSON versionado no repositório
5. Tabela de referência das queries PromQL principais
6. Critérios de aceite objetivos

**Alerting** (Alertmanager, regras Prometheus, contact points Grafana) fica para a próxima spec. Esta entrega **não** altera `compose.yaml`, `prometheus.yml` nem o datasource do Grafana.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente nos serviços |
| prom-client | Já presente; registry via `MetricsService` |
| Prometheus | Já em `observability-stack/` (scrape inalterado) |
| Grafana | Já em `observability-stack/`; provisioning de **dashboards** a adicionar |
| Package manager | Bun (padrão do monorepo) |

## Pré-condições

1. Os cinco targets Prometheus dos serviços NestJS devem estar **UP** (instrumentação HTTP já entregue)
2. Grafana acessível em `http://localhost:3010` com datasource Prometheus default
3. `MetricsService` continua sendo a porta de entrada para registrar métricas customizadas no mesmo registry de `/metrics`

## Requisitos funcionais

### RF-01 — Métricas de negócio no `payments-service`

O `payments-service` deve expor, no mesmo registry de `/metrics`, as seguintes métricas Prometheus:

| Métrica | Tipo | Labels | Quando incrementar |
|---|---|---|---|
| `payments_processed_total` | Counter | — (sem labels obrigatórios) | A cada pagamento processado (aprovado ou rejeitado) |
| `payments_approved_total` | Counter | — | A cada pagamento **aprovado** pelo gateway de pagamento |
| `payments_rejected_total` | Counter | `reason` | A cada pagamento **rejeitado**; `reason` identifica o motivo |

Regras:

1. Nomes das métricas são exatamente os da tabela
2. O label `reason` em `payments_rejected_total` deve refletir o motivo de rejeição já produzido pelo fluxo atual (ex.: `Limite excedido`, `Cartão recusado pela operadora`), sem inventar motivos novos
3. Incrementar no ponto do fluxo em que o resultado do processamento fica definido (aprovado/rejeitado), de forma que um pagamento aprovado incremente `payments_processed_total` e `payments_approved_total`, e um rejeitado incremente `payments_processed_total` e `payments_rejected_total{reason=...}`
4. Usar o registry do `MetricsService` global (não criar registry paralelo)
5. As métricas HTTP existentes e o endpoint JSON `GET /consumer-metrics` permanecem inalterados em contrato
6. Não adicionar métricas de banco de dados nem de exporter RabbitMQ

### RF-02 — Métricas de negócio no `checkout-service`

O `checkout-service` deve expor, no mesmo registry de `/metrics`:

| Métrica | Tipo | Labels | Quando incrementar |
|---|---|---|---|
| `orders_created_total` | Counter | — | A cada pedido criado com sucesso no fluxo de checkout/finalização |
| `rabbitmq_messages_published_total` | Counter | `queue` | A cada mensagem publicada com sucesso no RabbitMQ |

Regras:

1. Nomes das métricas são exatamente os da tabela
2. O label `queue` em `rabbitmq_messages_published_total` identifica a fila/destino lógico da publicação (ex.: `payment_queue` para a publicação da ordem de pagamento)
3. Incrementar `orders_created_total` somente quando o pedido for efetivamente criado (não em falhas de validação anteriores à criação)
4. Incrementar `rabbitmq_messages_published_total` somente após publicação bem-sucedida (falhas de publish não incrementam)
5. Usar o registry do `MetricsService` global
6. Não adicionar métricas de banco de dados nem instalar RabbitMQ exporter

### RF-03 — Estrutura de provisioning de dashboards no Grafana

Deve existir provisioning de **dashboards** versionado em `observability-stack/`, sem alterar o Compose nem o datasource já existente.

Estrutura mínima obrigatória (além do que já existe):

```text
observability-stack/
└── grafana/
    └── provisioning/
        ├── datasources/
        │   └── prometheus.yml          # já existente — não alterar nesta entrega
        └── dashboards/
            ├── dashboards.yml          # provider apontando para a pasta de JSON
            └── json/
                ├── marketplace-overview.json
                └── service-details.json
```

Regras:

1. O provider (`dashboards.yml`) deve carregar automaticamente os JSON no boot do Grafana
2. Os dashboards devem usar o datasource Prometheus já provisionado (por nome/uid estável, sem configuração manual na UI)
3. Pasta/organização no Grafana deve deixar claro que são dashboards do marketplace
4. **Não** alterar `compose.yaml`, `prometheus/prometheus.yml` nem `grafana/provisioning/datasources/prometheus.yml`
5. Se a montagem atual do Compose já inclui `grafana/provisioning/` por volume, os novos arquivos entram automaticamente; caso contrário, a montagem existente deve continuar cobrindo o diretório de provisioning (sem mudar a infra além do necessário para o provider enxergar os JSON — preferir apenas adicionar arquivos sob o path já montado)

### RF-04 — Dashboard "Marketplace Overview"

Deve existir o dashboard provisionado **Marketplace Overview** (`marketplace-overview.json`) com, no mínimo, os painéis abaixo.

| Painel | Tipo sugerido | Objetivo |
|---|---|---|
| Status UP/DOWN por serviço | Stat / tabela / status | Mostrar se cada job scrape está UP (`1`) ou DOWN (`0`) |
| Throughput geral (requests/s) | Time series | Taxa de requisições HTTP por serviço |
| Taxa de erros 4xx | Time series | Taxa de respostas 4xx por serviço |
| Taxa de erros 5xx | Time series | Taxa de respostas 5xx por serviço |
| Latência P95 por serviço | Time series | Percentil 95 de `http_request_duration_seconds` por serviço |
| Memória por serviço | Time series | Uso de memória do processo Node.js por serviço |
| Pagamentos processados / aprovados / rejeitados | Time series ou Stat | Métricas de negócio do `payments-service` |
| Pedidos criados | Time series ou Stat | `orders_created_total` do `checkout-service` |
| Mensagens RabbitMQ publicadas | Time series ou Stat | `rabbitmq_messages_published_total` (por `queue` quando útil) |

Regras:

1. Título do dashboard: **Marketplace Overview** (ou equivalente claro e estável)
2. Cobrir os cinco jobs: `api-gateway`, `users-service`, `products-service`, `checkout-service`, `payments-service`
3. Painéis de negócio podem ficar vazios até haver tráfego de pagamento/pedido; a query e o painel devem existir
4. Intervalo de tempo default razoável para desenvolvimento (ex.: últimas 15 minutos / 1 hora)
5. Não incluir painéis de alerting nem de exporters externos

### RF-05 — Dashboard "Service Details" (variável `$service`)

Deve existir o dashboard provisionado **Service Details** (`service-details.json`) com variável de template **`$service`** (job Prometheus).

Valores da variável `$service` (no mínimo):

- `api-gateway`
- `users-service`
- `products-service`
- `checkout-service`
- `payments-service`

Painéis mínimos:

| Painel | Tipo sugerido | Método / conteúdo |
|---|---|---|
| Rate por rota | Time series | RED — Rate: `rate(http_requests_total{job="$service"}[...])` por `route` (e `method` se útil) |
| Errors por rota | Time series | RED — Errors: taxa de 4xx/5xx (ou não-2xx) por rota no serviço selecionado |
| Duration P50 | Time series | RED — Duration: percentil 50 de latência por rota |
| Duration P95 | Time series | RED — Duration: percentil 95 de latência por rota |
| Duration P99 | Time series | RED — Duration: percentil 99 de latência por rota |
| Top rotas por volume | Tabela | Ranking das rotas com maior volume de requests no serviço |
| Distribuição de status codes | Pie chart | Proporção de `status_code` no serviço selecionado |
| CPU do processo | Time series | Métrica default de CPU do processo Node.js |
| Memória do processo | Time series | Heap / RSS (métricas default já coletadas) |
| Event loop | Time series | Lag / utilização do event loop (métricas default já coletadas) |

Regras:

1. Título do dashboard: **Service Details** (ou equivalente claro e estável)
2. Todos os painéis HTTP e de processo devem filtrar por `job="$service"` (ou equivalente que respeite a variável)
3. A variável deve ser selecionável na UI do Grafana (dropdown)
4. Aplicar o método **RED** (Rate, Errors, Duration) por rota
5. Não depender de métricas de negócio neste dashboard (elas ficam no Overview); se houver painéis extras de negócio filtrados por serviço, são opcionais

### RF-06 — Documentação da stack atualizada

O `observability-stack/README.md` deve mencionar:

1. Existência dos dashboards provisionados **Marketplace Overview** e **Service Details**
2. Caminho dos JSON / provider de dashboards
3. Que as métricas de negócio vivem nos serviços `payments-service` e `checkout-service` e aparecem via scrape `/metrics`
4. Que alerting permanece fora desta entrega

Não é obrigatório criar `prometheus/queries.md`; a tabela PromQL desta spec é a referência canônica da aula.

### RF-07 — Validação ponta a ponta

Com stack e serviços no ar:

1. Gerar tráfego HTTP nos serviços (health e/ou rotas de negócio)
2. Processar ao menos um pagamento aprovado e um rejeitado (quando o fluxo checkout→payments estiver disponível)
3. Criar ao menos um pedido e confirmar publicação RabbitMQ correspondente
4. Confirmar no Prometheus (UI ou API) a presença das séries de negócio e HTTP
5. Abrir o Grafana e verificar que os dois dashboards carregam com dados (ou séries vazias apenas quando não houver tráfego ainda)

## Métricas — resumo consolidado

### Já existentes (não redefinir)

| Métrica | Tipo | Labels | Serviço |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Todos os cinco |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Todos os cinco |
| Defaults Node.js (`process_*`, `nodejs_*`, etc.) | Variados | Conforme `collectDefaultMetrics` | Todos os cinco |

### Novas nesta entrega

| Métrica | Tipo | Labels | Serviço |
|---|---|---|---|
| `payments_processed_total` | Counter | — | `payments-service` |
| `payments_approved_total` | Counter | — | `payments-service` |
| `payments_rejected_total` | Counter | `reason` | `payments-service` |
| `orders_created_total` | Counter | — | `checkout-service` |
| `rabbitmq_messages_published_total` | Counter | `queue` | `checkout-service` |

## Tabela de referência — PromQL

Queries principais para painéis e validação manual. Ajustar o seletor de tempo (`[1m]`, `[5m]`) conforme o painel.

| Uso | PromQL |
|---|---|
| Status UP/DOWN por serviço | `up{job=~"api-gateway\|users-service\|products-service\|checkout-service\|payments-service"}` |
| Throughput (req/s) por serviço | `sum by (job) (rate(http_requests_total[1m]))` |
| Taxa 4xx por serviço | `sum by (job) (rate(http_requests_total{status_code=~"4.."}[1m]))` |
| Taxa 5xx por serviço | `sum by (job) (rate(http_requests_total{status_code=~"5.."}[1m]))` |
| Latência P95 por serviço | `histogram_quantile(0.95, sum by (job, le) (rate(http_request_duration_seconds_bucket[5m])))` |
| Memória (heap used) por serviço | `process_resident_memory_bytes` ou série equivalente de heap exposta pelo default (`nodejs_heap_size_used_bytes`) — usar a série estável presente em `/metrics` |
| Pagamentos processados (taxa) | `rate(payments_processed_total[1m])` ou `increase(payments_processed_total[1h])` |
| Pagamentos aprovados (taxa) | `rate(payments_approved_total[1m])` |
| Pagamentos rejeitados por motivo | `sum by (reason) (rate(payments_rejected_total[1m]))` |
| Pedidos criados (taxa) | `rate(orders_created_total[1m])` |
| Mensagens publicadas por fila | `sum by (queue) (rate(rabbitmq_messages_published_total[1m]))` |
| Rate por rota (Service Details) | `sum by (route) (rate(http_requests_total{job="$service"}[1m]))` |
| Errors por rota | `sum by (route) (rate(http_requests_total{job="$service",status_code=~"[45].."}[1m]))` |
| Duration P50 por rota | `histogram_quantile(0.50, sum by (route, le) (rate(http_request_duration_seconds_bucket{job="$service"}[5m])))` |
| Duration P95 por rota | `histogram_quantile(0.95, sum by (route, le) (rate(http_request_duration_seconds_bucket{job="$service"}[5m])))` |
| Duration P99 por rota | `histogram_quantile(0.99, sum by (route, le) (rate(http_request_duration_seconds_bucket{job="$service"}[5m])))` |
| Top rotas por volume | `topk(10, sum by (route) (increase(http_requests_total{job="$service"}[1h])))` |
| Distribuição de status codes | `sum by (status_code) (increase(http_requests_total{job="$service"}[1h]))` |
| CPU processo | `rate(process_cpu_user_seconds_total{job="$service"}[1m])` (+ system, se desejado) |
| Event loop lag | `nodejs_eventloop_lag_seconds{job="$service"}` (ou série equivalente exposta pelo default) |

Nota: nomes exatos das séries default (`process_*` / `nodejs_*`) devem ser confirmados no `/metrics` de cada serviço na implementação; a intenção dos painéis é CPU, memória e event loop do processo.

## Fora de escopo

Esta spec **não** inclui:

- Alerting (Alertmanager, recording/alerting rules, contact points, notification policies do Grafana)
- Alteração de `compose.yaml`, imagens, portas, volumes ou rede da stack
- Alteração de `prometheus/prometheus.yml` (scrape jobs, intervalos, relabel)
- Alteração do datasource Prometheus já provisionado
- Métricas de banco de dados (Postgres exporter ou queries SQL)
- RabbitMQ exporter ou métricas do broker (apenas o counter de publish no checkout)
- Métricas de negócio em `users-service`, `products-service` ou `api-gateway`
- Loki, Tempo, Jaeger, OpenTelemetry Collector
- Mudança de contratos HTTP de negócio (checkout, payments, gateway)
- Autenticação avançada / SSO no Grafana

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (arquivos versionados, `/metrics`, Prometheus, Grafana UI/API).

1. **CA-01 — Spec versionada no path combinado**  
   Existe `observability-stack/docs/specs/grafana-dashboards-and-business-metrics.md`.

2. **CA-02 — Counters de pagamento no `/metrics` do payments-service**  
   Após processar pagamentos, `GET http://localhost:3004/metrics` contém `payments_processed_total`, `payments_approved_total` e `payments_rejected_total` (com label `reason` nas rejeições).

3. **CA-03 — Incremento correto aprovado vs rejeitado**  
   Um pagamento aprovado aumenta `payments_processed_total` e `payments_approved_total` sem aumentar `payments_rejected_total`. Um rejeitado aumenta `payments_processed_total` e `payments_rejected_total{reason=...}` sem aumentar `payments_approved_total`.

4. **CA-04 — Counters de pedido e publish no `/metrics` do checkout-service**  
   Após criar pedido e publicar mensagem, `GET http://localhost:3003/metrics` contém `orders_created_total` e `rabbitmq_messages_published_total` com label `queue`.

5. **CA-05 — Label `queue` preenchido**  
   `rabbitmq_messages_published_total` expõe ao menos uma série com `queue` correspondente ao destino da publicação de ordem de pagamento.

6. **CA-06 — Provider e JSON de dashboards versionados**  
   Existem `grafana/provisioning/dashboards/dashboards.yml`, `grafana/provisioning/dashboards/json/marketplace-overview.json` e `grafana/provisioning/dashboards/json/service-details.json`.

7. **CA-07 — Marketplace Overview no Grafana**  
   Após reiniciar/recarregar o Grafana (ou boot limpo da stack), o dashboard **Marketplace Overview** aparece provisionado e contém painéis de status, throughput, erros 4xx/5xx, latência P95, memória e métricas de negócio.

8. **CA-08 — Service Details com variável `$service`**  
   O dashboard **Service Details** aparece provisionado; a variável `$service` lista os cinco jobs; ao trocar o serviço, os painéis RED / top rotas / status codes / recursos filtram pelo job selecionado.

9. **CA-09 — RED method no Service Details**  
   Existem painéis de Rate, Errors e Duration (P50, P95 e P99) por rota para o `$service` selecionado.

10. **CA-10 — Infraestrutura Compose/Prometheus intacta**  
    `compose.yaml`, `prometheus/prometheus.yml` e `grafana/provisioning/datasources/prometheus.yml` permanecem sem mudanças de comportamento nesta entrega (sem novos exporters, sem alerting, sem mudança de scrape).

11. **CA-11 — Sem alerting nesta entrega**  
    Não há regras de alerta Prometheus, Alertmanager nem contact points/notification policies Grafana adicionados.

12. **CA-12 — Prometheus enxerga as séries de negócio**  
    Com scrape UP, queries a `payments_processed_total`, `orders_created_total` e `rabbitmq_messages_published_total` retornam dados após o tráfego de validação (aguardar pelo menos um intervalo de scrape ~15s).

13. **CA-13 — README atualizado**  
    `observability-stack/README.md` documenta os dashboards provisionados e o caminho dos arquivos JSON/provider.

14. **CA-14 — HTTP metrics e consumer JSON preservados**  
    `http_requests_total` / `http_request_duration_seconds` continuam funcionando; em payments, `GET /consumer-metrics` permanece no contrato JSON existente; `GET /metrics` continua exclusivo do formato Prometheus.

## Ordem sugerida de implementação

1. Adicionar counters de negócio no `payments-service` (RF-01) e instrumentar o fluxo de processamento
2. Adicionar counters de negócio no `checkout-service` (RF-02) e instrumentar criação de pedido + publish
3. Validar exposição em `/metrics` e presença no Prometheus (CA-02..CA-05, CA-12)
4. Criar provider `dashboards.yml` e pasta `json/` (RF-03)
5. Implementar dashboard **Marketplace Overview** (RF-04)
6. Implementar dashboard **Service Details** com `$service` e RED (RF-05)
7. Reiniciar/recarregar Grafana e validar CA-07..CA-09
8. Atualizar `observability-stack/README.md` (RF-06)
9. Rodar validação ponta a ponta (RF-07) e fechar os CAs restantes

## Commits

Esta aula entrega **apenas a SPEC**. A implementação (métricas nos serviços + JSON de dashboards + README) deve ser feita em entrega posterior, a partir de um plano em português aprovado.

Quando a implementação for feita:

- Preferir commits por item de RF (ou agrupamento claro métricas → dashboards → docs), com lint nos serviços NestJS antes de cada commit que tocar código
- Não misturar alerting nem mudanças de scrape/Compose nessa implementação
- Não incluir exporters de banco ou RabbitMQ
`)