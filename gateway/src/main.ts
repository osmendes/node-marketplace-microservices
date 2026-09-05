import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || ["*"];

      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
    ],
    credentials: true,
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configuração do swagger
  const config = new DocumentBuilder()
    .setTitle("Marketeplace API Gateway")
    .setDescription(
      `
      API Gateway para o sistema de Marketplace com microserviços.

      Serviços disponíveis:
      - Users Service: Antenticação e gestão de usuários
      - Products Service: Catálogo e gestão de produtos
      - Checkout Service: Carrinho e processamento de pedidos
      - Payment Service: Processamento de pagamentos

      Autenticação:
      - Use JWT Bearer token para rotas protegidas
      - Use Session token para validação de sessão
    `,
    )
    .setVersion("1.0")
    .setContact("Marketplace Team", "https://marketplace.com", "dev@marketplace.com")
    .setLicense("MIT", "https://opensource.org/locenses/MIT")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "JWT",
        description: "Enter JWT token",
        in: "header",
      },
      "JWT-auth",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "x-session-token",
        in: "header",
        description: "Session token for user validation",
      },
      "session-auth",
    )
    .addTag("Authentication", "Endpoints para autenticação e autorização")
    .addTag("Users", "Endpoints para gestão de usuários")
    .addTag("Products", "Endpoints para catálogo de produtos")
    .addTag("Checkout", "Endpoints para carrinho e pedidos")
    .addTag("Payments", "Endpoints para processamento de pagamentos")
    .addTag("Health", "Endpoints para monitoramento de saúde")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document, {
    swaggerOptions: {},
    customSiteTitle: "Maketplace API Gateway Documentation",
    customfavIcon: "/favicon.ico",
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .tittle { color: #3b82f6; }
    `,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`API is running on port ${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api`);
}
bootstrap();
