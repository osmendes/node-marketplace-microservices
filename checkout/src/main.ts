import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger(`Main function`);
  const app = await NestFactory.create(AppModule);

  app.enableCors()
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )

  const port = process.env.PORT || 3003;
  await app.listen(port);

  logger.log(`Checkout Service running on port ${port}`);
}
bootstrap();
