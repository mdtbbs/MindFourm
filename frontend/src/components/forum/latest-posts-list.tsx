import type { PostSummary } from "@/types";
import TopicRow from "./topic-row";

export default function LatestPostsList({ posts }: { posts: PostSummary[] }) {
  return (
    <div className="overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
      {posts.map((post) => (
        <TopicRow key={post.id} post={post} />
      ))}
    </div>
  );
}
