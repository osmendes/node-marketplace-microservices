# Spec: Consulta de produtos no products-service

## Contexto

O `products-service` (porta `3001`) já possui:

- Scaffold NestJS com PostgreSQL (`products_db`, porta host `5436`) e TypeORM
- Entidade `Product` (`id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt`, `updatedAt`)
- Autenticação JWT funcionando: AuthModule de validação, JwtAuthGuard global, decorator `@Public()`, e `req.user` com `{ id, email, role }` após token válido
- `ProductsModule` com `ProductsController` e `ProductsService`, incluindo o endpoint `POST /products` (seller only) funcionando

O catálogo do marketplace precisa ser navegável por qualquer pessoa. As consultas de produtos são **públicas** (decoradas com `@Public()`). A criação (`POST /products`) permanece protegida pelo JwtAuthGuard global.

Esta spec define **apenas os endpoints essenciais de consulta**. Atualização, exclusão, paginação, filtros e busca por texto ficam fora do escopo.

## Stack

| Tecnologia | Versão / Observação |
|---|---|
| NestJS | Já presente no serviço |
| TypeORM | Persistência da entidade `Product` (já mapeada) |
| PostgreSQL | 15 (Compose existente) |
| Autenticação | JwtAuthGuard global já ativo; rotas de consulta **são** públicas (`@Public()`) |

## Requisitos funcionais

### RF-01 — Estender ProductsController e ProductsService

Os endpoints de consulta devem ser adicionados ao `ProductsController` e ao `ProductsService` já existentes.

Responsabilidades mínimas nesta entrega:

- **ProductsController:** expor os três endpoints de consulta na ordem correta de declaração de rotas
- **ProductsService:** aplicar os filtros de consulta (`isActive`, `sellerId`, `id`) e retornar os dados ou sinalizar produto não encontrado

O `ProductsModule` e o endpoint `POST /products` existentes devem continuar funcionando sem regressão.

### RF-02 — Listar produtos ativos (`GET /products`)

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/products`
- **Autenticação:** pública (`@Public()`) — qualquer pessoa pode navegar o catálogo, com ou sem token
- **Comportamento:** retornar todos os produtos com `isActive = true`, ordenados por data de criação do mais recente para o mais antigo
- **Resposta de sucesso:** **HTTP 200** com um array de produtos (array vazio se não houver produtos ativos)

### RF-03 — Listar produtos ativos de um vendedor (`GET /products/seller/:sellerId`)

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/products/seller/:sellerId`
- **Parâmetro:** `sellerId` — identificador UUID do vendedor
- **Autenticação:** pública (`@Public()`)
- **Comportamento:** retornar todos os produtos com `isActive = true` pertencentes ao `sellerId` informado
- **Resposta de sucesso:** **HTTP 200** com um array de produtos (array vazio se o vendedor não tiver produtos ativos; **não** retornar 404 nesse caso)

### RF-04 — Obter produto por ID (`GET /products/:id`)

Deve existir o endpoint:

- **Método:** `GET`
- **Caminho:** `/products/:id`
- **Parâmetro:** `id` — identificador UUID do produto
- **Autenticação:** pública (`@Public()`)
- **Comportamento:** retornar os dados do produto correspondente ao `id`
- **Produto inexistente:** responder **HTTP 404 (Not Found)** com mensagem clara indicando que o produto não foi encontrado
- **Resposta de sucesso:** **HTTP 200** com o objeto do produto

### RF-05 — Ordem de declaração das rotas

A ordem de declaração das rotas no controller **importa**.

Rotas estáticas e com prefixo fixo devem ser declaradas **antes** da rota dinâmica `:id`:

1. `GET /products` (lista geral)
2. `GET /products/seller/:sellerId` (lista por vendedor)
3. `GET /products/:id` (detalhe por ID)

Se `GET /products/:id` for declarada antes de `GET /products/seller/:sellerId`, o segmento `seller` será interpretado como um `id`, quebrando a consulta por vendedor.

### RF-06 — Consultas públicas e criação protegida

As três rotas de consulta desta spec devem ser marcadas como públicas (`@Public()`).

O endpoint `POST /products` existente **não** deve ser alterado: continua protegido pelo JwtAuthGuard global (sem `@Public()`), com a regra seller-only já implementada.

## Estrutura de dados

### Parâmetros de rota

| Endpoint | Parâmetro | Tipo esperado | Obrigatório |
|---|---|---|---|
| `GET /products/seller/:sellerId` | `sellerId` | UUID | Sim |
| `GET /products/:id` | `id` | UUID | Sim |

### Resposta de sucesso — item de produto

Cada produto retornado (em lista ou no detalhe) deve incluir os campos persistidos:

| Campo | Presente |
|---|---|
| `id` | Sim |
| `name` | Sim |
| `description` | Sim |
| `price` | Sim |
| `stock` | Sim |
| `sellerId` | Sim |
| `isActive` | Sim |
| `createdAt` | Sim |
| `updatedAt` | Sim |

### Resposta de sucesso — listas

`GET /products` e `GET /products/seller/:sellerId` retornam um **array** de produtos no formato acima. O array pode ser vazio (`[]`).

### Filtros aplicados nas consultas

| Endpoint | Filtro `isActive` | Outros filtros | Ordenação |
|---|---|---|---|
| `GET /products` | Apenas `true` | — | `createdAt` decrescente (mais recentes primeiro) |
| `GET /products/seller/:sellerId` | Apenas `true` | `sellerId` igual ao parâmetro | Sem ordenação obrigatória além do filtro |
| `GET /products/:id` | Sem filtro por `isActive` nesta entrega | `id` igual ao parâmetro | — |

## Fluxo esperado de uma requisição

### Listagem geral (`GET /products`)

1. Requisição chega sem necessidade de token
2. O serviço busca produtos com `isActive = true`
3. Os resultados são ordenados por `createdAt` decrescente
4. A API responde **200** com o array (possivelmente vazio)

### Listagem por vendedor (`GET /products/seller/:sellerId`)

1. Requisição chega sem necessidade de token, com `sellerId` na rota
2. O serviço busca produtos com `isActive = true` e `sellerId` igual ao parâmetro
3. A API responde **200** com o array (vazio se não houver produtos ativos daquele vendedor)

### Detalhe por ID — sucesso (`GET /products/:id`)

1. Requisição chega sem necessidade de token, com `id` na rota
2. O serviço busca o produto pelo `id`
3. Se encontrado, a API responde **200** com o objeto do produto

### Detalhe por ID — não encontrado

1. Requisição com `id` que não corresponde a nenhum produto
2. A API responde **404** com mensagem clara; nenhum outro efeito colateral

## Respostas esperadas

### 200 OK

Deve ocorrer quando:

- `GET /products` retorna a lista de produtos ativos (ou array vazio)
- `GET /products/seller/:sellerId` retorna a lista de produtos ativos do vendedor (ou array vazio)
- `GET /products/:id` encontra o produto e retorna seus dados

### 404 Not Found

Deve ocorrer **apenas** em `GET /products/:id` quando o produto com o `id` informado não existir.

`GET /products/seller/:sellerId` **não** retorna 404 quando o vendedor não tem produtos: retorna **200** com array vazio.

## Estrutura esperada (alto nível)

```text
products-service/
├── src/
│   ├── products/
│   │   ├── entities/            # Product (já existente)
│   │   ├── products.controller.ts   # adicionar os 3 GETs (ordem correta)
│   │   ├── products.service.ts      # adicionar métodos de consulta
│   │   └── products.module.ts       # inalterado em responsabilidades
│   └── auth/                    # inalterado nesta spec (@Public já existe)
└── docs/
    └── specs/
        └── 04-query-products.md
```

A organização interna deve seguir o padrão já usado no monorepo. Nomes de pastas e arquivos podem variar desde que as responsabilidades acima estejam cobertas.

## Fora de escopo

Esta spec **não** inclui:

- Atualização (`PATCH` / `PUT`) ou exclusão (`DELETE`) de produtos
- Paginação, ordenação configurável pelo cliente, filtros por preço/estoque ou busca por texto
- Soft delete ou alteração do comportamento de `isActive` na criação
- Upload de imagens ou categorias de produtos
- Alteração do schema da entidade `Product`
- Alteração do AuthModule, JwtStrategy, JwtAuthGuard ou do decorator `@Public()` (apenas o uso de `@Public()` nas novas rotas)
- Integração com API Gateway, RabbitMQ ou outros serviços
- Alteração do endpoint `POST /products` existente
- Emissão local de JWT (continua sendo responsabilidade exclusiva do `users-service`)

## Critérios de aceite

Os critérios abaixo devem ser verificáveis de forma objetiva.

1. **CA-01 — Endpoint de listagem geral**  
   `GET /products` existe, é público e responde **200** com um array.

2. **CA-02 — Apenas produtos ativos na listagem geral**  
   `GET /products` retorna somente produtos com `isActive = true`. Produtos inativos não aparecem na lista.

3. **CA-03 — Ordenação por criação**  
   Em `GET /products`, os produtos retornados estão ordenados por `createdAt` do mais recente para o mais antigo.

4. **CA-04 — Listagem geral pública**  
   `GET /products` responde **200** sem header `Authorization` (sem exigir token).

5. **CA-05 — Endpoint de listagem por vendedor**  
   `GET /products/seller/:sellerId` existe, é público e responde **200** com um array.

6. **CA-06 — Filtro por vendedor e ativos**  
   `GET /products/seller/:sellerId` retorna somente produtos com `isActive = true` e `sellerId` igual ao parâmetro da rota.

7. **CA-07 — Vendedor sem produtos**  
   Quando o `sellerId` não possui produtos ativos, a API responde **200** com array vazio (`[]`), e não **404**.

8. **CA-08 — Listagem por vendedor pública**  
   `GET /products/seller/:sellerId` responde **200** sem header `Authorization`.

9. **CA-09 — Endpoint de detalhe por ID**  
   `GET /products/:id` existe, é público e, com `id` válido existente, responde **200** com o objeto do produto completo (`id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt`, `updatedAt`).

10. **CA-10 — Produto não encontrado**  
    Com um `id` inexistente, `GET /products/:id` responde **404**.

11. **CA-11 — Detalhe por ID público**  
    `GET /products/:id` responde **200** (produto existente) sem header `Authorization`.

12. **CA-12 — Ordem das rotas**  
    `GET /products/seller/:sellerId` funciona corretamente e não é capturado pela rota `GET /products/:id` (o segmento `seller` não é tratado como UUID de produto).

13. **CA-13 — POST /products sem regressão**  
    `POST /products` continua protegido (sem token → **401**; buyer → **403**; seller com body válido → **201**).

14. **CA-14 — Escopo respeitado**  
    Não há endpoints de update, delete, paginação, filtros adicionais ou busca por texto nesta entrega.

## Ordem sugerida de implementação

1. Implementar no `ProductsService` a consulta de listagem geral (ativos, ordenados por `createdAt` desc)  
2. Implementar no `ProductsService` a consulta por `sellerId` (ativos do vendedor)  
3. Implementar no `ProductsService` a consulta por `id` (com 404 quando inexistente)  
4. Expor no `ProductsController` os três endpoints `GET`, na ordem: lista geral → seller → `:id`, todos com `@Public()`  
5. Cobrir os critérios de aceite com testes automatizados (unitário e/ou e2e)  
6. Validar manualmente: listagem sem token → 200; seller sem produtos → 200 `[]`; id inexistente → 404; `POST /products` sem regressão

## Commits

Faça um único commit com a implementação completa desta spec.
