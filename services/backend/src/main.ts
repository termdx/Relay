import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: webhook signature verification needs the exact bytes GitHub
  // signed — a re-serialized JSON body would not HMAC-match.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // The desktop app (control plane) calls this API from another origin.
  app.enableCors();

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();
