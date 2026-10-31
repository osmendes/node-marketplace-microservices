# Spec: Correção de portas DB e teste do checkout-service

## Contexto

O monorepo `marketplace-ms` possui serviços NestJS com bancos PostgreSQL próprios. Para rodar lado a lado no host, cada serviço precisa de uma porta de banco distinta.

### Alocação canônica de portas DB no host

| Serviço | Porta DB no host | Database |
|---|---|---|
| users-service | `5433` | `users_db` |
| checkout-service | `5434` | `checkout_db` |
| payments-service | `5435` | `payments_db` |
| products-service | `5436` | `products_db` |

### Problemas abordados

1. **Documentação / alinhamento de portas** — Hipótese inicial de colisão entre checkout e products na porta `5434` **não se confirma** no estado atual do repositório: checkout já usa `5434` e products já usa `5436`. A porta do checkout **permanece** `5434`. Mover checkout para `5436` criaria colisão com products-service (fora de escopo alterar products).

2. **payments-service** — O ambiente local precisa declarar `DB_PORT=5435`, alinhado ao `compose.yaml` do serviço (host `5435` → container `5432`) e ao fallback de `database.config.ts`.

3. **checkout-service — teste unitário** — O `TestingModule` de `app.controller.spec.ts` deve prover um mock de `PaymentQueueService`, evitando falha de DI caso o controller (ou o grafo de providers sob teste) dependa desse serviço.

## Requisitos

### RF-01 — Portas DB canônicas respeitadas

A alocação de portas DB no host deve permanecer:

- users-service: `5433`
- checkout-service: `5434`
- payments-service: `5435`
- products-service: `5436`

O checkout-service **não** deve migrar para `5436`.

### RF-02 — Ambiente do payments-service alinhado à porta 5435

O payments-service deve expor configuração de ambiente local com:

- `DB_PORT=5435` (alinhado ao compose do serviço)
- Demais variáveis de conexão coerentes com o banco `payments_db`

Como `.env` não é versionado, deve existir um `.env.example` versionável documentando as variáveis, incluindo `DB_PORT=5435`.

O fallback em `database.config.ts` do payments-service deve continuar sendo `5435`.

### RF-03 — Mock de PaymentQueueService no teste do AppController

O arquivo `checkout/src/app.controller.spec.ts` deve registrar no `TestingModule` um provider mock de `PaymentQueueService`, de forma que o módulo de teste compile e os testes passem independentemente de o `AppController` injetar ou não esse serviço no momento da implementação.

### RF-04 — Checkout permanece em 5434

Os arquivos de compose e configuração de banco do checkout-service devem continuar publicando / usando a porta `5434` no host.

## Fora de escopo

Esta spec **não** inclui:

- Alterações em `users-service` ou `products-service`
- Criação de `docker-compose` / `compose` na raiz do monorepo
- Criação ou alteração de Dockerfiles
- Mudança da porta DB do checkout para `5436` (colidiria com products)
- Refatoração de filas RabbitMQ, controllers de negócio ou novas features

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Alocação canônica documentada**  
   A spec e o repositório refletem: users `5433`, checkout `5434`, payments `5435`, products `5436`.

2. **CA-02 — Checkout sem mudança de porta**  
   O compose do checkout continua expondo `5434:5432` e o fallback de `database.config.ts` do checkout permanece `5434`.

3. **CA-03 — payments com DB_PORT 5435**  
   Existe `payments/.env.example` (versionado) com `DB_PORT=5435`, e o ambiente local `payments/.env` usa `DB_PORT=5435`. O compose do payments continua em `5435:5432` e o fallback de `database.config.ts` permanece `5435`.

4. **CA-04 — Sem colisão checkout × products**  
   checkout e products usam portas distintas (`5434` e `5436`).

5. **CA-05 — Teste do AppController com mock**  
   `checkout/src/app.controller.spec.ts` registra mock de `PaymentQueueService` no `TestingModule`.

6. **CA-06 — Teste unitário passa**  
   O comando de teste unitário do `app.controller.spec.ts` no checkout-service passa com sucesso.

7. **CA-07 — Escopo respeitado**  
   Não há alterações em `users-service` nem em `products-service`. Não há compose raiz nem Dockerfiles novos.

## Ordem sugerida de implementação

1. Criar esta spec em `docs/specs/`
2. Criar `payments/.env` e `payments/.env.example` com `DB_PORT=5435`
3. Adicionar mock de `PaymentQueueService` em `checkout/src/app.controller.spec.ts`
4. Validar CA-02..CA-06
5. Fazer um único commit com todas as alterações desta spec

## Commits

Faça um único commit com a implementação completa desta spec.
