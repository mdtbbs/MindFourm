import Link from "next/link";
import { FileArchive, Map, Package, User } from "lucide-react";
import type { Resource } from "@/types";
import { markdownToPlainExcerpt } from "@/lib/markdown/excerpt";
import { formatDate } from "@/lib/utils";
import { resourceKindLabel } from "@/lib/display-labels";
import ResourceCardActions from "./resource-card-actions";

export default function ResourceRow({ resource }: { resource: Resource }) {
  const platforms = (resource.metadata?.compatibility || []).slice(0, 3);
  const summary = markdownToPlainExcerpt(
    resource.description || resource.content || "",
  );
  const isMap = resource.resource_kind === "map";
  const isSchematic = resource.resource_kind === "schematic";
  const rendererMetadata = resource.renderer_metadata && typeof resource.renderer_metadata === "object"
    ? resource.renderer_metadata as Record<string, unknown>
    : {};
  const width = typeof rendererMetadata.width === "number" ? rendererMetadata.width : null;
  const height = typeof rendererMetadata.height === "number" ? rendererMetadata.height : null;
  const blockCount = typeof rendererMetadata.blocks === "number" ? rendererMetadata.blocks : null;
  const dimensions = width !== null && height !== null ? `${width} × ${height}` : null;
  const visualKind = isMap ? "地图" : isSchematic ? "蓝图" : "资源";
  const resourceHref = `/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ""}`;
  return (
    <article className="group block overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] transition hover:-translate-y-0.5 hover:border-[var(--primary)]/50 hover:shadow-lg">
      <div className={`relative overflow-hidden bg-[var(--bg-elevated)] ${isMap ? "aspect-video" : "aspect-[4/3]"}`}>
        <Link href={resourceHref} aria-label={`查看 ${resource.title}`} className="block h-full">
          {resource.preview_url ? (
          <img
            src={resource.preview_url}
            alt={`${resource.title} 预览图`}
            className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
          />
          ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
            {isMap ? <Map className="h-10 w-10" /> : isSchematic ? <FileArchive className="h-10 w-10" /> : <Package className="h-10 w-10" />}
            <span className="text-xs">{resource.renderer_status === "processing" ? "正在生成预览" : `暂无${visualKind}预览`}</span>
          </div>
          )}
        </Link>
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {resourceKindLabel(resource.resource_kind)}
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={resourceHref} className="block truncate text-base font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{resource.title}</Link>
            <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">
              {summary || "暂无简介"}
            </p>
          </div>
          <span className="shrink-0 text-xs text-[var(--text-muted)]">{resource.download_count.toLocaleString()} 次下载</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {dimensions && (
            <span className="rounded bg-[var(--primary)]/10 px-2 py-1 text-xs font-medium text-[var(--primary)]">
              {dimensions}
            </span>
          )}
          {blockCount !== null && (
            <span className="rounded bg-[var(--primary)]/10 px-2 py-1 text-xs font-medium text-[var(--primary)]">
              {blockCount.toLocaleString()} 个方块
            </span>
          )}
          {resource.version && (
            <span className="rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]">
              v{resource.version}
            </span>
          )}
          {platforms.map((platform) => (
            <span
              key={platform}
              className="rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]"
            >
              {platform}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <User className="h-3.5 w-3.5" />
            {resource.username || "未知作者"}
          </span>
          <span className="shrink-0">{formatDate(resource.updated_at || resource.created_at)}</span>
        </div>
        <div className="mt-3 flex justify-end border-t border-[var(--border)] pt-2">
          <ResourceCardActions resourceId={resource.id} resourceHref={resourceHref} initialLiked={resource.is_liked} initialLikeCount={resource.like_count} commentCount={resource.comment_count} />
        </div>
      </div>
    </article>
  );
}
