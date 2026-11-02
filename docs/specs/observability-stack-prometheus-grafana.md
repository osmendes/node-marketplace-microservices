# Spec: Stack de observabilidade com Prometheus e Grafana

## Contexto

O monorepo `node-marketplace-microservices` (marketplace-ms) possui cinco serviços NestJS HTTP e uma pasta dedicada de infraestrutura de mensageria:

| Serviço / pasta | Papel | Porta HTTP (host) |
|---|---|---|
| `gateway/` (`api-gateway`) | Entrada única, proxy, JWT | `3005` |
| `users-service/` | Usuários e autenticação | `3000` |
| `products-service/` | Catálogo de produtos | `3001` |
| `checkout/` (`checkout-service`) | Carrinho e pedidos | `3003` |
| `payments/` (`payments-service`) | Processamento de pagamentos | `3004` |
| `messaging/` | RabbitMQ (Docker Compose dedicado) | `5672` / `15672` |

O padrão de infraestrutura já estabelecido é o de `messaging/`: pasta dedicada na raiz, com `compose.yaml` e `README.md`, sem aplicação NestJS dentro dela.

Esta spec define a **criação da pasta `observability-stack/`** seguindo o mesmo padrão, contendo **apenas** Prometheus (coleta de métricas) e Grafana (visualização), prontos para scrape dos cinco serviços via endpoint `/metrics`.

A instrumentação dos serviços NestJS com métricas, a criação de dashboards no Grafana e a configuração de alerting ficam para specs futuras. Nesta entrega a stack sobe, o Prometheus está configurado para scrape e o Grafana já inicia com o datasource Prometheus provisionado.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| Prometheus | Imagem oficial `prom/prometheus` (versão pinada na implementação) |
| Grafana | Imagem oficial `grafana/grafana` (versão pinada na implementação) |
| Docker / Podman Compose | Mesmo fluxo local já usado em `messaging/` |
| Acesso ao host | `host.docker.internal` para o Prometheus alcançar serviços rodando no host |
| Provisioning Grafana | Datasource Prometheus via arquivos em `provisioning/` |

## Requisitos funcionais

### RF-01 — Pasta dedicada `observability-stack/`

Deve existir na raiz do monorepo a pasta `observability-stack/`, no mesmo nível de `messaging/`, contendo apenas a infraestrutura de observabilidade (sem código NestJS).

Estrutura mínima obrigatória:

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

Regras:

1. A pasta é infraestrutura pura (análoga a `messaging/`)
2. Não deve haver `package.json`, código NestJS nem instrumentação de serviços dentro dela
3. Nomes de arquivos de provisioning do Grafana devem permitir o Grafana carregar o datasource automaticamente na inicialização

### RF-02 — Docker Compose com Prometheus e Grafana

Deve existir um `compose.yaml` em `observability-stack/` que declare os serviços `prometheus` e `grafana`.

Requisitos mínimos:

| Serviço | Imagem | Container name sugerido | Porta host | Porta container |
|---|---|---|---|---|
| Prometheus | `prom/prometheus` (pinada) | `marketplace-prometheus` | `9090` | `9090` |
| Grafana | `grafana/grafana` (pinada) | `marketplace-grafana` | `3010` | `3000` |

Regras:

1. A porta do Grafana no **host** deve ser **`3010`** (evita conflito com `users-service` na `3000`)
2. A porta do Prometheus no **host** deve ser **`9090`**
3. O Prometheus deve montar `prometheus/prometheus.yml` como configuração de scrape
4. O Grafana deve montar `grafana/provisioning/` para carregar datasources no boot
5. Deve haver volume persistente para dados do Grafana (dashboards/usuários locais sobrevivem a recreate)
6. Volume persistente para dados do Prometheus é desejável (TSDB local)
7. Rede bridge dedicada da stack (ex.: `observability-network`)
8. `restart: unless-stopped` (ou equivalente alinhado a `messaging/`)
9. Healthcheck básico para Prometheus e Grafana, quando suportado pela imagem
10. Credenciais default do Grafana (admin) devem estar documentadas no README; em desenvolvimento podem usar valores simples, com aviso explícito de não usar em produção

Acesso do Prometheus aos serviços no host:

- Os targets de scrape apontam para `host.docker.internal:<porta>`
- No Compose, o serviço Prometheus deve garantir resolução de `host.docker.internal` (ex.: `extra_hosts` com `host-gateway` quando necessário no Linux/Podman)

### RF-03 — `prometheus.yml` com scrape dos cinco serviços

Deve existir `observability-stack/prometheus/prometheus.yml` com `scrape_configs` para **todos** os cinco serviços NestJS, cada um no endpoint `/metrics`.

Targets obrigatórios:

| Job name sugerido | Target | Endpoint |
|---|---|---|
| `api-gateway` | `host.docker.internal:3005` | `/metrics` |
| `users-service` | `host.docker.internal:3000` | `/metrics` |
| `products-service` | `host.docker.internal:3001` | `/metrics` |
| `checkout-service` | `host.docker.internal:3003` | `/metrics` |
| `payments-service` | `host.docker.internal:3004` | `/metrics` |

Regras:

1. Intervalo de scrape global razoável para desenvolvimento (ex.: `15s`)
2. Cada job deve identificar claramente o serviço (label `job` / nome do job)
3. O path de métricas é `/metrics` em todos os alvos
4. Não é obrigatório que os serviços já exponham `/metrics` nesta entrega — o scrape pode falhar até a instrumentação (spec futura); a **configuração** dos jobs deve existir
5. Não incluir RabbitMQ, Loki, Jaeger nem outros exporters nesta entrega

### RF-04 — Provisioning do Grafana com datasource Prometheus

O Grafana deve iniciar com o datasource Prometheus **já configurado**, via provisioning (sem configuração manual pela UI).

Requisitos mínimos do arquivo de datasource:

1. Tipo: `prometheus`
2. Nome visível: `Prometheus` (ou equivalente claro)
3. URL interna apontando para o serviço Compose do Prometheus (ex.: `http://prometheus:9090`)
4. Datasource marcado como default
5. Provisioning carregado automaticamente no boot do Grafana (montagem do diretório `provisioning`)

Regras:

1. Não criar dashboards provisionados nesta entrega
2. Não configurar alerting / contact points / notification policies
3. Após `compose up`, ao abrir o Grafana, o datasource Prometheus deve aparecer disponível para queries

### RF-05 — Mapa de portas atualizado

A documentação da stack (no mínimo o `README.md` de `observability-stack/`) deve incluir o mapa de portas do marketplace **atualizado**, incluindo Prometheus e Grafana.

Mapa canônico esperado nesta entrega:

| Componente | Porta host | Observação |
|---|---|---|
| users-service | `3000` | HTTP NestJS |
| products-service | `3001` | HTTP NestJS |
| checkout-service | `3003` | HTTP NestJS |
| payments-service | `3004` | HTTP NestJS |
| api-gateway | `3005` | HTTP NestJS |
| Grafana | `3010` | UI (host `3010` → container `3000`) |
| RabbitMQ AMQP | `5672` | `messaging/` |
| Prometheus | `9090` | UI e API |
| RabbitMQ Management | `15672` | `messaging/` |

Regras:

1. Documentar explicitamente o motivo da porta `3010` do Grafana (conflito com users-service `3000`)
2. Não alterar as portas canônicas dos serviços NestJS nem do RabbitMQ nesta entrega
3. Opcionalmente refletir Prometheus/Grafana no `README.md` da raiz do monorepo (estrutura do repositório + como subir a stack), mantendo o mapa completo obrigatório em `observability-stack/README.md`

### RF-06 — README básico da stack

Deve existir `observability-stack/README.md` com, no mínimo:

1. Propósito da pasta (observabilidade local com Prometheus + Grafana)
2. Estrutura de pastas
3. Mapa de portas (RF-05)
4. Como subir e derrubar a stack (`podman compose` / `docker compose`), no mesmo espírito de `messaging/README.md`
5. URLs locais: Prometheus (`http://localhost:9090`) e Grafana (`http://localhost:3010`)
6. Credenciais default do Grafana (dev) e aviso de não usar em produção
7. Nota de que os jobs de scrape apontam para `/metrics` nos cinco serviços via `host.docker.internal`
8. Nota de que a instrumentação NestJS, dashboards e alerting ficam fora desta entrega

## Fora de escopo

Esta spec **não** inclui:

- Instrumentação dos serviços NestJS (`@willsoto/nestjs-prometheus`, interceptors, custom metrics, etc.)
- Criação ou provisioning de dashboards no Grafana
- Alerting (Alertmanager, regras Prometheus, contact points do Grafana)
- Loki, Tempo, Jaeger, OpenTelemetry Collector ou qualquer outra ferramenta além de Prometheus e Grafana
- Exporters adicionais (Node Exporter, Postgres Exporter, RabbitMQ exporter, etc.)
- Compose unificado de todo o monorepo
- Autenticação avançada / SSO no Grafana
- Mudança de portas dos serviços NestJS ou do RabbitMQ
- CI/CD para a stack de observabilidade

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva (compose, curl, UI ou arquivos versionados).

1. **CA-01 — Pasta `observability-stack/` na raiz**  
   Existe `observability-stack/` na raiz do monorepo, no mesmo nível de `messaging/`.

2. **CA-02 — Estrutura de arquivos**  
   Existem `compose.yaml`, `README.md`, `prometheus/prometheus.yml` e `grafana/provisioning/datasources/prometheus.yml` (ou equivalente de provisioning de datasource).

3. **CA-03 — Compose sobe Prometheus e Grafana**  
   `podman compose up -d` (ou `docker compose up -d`) dentro de `observability-stack/` sobe os dois containers com sucesso.

4. **CA-04 — Prometheus na porta 9090**  
   `http://localhost:9090` responde (UI ou `/-/healthy` / `/-/ready`).

5. **CA-05 — Grafana na porta 3010**  
   `http://localhost:3010` responde (UI ou `/api/health`).

6. **CA-06 — Porta 3010 não conflita com users-service**  
   Grafana escuta em `3010` no host; users-service permanece em `3000`.

7. **CA-07 — Scrape config dos cinco serviços**  
   `prometheus.yml` contém jobs/targets para api-gateway (`3005`), users-service (`3000`), products-service (`3001`), checkout-service (`3003`) e payments-service (`3004`), todos com path `/metrics` via `host.docker.internal`.

8. **CA-08 — Targets visíveis no Prometheus**  
   Em Status → Targets (ou API `/api/v1/targets`), os cinco jobs aparecem configurados. Estado `UP`/`DOWN` depende da instrumentação futura; a presença dos targets é obrigatória.

9. **CA-09 — Datasource Prometheus no Grafana**  
   Após o boot, o Grafana lista o datasource Prometheus apontando para o Prometheus da stack (URL interna do Compose), sem configuração manual.

10. **CA-10 — README com mapa de portas e instruções**  
    `observability-stack/README.md` documenta propósito, estrutura, mapa de portas (incluindo `9090` e `3010`), comandos de subida/descida e URLs locais.

11. **CA-11 — Escopo respeitado**  
    Não há instrumentação nova nos serviços NestJS; não há dashboards provisionados; não há alerting; não há Loki/Jaeger/outras ferramentas além de Prometheus e Grafana.

## Ordem sugerida de implementação

1. Criar a árvore `observability-stack/` com as pastas `prometheus/` e `grafana/provisioning/datasources/`
2. Escrever `prometheus/prometheus.yml` com os cinco scrape jobs
3. Escrever o provisioning do datasource Prometheus do Grafana
4. Escrever `compose.yaml` (portas `9090` e `3010`, volumes, `extra_hosts` / `host.docker.internal`, montagens)
5. Escrever `README.md` com mapa de portas e instruções de uso
6. Subir a stack e validar CA-03 a CA-09
7. Atualizar o `README.md` da raiz do monorepo, se fizer parte da entrega (estrutura + como subir observabilidade)

## Commits

Esta aula entrega **apenas a SPEC**. A implementação da stack deve ser feita em entrega posterior, a partir de um plano em português aprovado.

Quando a stack for implementada:

- Preferir **um único commit** com toda a pasta `observability-stack/` (e eventual menção no README da raiz), no espírito da infra `messaging/`
- Não misturar instrumentação NestJS, dashboards ou alerting nesse commit
`)