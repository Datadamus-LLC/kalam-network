import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): ApiEnvelope<{ name: string; version: string }> {
    return {
      success: true,
      data: {
        name: "Hedera Social API",
        version: "1.0.0",
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get("health")
  health(): ApiEnvelope<{ status: string }> {
    return {
      success: true,
      data: {
        status: "ok",
      },
      timestamp: new Date().toISOString(),
    };
  }
}
