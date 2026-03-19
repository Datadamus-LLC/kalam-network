/**
 * Integration tests for WsJwtGuard (chat/guards/ws-jwt.guard.ts).
 *
 * These tests spin up a real NestJS application with a minimal WebSocket
 * gateway that uses WsJwtGuard, then connects real Socket.io clients
 * to verify authentication behavior.
 *
 * Tests verify:
 *   - Valid JWT in handshake auth.token allows connection + message handling
 *   - Valid JWT in Authorization header allows message handling
 *   - Missing token causes disconnection and ws_error emission
 *   - Invalid token causes disconnection and ws_error emission
 *   - Expired token causes disconnection and ws_error emission
 *
 * The WsJwtGuard runs on @SubscribeMessage handlers (not on connection itself),
 * so we test by emitting an event to a guarded handler and verifying the response.
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { UseGuards, Logger, INestApplication } from "@nestjs/common";
import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Socket } from "socket.io";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import {
  WsJwtGuard,
  type AuthenticatedSocket,
} from "../../chat/guards/ws-jwt.guard";

const logger = new Logger("WsJwtGuardIntegrationTest");

const TEST_JWT_SECRET =
  "ws-jwt-guard-test-secret-key-at-least-32-characters-long";

const WRONG_JWT_SECRET =
  "wrong-ws-jwt-guard-secret-key-at-least-32-characters-long";

// ---------------------------------------------------------------------------
// Minimal test gateway that uses WsJwtGuard
// ---------------------------------------------------------------------------

@WebSocketGateway({
  namespace: "/ws-test",
  cors: { origin: "*" },
})
class TestWsGateway {
  /**
   * A guarded handler: WsJwtGuard runs when this event is received.
   * If the guard passes, the decoded user is attached to the socket.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage("ping")
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { value: string },
  ): { event: string; data: { pong: string; userId: string } } {
    const authenticatedClient = client as AuthenticatedSocket;
    return {
      event: "pong",
      data: {
        pong: data.value,
        userId: authenticatedClient.user.sub,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WsJwtGuard Integration Tests", () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let serverPort: number;

  const clientSockets: ClientSocket[] = [];

  beforeAll(async () => {
    try {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                jwt: {
                  secret: TEST_JWT_SECRET,
                  expiresIn: "24h",
                },
              }),
            ],
          }),
          JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              secret: configService.get<string>("jwt.secret"),
              signOptions: { expiresIn: "24h" },
            }),
          }),
        ],
        providers: [TestWsGateway, WsJwtGuard],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
      await app.listen(0);

      const serverUrl = await app.getUrl();
      serverPort = parseInt(new URL(serverUrl).port, 10);

      jwtService = moduleRef.get<JwtService>(JwtService);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize WsJwtGuard test app: ${message}`);
      throw error;
    }
  });

  afterAll(async () => {
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function signToken(
    payload?: Partial<{
      sub: string;
      hederaAccountId: string;
      identifier: string;
    }>,
    options?: { expiresIn?: string; secret?: string },
  ): string {
    return jwtService.sign(
      {
        sub: payload?.sub ?? "test-user-id",
        hederaAccountId: payload?.hederaAccountId ?? "0.0.11111",
        identifier: payload?.identifier ?? "test@example.com",
      },
      {
        secret: options?.secret ?? TEST_JWT_SECRET,
        expiresIn: options?.expiresIn ?? "1h",
      },
    );
  }

  function createClient(authOptions?: {
    token?: string;
    useHeader?: boolean;
  }): ClientSocket {
    const opts: Record<string, unknown> = {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    };

    if (authOptions?.token) {
      if (authOptions.useHeader) {
        opts.extraHeaders = {
          authorization: `Bearer ${authOptions.token}`,
        };
      } else {
        opts.auth = { token: authOptions.token };
      }
    }

    const client = ioClient(`http://localhost:${serverPort}/ws-test`, opts);
    clientSockets.push(client);
    return client;
  }

  function waitForEvent<T>(
    socket: ClientSocket,
    event: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for event "${event}"`));
      }, timeoutMs);

      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  function waitForDisconnect(
    socket: ClientSocket,
    timeoutMs = 5000,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!socket.connected) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error("Timed out waiting for disconnect"));
      }, timeoutMs);

      socket.once("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // -------------------------------------------------------------------------
  // Tests: Valid JWT via auth.token
  // -------------------------------------------------------------------------

  describe("Valid JWT in handshake auth.token", () => {
    it("should allow guarded message handling with valid token in auth.token", async () => {
      const token = signToken({
        sub: "user-via-auth-token",
        hederaAccountId: "0.0.22222",
      });
      const client = createClient({ token });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      // Emit a guarded event
      const responsePromise = waitForEvent<{
        pong: string;
        userId: string;
      }>(client, "pong");

      client.emit("ping", { value: "hello" });

      const response = await responsePromise;

      expect(response.pong).toBe("hello");
      expect(response.userId).toBe("user-via-auth-token");

      client.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Valid JWT via Authorization header
  // -------------------------------------------------------------------------

  describe("Valid JWT in Authorization header", () => {
    it("should allow guarded message handling with valid token in header", async () => {
      const token = signToken({
        sub: "user-via-header",
        hederaAccountId: "0.0.33333",
      });
      const client = createClient({ token, useHeader: true });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      const responsePromise = waitForEvent<{
        pong: string;
        userId: string;
      }>(client, "pong");

      client.emit("ping", { value: "header-test" });

      const response = await responsePromise;

      expect(response.pong).toBe("header-test");
      expect(response.userId).toBe("user-via-header");

      client.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Missing token
  // -------------------------------------------------------------------------

  describe("Missing token", () => {
    it("should emit ws_error and disconnect when no token is provided", async () => {
      const client = createClient(); // No token

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      // The client can connect (connection itself has no guard),
      // but when sending a guarded event, the guard rejects it.
      const errorPromise = waitForEvent<{
        code: string;
        message: string;
      }>(client, "ws_error");

      const disconnectPromise = waitForDisconnect(client);

      client.emit("ping", { value: "should-fail" });

      const errorEvent = await errorPromise;

      expect(errorEvent.code).toBe("WS_TOKEN_MISSING");
      expect(typeof errorEvent.message).toBe("string");

      // Guard calls client.disconnect() so the socket should be disconnected
      await disconnectPromise;
      expect(client.connected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Invalid token
  // -------------------------------------------------------------------------

  describe("Invalid token", () => {
    it("should emit ws_error and disconnect for a malformed token", async () => {
      const client = createClient({ token: "not-a-real-jwt-token" });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      const errorPromise = waitForEvent<{
        code: string;
        message: string;
      }>(client, "ws_error");

      const disconnectPromise = waitForDisconnect(client);

      client.emit("ping", { value: "bad-token" });

      const errorEvent = await errorPromise;

      expect(errorEvent.code).toBe("WS_AUTHENTICATION_FAILED");
      expect(typeof errorEvent.message).toBe("string");

      await disconnectPromise;
      expect(client.connected).toBe(false);
    });

    it("should emit ws_error and disconnect for a token signed with wrong secret", async () => {
      const wrongJwt = new JwtService({ secret: WRONG_JWT_SECRET });
      const token = wrongJwt.sign(
        {
          sub: "attacker",
          hederaAccountId: "0.0.99999",
          identifier: "attacker@evil.com",
        },
        { expiresIn: "1h" },
      );

      const client = createClient({ token });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      const errorPromise = waitForEvent<{
        code: string;
        message: string;
      }>(client, "ws_error");

      const disconnectPromise = waitForDisconnect(client);

      client.emit("ping", { value: "wrong-secret" });

      const errorEvent = await errorPromise;

      expect(errorEvent.code).toBe("WS_AUTHENTICATION_FAILED");

      await disconnectPromise;
      expect(client.connected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Expired token
  // -------------------------------------------------------------------------

  describe("Expired token", () => {
    it("should emit ws_error and disconnect for an expired token", async () => {
      // Sign a token that expires immediately
      const token = signToken(
        { sub: "expired-user", hederaAccountId: "0.0.44444" },
        { expiresIn: "0s" },
      );

      // Wait briefly to ensure expiry
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 150);
        if (typeof timer === "object" && "unref" in timer) timer.unref();
      });

      const client = createClient({ token });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      const errorPromise = waitForEvent<{
        code: string;
        message: string;
      }>(client, "ws_error");

      const disconnectPromise = waitForDisconnect(client);

      client.emit("ping", { value: "expired" });

      const errorEvent = await errorPromise;

      expect(errorEvent.code).toBe("WS_AUTHENTICATION_FAILED");

      await disconnectPromise;
      expect(client.connected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Tests: User payload attached to socket
  // -------------------------------------------------------------------------

  describe("User payload attachment", () => {
    it("should attach full JWT payload to socket.user after successful auth", async () => {
      const token = signToken({
        sub: "payload-check-user",
        hederaAccountId: "0.0.55555",
        identifier: "payload@test.com",
      });
      const client = createClient({ token });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      const responsePromise = waitForEvent<{
        pong: string;
        userId: string;
      }>(client, "pong");

      client.emit("ping", { value: "payload-check" });

      const response = await responsePromise;

      // The guard attaches user.sub to the socket, and the test handler reads it
      expect(response.userId).toBe("payload-check-user");
      expect(response.pong).toBe("payload-check");

      client.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Multiple authenticated messages
  // -------------------------------------------------------------------------

  describe("Multiple messages on same connection", () => {
    it("should handle multiple guarded messages on the same authenticated socket", async () => {
      const token = signToken({
        sub: "multi-msg-user",
        hederaAccountId: "0.0.66666",
      });
      const client = createClient({ token });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      // Send first message
      const pong1Promise = waitForEvent<{
        pong: string;
        userId: string;
      }>(client, "pong");

      client.emit("ping", { value: "first" });
      const pong1 = await pong1Promise;
      expect(pong1.pong).toBe("first");

      // Send second message on same connection
      const pong2Promise = waitForEvent<{
        pong: string;
        userId: string;
      }>(client, "pong");

      client.emit("ping", { value: "second" });
      const pong2 = await pong2Promise;
      expect(pong2.pong).toBe("second");
      expect(pong2.userId).toBe("multi-msg-user");

      client.disconnect();
    });
  });
});
