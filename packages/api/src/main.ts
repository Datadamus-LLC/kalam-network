import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — supports comma-separated list of allowed origins
  const corsOriginRaw = configService.get<string>("cors.origin") ?? "";
  const corsOrigin = corsOriginRaw.includes(",")
    ? corsOriginRaw.split(",").map((o) => o.trim())
    : corsOriginRaw;
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  const port = configService.get<number>("port");
  await app.listen(port ?? 3001, "0.0.0.0");
  logger.log(
    `Hedera Social Platform API listening on http://localhost:${port}`,
  );
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger("Bootstrap");
  logger.error(
    "Failed to bootstrap application",
    err instanceof Error ? err.stack : String(err),
  );
  process.exit(1);
});
