/**
 * Environment Variable Utilities — Unit Tests
 *
 * Tests the env module's validation and default values.
 * No mocking — tests the real Zod schema validation behavior.
 *
 * Note: The env module executes validation at import time (module load).
 * Since the module is already imported and cached by the time tests run,
 * we test the exported singleton `env` object's values. We also test
 * that the schema provides correct defaults when env vars are not set.
 */
import { env, type ClientEnv } from '../src/lib/env';

describe('Client Environment (env)', () => {
  describe('exported env singleton', () => {
    it('should export a non-null env object', () => {
      expect(env).toBeDefined();
      expect(env).not.toBeNull();
    });

    it('should have NEXT_PUBLIC_API_URL as a string', () => {
      expect(typeof env.NEXT_PUBLIC_API_URL).toBe('string');
    });

    it('should have NEXT_PUBLIC_HEDERA_NETWORK as a valid network', () => {
      expect(['testnet', 'mainnet', 'previewnet']).toContain(
        env.NEXT_PUBLIC_HEDERA_NETWORK,
      );
    });

    it('should have NEXT_PUBLIC_ENABLE_CHAT as a boolean', () => {
      expect(typeof env.NEXT_PUBLIC_ENABLE_CHAT).toBe('boolean');
    });

    it('should have NEXT_PUBLIC_ENABLE_KYC as a boolean', () => {
      expect(typeof env.NEXT_PUBLIC_ENABLE_KYC).toBe('boolean');
    });

    it('should have NEXT_PUBLIC_ENABLE_PAYMENTS as a boolean', () => {
      expect(typeof env.NEXT_PUBLIC_ENABLE_PAYMENTS).toBe('boolean');
    });
  });

  describe('default values', () => {
    // When no NEXT_PUBLIC_* env vars are set, the schema should use defaults.
    // In the test environment, these are not set, so defaults apply.

    it('should default NEXT_PUBLIC_API_URL to http://localhost:3001/api/v1', () => {
      // Only true if the env var is not set in the test environment
      if (!process.env.NEXT_PUBLIC_API_URL) {
        expect(env.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001/api/v1');
      }
    });

    it('should default NEXT_PUBLIC_HEDERA_NETWORK to testnet', () => {
      if (!process.env.NEXT_PUBLIC_HEDERA_NETWORK) {
        expect(env.NEXT_PUBLIC_HEDERA_NETWORK).toBe('testnet');
      }
    });

    it('should default NEXT_PUBLIC_ENABLE_CHAT to true', () => {
      if (!process.env.NEXT_PUBLIC_ENABLE_CHAT) {
        expect(env.NEXT_PUBLIC_ENABLE_CHAT).toBe(true);
      }
    });

    it('should default NEXT_PUBLIC_ENABLE_KYC to true', () => {
      if (!process.env.NEXT_PUBLIC_ENABLE_KYC) {
        expect(env.NEXT_PUBLIC_ENABLE_KYC).toBe(true);
      }
    });

    it('should default NEXT_PUBLIC_ENABLE_PAYMENTS to true', () => {
      if (!process.env.NEXT_PUBLIC_ENABLE_PAYMENTS) {
        expect(env.NEXT_PUBLIC_ENABLE_PAYMENTS).toBe(true);
      }
    });
  });

  describe('optional fields', () => {
    it('should allow NEXT_PUBLIC_WS_URL to be undefined', () => {
      // This field is optional — it may or may not be set
      const wsUrl = env.NEXT_PUBLIC_WS_URL;
      expect(wsUrl === undefined || typeof wsUrl === 'string').toBe(true);
    });

    it('should allow NEXT_PUBLIC_HASHSCAN_URL to be undefined', () => {
      const hashscanUrl = env.NEXT_PUBLIC_HASHSCAN_URL;
      expect(hashscanUrl === undefined || typeof hashscanUrl === 'string').toBe(true);
    });
  });

  describe('type conformance', () => {
    it('should conform to ClientEnv type shape', () => {
      // Verify every key in ClientEnv is present
      const envObj: ClientEnv = env;

      expect(envObj).toHaveProperty('NEXT_PUBLIC_API_URL');
      expect(envObj).toHaveProperty('NEXT_PUBLIC_HEDERA_NETWORK');
      expect(envObj).toHaveProperty('NEXT_PUBLIC_ENABLE_CHAT');
      expect(envObj).toHaveProperty('NEXT_PUBLIC_ENABLE_KYC');
      expect(envObj).toHaveProperty('NEXT_PUBLIC_ENABLE_PAYMENTS');
    });

    it('should have a valid URL for NEXT_PUBLIC_API_URL', () => {
      // The schema validates this is a URL; verify it is parseable
      const parsed = new URL(env.NEXT_PUBLIC_API_URL);
      expect(parsed.protocol).toMatch(/^https?:$/);
    });
  });

  describe('boolean transforms', () => {
    // The schema transforms string "true"/"false" to boolean.
    // Since the defaults are "true", the transformed values should be true.

    it('should transform NEXT_PUBLIC_ENABLE_CHAT string to boolean', () => {
      // The transform turns "true" -> true, "false" -> false
      expect(env.NEXT_PUBLIC_ENABLE_CHAT === true || env.NEXT_PUBLIC_ENABLE_CHAT === false).toBe(
        true,
      );
    });

    it('should transform NEXT_PUBLIC_ENABLE_KYC string to boolean', () => {
      expect(env.NEXT_PUBLIC_ENABLE_KYC === true || env.NEXT_PUBLIC_ENABLE_KYC === false).toBe(
        true,
      );
    });

    it('should transform NEXT_PUBLIC_ENABLE_PAYMENTS string to boolean', () => {
      expect(
        env.NEXT_PUBLIC_ENABLE_PAYMENTS === true || env.NEXT_PUBLIC_ENABLE_PAYMENTS === false,
      ).toBe(true);
    });
  });
});
