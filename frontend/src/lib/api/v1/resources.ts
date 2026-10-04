/**
 * V1 Resources API client.
 *
 * Thin wrapper over `fetchV1` for the resource detail endpoint. The
 * shape here mirrors the backend's V1 DTO so callers can rely on the
 * exact field names — no camelCase conversion, no optional fallbacks.
 */

import { fetchV1, requestV1, requestV1Blob, type FetchV1Options } from './transport';

export type V1VersionSummary = {
  public_id: string;
  version: string;
  display_version: string;
  status: string;
  is_legacy_root_release: boolean;
  file_count: number;
};

export type V1AttributionSummary = {
  id: number;
  role: string;
  subject_type: string;
  display_name: string | null;
};

export type V1ResourceDetail = {
  public_id: string;
  title: string;
  summary: string;
  resource_kind: string;
  visibility: string;
  metadata: V1ResourceMetadata;
  latest_version: V1VersionSummary | null;
  attributions: V1AttributionSummary[];
  download_count: number;
};

export type V1ResourceListItem = Omit<V1ResourceDetail, 'attributions'>;

export type ResourceWorkbenchV2File = {
  public_id: string;
  role: string;
  delivery_mode: string;
  platform: string | null;
  architecture: string | null;
  package_type: string | null;
  display_name: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  integrity_status: string;
  availability_status: string;
  downloadable: boolean;
  installable: boolean;
  download_url: string;
};

export type ResourceWorkbenchV2Compatibility = {
  runtime: string;
  game_version: string | null;
  min_game_version: string | null;
  max_game_version: string | null;
  status: string | null;
  source: string | null;
  confidence: string | null;
  channel: string | null;
  platform: string | null;
  notes: string | null;
};

export type ResourceWorkbenchV2Dependency = {
  dependency_type: string;
  resource_public_id: string | null;
  external_identifier: string | null;
  upstream_url: string | null;
  version_constraint: string | null;
  resolution_status: string | null;
  sort_order: number;
};

export type ResourceWorkbenchV2Version = {
  public_id: string;
  version: string;
  display_version: string;
  version_mode: string;
  revision: number;
  release_channel: string;
  recommended: boolean;
  game_version_min: string | null;
  game_version_max: string | null;
  status: string;
  published_at: string | null;
  preview_url?: string | null;
  compatibility: ResourceWorkbenchV2Compatibility[];
  dependencies: ResourceWorkbenchV2Dependency[];
  files: ResourceWorkbenchV2File[];
};

export type ResourceWorkbenchV2Analysis = {
  kind: string;
  status: string;
  parser_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
  findings: Array<{
    key: string;
    severity: 'ERROR' | 'WARNING' | 'INFO';
    message: string;
    field_path: string | null;
    ignored: boolean;
    ignore_reason: string | null;
    actor: string | null;
    timestamp: string | null;
  }>;
  data: Record<string, unknown> | null;
};

export type ResourceWorkbenchV2Relation = {
  relation_direction: 'outgoing' | 'incoming';
  relation_type: string;
  relation_context: 'opening' | 'production' | 'defense' | 'logistics' | 'general';
  resource: {
    public_id: string;
    title: string;
    resource_kind: string;
  };
  version_public_id: string | null;
  version: string | null;
};

export type ResourceWorkbenchV2Stats = {
  views: number;
  downloads: number;
  likes: number;
  favorites: number;
  rating_count: number;
  rating_average: number;
};

export type ResourceWorkbenchV2ModContent = {
  public_id: string;
  content_type: string;
  internal_name: string;
  display_name: string | null;
  description: string | null;
  icon_url: string | null;
  properties: Record<string, unknown>;
  version_public_id: string;
};

export type ResourceWorkbenchV2Localization = {
  locale: string;
  translated_count: number;
  total_count: number;
  percentage: number;
  missing_keys: string[];
};

export type ResourceWorkbenchV2Page<T> = {
  items: T[];
  pagination: { next_cursor: string | null; has_more: boolean };
};

export type ResourceWorkbenchV2Kind = 'map' | 'schematic';
export type ResourceWorkbenchV2KindTab = 'rules' | 'resources' | 'spawns' | 'cores' | 'waves' | 'blocks' | 'materials' | 'production' | 'logic';
export type ResourceWorkbenchV2KindTabData = {
  summary: Record<string, unknown> | null;
  items: Array<Record<string, unknown>>;
  pagination: { next_cursor: string | null; has_more: boolean };
};

/** Owner-aware, read-only data contract for the Resource Center workbench. */
export type ResourceWorkbenchV2Response = {
  resource: {
    public_id: string;
    resource_kind: string;
    title: string;
    summary: string | null;
    description: string | null;
    content: string | null;
    content_format: 'tiptap_json';
    content_schema_version: number;
    content_json: Record<string, unknown> | null;
    content_html: string | null;
    content_text: string | null;
    visibility: string;
    source_url: string | null;
    license: string | null;
    metadata: V1ResourceMetadata;
    renderer: {
      status: 'processing' | 'ready' | 'failed' | 'unavailable' | 'none';
      parser_version: string | null;
      public_metadata: Record<string, unknown> | null;
      preview_url: string | null;
    } | null;
  };
  permissions: {
    role: 'owner' | 'maintainer' | 'publisher' | 'admin' | 'viewer' | null;
    can_manage: boolean;
  };
  versions: ResourceWorkbenchV2Version[];
  analysis: ResourceWorkbenchV2Analysis | null;
  relations: ResourceWorkbenchV2Relation[];
  stats: ResourceWorkbenchV2Stats;
};

export type ResourceWorkbenchV2ReleaseFinding = {
  code?: string;
  key?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  field_path?: string | null;
  ignored?: boolean;
  ignore_reason?: string | null;
};

export type ResourceWorkbenchV2ModVersionAnalysis = {
  parser_version: string | null;
  manifest: {
    name: string | null;
    display_name: string | null;
    author: string | null;
    version: string | null;
    min_game_version: string | null;
    dependencies: Array<{
      mod_id: string;
      kind: 'required' | 'optional' | 'incompatible' | 'embedded';
      version_constraint: string | null;
    }>;
    description: string | null;
    main: string | null;
    package: string | null;
  } | null;
  runtime_type: 'java' | 'js' | 'hybrid' | 'content' | 'unknown' | null;
  java: {
    entrypoint: string | null;
    packages: string[];
    mindustry_api_references: string[];
    arc_api_references: string[];
    bundled_dependency_count: number;
    native_libraries: string[];
  } | null;
  content_count: number;
  localization_count: number;
  localizations: Array<{
    locale: string;
    translated: number;
    total: number;
    percentage: number;
    missing_keys?: string[];
  }>;
  findings: ResourceWorkbenchV2ReleaseFinding[];
};

export type ResourceWorkbenchV2RendererVersionAnalysis = {
  parser_version: string | null;
  renderer_metadata: Record<string, unknown> | null;
  duplicate: boolean;
  findings: ResourceWorkbenchV2ReleaseFinding[];
};

export type ResourceWorkbenchV2VersionAnalysis =
  | ResourceWorkbenchV2ModVersionAnalysis
  | ResourceWorkbenchV2RendererVersionAnalysis;

export type ResourceWorkbenchV2VersionAnalysisResponse = {
  resource_public_id: string;
  resource_kind: 'mod' | 'map' | 'schematic';
  analysis: ResourceWorkbenchV2VersionAnalysis;
};

export type ResourceWorkbenchV2CreatedVersion = Pick<
  ResourceWorkbenchV2Version,
  'public_id' | 'version' | 'version_mode' | 'revision' | 'release_channel' | 'recommended' | 'status' | 'published_at'
> & { display_version?: string };

export type ResourceWorkbenchV2VersionCreateResponse = {
  version: ResourceWorkbenchV2CreatedVersion;
  revision: number;
  findings: ResourceWorkbenchV2ReleaseFinding[];
};

export type ResourceWorkbenchV2ResourcePatch = {
  title?: string;
  description?: string;
  content?: string;
  source_url?: string;
  license?: string;
};

export type ResourceWorkbenchV2ResourcePatchResponse = {
  public_id: string;
  title: string;
  description: string | null;
  content: string | null;
  source_url: string | null;
  license: string | null;
  status?: string;
};

export type ResourceV2PagedResult<T> = {
  items: T[];
  pagination: { next_cursor: string | null; has_more: boolean };
};

export type ResourceV2SchematicBlockPosition = { x: number | null; y: number | null; rotation: number | null };
export type ResourceV2SchematicBlock = {
  internal_name: string;
  display_name: string | null;
  count: number;
  positions: ResourceV2SchematicBlockPosition[];
};
export type ResourceV2SchematicBlockPageOptions = FetchV1Options & { cursor?: string; limit?: number };
export type ResourceV2SchematicTransformInput = {
  rotation_quarters: number;
  mirror_x: boolean;
  delete_positions: Array<{ x: number; y: number }>;
};

export type ResourceV2MapFeedbackAggregate = {
  feedback_count: number;
  difficulty_average: number | null;
  resource_sufficiency_average: number | null;
  balance_average: number | null;
  multiplayer_experience_average: number | null;
};

export type ResourceV2MapFeedbackResponse = {
  resource_public_id: string;
  version_public_id: string;
  aggregate: ResourceV2MapFeedbackAggregate;
};

export type ResourceV2MapFeedbackInput = {
  difficulty?: number;
  resource_sufficiency?: number;
  balance?: number;
  multiplayer_experience?: number;
  body?: string;
};

export type ResourceV2ModCompatibilityReportInput = {
  status: 'working' | 'partial' | 'cannot_start' | 'crash' | 'performance' | 'multiplayer';
  game_version?: string;
  platform_key?: string;
  runtime?: 'java' | 'js' | 'hybrid' | 'content';
  body?: string;
};

export type ResourceV2ModCompatibilityReport = {
  public_id: string;
  status: string;
  version_public_id: string | null;
  game_version: string | null;
  platform: string | null;
  runtime: string | null;
  body: string | null;
  author_response: string | null;
};

export type ResourceV2ModCompatibilityResponse = {
  items: ResourceWorkbenchV2Compatibility[];
  reports: ResourceV2ModCompatibilityReport[];
};

export type ResourceV2ModIssueReportInput = { title: string; body: string };

export type ResourceV2ModIssueReport = {
  public_id: string;
  version_public_id: string;
  status: string;
  title: string;
  body: string;
  author_response_status: string | null;
  author_response: string | null;
  fixed_version_public_id: string | null;
  created_at: string;
};

export type ResourceV2VersionDiff = {
  from_version_public_id: string | null;
  to_version_public_id: string | null;
  status: string;
  parser_version: string | null;
  diff: Record<string, unknown> | null;
};

export type ResourceV2IssueReportPageOptions = FetchV1Options & {
  cursor?: string;
  limit?: number;
};

export type ResourceV2ModConflictMemberInput = {
  resource_public_id: string;
  version_public_id: string;
  version_constraint?: string;
};

export type ResourceV2ModConflictInput = {
  title?: string;
  body?: string;
  game_version_min?: string;
  game_version_max?: string;
  members: ResourceV2ModConflictMemberInput[];
};

export type ResourceV2ModConflict = {
  public_id: string;
  status: string;
  title: string | null;
  body: string | null;
  members: Array<{ public_id: string; title: string; resource_kind: string }>;
  author_response: string | null;
};

export type ResourceV2ModConflictSubmission = {
  public_id: string;
  status: string;
  members: Array<{
    resource_public_id: string;
    version_public_id: string;
    version_constraint: string | null;
  }>;
};

export type ResourceV2CreateRelationInput = {
  target_resource_public_id: string;
  relation_type: string;
  relation_context?: 'opening' | 'production' | 'defense' | 'logistics' | 'general';
  source_version_public_id?: string;
  target_version_public_id?: string;
};

export type V1ResourceManifest = {
  resource_public_id: string;
  resource_kind: string;
  versions: Array<{
    public_id: string;
    version: string;
    display_version: string;
    release_channel: string;
    published_at: string | null;
    compatibility: Array<{
      runtime: string;
      game_series: string | null;
      min_version: string | null;
      max_version: string | null;
      channel: string | null;
      platform: string | null;
    }>;
    dependencies: Array<{
      dependency_type: string;
      resource_public_id: string | null;
      external_identifier: string | null;
      version_constraint: string | null;
      notes: string | null;
    }>;
    files: Array<{
      public_id: string;
      role: string;
      delivery_mode: string;
      platform: string | null;
      architecture: string | null;
      package_type: string | null;
      display_name: string | null;
      original_filename: string | null;
      mime_type: string | null;
      size_bytes: number | null;
      hash_algorithm: string | null;
      content_hash: string | null;
      integrity_status: string;
      availability_status: string;
      downloadable: boolean;
      installable: boolean;
      download_url: string;
    }>;
  }>;
};

export type V1ResourceMetadata = {
  schema_version: 1;
  tags: string[];
  supported_versions: string[];
  compatibility: string[];
  preview: {
    url: string | null;
    status: 'processing' | 'ready' | 'failed' | 'unavailable' | 'none';
  };
  map?: {
    name: string | null;
    author: string | null;
    description: string | null;
    width: number | null;
    height: number | null;
    spawns: number | null;
    version: number | null;
    build: number | null;
    planets: string[];
    game_modes: string[];
    required_mods: string[];
    wave_groups?: Array<Record<string, unknown>>;
    cores?: Array<Record<string, unknown>>;
    core_count?: number | null;
    tile_layers?: Record<string, unknown>;
    tile_layers_truncated?: boolean;
  };
  schematic?: {
    name: string | null;
    description: string | null;
    width: number | null;
    height: number | null;
    blocks: number | null;
    requirements: unknown[];
    block_positions?: Array<{ block?: string; x?: number; y?: number; rotation?: number; config?: unknown }>;
    block_positions_truncated?: boolean;
  };
  mod?: {
    mod_id: string | null;
    version: string | null;
    game_versions: string[];
    dependencies: unknown[];
  };
};

/**
 * Fetch a single resource by id via the V1 endpoint.
 *
 * Returns the unwrapped `data` payload — the `meta: { request_id }`
 * envelope is handled by the transport layer.
 *
 * Pass `options.cookies` when calling from a server component so the
 * user's session is forwarded to the backend.
 */
export async function getResourceV1(
  publicId: string,
  options?: FetchV1Options,
): Promise<V1ResourceDetail> {
  return fetchV1<V1ResourceDetail>(`/resources/${encodeURIComponent(publicId)}`, options);
}

/** Fetch owner-aware Resource Center V2 workbench data by public UUID. */
export async function getResourceWorkbenchV2(
  publicId: string,
  options?: FetchV1Options,
): Promise<ResourceWorkbenchV2Response> {
  return fetchV1<ResourceWorkbenchV2Response>(
    `/resources/${encodeURIComponent(publicId)}/workbench`,
    options,
  );
}

/** Fetch the analysis attached to one published resource version. */
export async function getResourceWorkbenchV2Analysis(
  publicId: string,
  kind: 'mod' | 'map' | 'schematic',
  versionPublicId: string,
  options?: FetchV1Options,
): Promise<ResourceWorkbenchV2Analysis | null> {
  const kindPath = kind === 'mod' ? 'mods' : kind === 'map' ? 'maps' : 'schematics';
  const query = new URLSearchParams({ version_public_id: versionPublicId });
  const result = await fetchV1<{ analysis: ResourceWorkbenchV2Analysis | null }>(
    `/resources/${kindPath}/${encodeURIComponent(publicId)}/analysis?${query.toString()}`,
    options,
  );
  return result.analysis;
}

/** Fetch one page of a versioned Mod Content index. */
export async function getResourceWorkbenchV2ModContents(
  publicId: string,
  versionPublicId: string,
  cursor?: string,
  options?: FetchV1Options,
): Promise<ResourceWorkbenchV2Page<ResourceWorkbenchV2ModContent>> {
  const query = new URLSearchParams({ version_public_id: versionPublicId, limit: '100' });
  if (cursor) query.set('cursor', cursor);
  return fetchV1<ResourceWorkbenchV2Page<ResourceWorkbenchV2ModContent>>(
    `/resources/mods/${encodeURIComponent(publicId)}/contents?${query.toString()}`,
    options,
  );
}

/** Fetch one page of versioned Mod localization coverage. */
export async function getResourceWorkbenchV2Localizations(
  publicId: string,
  versionPublicId: string,
  cursor?: string,
  options?: FetchV1Options,
): Promise<ResourceWorkbenchV2Page<ResourceWorkbenchV2Localization>> {
  const query = new URLSearchParams({ version_public_id: versionPublicId, limit: '100' });
  if (cursor) query.set('cursor', cursor);
  return fetchV1<ResourceWorkbenchV2Page<ResourceWorkbenchV2Localization>>(
    `/resources/mods/${encodeURIComponent(publicId)}/localizations?${query.toString()}`,
    options,
  );
}

/** Fetch the first Content and localization pages for the workbench. */
export async function getResourceWorkbenchV2ModIndex(
  publicId: string,
  versionPublicId: string,
  options?: FetchV1Options,
): Promise<{ contents: ResourceWorkbenchV2Page<ResourceWorkbenchV2ModContent>; localizations: ResourceWorkbenchV2Page<ResourceWorkbenchV2Localization> }> {
  const [contents, localizations] = await Promise.all([
    getResourceWorkbenchV2ModContents(publicId, versionPublicId, undefined, options),
    getResourceWorkbenchV2Localizations(publicId, versionPublicId, undefined, options),
  ]);
  return { contents, localizations };
}

/** Fetch one on-demand, version-scoped map or schematic workbench section. */
export async function getResourceWorkbenchV2KindTabData(
  publicId: string,
  kind: ResourceWorkbenchV2Kind,
  tab: ResourceWorkbenchV2KindTab,
  versionPublicId: string,
  cursor?: string,
  options?: FetchV1Options,
): Promise<ResourceWorkbenchV2KindTabData> {
  const paths: Record<ResourceWorkbenchV2Kind, Partial<Record<ResourceWorkbenchV2KindTab, string>>> = {
    map: { rules: 'rules', resources: 'resources', spawns: 'spawns', cores: 'detail', waves: 'waves' },
    schematic: { blocks: 'blocks', materials: 'materials', production: 'production', logic: 'logic' },
  };
  const path = paths[kind][tab];
  if (!path) throw new Error(`Unsupported ${kind} workbench section: ${tab}`);
  const query = new URLSearchParams({ version_public_id: versionPublicId, limit: '100' });
  if (cursor) query.set('cursor', cursor);
  const kindPath = kind === 'map' ? 'maps' : 'schematics';
  const route = `/resources/${kindPath}/${encodeURIComponent(publicId)}${path === 'detail' ? '' : `/${path}`}`;
  const response = await fetchV1<Record<string, unknown>>(
    `${route}?${query.toString()}`,
    options,
  );
  const asRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const pagination = asRecord(response.pagination);
  const rawItems = Array.isArray(response.items) ? response.items : [];
  let summary: Record<string, unknown> | null = null;
  if (tab === 'rules') summary = asRecord(response.rules);
  if (tab === 'production') summary = { ...asRecord(response.production), available: response.available };
  if (tab === 'cores') {
    const map = asRecord(response.map);
    const cores = Array.isArray(map?.cores) ? map.cores.map(asRecord).filter((item): item is Record<string, unknown> => item !== null) : [];
    const mapSummary = Object.fromEntries(Object.entries(map || {}).filter(([key, value]) => key !== 'cores' && value !== null && value !== undefined && value !== ''));
    return { summary: Object.keys(mapSummary).length ? mapSummary : null, items: cores, pagination: { next_cursor: null, has_more: false } };
  }
  if (tab === 'rules' && summary) {
    return {
      summary,
      items: [],
      pagination: { next_cursor: null, has_more: false },
    };
  }
  return {
    summary,
    items: rawItems.map(asRecord).filter((item): item is Record<string, unknown> => item !== null),
    pagination: {
      next_cursor: typeof pagination?.next_cursor === 'string' ? pagination.next_cursor : null,
      has_more: pagination?.has_more === true,
    },
  };
}

/** Analyze a prospective release without creating a resource version. */
export async function analyzeResourceWorkbenchVersionV2(
  publicId: string,
  formData: FormData,
): Promise<ResourceWorkbenchV2VersionAnalysisResponse> {
  return requestV1<ResourceWorkbenchV2VersionAnalysisResponse>(
    `/resources/${encodeURIComponent(publicId)}/versions/analyze`,
    { method: 'POST', body: formData },
  );
}

/** Fetch version-specific schematic positions for the light editor. */
export async function getResourceV2SchematicBlocks(
  publicId: string,
  versionPublicId: string,
  options?: ResourceV2SchematicBlockPageOptions,
): Promise<ResourceV2PagedResult<ResourceV2SchematicBlock>> {
  const query = new URLSearchParams({ version_public_id: versionPublicId });
  if (options?.limit !== undefined) query.set('limit', String(options.limit));
  if (options?.cursor) query.set('cursor', options.cursor);
  return fetchV1<ResourceV2PagedResult<ResourceV2SchematicBlock>>(
    `/resources/schematics/${encodeURIComponent(publicId)}/blocks?${query.toString()}`,
    options,
  );
}

/** Export a transformed copy of a published schematic through the official renderer. */
export async function exportResourceWorkbenchSchematicV2(
  publicId: string,
  versionPublicId: string,
  input: ResourceV2SchematicTransformInput,
): Promise<Blob> {
  return requestV1Blob(
    `/resources/${encodeURIComponent(publicId)}/versions/${encodeURIComponent(versionPublicId)}/schematic-editor/export`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** Create a release after the user has reviewed the server-side analysis. */
export async function createResourceWorkbenchVersionV2(
  publicId: string,
  formData: FormData,
): Promise<ResourceWorkbenchV2VersionCreateResponse> {
  return requestV1<ResourceWorkbenchV2VersionCreateResponse>(
    `/resources/${encodeURIComponent(publicId)}/versions`,
    { method: 'POST', body: formData },
  );
}

/** Update editable resource profile and source/license declarations. */
export async function updateResourceWorkbenchV2(
  publicId: string,
  input: ResourceWorkbenchV2ResourcePatch,
): Promise<ResourceWorkbenchV2ResourcePatchResponse> {
  return requestV1<ResourceWorkbenchV2ResourcePatchResponse>(
    `/resources/${encodeURIComponent(publicId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

function versionQuery(versionPublicId: string): string {
  return `?version_public_id=${encodeURIComponent(versionPublicId)}`;
}

/** Fetch the previous-to-selected published version diff for a supported resource kind. */
export async function getResourceV2VersionDiff(
  publicId: string,
  kind: 'mod' | 'schematic' | 'map',
  toVersionPublicId: string,
  options?: FetchV1Options,
): Promise<ResourceV2VersionDiff> {
  return fetchV1<ResourceV2VersionDiff>(
    `/resources/${kind === 'mod' ? 'mods' : kind === 'schematic' ? 'schematics' : 'maps'}/${encodeURIComponent(publicId)}/diff?to_version_public_id=${encodeURIComponent(toVersionPublicId)}`,
    options,
  );
}

/** Fetch a public page of issue reports across all published Mod versions. */
export async function getResourceV2ModIssueReports(
  publicId: string,
  options?: ResourceV2IssueReportPageOptions,
): Promise<ResourceV2PagedResult<ResourceV2ModIssueReport>> {
  const query = new URLSearchParams();
  if (options?.limit !== undefined) query.set('limit', String(options.limit));
  if (options?.cursor) query.set('cursor', options.cursor);
  const suffix = query.size ? `?${query.toString()}` : '';
  return fetchV1<ResourceV2PagedResult<ResourceV2ModIssueReport>>(
    `/resources/mods/${encodeURIComponent(publicId)}/issue-reports${suffix}`,
    options,
  );
}

export async function getResourceV2ModCompatibility(
  publicId: string,
  versionPublicId: string,
  options?: FetchV1Options,
): Promise<ResourceV2ModCompatibilityResponse> {
  return fetchV1<ResourceV2ModCompatibilityResponse>(
    `/resources/mods/${encodeURIComponent(publicId)}/compatibility${versionQuery(versionPublicId)}`,
    options,
  );
}

export async function submitResourceV2ModCompatibilityReport(
  publicId: string,
  versionPublicId: string,
  input: ResourceV2ModCompatibilityReportInput,
): Promise<{ public_id: string; resource_public_id: string; version_public_id: string; status: string }> {
  return requestV1(
    `/resources/mods/${encodeURIComponent(publicId)}/versions/${encodeURIComponent(versionPublicId)}/compatibility-reports`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function submitResourceV2ModIssueReport(
  publicId: string,
  versionPublicId: string,
  input: ResourceV2ModIssueReportInput,
): Promise<{ public_id: string; resource_public_id: string; version_public_id: string; status: string }> {
  return requestV1(
    `/resources/mods/${encodeURIComponent(publicId)}/versions/${encodeURIComponent(versionPublicId)}/issue-reports`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function getResourceV2ModConflicts(
  publicId: string,
  options?: FetchV1Options,
): Promise<ResourceV2PagedResult<ResourceV2ModConflict>> {
  return fetchV1<ResourceV2PagedResult<ResourceV2ModConflict>>(
    `/resources/mods/${encodeURIComponent(publicId)}/conflicts?limit=50`,
    options,
  );
}

export async function submitResourceV2ModConflict(
  input: ResourceV2ModConflictInput,
): Promise<ResourceV2ModConflictSubmission> {
  return requestV1('/resources/mods/conflicts', { method: 'POST', body: JSON.stringify(input) });
}

export async function getResourceV2MapFeedback(
  publicId: string,
  versionPublicId: string,
  options?: FetchV1Options,
): Promise<ResourceV2MapFeedbackResponse> {
  return fetchV1<ResourceV2MapFeedbackResponse>(
    `/resources/maps/${encodeURIComponent(publicId)}/versions/${encodeURIComponent(versionPublicId)}/feedback`,
    options,
  );
}

export async function submitResourceV2MapFeedback(
  publicId: string,
  versionPublicId: string,
  input: ResourceV2MapFeedbackInput,
): Promise<ResourceV2MapFeedbackResponse> {
  return requestV1(
    `/resources/maps/${encodeURIComponent(publicId)}/versions/${encodeURIComponent(versionPublicId)}/feedback`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function createResourceV2Relation(
  publicId: string,
  input: ResourceV2CreateRelationInput,
): Promise<{ source_resource_public_id: string; target_resource_public_id: string; relation_type: string; relation_context: string; created: boolean }> {
  return requestV1(
    `/resources/${encodeURIComponent(publicId)}/relations`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function getResourceManifestV1(
  publicId: string,
  options?: FetchV1Options,
): Promise<V1ResourceManifest> {
  return fetchV1<V1ResourceManifest>(`/resources/${encodeURIComponent(publicId)}/manifest`, options);
}

export async function listResourcesV1(
  params: { limit?: number; offset?: number; query?: string } = {},
  options?: FetchV1Options,
): Promise<{ items: V1ResourceListItem[]; pagination: { limit: number; offset: number; next_offset: number | null; has_more: boolean } }> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.query) query.set('q', params.query);
  return fetchV1(`/resources${query.toString() ? `?${query.toString()}` : ''}`, options);
}
