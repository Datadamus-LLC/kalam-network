'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Post {
  id: string;
  authorAccountId: string;
  content: string;
  createdAt: string;
  likes?: number;
  replies?: number;
  media?: string[];
}

export default function FeedPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: () => api.getHomeFeed(),
  });

  const posts: Post[] = data?.posts ?? [];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Home Feed</h1>

      {isLoading && <p className="text-gray-500">Loading posts...</p>}

      {!isLoading && posts.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No posts yet. Follow users to see their posts.
        </p>
      )}

      {posts.length > 0 && (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-white rounded-lg p-4 border border-gray-200"
            >
              <p className="text-sm text-gray-400 mb-1">
                {post.authorAccountId}
              </p>
              <p className="text-gray-900">{post.content}</p>
              <p className="text-sm text-gray-500 mt-2">
                {new Date(post.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
