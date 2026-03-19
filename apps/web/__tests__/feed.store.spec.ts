/**
 * Feed Store — Unit Tests
 *
 * Tests the Zustand feed store with real store operations.
 * No mocking — the store runs its actual logic.
 */
import { useFeedStore } from '../src/stores/feed.store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(): string {
  idCounter++;
  return `test-id-${idCounter}`;
}

function makePost(overrides: Partial<{
  id: string;
  authorAccountId: string;
  content: string;
  createdAt: string;
  likes: number;
  replies: number;
  media: string[];
}> = {}) {
  return {
    id: overrides.id ?? nextId(),
    authorAccountId: overrides.authorAccountId ?? '0.0.12345',
    content: overrides.content ?? 'Hello world',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    likes: overrides.likes,
    replies: overrides.replies,
    media: overrides.media,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feed Store (Zustand)', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useFeedStore.getState().reset();
  });

  describe('initial state', () => {
    it('should start with empty posts', () => {
      const state = useFeedStore.getState();
      expect(state.posts).toEqual([]);
    });

    it('should start with isLoading false', () => {
      expect(useFeedStore.getState().isLoading).toBe(false);
    });

    it('should start with hasMore true', () => {
      expect(useFeedStore.getState().hasMore).toBe(true);
    });

    it('should start with cursor undefined', () => {
      expect(useFeedStore.getState().cursor).toBeUndefined();
    });
  });

  describe('setPosts', () => {
    it('should replace all posts with the provided array', () => {
      const posts = [makePost({ id: 'p1' }), makePost({ id: 'p2' })];

      useFeedStore.getState().setPosts(posts);

      const state = useFeedStore.getState();
      expect(state.posts).toHaveLength(2);
      expect(state.posts[0].id).toBe('p1');
      expect(state.posts[1].id).toBe('p2');
    });

    it('should replace existing posts entirely', () => {
      const initial = [makePost({ id: 'old-1' }), makePost({ id: 'old-2' })];
      useFeedStore.getState().setPosts(initial);
      expect(useFeedStore.getState().posts).toHaveLength(2);

      const replacement = [makePost({ id: 'new-1' })];
      useFeedStore.getState().setPosts(replacement);

      const state = useFeedStore.getState();
      expect(state.posts).toHaveLength(1);
      expect(state.posts[0].id).toBe('new-1');
    });

    it('should allow setting an empty array', () => {
      useFeedStore.getState().setPosts([makePost()]);
      expect(useFeedStore.getState().posts).toHaveLength(1);

      useFeedStore.getState().setPosts([]);
      expect(useFeedStore.getState().posts).toEqual([]);
    });
  });

  describe('addPosts', () => {
    it('should append posts to the existing array', () => {
      const existing = [makePost({ id: 'existing-1' })];
      useFeedStore.getState().setPosts(existing);

      const newPosts = [makePost({ id: 'new-1' }), makePost({ id: 'new-2' })];
      useFeedStore.getState().addPosts(newPosts);

      const state = useFeedStore.getState();
      expect(state.posts).toHaveLength(3);
      expect(state.posts[0].id).toBe('existing-1');
      expect(state.posts[1].id).toBe('new-1');
      expect(state.posts[2].id).toBe('new-2');
    });

    it('should append to an empty array', () => {
      const newPosts = [makePost({ id: 'p1' })];
      useFeedStore.getState().addPosts(newPosts);

      expect(useFeedStore.getState().posts).toHaveLength(1);
      expect(useFeedStore.getState().posts[0].id).toBe('p1');
    });

    it('should not change existing posts when appending empty array', () => {
      const existing = [makePost({ id: 'e1' })];
      useFeedStore.getState().setPosts(existing);

      useFeedStore.getState().addPosts([]);

      expect(useFeedStore.getState().posts).toHaveLength(1);
      expect(useFeedStore.getState().posts[0].id).toBe('e1');
    });
  });

  describe('prependPost', () => {
    it('should add a post at the beginning', () => {
      const existing = [makePost({ id: 'e1' }), makePost({ id: 'e2' })];
      useFeedStore.getState().setPosts(existing);

      const newPost = makePost({ id: 'prepended' });
      useFeedStore.getState().prependPost(newPost);

      const state = useFeedStore.getState();
      expect(state.posts).toHaveLength(3);
      expect(state.posts[0].id).toBe('prepended');
      expect(state.posts[1].id).toBe('e1');
      expect(state.posts[2].id).toBe('e2');
    });

    it('should prepend to an empty array', () => {
      const post = makePost({ id: 'first' });
      useFeedStore.getState().prependPost(post);

      expect(useFeedStore.getState().posts).toHaveLength(1);
      expect(useFeedStore.getState().posts[0].id).toBe('first');
    });
  });

  describe('setIsLoading', () => {
    it('should set loading to true', () => {
      useFeedStore.getState().setIsLoading(true);
      expect(useFeedStore.getState().isLoading).toBe(true);
    });

    it('should set loading to false', () => {
      useFeedStore.getState().setIsLoading(true);
      useFeedStore.getState().setIsLoading(false);
      expect(useFeedStore.getState().isLoading).toBe(false);
    });
  });

  describe('setHasMore', () => {
    it('should set hasMore to false', () => {
      useFeedStore.getState().setHasMore(false);
      expect(useFeedStore.getState().hasMore).toBe(false);
    });

    it('should set hasMore back to true', () => {
      useFeedStore.getState().setHasMore(false);
      useFeedStore.getState().setHasMore(true);
      expect(useFeedStore.getState().hasMore).toBe(true);
    });
  });

  describe('setCursor', () => {
    it('should set cursor to a string value', () => {
      useFeedStore.getState().setCursor('abc123');
      expect(useFeedStore.getState().cursor).toBe('abc123');
    });

    it('should set cursor to undefined', () => {
      useFeedStore.getState().setCursor('some-cursor');
      useFeedStore.getState().setCursor(undefined);
      expect(useFeedStore.getState().cursor).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('should return to initial state', () => {
      // Fill the store with non-default values
      useFeedStore.getState().setPosts([makePost(), makePost()]);
      useFeedStore.getState().setIsLoading(true);
      useFeedStore.getState().setHasMore(false);
      useFeedStore.getState().setCursor('cursor-value');

      // Reset
      useFeedStore.getState().reset();

      const state = useFeedStore.getState();
      expect(state.posts).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.hasMore).toBe(true);
      expect(state.cursor).toBeUndefined();
    });
  });

  describe('sequential operations', () => {
    it('should maintain correct state across multiple operations', () => {
      // Set initial posts
      const initialPosts = [makePost({ id: 'p1' }), makePost({ id: 'p2' })];
      useFeedStore.getState().setPosts(initialPosts);
      expect(useFeedStore.getState().posts).toHaveLength(2);

      // Prepend a new post
      useFeedStore.getState().prependPost(makePost({ id: 'p0' }));
      expect(useFeedStore.getState().posts).toHaveLength(3);
      expect(useFeedStore.getState().posts[0].id).toBe('p0');

      // Append more posts (pagination)
      useFeedStore.getState().addPosts([makePost({ id: 'p3' }), makePost({ id: 'p4' })]);
      expect(useFeedStore.getState().posts).toHaveLength(5);
      expect(useFeedStore.getState().posts[4].id).toBe('p4');

      // Update loading and cursor
      useFeedStore.getState().setIsLoading(true);
      useFeedStore.getState().setCursor('next-page');
      expect(useFeedStore.getState().isLoading).toBe(true);
      expect(useFeedStore.getState().cursor).toBe('next-page');

      // Mark no more pages
      useFeedStore.getState().setHasMore(false);
      useFeedStore.getState().setIsLoading(false);

      const finalState = useFeedStore.getState();
      expect(finalState.posts).toHaveLength(5);
      expect(finalState.isLoading).toBe(false);
      expect(finalState.hasMore).toBe(false);
      expect(finalState.cursor).toBe('next-page');
    });

    it('should preserve post data including optional fields', () => {
      const postWithMedia = makePost({
        id: 'media-post',
        content: 'Check out this photo!',
        likes: 42,
        replies: 5,
        media: ['ipfs://Qm123', 'ipfs://Qm456'],
      });

      useFeedStore.getState().setPosts([postWithMedia]);

      const stored = useFeedStore.getState().posts[0];
      expect(stored.content).toBe('Check out this photo!');
      expect(stored.likes).toBe(42);
      expect(stored.replies).toBe(5);
      expect(stored.media).toEqual(['ipfs://Qm123', 'ipfs://Qm456']);
    });
  });
});
