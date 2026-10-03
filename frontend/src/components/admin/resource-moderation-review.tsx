import type { Resource } from '@/types';
import { effectiveResourceMetadata, resourceMetadataDifferences } from '@/lib/resources/moderation-review';

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function shortValue(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return (serialized || '—').length > 180 ? `${serialized!.slice(0, 177)}…` : serialized || '—';
}

function MetadataPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="min-w-0 rounded-lg border border-surface-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h4 className="mb-2 text-sm font-semibold text-surface-800 dark:text-gray-200">{title}</h4>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-50 p-3 text-xs leading-5 text-surface-700 dark:bg-gray-800 dark:text-gray-300">
        {pretty(value)}
      </pre>
    </section>
  );
}

export default function ResourceModerationReview({ resource }: { resource: Resource }) {
  const authorInput = resource.metadata || {};
  const parsedResult = resource.renderer_metadata || {};
  const effectiveResult = effectiveResourceMetadata(resource);
  const differences = resourceMetadataDifferences(resource);
  const integrityStatus = resource.integrity_status || resource.integrity;
  const hasFileFacts = Boolean(resource.file_name || resource.file_size || resource.content_hash || integrityStatus || resource.hash_algorithm);

  return (
    <section className="space-y-4" aria-label="资源元数据审核对照">
      <div>
        <h4 className="text-base font-semibold text-surface-900 dark:text-gray-100">元数据审核对照</h4>
        <p className="mt-1 text-xs text-surface-500">作者填写内容与解析器结果并列展示；有效结果中同名字段优先采用解析结果。</p>
      </div>

      {differences.length > 0 ? (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="font-semibold">检测到作者输入与解析结果不一致</div>
          <ul className="mt-2 space-y-1 text-xs">
            {differences.map((difference) => (
              <li key={difference.path} className="break-words">
                <code>{difference.path}</code>：作者 {shortValue(difference.authorValue)}；解析器 {shortValue(difference.parsedValue)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-surface-200 bg-surface-50 p-3 text-xs text-surface-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          未发现作者输入与解析结果之间的同名字段差异。
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        <MetadataPanel title="作者输入 / Author Input" value={authorInput} />
        <MetadataPanel title="解析结果 / Parsed Result" value={parsedResult} />
        <MetadataPanel title="有效结果 / Effective Result" value={effectiveResult} />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-surface-200 bg-surface-50 p-3 text-xs text-surface-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <span>解析状态：{resource.renderer_status || '未提供'}</span>
        {resource.renderer_parser_version ? <span>解析器版本：{resource.renderer_parser_version}</span> : null}
        {resource.renderer_error_code ? <span className="font-medium text-red-700 dark:text-red-300">解析错误：{resource.renderer_error_code}</span> : null}
      </div>

      {hasFileFacts ? (
        <div className="rounded-lg border border-surface-200 p-3 text-xs text-surface-600 dark:border-gray-700 dark:text-gray-300">
          <h5 className="mb-2 font-semibold text-surface-800 dark:text-gray-200">文件完整性</h5>
          <dl className="grid gap-2 sm:grid-cols-2">
            {resource.file_name ? <div><dt className="text-surface-400">文件</dt><dd className="break-all">{resource.file_name}</dd></div> : null}
            {resource.file_size ? <div><dt className="text-surface-400">大小</dt><dd>{resource.file_size.toLocaleString()} bytes</dd></div> : null}
            {integrityStatus ? <div><dt className="text-surface-400">校验状态</dt><dd>{integrityStatus}</dd></div> : null}
            {resource.content_hash ? <div className="sm:col-span-2"><dt className="text-surface-400">{resource.hash_algorithm || 'SHA-256'}</dt><dd className="break-all font-mono">{resource.content_hash}</dd></div> : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
