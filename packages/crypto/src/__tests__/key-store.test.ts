// =============================================================================
// KEY STORE TESTS
// =============================================================================
// Test the client-side key storage functions.
// Uses real Web Crypto API for key generation — no mocking, no faking.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  storeKey,
  getKey,
  removeKey,
  hasKey,
  getAllTopicIds,
} from '../key-store';
import { generateSymmetricKey } from '../aes';

describe('Key Store', () => {
  beforeEach(async () => {
    // Clear the store before each test
    const topicIds = await getAllTopicIds();
    for (const topicId of topicIds) {
      await removeKey(topicId);
    }
  });

  it('should store and retrieve a key', async () => {
    const topicId = '0.0.12345';
    const key = await generateSymmetricKey();
    const metadata = {
      keyId: 'test-key-id-123',
      key,
      rotationIndex: 0,
    };

    await storeKey(topicId, metadata);
    const retrieved = await getKey(topicId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.keyId).toBe('test-key-id-123');
    expect(retrieved?.rotationIndex).toBe(0);
    expect(retrieved?.key).toBe(key);
  });

  it('should remove a key', async () => {
    const topicId = '0.0.12345';
    const key = await generateSymmetricKey();

    await storeKey(topicId, {
      keyId: 'test-key-id',
      key,
      rotationIndex: 0,
    });

    // Verify key exists
    expect(await hasKey(topicId)).toBe(true);

    // Remove it
    await removeKey(topicId);

    // Verify it's gone
    expect(await hasKey(topicId)).toBe(false);
  });

  it('should return undefined for non-existent key', async () => {
    const retrieved = await getKey('0.0.99999');
    expect(retrieved).toBeUndefined();
  });

  it('should check key existence with hasKey', async () => {
    const topicId = '0.0.54321';
    const key = await generateSymmetricKey();

    // Should not exist yet
    expect(await hasKey(topicId)).toBe(false);

    // Store it
    await storeKey(topicId, {
      keyId: 'test-id',
      key,
      rotationIndex: 0,
    });

    // Should exist now
    expect(await hasKey(topicId)).toBe(true);
  });

  it('should return all topic IDs', async () => {
    const topicIds = ['0.0.100', '0.0.101', '0.0.102'];
    const key = await generateSymmetricKey();

    for (const topicId of topicIds) {
      await storeKey(topicId, {
        keyId: `key-${topicId}`,
        key,
        rotationIndex: 0,
      });
    }

    const retrieved = await getAllTopicIds();

    expect(retrieved).toHaveLength(3);
    expect(retrieved).toEqual(expect.arrayContaining(topicIds));
  });

  it('should store multiple keys for different topics', async () => {
    const key1 = await generateSymmetricKey();
    const key2 = await generateSymmetricKey();

    await storeKey('0.0.200', {
      keyId: 'key1',
      key: key1,
      rotationIndex: 0,
    });

    await storeKey('0.0.201', {
      keyId: 'key2',
      key: key2,
      rotationIndex: 0,
    });

    const retrieved1 = await getKey('0.0.200');
    const retrieved2 = await getKey('0.0.201');

    expect(retrieved1?.keyId).toBe('key1');
    expect(retrieved2?.keyId).toBe('key2');
    expect(retrieved1?.key).not.toBe(retrieved2?.key);
  });
});
