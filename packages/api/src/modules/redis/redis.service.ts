import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("redis.host", "localhost");
    const port = this.configService.get<number>("redis.port", 6379);

    this.client = new Redis({
      host,
      port,
      retryStrategy: (times: number): number | null => {
        if (times > 3) {
          this.logger.error(`Redis connection failed after ${times} attempts`);
          return null;
        }
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on("connect", () => {
      this.logger.log("Redis connected");
    });

    this.client.on("error", (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });

    this.client.connect().catch((error: Error) => {
      this.logger.warn(
        `Redis initial connection failed: ${error.message} — will retry on first use`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log("Redis disconnected");
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<"OK"> {
    return this.client.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<"OK"> {
    return this.client.setex(key, seconds, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }
}
