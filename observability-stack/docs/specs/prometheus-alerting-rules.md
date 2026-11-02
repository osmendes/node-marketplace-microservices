# Spec: Alerting rules no Prometheus e painel de alertas no Grafana

## Contexto

O monorepo já possui:

| Componente | Estado |
|---|---|
| Cinco serviços NestJS com `/metrics` | `api-gateway`, `users-service`, `products-service`, `checkout-service`, `payments-service` |
| Prometheus | Host `9090`; scrape `15s`; `evaluation_interval` já definido em `prometheus.yml` |
| Grafana | Host `3010`; datasource Prometheus; dashboards **Marketplace Overview** e **Service Details** provisionados |
| Métricas de negócio (payments) | `payments_processed_total`, `payments_approved_total`, `payments_rejected_total` |
| Health Terminus | Specs por serviço nesta aula (dependências reais); alerting **não** depende do JSON de `/health` — usa séries Prometheus |

Ainda **não** há `rule_files`, arquivo de alerting rules nem painel de alertas ativos no Overview.

Esta spec define:

1. Arquivo `alert.rules.yml` com as regras pedidas
2. Carregamento das rules no Prometheus (`prometheus.yml` + montagem necessária no Compose)
3. Painel de **alertas ativos** no dashboard **Marketplace Overview**
4. Critérios de aceite testáveis

**Não** configurar notificações externas (Slack, e-mail, webhooks, Alertmanager contact points). Isso fica como nice-to-have futuro.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| Prometheus | Já pinado na stack (`prom/prometheus`) |
| Grafana | Já pinado; dashboard JSON versionado |
| PromQL | Regras de alerta nativas do Prometheus |
| Compose | Ajuste mínimo apenas para carregar o arquivo de rules |

## Pré-condições

1. Targets dos cinco jobs scrapeáveis (UP quando os serviços estão no ar)
2. Dashboard `marketplace-overview.json` já provisionado
3. Counters de pagamento disponíveis após tráfego de negócio (para regras de payments)

## Requisitos funcionais

### RF-01 — Arquivo `alert.rules.yml`

Deve existir o arquivo versionado:

```text
observability-stack/prometheus/alert.rules.yml
```

(ou path equivalente sob `observability-stack/prometheus/`, desde que referenciado pelo Prometheus).

O arquivo deve declarar um ou mais grupos de regras de **alerting** (não apenas recording rules) contendo **todas** as alertas abaixo.

### RF-02 — Regras de alerta obrigatórias

| Alerta | Condição (intenção) | Duração (`for`) | Severidade (`severity`) |
|---|---|---|---|
| `ServiceDown` | Target scrape `up == 0` | `30s` | `critical` |
| `HighErrorRate` | Taxa de respostas **5xx** acima de **10%** do total de requests | `1m` | `warning` |
| `HighLatencyP95` | Latência **P95** de `http_request_duration_seconds` **> 2s** | `1m` | `warning` |
| `HighMemoryUsage` | Uso de memória do processo **> 512MB** | `2m` | `warning` |
| `NoPaymentsProcessed` | **Zero** pagamentos processados no intervalo de **5 minutos** | `5m` (ou `for` alinhado a “0 em 5min”) | `info` |
| `HighPaymentRejectionRate` | Taxa de rejeição de pagamentos **> 50%** | `2m` | `warning` |

Regras de implementação da intenção:

1. **`ServiceDown`** — usar a métrica `up` por `job` dos cinco serviços; um alerta por job (ou vetor com label `job`) quando `up == 0` por `30s`
2. **`HighErrorRate`** — razão entre `rate` de `http_requests_total` com `status_code=~"5.."` e `rate` do total no mesmo `job` (janela típica `5m` na expressão; `for: 1m`); limiar `> 0.10`
3. **`HighLatencyP95`** — `histogram_quantile(0.95, ...)` sobre `http_request_duration_seconds_bucket` por `job`; limiar `> 2`; `for: 1m`
4. **`HighMemoryUsage`** — série de memória residente/heap estável já exposta por `collectDefaultMetrics` (preferir `process_resident_memory_bytes` se presente); limiar `> 512 * 1024 * 1024`; `for: 2m`; por `job`
5. **`NoPaymentsProcessed`** — ausência de processamento: ex. `increase(payments_processed_total[5m]) == 0` (ou equivalente que signifique “0 em 5min”); severidade `info`; evitar ruído logo no boot pode ser tratado com `for` e/ou anotações — documentar o comportamento esperado no README da stack
6. **`HighPaymentRejectionRate`** — razão rejeitados/processados (via `rate` ou `increase` no mesmo intervalo) `> 0.5`; `for: 2m`; proteger divisão por zero (só avaliar com processados > 0)

Labels/anotações mínimas recomendadas em cada alerta:

- `severity`: conforme a tabela
- `summary` / `description`: texto curto em português ou inglês claro identificando o serviço/métrica

Jobs cobertos pelas regras de infra/HTTP: `api-gateway`, `users-service`, `products-service`, `checkout-service`, `payments-service`.

Regras de pagamento aplicam-se ao job/`payments_processed_total` do `payments-service`.

### RF-03 — Prometheus carrega as rules

`observability-stack/prometheus/prometheus.yml` deve:

1. Referenciar o arquivo de rules via `rule_files` (ex.: `alert.rules.yml` ou path montado no container)
2. Manter scrape dos cinco serviços e intervalos atuais (sem mudar targets/portas)
3. Garantir que `evaluation_interval` continue adequado à avaliação das rules (já existe; ajustar só se necessário para as durações acima)

Compose (`compose.yaml`):

1. Permitir que o container Prometheus leia o `alert.rules.yml` (montar o arquivo ou o diretório `prometheus/` de forma mínima)
2. Evitar mudanças desnecessárias de imagem, portas, rede ou Grafana volumes além do estritamente necessário para as rules
3. Após alteração de config, o Prometheus deve carregar as rules (restart ou reload lifecycle já habilitado com `--web.enable-lifecycle`)

### RF-04 — Painel de alertas ativos no Marketplace Overview

O dashboard provisionado **Marketplace Overview** (`grafana/provisioning/dashboards/json/marketplace-overview.json`) deve ganhar **um painel** de alertas ativos.

Objetivo do painel:

- Mostrar alertas **firing** (ativos) conhecidos pelo Prometheus (série `ALERTS` / `ALERTS{alertstate="firing"}` ou painel equivalente que liste alertas ativos da datasource Prometheus)

Regras:

1. Adicionar o painel ao Overview existente — **não** recriar o dashboard do zero
2. **Não** remover nem redesenhar os painéis já existentes (status, throughput, erros, latência, memória, negócio), além do necessário para encaixar o novo painel
3. Título claro (ex.: **Alertas ativos** / **Active alerts**)
4. Em ambiente sem alertas firing, o painel pode ficar vazio/zero — isso é válido
5. **Não** configurar contact points, notification policies, mute timings nem Alertmanager
6. **Não** alterar o dashboard **Service Details** nesta entrega (salvo se um uid/provider compartilhado exigir touch mínimo — preferir zero mudança)

### RF-05 — Documentação da stack

Atualizar `observability-stack/README.md` para mencionar:

1. Existência de `prometheus/alert.rules.yml`
2. Lista resumida dos alertas e severidades
3. Que notificações externas estão fora de escopo
4. Como validar rules (UI Prometheus → Alerts, ou API) e o painel no Overview

### RF-06 — Validação operacional

Com stack e serviços no ar:

1. Prometheus reconhece as rules sem erro de carregamento (`/-/healthy` / status de rules)
2. Com um job propositalmente DOWN (serviço parado), `ServiceDown` entra em pending/firing após `30s`
3. Demais alertas podem ser validados por expressão na UI ou por injeção controlada de tráfego/métricas quando viável
4. Overview mostra o painel de alertas ativos

## Estrutura esperada (alto nível)

```text
observability-stack/
├── compose.yaml                          # montagem mínima para rules, se necessário
├── README.md                             # documenta alertas
├── prometheus/
│   ├── prometheus.yml                    # rule_files
│   └── alert.rules.yml                   # regras desta spec
└── grafana/
    └── provisioning/
        └── dashboards/
            └── json/
                └── marketplace-overview.json   # + painel de alertas ativos
```

## Fora de escopo

Esta spec **não** inclui:

- Notificações externas (Slack, e-mail, PagerDuty, webhooks)
- Alertmanager como componente novo (contact points, receivers, routes) — a avaliação das rules no próprio Prometheus + visualização no Grafana é suficiente nesta aula
- Readiness/liveness probes Kubernetes nos serviços Nest
- Alteração das métricas HTTP/negócio já existentes
- Redesign dos dashboards além do painel de alertas no Overview
- Exporters novos (Postgres, RabbitMQ)
- Mudança dos health checks Terminus (isso vive nas specs por serviço)

## Critérios de aceite

1. **CA-01 — Arquivo de rules versionado**  
   Existe `observability-stack/prometheus/alert.rules.yml` (ou path equivalente documentado).

2. **CA-02 — Seis alertas nomeados**  
   O arquivo declara `ServiceDown`, `HighErrorRate`, `HighLatencyP95`, `HighMemoryUsage`, `NoPaymentsProcessed` e `HighPaymentRejectionRate`.

3. **CA-03 — Severidades e `for`**  
   Severidades e durações batem com a tabela do RF-02 (`critical` / `warning` / `info` e `30s` / `1m` / `2m` / `5m` conforme o alerta).

4. **CA-04 — Limiares corretos**  
   HighErrorRate > 10% 5xx; HighLatencyP95 > 2s; HighMemoryUsage > 512MB; HighPaymentRejectionRate > 50%; NoPaymentsProcessed = 0 em 5min; ServiceDown com `up == 0`.

5. **CA-05 — Prometheus carrega rules**  
   `prometheus.yml` referencia `rule_files`; o container enxerga o arquivo; a UI/API do Prometheus lista as rules sem erro de parse.

6. **CA-06 — ServiceDown observável**  
   Ao parar um serviço scrapeado, após ~30s o alerta `ServiceDown` aparece como pending ou firing para o `job` correspondente.

7. **CA-07 — Painel no Overview**  
   O dashboard **Marketplace Overview** provisionado contém o painel de alertas ativos.

8. **CA-08 — Demais painéis preservados**  
   Painéis pré-existentes do Overview continuam presentes (status, throughput, erros, latência, memória, negócio).

9. **CA-09 — Sem notificações externas**  
   Não há configuração de Slack/e-mail/webhooks/contact points nesta entrega.

10. **CA-10 — README atualizado**  
    `observability-stack/README.md` documenta as rules e o fora de escopo de notificações.

11. **CA-11 — Scrape intacto**  
    Os cinco jobs de scrape e portas permanecem; não há exporters novos.

12. **CA-12 — Service Details intocado em escopo**  
    Não há redesign do dashboard Service Details nesta entrega.

## Ordem sugerida de implementação

1. Escrever `prometheus/alert.rules.yml` com as seis rules
2. Atualizar `prometheus.yml` (`rule_files`) e Compose (montagem) se necessário
3. Recarregar/reiniciar Prometheus e validar parse + `ServiceDown`
4. Adicionar painel de alertas ativos ao `marketplace-overview.json`
5. Recarregar Grafana / validar Overview
6. Atualizar README
7. Fechar CAs restantes

## Commits

Esta aula entrega **apenas as SPECs** (serviços + esta stack). A implementação deve ser feita em entrega posterior, a partir de um plano em português aprovado.

Quando for implementar a stack: preferir commit(s) claros para rules + wiring Prometheus e outro para o painel Grafana/README, ou um commit coeso da feature de alerting; não misturar implementação Terminus dos NestJS no mesmo commit sem necessidade.
