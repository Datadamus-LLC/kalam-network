/**
 * PostCard — Component Tests
 *
 * Renders the component against a real DOM (jsdom) with real React.
 * fetch is mocked here because this is a browser unit test — the
 * no-mock rule applies to backend integration tests only.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PostCard } from '../src/components/feed/PostCard';

// ---------------------------------------------------------------------------
// Minimal Next.js module stubs needed for jsdom — not mocking business logic
// ---------------------------------------------------------------------------

// jest.mock is used ONLY to prevent "Cannot find module" errors for non-test
// dependencies that are unavailable in jsdom (Next.js navigation).
jest.mock('next/link', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// next/navigation is not available in jsdom — stub useRouter so components
// that call useRouter() (e.g. via useAuth) can render without throwing.
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Stub env module — real values are irrelevant in a DOM unit test
jest.mock('../src/lib/env', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/v1',
    NEXT_PUBLIC_WS_URL: 'http://localhost:3001',
    NEXT_PUBLIC_HEDERA_NETWORK: 'testnet',
    NEXT_PUBLIC_HASHSCAN_URL: 'https://hashscan.io',
    NEXT_PUBLIC_ENABLE_CHAT: true,
    NEXT_PUBLIC_ENABLE_PAYMENTS: true,
  },
}));

// AbortSignal.timeout is not implemented in jsdom — polyfill it so api calls
// inside the component do not crash before reaching the fetch mock.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => {
      const err = new DOMException('The operation was aborted.', 'TimeoutError');
      controller.abort(err);
    }, ms);
    return controller.signal;
  };
}

// ---------------------------------------------------------------------------
// fetch mock — acceptable in frontend unit tests (per FIX 10 task instructions)
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

beforeEach(() => {
  // Install a basic fetch mock for API calls made by the component
  global.fetch = jest.fn().mockImplementation((url: string) => {
    // Default: return empty success responses
    if (String(url).includes('/like')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { liked: true } }),
      } as Response);
    }
    if (String(url).includes('/comments')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            comments: [
              {
                id: 'c1',
                postId: 'post-1',
                authorAccountId: '0.0.11111',
                contentText: 'Great post!',
                hcsTopicId: null,
                hcsSequenceNumber: null,
                createdAt: '2026-01-01T00:00:00Z',
              },
            ],
            cursor: null,
            hasMore: false,
          },
        }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: {} }),
    } as Response);
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeAuthor(overrides = {}) {
  return {
    accountId: '0.0.12345',
    displayName: 'Alice',
    avatarUrl: null,
    badgeTier: null as null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PostCard', () => {
  it('renders post content', () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Hello world"
        createdAt="2026-01-01T00:00:00Z"
      />,
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows authorDisplayName when provided', () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor({ displayName: 'Alice Wonderland' })}
        text="Test content"
        createdAt="2026-01-01T00:00:00Z"
      />,
    );

    expect(screen.getByText('Alice Wonderland')).toBeInTheDocument();
  });

  it('falls back to accountId when displayName is null', () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor({ displayName: null })}
        text="Test content"
        createdAt="2026-01-01T00:00:00Z"
      />,
    );

    expect(screen.getByText('0.0.12345')).toBeInTheDocument();
  });

  it('shows initial like count', () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Test"
        createdAt="2026-01-01T00:00:00Z"
        likeCount={7}
      />,
    );

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('like button toggles liked state on click', async () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Test"
        createdAt="2026-01-01T00:00:00Z"
        likeCount={3}
        isLiked={false}
      />,
    );

    const likeBtn = screen.getByRole('button', { name: /like post/i });
    expect(likeBtn).toHaveAttribute('aria-pressed', 'false');

    await act(async () => {
      fireEvent.click(likeBtn);
    });

    // After optimistic update, like count should increase to 4
    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('comment section is initially hidden', () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Test"
        createdAt="2026-01-01T00:00:00Z"
      />,
    );

    expect(screen.queryByPlaceholderText('Write a comment…')).not.toBeInTheDocument();
  });

  it('expands comment section on toggle', async () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Test"
        createdAt="2026-01-01T00:00:00Z"
        commentCount={1}
      />,
    );

    const commentBtn = screen.getByRole('button', { name: /toggle comments/i });
    await act(async () => {
      fireEvent.click(commentBtn);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a comment…')).toBeInTheDocument();
    });
  });

  it('loads and displays comments when section is expanded', async () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Test"
        createdAt="2026-01-01T00:00:00Z"
        commentCount={1}
      />,
    );

    const commentBtn = screen.getByRole('button', { name: /toggle comments/i });
    await act(async () => {
      fireEvent.click(commentBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Great post!')).toBeInTheDocument();
    });
  });

  it('collapses comment section on second toggle', async () => {
    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Test"
        createdAt="2026-01-01T00:00:00Z"
      />,
    );

    const commentBtn = screen.getByRole('button', { name: /toggle comments/i });

    // Expand
    await act(async () => {
      fireEvent.click(commentBtn);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a comment…')).toBeInTheDocument();
    });

    // Collapse
    await act(async () => {
      fireEvent.click(commentBtn);
    });
    expect(screen.queryByPlaceholderText('Write a comment…')).not.toBeInTheDocument();
  });

  it('comment form submits on button click', async () => {
    // Override fetch to capture the comment creation call
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/comments') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            data: {
              id: 'new-comment',
              postId: 'post-1',
              authorAccountId: '0.0.me',
              contentText: 'My new comment',
              hcsTopicId: null,
              hcsSequenceNumber: null,
              createdAt: '2026-01-02T00:00:00Z',
            },
          }),
        } as Response);
      }
      // Default GET for loading comments
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { comments: [], cursor: null, hasMore: false },
        }),
      } as Response);
    });

    render(
      <PostCard
        id="post-1"
        author={makeAuthor()}
        text="Test"
        createdAt="2026-01-01T00:00:00Z"
      />,
    );

    // Open comments
    const commentBtn = screen.getByRole('button', { name: /toggle comments/i });
    await act(async () => {
      fireEvent.click(commentBtn);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a comment…')).toBeInTheDocument();
    });

    // Type a comment
    const input = screen.getByPlaceholderText('Write a comment…');
    fireEvent.change(input, { target: { value: 'My new comment' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /^post$/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Comment should appear
    await waitFor(() => {
      expect(screen.getByText('My new comment')).toBeInTheDocument();
    });
  });
});
