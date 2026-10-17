'use client';

import { useEffect, useState } from 'react';
import type { Resource } from '@/types';
import { resourceAdminApi, type AdminModAnalysis } from '@/lib/api/client';
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

function modAnalysisStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'complete': return '已完成';
    case 'partial': return '部分完成';
    case 'failed': return '失败';
    case 'not_run': return '未运行';
    case 'completed': return '已完成';
    default: return status || '未知';
  }
}

export default function ResourceModerationReview({ resource }: { resource: Resource }) {
  const isMod = resource.resource_kind === 'mod';
  const [loadedModAnalysis, setLoadedModAnalysis] = useState<{ resourceId: number; data: AdminModAnalysis } | null>(null);
  const [modAnalysisLoading, setModAnalysisLoading] = useState(false);
  const [modAnalysisError, setModAnalysisError] = useState<string | null>(null);
  const modAnalysis = loadedModAnalysis?.resourceId === resource.id ? loadedModAnalysis.data : null;

  useEffect(() => {
    let active = true;
    if (!isMod) {
      setLoadedModAnalysis(null);
      setModAnalysisError(null);
      setModAnalysisLoading(false);
      return () => { active = false; };
    }

    setLoadedModAnalysis(null);
    setModAnalysisError(null);
    setModAnalysisLoading(true);
    resourceAdminApi.getModAnalysis(resource.id)
      .then((result) => { if (active) setLoadedModAnalysis({ resourceId: resource.id, data: result }); })
      .catch((error: unknown) => {
        if (active) setModAnalysisError(error instanceof Error ? error.message : '读取 Mod 解析结果失败');
      })
      .finally(() => { if (active) setModAnalysisLoading(false); });

    return () => { active = false; };
  }, [isMod, resource.id]);

  const authorInput = isMod ? modAnalysis?.author_overrides || {} : resource.metadata || {};
  const parsedResult = isMod ? modAnalysis?.manifest || {} : resource.renderer_metadata || {};
  const reviewInput = isMod ? { metadata: authorInput, renderer_metadata: parsedResult } : resource;
  const effectiveResult = effectiveResourceMetadata(reviewInput);
  const differences = resourceMetadataDifferences(reviewInput);
  const integrityStatus = resource.integrity_status || resource.integrity;
  const hasFileFacts = Boolean(resource.file_name || resource.file_size || resource.content_hash || integrityStatus || resource.hash_algorithm);

  return (
    <section className="space-y-4" aria-label="资源元数据审核对照">
      <div>
        <h4 className="text-base font-semibold text-surface-900 dark:text-gray-100">{isMod ? 'Mod 元数据审核对照' : '元数据审核对照'}</h4>
        <p className="mt-1 text-xs text-surface-500">
          {isMod
            ? '展示当前待审核版本的 Mod 包解析清单和作者覆盖字段；有效结果优先采用作者覆盖值。'
            : '作者填写内容与解析器结果并列展示；有效结果优先采用作者填写内容，作者未填写的字段使用解析结果补充。'}
        </p>
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
          {isMod && modAnalysisLoading
            ? '正在读取 Mod 静态解析结果，暂不进行字段比对。'
            : isMod && modAnalysisError
              ? '未能读取 Mod 静态解析结果，暂无法进行字段比对。'
              : isMod && !modAnalysis?.manifest
                ? '该版本没有可比较的 Mod 解析清单。'
                : '未发现作者输入与解析结果之间的同名字段差异。'}
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        <MetadataPanel title={isMod ? '作者覆盖 / Author Overrides' : '作者输入 / Author Input'} value={authorInput} />
        <MetadataPanel title={isMod ? 'Mod 清单 / Parsed Manifest' : '解析结果 / Parsed Result'} value={parsedResult} />
        <MetadataPanel title="有效结果 / Effective Result" value={effectiveResult} />
      </div>

      {isMod ? (
        <section className="space-y-3 rounded-lg border border-surface-200 bg-surface-50 p-3 text-xs text-surface-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <span>Mod 静态解析：{modAnalysisLoading ? '读取中…' : modAnalysisError ? '读取失败' : modAnalysis ? modAnalysisStatusLabel(modAnalysis.status) : '未运行'}</span>
            {modAnalysis?.version ? <span>审核版本：{modAnalysis.version.version || '—'}（{modAnalysis.version.status || '—'}）</span> : null}
            {modAnalysis?.parser_version ? <span>解析器版本：{modAnalysis.parser_version}</span> : null}
            {modAnalysis?.runtime_type ? <span>运行时：{modAnalysis.runtime_type}</span> : null}
            {modAnalysis?.summary?.content_count != null ? <span>内容条目：{modAnalysis.summary.content_count}</span> : null}
            {modAnalysis?.summary?.localization_count != null ? <span>语言文件：{modAnalysis.summary.localization_count}</span> : null}
          </div>
          {modAnalysisError ? <p role="alert" className="text-red-700 dark:text-red-300">{modAnalysisError}</p> : null}
          {modAnalysis?.findings.length ? (
            <div>
              <h5 className="mb-2 font-semibold text-surface-800 dark:text-gray-200">解析发现</h5>
              <ul className="space-y-1">
                {modAnalysis.findings.map((finding, index) => (
                  <li key={`${finding.code}-${index}`} className="break-words">
                    <span className={finding.severity === 'ERROR' ? 'font-semibold text-red-700 dark:text-red-300' : finding.severity === 'WARNING' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold'}>
                      [{finding.severity}]
                    </span>{' '}
                    <code>{finding.code}</code>：{finding.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {modAnalysis?.summary?.java ? <MetadataPanel title="Java 静态分析" value={modAnalysis.summary.java} /> : null}
        </section>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-surface-200 bg-surface-50 p-3 text-xs text-surface-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <span>解析状态：{resource.renderer_status || '未提供'}</span>
          {resource.renderer_parser_version ? <span>解析器版本：{resource.renderer_parser_version}</span> : null}
          {resource.renderer_error_code ? <span className="font-medium text-red-700 dark:text-red-300">解析错误：{resource.renderer_error_code}</span> : null}
        </div>
      )}

      {hasFileFacts ? (
        <div className="rounded-lg border border-surface-200 p-3 text-xs text-surface-600 dark:border-gray-700 dark:text-gray-300">
          <h5 className="mb-2 font-semibold text-surface-800 dark:text-gray-200">文件完整性</h5>
          <dl className="grid gap-2 sm:grid-cols-2">
            {resource.file_name ? <div><dt className="text-surface-400">文件</dt><dd className="break-all">{resource.file_name}</dd></div> : null}
            {resource.file_size ? <div><dt className="text-surface-400">大小</dt><dd>{resource.file_size.toLocaleString()} 字节</dd></div> : null}
            {integrityStatus ? <div><dt className="text-surface-400">校验状态</dt><dd>{integrityStatus}</dd></div> : null}
            {resource.content_hash ? <div className="sm:col-span-2"><dt className="text-surface-400">{resource.hash_algorithm || 'SHA-256'}</dt><dd className="break-all font-mono">{resource.content_hash}</dd></div> : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
