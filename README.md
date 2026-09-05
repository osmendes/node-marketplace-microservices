# node-marketplace-microservices

Repositório unificado dos microserviços do marketplace.

## Estrutura

```text
node-marketplace-microservices/
├── gateway/       # API Gateway (NestJS)
├── checkout/      # Serviço de Checkout
├── payments/      # Serviço de Pagamentos
└── messaging/     # Serviço de Mensageria
```

Cada pasta contém o código completo do respectivo serviço (com seu próprio `package.json`, `src/`, etc.).

## Origem

Este repositório unifica os seguintes projetos:

- [node-marketplace-gateway](https://github.com/osmendes/node-marketplace-gateway)
- [node-marketplace-checkout](https://github.com/osmendes/node-marketplace-checkout)
- [node-marketplace-payments](https://github.com/osmendes/node-marketplace-payments)
- [node-marketplace-messaging](https://github.com/osmendes/node-marketplace-messaging)

## Como desenvolver

Entre na pasta do serviço que deseja trabalhar e use os comandos normais:

```bash
cd gateway
pnpm install
pnpm run start:dev
```

O mesmo vale para `checkout`, `payments` e `messaging`.

## Próximos passos

No futuro este repositório pode ser transformado em um monorepo com workspaces (pnpm + Turborepo).
