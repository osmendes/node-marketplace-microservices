# observability-stack

Infraestrutura local de observabilidade do marketplace com **Prometheus** (coleta de métricas) e **Grafana** (visualização).

Segue o mesmo padrão de `messaging/`: pasta dedicada na raiz do monorepo, apenas Docker/Podman Compose, sem aplicação NestJS.

## Estrutura

```text
observability-stack/
├── compose.yaml
├── README.md
├── prometheus/
│   └── prometheus.yml
└── grafana/
    └── provisioning/
        └── datasources/
            └── prometheus.yml
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

## Fora desta entrega

- Instrumentação dos serviços NestJS com métricas
- Dashboards no Grafana
- Alerting (Alertmanager / regras / contact points)
- Loki, Jaeger ou outras ferramentas além de Prometheus e Grafana

## Imagens

| Serviço | Imagem |
|---|---|
| Prometheus | `prom/prometheus:v3.4.0` |
| Grafana | `grafana/grafana:12.0.0` |
