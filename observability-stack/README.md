# observability-stack

Infraestrutura local de observabilidade do marketplace com **Prometheus** (coleta de métricas) e **Grafana** (visualização).

Segue o mesmo padrão de `messaging/`: pasta dedicada na raiz do monorepo, apenas Docker/Podman Compose, sem aplicação NestJS.

## Estrutura

```text
observability-stack/
├── compose.yaml
├── README.md
├── docs/
│   └── specs/
│       ├── grafana-dashboards-and-business-metrics.md
│       └── prometheus-alerting-rules.md
├── prometheus/
│   ├── prometheus.yml
│   └── alert.rules.yml
└── grafana/
    └── provisioning/
        ├── datasources/
        │   └── prometheus.yml
        └── dashboards/
            ├── dashboards.yml
            └── json/
                ├── marketplace-overview.json
                └── service-details.json
```

## Mapa de portas

| Componente | Porta host | Observação |
|---|---|---|
| users-service | `3000` | HTTP NestJS |
| products-service | `3001` | HTTP NestJS |
| checkout-service | `3003` | HTTP NestJS |
| payments-service | `3004` | HTTP NestJS |
| api-gateway | `3005` | HTTP NestJS |
| Grafana | `3010` | UI (host `3010` → container `3000`; evita conflito com users-service na `3000`) |
| RabbitMQ AMQP | `5672` | `messaging/` |
| Prometheus | `9090` | UI e API |
| RabbitMQ Management | `15672` | `messaging/` |

## Como usar

### Subir a stack

```bash
cd observability-stack
podman compose up -d
# ou
docker compose up -d
```

### Derrubar a stack

```bash
podman compose down
# ou
docker compose down
```

## URLs locais

| Serviço | URL |
|---|---|
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3010 |

### Credenciais Grafana (desenvolvimento)

- Usuário: `admin`
- Senha: `admin`

**Não use essas credenciais em produção.**

## Scrape de métricas

O Prometheus está configurado para coletar `/metrics` dos cinco serviços NestJS via `host.docker.internal`:

| Job | Target |
|---|---|
| `api-gateway` | `host.docker.internal:3005` |
| `users-service` | `host.docker.internal:3000` |
| `products-service` | `host.docker.internal:3001` |
| `checkout-service` | `host.docker.internal:3003` |
| `payments-service` | `host.docker.internal:3004` |

O Grafana inicia com o datasource **Prometheus** já provisionado (`http://prometheus:9090`).

## Dashboards provisionados

Os dashboards são versionados em `grafana/provisioning/dashboards/` e carregados automaticamente no boot (pasta **Marketplace** no Grafana).

| Dashboard | UID | Conteúdo |
|---|---|---|
| **Marketplace Overview** | `marketplace-overview` | Status UP/DOWN, throughput, erros 4xx/5xx, latência P95, memória, métricas de negócio e painel **Alertas ativos** |
| **Service Details** | `service-details` | Variável `$service`; método RED por rota; top rotas; status codes; CPU, memória e event loop |

URLs diretas (com a stack no ar):

- http://localhost:3010/d/marketplace-overview/marketplace-overview
- http://localhost:3010/d/service-details/service-details

### Métricas de negócio

Além das métricas HTTP (`http_requests_total`, `http_request_duration_seconds`) e defaults do Node.js, o scrape de `/metrics` inclui:

| Serviço | Métricas |
|---|---|
| `payments-service` | `payments_processed_total`, `payments_approved_total`, `payments_rejected_total{reason}` |
| `checkout-service` | `orders_created_total`, `rabbitmq_messages_published_total{queue}` |

A tabela PromQL de referência está na SPEC `docs/specs/grafana-dashboards-and-business-metrics.md`.

## Alerting rules (Prometheus)

Arquivo versionado: `prometheus/alert.rules.yml` (montado em `/etc/prometheus/alert.rules.yml` e referenciado em `prometheus.yml` via `rule_files`).

| Alerta | Condição | `for` | Severidade |
|---|---|---|---|
| `ServiceDown` | `up == 0` nos jobs dos cinco serviços | `30s` | `critical` |
| `HighErrorRate` | taxa 5xx / total `> 0.10` por `job` (rate ~5m) | `1m` | `warning` |
| `HighLatencyP95` | P95 de `http_request_duration_seconds` `> 2s` por `job` | `1m` | `warning` |
| `HighMemoryUsage` | `process_resident_memory_bytes > 512MB` por `job` | `2m` | `warning` |
| `NoPaymentsProcessed` | `increase(payments_processed_total[5m]) == 0` | `5m` | `info` |
| `HighPaymentRejectionRate` | rejeitados/processados `> 0.5` (com processados `> 0`) | `2m` | `warning` |

**Nota:** `NoPaymentsProcessed` é severidade `info` e pode disparar em ambiente ocioso (sem pagamentos) — comportamento esperado nesta aula.

O Overview inclui o painel **Alertas ativos** (`ALERTS{alertstate="firing"}`).

### Como validar

1. Subir/recarregar a stack (`podman compose up -d` ou reload do Prometheus).
2. UI Prometheus → **Alerts** (http://localhost:9090/alerts) ou API:
   - `curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[].name'`
   - `curl -s 'http://localhost:9090/-/reload' -X POST` (lifecycle já habilitado)
3. Parar um serviço scrapeado e observar `ServiceDown` em pending/firing após ~30s.
4. Grafana Overview → painel **Alertas ativos**: http://localhost:3010/d/marketplace-overview/marketplace-overview

**Fora de escopo:** notificações externas (Slack, e-mail, webhooks, contact points do Alertmanager/Grafana). A avaliação das rules no Prometheus + visualização no Grafana é suficiente nesta entrega.

## Fora desta entrega

- Notificações externas / receivers Alertmanager
- Exporters de banco de dados ou RabbitMQ
- Loki, Jaeger ou outras ferramentas além de Prometheus e Grafana

## Imagens

| Serviço | Imagem |
|---|---|
| Prometheus | `prom/prometheus:v3.4.0` |
| Grafana | `grafana/grafana:12.0.0` |
