import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { getDataSourceToken } from "@nestjs/typeorm";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  // Run pending database migrations on startup
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const pending = await dataSource.showMigrations();
  if (pending) {
    logger.log("Running pending database migrations…");
    await dataSource.runMigrations({ transaction: "each" });
    logger.log("Database migrations complete");
  } else {
    logger.log("Database schema up to date — no migrations to run");
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  const corsOrigin = configService.get<string>("cors.origin");
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
