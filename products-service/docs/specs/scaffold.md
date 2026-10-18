# Spec: Scaffold do products-service

## Contexto

O marketplace-ms já possui `api-gateway` (porta 3005), `users-service` (porta 3000), `checkout-service` (porta 3003), `payments-service` (porta 3004) e `messaging-service` (RabbitMQ).

Esta spec define o scaffold do **products-service** (porta 3001), responsável por gerenciar o catálogo de produtos do marketplace.

O escopo é enxuto: apenas o essencial para o serviço existir, conectar ao banco e registrar a entidade de produto. Endpoints, autenticação e lógica de negócio ficam para specs futuras.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Mesma linha dos demais serviços do monorepo |
| TypeORM | Persistência |
| PostgreSQL | 15 |
| Driver | `pg` |
| Config | `@nestjs/config` |
| Validação | `class-validator` + `class-transformer` |

## Requisitos funcionais

### RF-01 — Projeto NestJS com dependências

O serviço deve estar estruturado como projeto NestJS independente, alinhado ao padrão de `users-service`, e deve incluir as dependências:

- `@nestjs/typeorm` e `typeorm`
- `pg`
- `@nestjs/config`
- `class-validator` e `class-transformer`

### RF-02 — Docker Compose com PostgreSQL 15

Deve existir um arquivo de compose na raiz do serviço que suba um PostgreSQL 15 com:

- Database: `products_db`
- Porta publicada no host: `5436` (mapeada para `5432` no container)
- Volume persistente para os dados
- Healthcheck habilitado
- Rede isolada do serviço

### RF-03 — Configuração de conexão com o banco

A conexão com o PostgreSQL deve ser feita via variáveis de ambiente, com valores padrão adequados para desenvolvimento local.

A configuração deve:

- Usar o tipo `postgres`
- Carregar entidades automaticamente
- Habilitar `synchronize` apenas fora de produção
- Habilitar logging apenas em desenvolvimento

O módulo de configuração da aplicação deve estar disponível globalmente.

### RF-04 — Módulo de produtos básico

Deve existir um módulo de produtos registrado na aplicação, contendo:

- Entidade `Product` mapeada no TypeORM
- Módulo NestJS de produtos importado no módulo raiz

Neste scaffold **não** devem existir controllers, endpoints HTTP, DTOs de API, serviços de negócio, autenticação ou autorização.

### RF-05 — ValidationPipe global

A aplicação deve iniciar com `ValidationPipe` global habilitado, com:

- Transformação automática de tipos (`transform`)
- Remoção de propriedades não declaradas (`whitelist`)
- Rejeição de propriedades não permitidas (`forbidNonWhitelisted`)

A aplicação deve escutar na porta definida por `PORT`, com fallback para `3001`.

## Estrutura de dados

### Entidade: Product

A entidade `Product` deve conter **apenas** os campos abaixo.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | Gerado automaticamente |
| `name` | string | Máximo 255 caracteres |
| `description` | text | Texto longo |
| `price` | decimal | Precisão `(10,2)` |
| `stock` | int | Default `0` |
| `sellerId` | UUID | Referência ao usuário vendedor; sem FK (banco separado) |
| `isActive` | boolean | Default `true` |
| `createdAt` | timestamp | Preenchido automaticamente na criação |
| `updatedAt` | timestamp | Atualizado automaticamente em alterações |

## Variáveis de ambiente

| Variável | Descrição | Exemplo local |
|---|---|---|
| `PORT` | Porta HTTP do serviço | `3001` |
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5436` |
| `DB_USERNAME` | Usuário do banco | `postgres` |
| `DB_PASSWORD` | Senha do banco | `postgres` |
| `DB_DATABASE` | Nome do database | `products_db` |

Deve existir um arquivo de exemplo de ambiente (por exemplo `.env.example`) documentando essas variáveis, sem commitar segredos reais.

## Estrutura esperada do serviço (alto nível)

```text
products-service/
├── compose.yaml
├── docs/
│   └── specs/
│       └── scaffold.md
├── src/
│   ├── config/          # configuração de banco / ambiente
│   ├── products/        # módulo + entidade Product
│   ├── app.module.ts
│   └── main.ts
├── package.json
└── ...
```

A organização interna deve seguir o padrão já usado em `users-service`.

## Fora de escopo

Esta spec **não** inclui:

- Endpoints HTTP (CRUD de produtos)
- Autenticação, JWT, guards ou Passport
- Integração com RabbitMQ / messaging
- Integração com o API Gateway
- Migrations versionadas (usar synchronize apenas em desenvolvimento)
- Lógica de negócio de produtos (estoque, catálogo, busca)
- Foreign key para `sellerId` (bancos separados)
- Testes de endpoints (não há endpoints neste scaffold)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Projeto inicia**  
   Com as dependências instaladas, o comando de start em modo desenvolvimento sobe a aplicação sem erros de compilação.

2. **CA-02 — Porta padrão**  
   Sem `PORT` definido, o serviço escuta na porta `3001`.

3. **CA-03 — Banco sobe via Compose**  
   Ao executar o compose do serviço, o container PostgreSQL 15 fica healthy e a porta `5436` fica acessível no host, com database `products_db`.

4. **CA-04 — Conexão com o banco**  
   Com o banco no ar e as variáveis de ambiente configuradas, a aplicação conecta ao PostgreSQL sem erro na inicialização.

5. **CA-05 — Entidade Product criada**  
   Após a subida da aplicação em ambiente de desenvolvimento, a tabela correspondente à entidade `Product` existe no banco com as colunas: `id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt`, `updatedAt`.

6. **CA-06 — Constraints e defaults**  
   - `id` é UUID  
   - `name` tem limite de 255 caracteres  
   - `price` usa decimal `(10,2)`  
   - o default de `stock` é `0`  
   - o default de `isActive` é `true`  
   - `sellerId` é UUID sem foreign key

7. **CA-07 — Módulo de produtos presente**  
   O módulo de produtos está registrado na aplicação e a entidade `Product` está mapeada no TypeORM. Não existem controllers ou rotas HTTP de produtos.

8. **CA-08 — ValidationPipe global**  
   O `ValidationPipe` global está habilitado com `transform`, `whitelist` e `forbidNonWhitelisted`.

9. **CA-09 — Variáveis de ambiente**  
   Existe documentação/exemplo das variáveis `PORT`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE`.

10. **CA-10 — Escopo respeitado**  
    Não há implementação de endpoints, autenticação ou integração com messaging/gateway neste scaffold.

## Ordem sugerida de implementação

1. Garantir dependências do scaffold instaladas  
2. Criar Compose do PostgreSQL 15  
3. Configurar variáveis de ambiente e conexão TypeORM  
4. Criar entidade `Product` e módulo de produtos  
5. Registrar módulo e configuração no módulo raiz  
6. Habilitar ValidationPipe global e porta `3001`  
7. Validar os critérios de aceite

## Commits

Faça um único commit com a implementação completa desta spec.
