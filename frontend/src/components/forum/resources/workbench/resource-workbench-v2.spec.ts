import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import {
  createResourceV2Relation,
  getResourceV2ModIssueReports,
  getResourceV2MapFeedback,
  getResourceV2ModCompatibility,
  getResourceV2ModConflicts,
  getResourceV2VersionDiff,
  getResourceWorkbenchV2Analysis,
  getResourceWorkbenchV2ModContents,
  getResourceWorkbenchV2ModIndex,
  getResourceWorkbenchV2,
  submitResourceV2MapFeedback,
  submitResourceV2ModCompatibilityReport,
  submitResourceV2ModConflict,
  submitResourceV2ModIssueReport,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
  type ResourceV2ModIssueReport,
  type ResourceV2VersionDiff,
} from '@/lib/api/v1/resources';
import {
  deleteResourceV2ReportAttachment,
  downloadResourceV2ReportAttachment,
  listResourceV2ReportAttachments,
  uploadResourceV2ReportAttachment,
  type ResourceV2ReportAttachment,
} from '@/lib/api/v1/resource-report-attachments';
import ResourceWorkbenchV2 from './resource-workbench-v2';

jest.mock('@/lib/api/v1/resource-report-attachments', () => ({
  ...jest.requireActual('@/lib/api/v1/resource-report-attachments'),
  deleteResourceV2ReportAttachment: jest.fn(),
  downloadResourceV2ReportAttachment: jest.fn(),
  listResourceV2ReportAttachments: jest.fn(),
  uploadResourceV2ReportAttachment: jest.fn(),
}));

jest.mock('@/lib/api/v1/resources', () => ({
  ...jest.requireActual('@/lib/api/v1/resources'),
  getResourceWorkbenchV2: jest.fn(),
  getResourceWorkbenchV2Analysis: jest.fn(),
  getResourceWorkbenchV2ModContents: jest.fn(),
  getResourceWorkbenchV2ModIndex: jest.fn(),
  getResourceV2MapFeedback: jest.fn(),
  getResourceV2ModCompatibility: jest.fn(),
  getResourceV2ModConflicts: jest.fn(),
  getResourceV2ModIssueReports: jest.fn(),
  getResourceV2VersionDiff: jest.fn(),
  submitResourceV2MapFeedback: jest.fn(),
  submitResourceV2ModCompatibilityReport: jest.fn(),
  submitResourceV2ModConflict: jest.fn(),
  submitResourceV2ModIssueReport: jest.fn(),
  createResourceV2Relation: jest.fn(),
}));

jest.mock('@/i18n/provider', () => {
  const translations: Record<string, string> = {
    'resourceWorkbenchV2.sections': 'Workbench sections',
    'resourceWorkbenchV2.overview': 'Overview',
    'resourceWorkbenchV2.publish': 'Publish',
    'resourceWorkbenchV2.compatibility': 'Compatibility',
    'resourceWorkbenchV2.analysis': 'Analysis',
    'resourceWorkbenchV2.community': 'Community',
    'resourceWorkbenchV2.settings': 'Settings',
    'resourceWorkbenchV2.modDetails': 'Mod parser details',
    'resourceWorkbenchV2.parserDetails': 'Parsed details',
    'resourceWorkbenchV2.noVersions': 'No published versions are available.',
    'resourceWorkbenchV2.analysisEmpty': 'No structured analysis is available yet.',
    'resourceWorkbenchV2.analysisLoading': 'Loading analysis for this version…',
    'resourceWorkbenchV2.analysisLoadFailed': 'Could not load analysis',
    'resourceWorkbenchV2.kindAnalysis': 'Resource analysis details',
    'resourceWorkbenchV2.modAnalysisDetails': 'Mod content and manifest',
    'resourceWorkbenchV2.indexedContentCount': 'Indexed content entries',
    'resourceWorkbenchV2.localizationCount': 'Localization files',
    'resourceWorkbenchV2.modContentIndex': 'Mod Content index',
    'resourceWorkbenchV2.indexLoading': 'Loading the Content index…',
    'resourceWorkbenchV2.indexLoadFailed': 'Could not load the Content index',
    'resourceWorkbenchV2.noIndexedContent': 'No indexed Content entries are available.',
    'resourceWorkbenchV2.loadMoreContent': 'Load more Content',
    'resourceWorkbenchV2.loadingMore': 'Loading more…',
    'resourceWorkbenchV2.localizationCoverage': 'Localization coverage',
    'resourceWorkbenchV2.noLocalizationCoverage': 'No localization coverage data is available.',
    'resourceWorkbenchV2.translatedKeys': 'translated keys',
    'resourceWorkbenchV2.missingKeys': 'Missing keys',
    'resourceWorkbenchV2.schematicAnalysis': 'Blueprint production analysis',
    'resourceWorkbenchV2.mapAnalysis': 'Map balance and wave analysis',
    'resourceWorkbenchV2.productionEstimate': 'Theoretical production estimate',
    'resourceWorkbenchV2.measured': 'Measured',
    'resourceWorkbenchV2.available': 'Available',
    'resourceWorkbenchV2.bottlenecks': 'Potential bottlenecks',
    'resourceWorkbenchV2.analysisWarnings': 'Analysis notes',
    'resourceWorkbenchV2.difficulty': 'Estimated difficulty',
    'resourceWorkbenchV2.confidence': 'Confidence',
    'resourceWorkbenchV2.resourceBalance': 'Resource balance indicators',
    'resourceWorkbenchV2.pathAnalysis': 'Spawn and core distance indicators',
    'resourceWorkbenchV2.waves': 'Wave groups',
    'resourceWorkbenchV2.noFindings': 'This analysis has no findings.',
    'resourceWorkbenchV2.estimated': 'Estimated',
    'resourceWorkbenchV2.versionSummary': 'Summary',
    'resourceWorkbenchV2.files': 'Files',
    'resourceWorkbenchV2.versionTabs': 'Version sections',
    'resourceWorkbenchV2.selectVersion': 'Select a version',
    'resourceWorkbenchV2.recommended': 'Recommended',
    'resourceWorkbenchV2.revision': 'Revision',
    'resourceWorkbenchV2.publishedAt': 'Published',
    'resourceWorkbenchV2.gameRange': 'Game version range',
    'resourceWorkbenchV2.noFiles': 'No files are available for this version.',
    'resourceWorkbenchV2.diff': 'Version diff',
    'resourceWorkbenchV2.diffLoading': 'Loading version diff…',
    'resourceWorkbenchV2.diffLoadFailed': 'Could not load version diff',
    'resourceWorkbenchV2.diffEmpty': 'No structured diff is available for this version.',
    'resourceWorkbenchV2.diffNoChanges': 'No changes were reported.',
    'resourceWorkbenchV2.diffRange': 'Compared versions',
    'resourceWorkbenchV2.diffSummary': 'Version change summary',
    'resourceWorkbenchV2.previousVersion': 'Previous release',
    'resourceWorkbenchV2.added': 'Added',
    'resourceWorkbenchV2.removed': 'Removed',
    'resourceWorkbenchV2.changed': 'Changed',
    'resourceWorkbenchV2.unknown': 'Unknown',
    'resourceWorkbenchV2.download': 'Download',
    'resourceWorkbenchV2.unavailable': 'Unavailable',
    'resourceWorkbenchV2.parser': 'Parser',
    'resourceWorkbenchV2.dependencies': 'Dependencies',
    'resourceWorkbenchV2.noDependencies': 'No dependency information is available.',
    'resourceWorkbenchV2.source': 'Source',
    'resourceWorkbenchV2.noCompatibility': 'No compatibility records are available.',
    'resourceWorkbenchV2.modId': 'Mod ID',
    'resourceWorkbenchV2.version': 'Version',
    'resourceWorkbenchV2.gameVersions': 'Supported game versions',
    'resourceWorkbenchV2.detailsEmpty': 'No parsed metadata is available.',
    'resourceWorkbenchV2.noDescription': 'No description is available.',
    'resourceWorkbenchV2.loading': 'Loading workbench…',
    'resourceWorkbenchV2.loadFailed': 'Could not load the resource workbench',
    'resourceWorkbenchV2.retry': 'Retry',
    'resourceWorkbenchV2.backToResources': 'Back to resources',
    'resourceWorkbenchV2.v2Badge': 'Resource Center V2',
    'resourceWorkbenchV2.readOnly': 'Read only',
    'resourceWorkbenchV2.manager': 'Can manage',
    'resourceWorkbenchV2.views': 'Views',
    'resourceWorkbenchV2.downloads': 'Downloads',
    'resourceWorkbenchV2.likes': 'Likes',
    'resourceWorkbenchV2.favorites': 'Favorites',
    'resourceWorkbenchV2.preview': 'Interactive preview',
    'resourceWorkbenchV2.rendererReady': 'Preview ready',
    'resourceWorkbenchV2.rendererNone': 'No preview',
    'resourceWorkbenchV2.coordinates': 'Coordinates',
    'resourceWorkbenchV2.approximate': 'Approximate position',
    'resourceWorkbenchV2.grid': 'Grid',
    'resourceWorkbenchV2.markers': 'Markers',
    'resourceWorkbenchV2.noMarkers': 'No coordinate data',
    'resourceWorkbenchV2.zoomIn': 'Zoom in',
    'resourceWorkbenchV2.zoomOut': 'Zoom out',
    'resourceWorkbenchV2.reset': 'Reset view',
    'resourceWorkbenchV2.about': 'About this resource',
    'resourceWorkbenchV2.visibility': 'Visibility',
    'resourceWorkbenchV2.renderer': 'Preview status',
    'resourceWorkbenchV2.versionWorkspace': 'Version workspace',
    'resourceWorkbenchV2.rendererFacts.name': 'Name',
    'resourceWorkbenchV2.rendererFacts.author': 'Author',
    'resourceWorkbenchV2.community.interactions': 'Community interactions',
    'resourceWorkbenchV2.community.loading': 'Loading community reports…',
    'resourceWorkbenchV2.community.loginPhoneRequired': 'Sign in and verify your phone number.',
    'resourceWorkbenchV2.community.privacyReminder': 'Remove private information first.',
    'resourceWorkbenchV2.community.reportAttachments': 'Attach logs or screenshots',
    'resourceWorkbenchV2.community.attachmentHelp': 'Up to 10 files, 5 MiB each.',
    'resourceWorkbenchV2.community.viewAttachments': 'View private attachments',
    'resourceWorkbenchV2.community.noReportAttachments': 'No attachments are available to display.',
    'resourceWorkbenchV2.community.attachmentListUnavailable': 'Private attachments are unavailable for your account.',
    'resourceWorkbenchV2.community.downloadAttachment': 'Download attachment',
    'resourceWorkbenchV2.community.deleteAttachment': 'Delete attachment',
    'resourceWorkbenchV2.community.compatibilityReports': 'Compatibility reports',
    'resourceWorkbenchV2.community.noCompatibilityReports': 'No compatibility reports yet.',
    'resourceWorkbenchV2.community.submitCompatibility': 'Submit compatibility report',
    'resourceWorkbenchV2.community.statusLabel': 'Status',
    'resourceWorkbenchV2.community.status.working': 'Working',
    'resourceWorkbenchV2.community.gameVersion': 'Game version',
    'resourceWorkbenchV2.community.platform': 'Platform',
    'resourceWorkbenchV2.community.runtime': 'Runtime',
    'resourceWorkbenchV2.community.unspecified': 'Unspecified',
    'resourceWorkbenchV2.community.details': 'Details',
    'resourceWorkbenchV2.community.submit': 'Submit report',
    'resourceWorkbenchV2.community.submitting': 'Submitting…',
    'resourceWorkbenchV2.community.submitFailed': 'Submission failed.',
    'resourceWorkbenchV2.community.compatibilitySaved': 'Compatibility report saved.',
    'resourceWorkbenchV2.community.authorResponse': 'Author response',
    'resourceWorkbenchV2.community.issueReports': 'Issue reports',
    'resourceWorkbenchV2.community.issueReportsLoading': 'Loading issue reports…',
    'resourceWorkbenchV2.community.issueReportsLoadFailed': 'Could not load public issue reports',
    'resourceWorkbenchV2.community.noPublicIssueReports': 'No public issue reports yet.',
    'resourceWorkbenchV2.community.loadMoreIssues': 'Load more reports',
    'resourceWorkbenchV2.community.issueVersion': 'Affected version',
    'resourceWorkbenchV2.community.fixedInVersion': 'Fixed in',
    'resourceWorkbenchV2.community.issueStatus.open': 'Open',
    'resourceWorkbenchV2.community.issueStatus.confirmed': 'Confirmed',
    'resourceWorkbenchV2.community.issueStatus.fixed': 'Fixed',
    'resourceWorkbenchV2.community.issueStatus.not_mod_issue': 'Not a Mod issue',
    'resourceWorkbenchV2.community.issueTitle': 'Issue title',
    'resourceWorkbenchV2.community.submitIssue': 'Submit issue report',
    'resourceWorkbenchV2.community.issueSaved': 'Issue report submitted.',
    'resourceWorkbenchV2.community.modConflicts': 'Mod conflict reports',
    'resourceWorkbenchV2.community.conflictHelp': 'Report Mod conflicts.',
    'resourceWorkbenchV2.community.noConflicts': 'No public conflicts yet.',
    'resourceWorkbenchV2.community.untitledConflict': 'Untitled conflict',
    'resourceWorkbenchV2.community.conflictStatus.unverified': 'Unverified',
    'resourceWorkbenchV2.community.submitConflict': 'Submit conflict report',
    'resourceWorkbenchV2.community.currentModMember': 'Current Mod included: {resource} · {version}',
    'resourceWorkbenchV2.community.memberResourceUuid': 'Other Mod resource UUID',
    'resourceWorkbenchV2.community.memberVersionUuid': 'Other Mod version UUID',
    'resourceWorkbenchV2.community.versionConstraint': 'Version constraint',
    'resourceWorkbenchV2.community.addMember': 'Add another Mod',
    'resourceWorkbenchV2.community.removeMember': 'Remove this Mod',
    'resourceWorkbenchV2.community.conflictMembersRequired': 'Enter the other Mod UUIDs.',
    'resourceWorkbenchV2.community.conflictDistinctMods': 'Each Mod must be different.',
    'resourceWorkbenchV2.community.conflictStartsUnverified': 'New reports are unverified.',
    'resourceWorkbenchV2.community.conflictSaved': 'Conflict submitted.',
    'resourceWorkbenchV2.community.selectVersionFirst': 'Select a published version first.',
    'resourceWorkbenchV2.community.mapFeedback': 'Map play feedback',
    'resourceWorkbenchV2.community.feedbackAggregate': 'Map feedback summary',
    'resourceWorkbenchV2.community.feedbackCount': 'Feedback count',
    'resourceWorkbenchV2.community.noFeedback': 'No data',
    'resourceWorkbenchV2.community.feedback.difficulty': 'Difficulty',
    'resourceWorkbenchV2.community.feedback.resource_sufficiency': 'Resource sufficiency',
    'resourceWorkbenchV2.community.feedback.balance': 'Balance',
    'resourceWorkbenchV2.community.feedback.multiplayer_experience': 'Multiplayer experience',
    'resourceWorkbenchV2.community.noRating': 'No rating',
    'resourceWorkbenchV2.community.feedbackRequired': 'Choose one rating or enter feedback.',
    'resourceWorkbenchV2.community.submitFeedback': 'Submit map feedback',
    'resourceWorkbenchV2.community.feedbackSaved': 'Map feedback saved.',
    'resourceWorkbenchV2.community.gameVersionMin': 'Minimum game version',
    'resourceWorkbenchV2.community.gameVersionMax': 'Maximum game version',
    'resourceWorkbenchV2.community.createRelationTitle': 'Create a related resource link',
    'resourceWorkbenchV2.community.relationHelp': 'Enter a public resource UUID.',
    'resourceWorkbenchV2.community.targetResourceUuid': 'Target resource UUID',
    'resourceWorkbenchV2.community.relationContext': 'Recommended use',
    'resourceWorkbenchV2.community.context.opening': 'Opening',
    'resourceWorkbenchV2.community.context.production': 'Production',
    'resourceWorkbenchV2.community.context.defense': 'Defense',
    'resourceWorkbenchV2.community.context.logistics': 'Logistics',
    'resourceWorkbenchV2.community.context.general': 'General',
    'resourceWorkbenchV2.community.createRelation': 'Create relation',
    'resourceWorkbenchV2.community.relationCreated': 'Relation created.',
    'resourceWorkbenchV2.community.relationAlreadyExists': 'Relation already exists.',
  };
  const translate = (key: string) => translations[key] || key;
  return { useI18n: () => ({ locale: 'en', t: translate }) };
});

jest.mock('next/link', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href, ...props }, children),
  };
});

const mockGetWorkbench = getResourceWorkbenchV2 as jest.MockedFunction<typeof getResourceWorkbenchV2>;
const mockGetAnalysis = getResourceWorkbenchV2Analysis as jest.MockedFunction<typeof getResourceWorkbenchV2Analysis>;
const mockGetModContents = getResourceWorkbenchV2ModContents as jest.MockedFunction<typeof getResourceWorkbenchV2ModContents>;
const mockGetModIndex = getResourceWorkbenchV2ModIndex as jest.MockedFunction<typeof getResourceWorkbenchV2ModIndex>;
const mockGetMapFeedback = getResourceV2MapFeedback as jest.MockedFunction<typeof getResourceV2MapFeedback>;
const mockGetModCompatibility = getResourceV2ModCompatibility as jest.MockedFunction<typeof getResourceV2ModCompatibility>;
const mockGetModConflicts = getResourceV2ModConflicts as jest.MockedFunction<typeof getResourceV2ModConflicts>;
const mockGetModIssueReports = getResourceV2ModIssueReports as jest.MockedFunction<typeof getResourceV2ModIssueReports>;
const mockGetVersionDiff = getResourceV2VersionDiff as jest.MockedFunction<typeof getResourceV2VersionDiff>;
const mockSubmitMapFeedback = submitResourceV2MapFeedback as jest.MockedFunction<typeof submitResourceV2MapFeedback>;
const mockSubmitModCompatibility = submitResourceV2ModCompatibilityReport as jest.MockedFunction<typeof submitResourceV2ModCompatibilityReport>;
const mockSubmitModConflict = submitResourceV2ModConflict as jest.MockedFunction<typeof submitResourceV2ModConflict>;
const mockSubmitModIssue = submitResourceV2ModIssueReport as jest.MockedFunction<typeof submitResourceV2ModIssueReport>;
const mockCreateRelation = createResourceV2Relation as jest.MockedFunction<typeof createResourceV2Relation>;
const mockListReportAttachments = listResourceV2ReportAttachments as jest.MockedFunction<typeof listResourceV2ReportAttachments>;
const mockUploadReportAttachment = uploadResourceV2ReportAttachment as jest.MockedFunction<typeof uploadResourceV2ReportAttachment>;
const mockDownloadReportAttachment = downloadResourceV2ReportAttachment as jest.MockedFunction<typeof downloadResourceV2ReportAttachment>;
const mockDeleteReportAttachment = deleteResourceV2ReportAttachment as jest.MockedFunction<typeof deleteResourceV2ReportAttachment>;
type TestDom = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => TestDom;
};

let dom: TestDom;
let container: HTMLDivElement;
let root: Root | null = null;
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
const GLOBALS = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];

function metadata(kind: 'mod' | 'map' | 'schematic'): ResourceWorkbenchV2Response['resource']['metadata'] {
  return {
    schema_version: 1,
    tags: [],
    supported_versions: [],
    compatibility: [],
    preview: { url: '/preview.png', status: 'ready' },
    ...(kind === 'mod' ? { mod: { mod_id: 'example-mod', version: '1.2.3', game_versions: ['v7'], dependencies: [] } } : {}),
    ...(kind === 'map' ? { map: { name: 'Test map', author: 'Mapper', description: null, width: 80, height: 50, spawns: 2, version: 1, build: 146, planets: ['Serpulo'], game_modes: ['attack'], required_mods: [] } } : {}),
    ...(kind === 'schematic' ? { schematic: { name: 'Test schematic', description: null, width: 12, height: 8, blocks: 24, requirements: [] } } : {}),
  };
}

function version(id: string, displayVersion: string, revision: number, recommended = false): ResourceWorkbenchV2Version {
  return {
    public_id: id,
    version: displayVersion,
    display_version: displayVersion,
    version_mode: 'semver',
    revision,
    release_channel: 'release',
    recommended,
    game_version_min: 'v7',
    game_version_max: null,
    status: 'published',
    published_at: '2026-10-01T00:00:00.000Z',
    compatibility: [],
    dependencies: [],
    files: [{
      public_id: `${id}-file`,
      role: 'primary',
      delivery_mode: 'managed',
      platform: null,
      architecture: null,
      package_type: null,
      display_name: `${displayVersion}.jar`,
      original_filename: `${displayVersion}.jar`,
      mime_type: 'application/java-archive',
      size_bytes: 2048,
      sha256: null,
      integrity_status: 'verified',
      availability_status: 'available',
      downloadable: true,
      installable: true,
      download_url: `/download/${id}`,
    }],
  };
}

function workbench(kind: 'mod' | 'map' | 'schematic' = 'mod', overrides: Partial<ResourceWorkbenchV2Response> = {}): ResourceWorkbenchV2Response {
  const resourceMetadata = metadata(kind);
  return {
    resource: {
      public_id: '11111111-1111-4111-8111-111111111111',
      resource_kind: kind,
      title: `Example ${kind}`,
      summary: `A ${kind} resource`,
      description: 'A detailed description',
      content: null,
      content_format: 'tiptap_json',
      content_schema_version: 2,
      content_json: null,
      content_html: null,
      content_text: null,
      visibility: 'public',
      source_url: null,
      license: null,
      metadata: resourceMetadata,
      renderer: { status: 'ready', parser_version: 'renderer-v2', public_metadata: resourceMetadata, preview_url: '/preview.png' },
    },
    permissions: { role: 'viewer', can_manage: false },
    versions: [],
    analysis: null,
    relations: [],
    stats: { views: 12, downloads: 4, likes: 2, favorites: 1, rating_count: 0, rating_average: 0 },
    ...overrides,
  };
}

async function mount(value: ResourceWorkbenchV2Response | Promise<ResourceWorkbenchV2Response>): Promise<void> {
  mockGetWorkbench.mockReturnValue(Promise.resolve(value));
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ResourceWorkbenchV2, { publicId: '11111111-1111-4111-8111-111111111111' }));
    await Promise.resolve();
  });
}

async function click(element: Element | null): Promise<void> {
  if (!element) throw new Error('Expected interactive element was not rendered');
  await act(async () => {
    (element as HTMLElement).click();
  });
}

async function setValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null, value: string): Promise<void> {
  if (!element) throw new Error('Expected form field was not rendered');
  await act(async () => {
    Simulate.change(element, { target: { value } as EventTarget & { value: string } });
  });
}

async function submitForm(form: HTMLFormElement | null): Promise<void> {
  if (!form) throw new Error('Expected form was not rendered');
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

async function navigateCommunity(): Promise<void> {
  await click(container.querySelector('button[aria-expanded="false"]'));
  const communityButton = Array.from(container.querySelectorAll('nav[aria-label="Workbench sections"] button'))
    .find((button) => button.textContent === 'Community interactions');
  await click(communityButton || null);
}

describe('ResourceWorkbenchV2', () => {
  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
    for (const name of GLOBALS) originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: dom.window },
      document: { configurable: true, value: dom.window.document },
      navigator: { configurable: true, value: dom.window.navigator },
      HTMLElement: { configurable: true, value: dom.window.HTMLElement },
      Node: { configurable: true, value: dom.window.Node },
      Event: { configurable: true, value: dom.window.Event },
      MouseEvent: { configurable: true, value: dom.window.MouseEvent },
      IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
    });
  });

  beforeEach(() => {
    mockGetWorkbench.mockReset();
    mockGetAnalysis.mockReset().mockResolvedValue(null);
    mockGetModContents.mockReset().mockResolvedValue({ items: [], pagination: { next_cursor: null, has_more: false } });
    mockGetModIndex.mockReset().mockResolvedValue({
      contents: { items: [], pagination: { next_cursor: null, has_more: false } },
      localizations: { items: [], pagination: { next_cursor: null, has_more: false } },
    });
    mockGetMapFeedback.mockReset().mockResolvedValue({ resource_public_id: 'resource-id', version_public_id: 'version-id', aggregate: { feedback_count: 0, difficulty_average: null, resource_sufficiency_average: null, balance_average: null, multiplayer_experience_average: null } });
    mockGetModCompatibility.mockReset().mockResolvedValue({ items: [], reports: [] });
    mockGetModConflicts.mockReset().mockResolvedValue({ items: [], pagination: { next_cursor: null, has_more: false } });
    mockGetModIssueReports.mockReset().mockResolvedValue({ items: [], pagination: { next_cursor: null, has_more: false } });
    mockGetVersionDiff.mockReset().mockResolvedValue({ from_version_public_id: null, to_version_public_id: 'version-1', status: 'unavailable', parser_version: null, diff: null });
    mockSubmitMapFeedback.mockReset().mockResolvedValue({ resource_public_id: 'resource-id', version_public_id: 'version-id', aggregate: { feedback_count: 1, difficulty_average: 3, resource_sufficiency_average: null, balance_average: null, multiplayer_experience_average: null } });
    mockSubmitModCompatibility.mockReset().mockResolvedValue({ public_id: 'report-id', resource_public_id: 'resource-id', version_public_id: 'version-id', status: 'working' });
    mockSubmitModConflict.mockReset().mockResolvedValue({
      public_id: 'conflict-id', status: 'unverified', members: [
        { resource_public_id: 'mod-id', version_public_id: 'version-1', version_constraint: null },
        { resource_public_id: 'other-mod-id', version_public_id: 'other-version-id', version_constraint: null },
      ],
    });
    mockSubmitModIssue.mockReset().mockResolvedValue({ public_id: 'issue-id', resource_public_id: 'resource-id', version_public_id: 'version-id', status: 'open' });
    mockCreateRelation.mockReset().mockResolvedValue({ source_resource_public_id: 'resource-id', target_resource_public_id: 'target-id', relation_type: 'recommended_for', relation_context: 'production', created: true });
    mockListReportAttachments.mockReset().mockResolvedValue({ items: [], max_attachments: 10, max_file_size_bytes: 5 * 1024 * 1024, max_total_size_bytes: 20 * 1024 * 1024 });
    mockUploadReportAttachment.mockReset().mockResolvedValue({
      public_id: 'attachment-id', kind: 'log', name: 'client.log', size_bytes: 12, mime_type: 'text/plain',
      sha256: 'a'.repeat(64), created_at: '2026-10-01T00:00:00.000Z', download_url: '/api/v1/private-attachment', can_delete: true,
    } satisfies ResourceV2ReportAttachment);
    mockDownloadReportAttachment.mockReset().mockResolvedValue(new Blob(['log']));
    mockDeleteReportAttachment.mockReset().mockResolvedValue({ public_id: 'attachment-id', deleted: true });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    container.remove();
  });

  afterAll(() => {
    dom.window.close();
    for (const name of GLOBALS) {
      const descriptor = originalGlobals.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  it('renders the Mod parser details variant', async () => {
    await mount(workbench('mod'));

    expect(container.textContent).toContain('Example mod');
    expect(container.textContent).toContain('Mod parser details');
    expect(container.textContent).toContain('example-mod');
    expect(container.textContent).toContain('1.2.3');
  });

  it('shows the selected Mod version Content index and localization coverage', async () => {
    const fixture = workbench('mod', { versions: [version('mod-version', '1.2.3', 1, true)] });
    mockGetModIndex.mockResolvedValue({
      contents: {
        items: [{ public_id: 'content-id', content_type: 'block', internal_name: 'example-conveyor', display_name: 'Example Conveyor', description: 'A sample block', icon_url: null, properties: { health: 100 }, version_public_id: 'mod-version' }],
        pagination: { next_cursor: null, has_more: false },
      },
      localizations: {
        items: [{ locale: 'zh_CN', translated_count: 84, total_count: 100, percentage: 84, missing_keys: ['block.example.name'] }],
        pagination: { next_cursor: null, has_more: false },
      },
    });
    await mount(fixture);
    await act(async () => { await Promise.resolve(); });

    expect(mockGetModIndex).toHaveBeenCalledWith(fixture.resource.public_id, 'mod-version', expect.any(Object));
    expect(container.textContent).toContain('Example Conveyor');
    expect(container.textContent).toContain('example-conveyor');
    expect(container.textContent).toContain('zh_CN');
    expect(container.textContent).toContain('84%');
    expect(container.textContent).toContain('block.example.name');
  });

  it('loads the next page of Mod Content index entries', async () => {
    const fixture = workbench('mod', { versions: [version('mod-version', '1.2.3', 1, true)] });
    mockGetModIndex.mockResolvedValue({
      contents: {
        items: [{ public_id: 'content-1', content_type: 'block', internal_name: 'first-block', display_name: null, description: null, icon_url: null, properties: {}, version_public_id: 'mod-version' }],
        pagination: { next_cursor: 'content-cursor-2', has_more: true },
      },
      localizations: { items: [], pagination: { next_cursor: null, has_more: false } },
    });
    mockGetModContents.mockResolvedValue({
      items: [{ public_id: 'content-2', content_type: 'unit', internal_name: 'second-unit', display_name: null, description: null, icon_url: null, properties: {}, version_public_id: 'mod-version' }],
      pagination: { next_cursor: null, has_more: false },
    });
    await mount(fixture);
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain('first-block');
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Load more Content') || null);

    expect(mockGetModContents).toHaveBeenCalledWith(fixture.resource.public_id, 'mod-version', 'content-cursor-2');
    expect(container.textContent).toContain('second-unit');
  });

  it.each([
    ['map', 'Test map', '80 × 50 · Approximate position'],
    ['schematic', 'Test schematic', '12 × 8 · Approximate position'],
  ] as const)('renders the %s preview and parsed details', async (kind, name, dimensions) => {
    await mount(workbench(kind));

    expect(container.textContent).toContain('Interactive preview');
    expect(container.textContent).toContain('Preview ready');
    expect(container.textContent).toContain(name);
    expect(container.textContent).toContain(dimensions);
    expect(container.querySelector('button[aria-label="Zoom in"]')).not.toBeNull();
  });

  it('exposes a collapsible mobile navigation and the desktop sidebar layout', async () => {
    await mount(workbench());

    const mobileMenu = container.querySelector('button[aria-expanded="false"]');
    expect(mobileMenu).not.toBeNull();
    expect(container.querySelector('aside.hidden.lg\\:block')).not.toBeNull();
    expect(container.querySelectorAll('nav[aria-label="Workbench sections"]')).toHaveLength(1);

    await click(mobileMenu);

    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(container.querySelectorAll('nav[aria-label="Workbench sections"]')).toHaveLength(2);
    expect(container.textContent).toContain('Overview');
    expect(container.textContent).toContain('Settings');
  });

  it('switches the selected version and its internal file tab', async () => {
    const fixture = workbench('mod', { versions: [version('version-1', '1.0.0', 1), version('version-2', '2.0.0', 2, true)] });
    await mount(fixture);

    const versionSelect = container.querySelector('#workbench-version') as HTMLSelectElement;
    expect(versionSelect.value).toBe('version-2');
    expect(container.querySelector('h3')?.textContent).toBe('2.0.0');

    await act(async () => {
      versionSelect.value = 'version-1';
      versionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    expect(container.querySelector('h3')?.textContent).toBe('1.0.0');
    const filesTab = Array.from(container.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent === 'Files');
    await click(filesTab || null);
    expect(container.textContent).toContain('1.0.0.jar');
  });

  it('shows loading, empty version and analysis states', async () => {
    mockGetWorkbench.mockReturnValue(new Promise<ResourceWorkbenchV2Response>(() => undefined));
    root = createRoot(container);
    await act(async () => root?.render(createElement(ResourceWorkbenchV2, { publicId: 'resource-id' })));
    expect(container.textContent).toContain('Loading workbench…');

    await act(async () => root?.unmount());
    root = null;
    container.replaceChildren();
    await mount(workbench('mod'));

    expect(container.textContent).toContain('No published versions are available.');
    await click(container.querySelector('button[aria-expanded="false"]'));
    const analysisButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Analysis');
    await click(analysisButton || null);
    expect(container.textContent).toContain('No structured analysis is available yet.');
  });

  it('shows structured analysis findings and a retryable error state', async () => {
    const fixture = workbench('mod', {
      analysis: {
        kind: 'mod',
        status: 'complete',
        parser_version: 'mod-parser-1',
        started_at: '2026-10-01T00:00:00.000Z',
        completed_at: '2026-10-01T00:00:01.000Z',
        summary: { content_count: 3 },
        findings: [{ key: 'manifest.author', severity: 'WARNING', message: 'Author metadata is missing.', field_path: 'mod.json.author', ignored: false, ignore_reason: null, actor: null, timestamp: null }],
        data: { manifest: { display_name: 'Example manifest', main: 'example.Main' }, indexed_content_count: 3, localization_count: 2 },
      },
    });
    await mount(fixture);
    await click(container.querySelector('button[aria-expanded="false"]'));
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Analysis') || null);
    expect(container.textContent).toContain('mod-parser-1');
    expect(container.textContent).toContain('Author metadata is missing.');
    expect(container.textContent).toContain('Example manifest');
    expect(container.textContent).toContain('3');

    if (root) await act(async () => root?.unmount());
    root = null;
    container.replaceChildren();
    mockGetWorkbench.mockRejectedValue(new Error('not available'));
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(ResourceWorkbenchV2, { publicId: 'resource-id' }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Could not load the resource workbench');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('Retry'))).toBe(true);
  });

  it.each([
    ['schematic', { complete: true, available: true, estimated: true, production: { mode: 'theoretical', items: { graphite: { produced: 6, consumed: 4, net: 2 } } }, bottlenecks: [{ code: 'input-shortage', item: 'coal' }], warnings: [] }, 'Blueprint production analysis', 'graphite: produced: 6 · consumed: 4 · net: 2'],
    ['map', { estimated: true, estimated_difficulty: 16, difficulty_confidence: 'low', resource_balance: { available: true, resource_entry_count: 3 }, path_analysis: { available: true, average_spawn_to_core_distance: 24 }, waves: [{ wave_start: 1, wave_end: 5, enemy_count: 8, boss_count: 1 }], warnings: [] }, 'Map balance and wave analysis', 'wave_start: 1 · wave_end: 5 · enemy_count: 8 · boss_count: 1'],
  ] as Array<['schematic' | 'map', Record<string, unknown>, string, string]>)('renders the %s analysis workspace details', async (kind, data, heading, detail) => {
    const fixture = workbench(kind, {
      versions: [version(`${kind}-version`, '1.0.0', 1, true)],
      analysis: {
        kind,
        status: 'completed',
        parser_version: 'kind-parser-1',
        started_at: null,
        completed_at: null,
        summary: null,
        findings: [],
        data,
      },
    });
    await mount(fixture);
    await click(container.querySelector('button[aria-expanded="false"]'));
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Analysis') || null);

    expect(container.textContent).toContain(heading);
    expect(container.textContent).toContain(detail);
  });

  it('loads analysis for the newly selected version', async () => {
    const fixture = workbench('mod', {
      versions: [version('version-1', '1.0.0', 1), version('version-2', '2.0.0', 2, true)],
      analysis: {
        kind: 'mod', status: 'completed', parser_version: 'mod-parser-1', started_at: null, completed_at: null,
        summary: null, findings: [], data: { manifest: { display_name: 'Recommended manifest' }, indexed_content_count: 4, localization_count: 1 },
      },
    });
    mockGetAnalysis.mockResolvedValue({
      kind: 'mod', status: 'completed', parser_version: 'mod-parser-1', started_at: null, completed_at: null,
      summary: null, findings: [], data: { manifest: { display_name: 'Version one manifest' }, indexed_content_count: 2, localization_count: 3 },
    });
    await mount(fixture);
    expect(container.textContent).toContain('Recommended manifest');

    await act(async () => {
      const versionSelect = container.querySelector('#workbench-version') as HTMLSelectElement;
      versionSelect.value = 'version-1';
      versionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockGetAnalysis).toHaveBeenCalledWith(fixture.resource.public_id, 'mod', 'version-1', expect.any(Object));
    expect(container.textContent).toContain('Version one manifest');
    expect(container.textContent).not.toContain('Recommended manifest');
  });

  it.each([
    ['mod', { summary: { added_content: 2, removed_files: 1, changed_content: 3, renamed_content: 1, changed_manifest_fields: 0 } }, ['2', '1', '4']],
    ['schematic', { blocks: { added: [{}], removed: [{}], changed: [{}] }, materials: { added: [], removed: [], changed: [] }, dependencies: { added: [], removed: [], changed: [] }, metadata: [{}], production: { before: {}, after: {} } }, ['1', '1', '3']],
    ['map', { resources: { added: [{}, {}], removed: [], changed: [] }, cores: { added: [], removed: [{}], changed: [] }, spawns: { added: [], removed: [], changed: [] }, waves: { added: [], removed: [], changed: [{}] }, dependencies: { added: [], removed: [], changed: [] }, metadata: [{}], analysis: null }, ['2', '1', '2']],
  ] as Array<['mod' | 'schematic' | 'map', Record<string, unknown>, string[]]>)('shows %s version diff counts', async (kind, diff, expectedCounts) => {
    const fixture = workbench(kind, { versions: [version('version-1', '1.0.0', 1), version('version-2', '2.0.0', 2, true)] });
    mockGetVersionDiff.mockResolvedValue({ from_version_public_id: 'version-1', to_version_public_id: 'version-2', status: 'completed', parser_version: 'diff-parser-1', diff } satisfies ResourceV2VersionDiff);
    await mount(fixture);
    await click(Array.from(container.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent === 'Version diff') || null);
    expect(mockGetVersionDiff).toHaveBeenCalledWith(fixture.resource.public_id, kind, 'version-2');
    expect(container.textContent).toContain('1.0.0 → 2.0.0');
    const summary = container.querySelector('[aria-label="Version change summary"]');
    expect(Array.from(summary?.querySelectorAll('dd') || []).map((item) => item.textContent)).toEqual(expectedCounts);
  });

  it('shows diff loading failures with retry and an unavailable empty state', async () => {
    mockGetVersionDiff.mockRejectedValueOnce(new Error('diff service unavailable'));
    const fixture = workbench('map', { versions: [version('map-version', 'map-1', 1, true)] });
    await mount(fixture);
    await click(Array.from(container.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent === 'Version diff') || null);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('diff service unavailable');
    mockGetVersionDiff.mockResolvedValueOnce({ from_version_public_id: null, to_version_public_id: 'map-version', status: 'unavailable', parser_version: null, diff: null });
    await click(Array.from(container.querySelectorAll('[role="alert"] button'))[0] || null);
    expect(container.textContent).toContain('No structured diff is available for this version.');
  });

  it('submits Mod compatibility, issue and multi-release conflict reports', async () => {
    const fixture = workbench('mod', { versions: [version('version-1', '1.0.0', 1, true)] });
    await mount(fixture);
    await navigateCommunity();

    expect(container.textContent).toContain('Compatibility reports');
    expect(container.textContent).toContain('Remove private information first.');
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(2);
    expect(container.textContent).toContain('Attach logs or screenshots');
    expect(container.querySelectorAll('form')).toHaveLength(3);
    expect((container.querySelectorAll('form')[0].querySelector('button[type="submit"]') as HTMLButtonElement).className).toContain('w-full');
    await submitForm(container.querySelectorAll('form')[0]);
    expect(mockSubmitModCompatibility).toHaveBeenCalledWith(fixture.resource.public_id, 'version-1', expect.objectContaining({ status: 'working' }));

    const issueTitle = container.querySelectorAll('form')[1].querySelector('input');
    const issueBody = container.querySelectorAll('form')[1].querySelector('textarea');
    await setValue(issueTitle, 'Crashes after loading');
    await setValue(issueBody, 'The game exits after the resource loads.');
    await submitForm(container.querySelectorAll('form')[1]);
    expect(mockSubmitModIssue).toHaveBeenCalledWith(fixture.resource.public_id, 'version-1', {
      title: 'Crashes after loading', body: 'The game exits after the resource loads.',
    });

    const conflictForm = container.querySelectorAll('form')[2];
    const conflictFields = conflictForm.querySelectorAll('input[required]');
    await setValue(conflictFields[0] as HTMLInputElement, '22222222-2222-4222-8222-222222222222');
    await setValue(conflictFields[1] as HTMLInputElement, '33333333-3333-4333-8333-333333333333');
    await submitForm(conflictForm);
    expect(mockSubmitModConflict).toHaveBeenCalledWith(expect.objectContaining({
      members: [
        { resource_public_id: fixture.resource.public_id, version_public_id: 'version-1' },
        { resource_public_id: '22222222-2222-4222-8222-222222222222', version_public_id: '33333333-3333-4333-8333-333333333333', version_constraint: undefined },
      ],
    }));
  });

  it('uploads a private log attachment to the newly submitted issue report', async () => {
    const fixture = workbench('mod', { versions: [version('version-1', '1.0.0', 1, true)] });
    await mount(fixture);
    await navigateCommunity();
    const issueForm = container.querySelectorAll('form')[1];
    await setValue(issueForm.querySelector('input'), 'Crashes after loading');
    await setValue(issueForm.querySelector('textarea'), 'See attached client log.');
    const fileInput = issueForm.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new dom.window.File(['crash trace'], 'client.log', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => Simulate.change(fileInput, { target: { files: [file] } as unknown as EventTarget }));

    await submitForm(issueForm);

    expect(mockSubmitModIssue).toHaveBeenCalledWith(fixture.resource.public_id, 'version-1', {
      title: 'Crashes after loading', body: 'See attached client log.',
    });
    expect(mockListReportAttachments).toHaveBeenCalledWith('issue', 'issue-id');
    expect(mockUploadReportAttachment).toHaveBeenCalledWith('issue', 'issue-id', file);
    expect(container.textContent).toContain('reportAndAttachmentsSaved');
  });

  it('shows public issue reports, author responses, and loads the next page', async () => {
    const fixture = workbench('mod', { versions: [version('version-1', '1.0.0', 1, true)] });
    const issue = (id: string, title: string): ResourceV2ModIssueReport => ({
      public_id: id, version_public_id: 'version-1', status: 'open', title, body: `${title} details`,
      author_response_status: 'fixed', author_response: 'Fixed in the next release.', fixed_version_public_id: 'version-1', created_at: '2026-10-01T00:00:00.000Z',
    });
    mockGetModIssueReports
      .mockResolvedValueOnce({ items: [issue('issue-1', 'Loading failure')], pagination: { next_cursor: 'next-cursor', has_more: true } })
      .mockResolvedValueOnce({ items: [issue('issue-2', 'Startup crash')], pagination: { next_cursor: null, has_more: false } });
    mockListReportAttachments.mockResolvedValueOnce({
      items: [{
        public_id: 'private-attachment', kind: 'image', name: 'screenshot.png', size_bytes: 128,
        mime_type: 'image/png', sha256: 'b'.repeat(64), created_at: '2026-10-01T00:00:00.000Z',
        download_url: '/api/v1/private-attachment', can_delete: false,
      }],
      max_attachments: 10, max_file_size_bytes: 5 * 1024 * 1024, max_total_size_bytes: 20 * 1024 * 1024,
    });
    await mount(fixture);
    await navigateCommunity();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Loading failure details');
    expect(container.textContent).toContain('Fixed in the next release.');
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'View private attachments') || null);
    expect(mockListReportAttachments).toHaveBeenCalledWith('issue', 'issue-1');
    expect(container.textContent).toContain('screenshot.png');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Delete attachment')).toBe(false);
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Load more reports') || null);
    expect(mockGetModIssueReports).toHaveBeenLastCalledWith(fixture.resource.public_id, { limit: 10, cursor: 'next-cursor' });
    expect(container.textContent).toContain('Startup crash details');
  });

  it('shows map feedback aggregates, submits structured ratings and creates owner relations', async () => {
    const fixture = workbench('map', {
      versions: [version('map-version-1', 'map-1', 1, true)],
      permissions: { role: 'owner', can_manage: true },
    });
    mockGetMapFeedback.mockResolvedValue({ resource_public_id: fixture.resource.public_id, version_public_id: 'map-version-1', aggregate: {
      feedback_count: 3, difficulty_average: 4, resource_sufficiency_average: 3.5, balance_average: null, multiplayer_experience_average: 5,
    } });
    await mount(fixture);
    await navigateCommunity();

    expect(container.querySelector('[aria-label="Map feedback summary"]')).not.toBeNull();
    expect(container.textContent).toContain('Resource sufficiency');
    expect(container.textContent).toContain('4');
    expect(container.querySelectorAll('form')).toHaveLength(2);
    await setValue(container.querySelectorAll('form')[0].querySelector('select'), '4');
    await submitForm(container.querySelectorAll('form')[0]);
    expect(mockSubmitMapFeedback).toHaveBeenCalledWith(fixture.resource.public_id, 'map-version-1', expect.objectContaining({ difficulty: 4 }));

    await setValue(container.querySelectorAll('form')[1].querySelector('input'), '44444444-4444-4444-8444-444444444444');
    const relationForm = container.querySelectorAll('form')[1];
    const relationSelects = relationForm.querySelectorAll('select');
    await setValue(relationSelects[0], 'recommended_for');
    await setValue(relationSelects[1], 'production');
    await submitForm(relationForm);
    expect(mockCreateRelation).toHaveBeenCalledWith(fixture.resource.public_id, {
      target_resource_public_id: '44444444-4444-4444-8444-444444444444',
      relation_type: 'recommended_for',
      relation_context: 'production',
      source_version_public_id: 'map-version-1',
    });

    await setValue(relationForm.querySelector('select'), 'fork_of');
    const relationInputs = relationForm.querySelectorAll('input');
    await setValue(relationInputs[0], '55555555-5555-4555-8555-555555555555');
    await setValue(relationInputs[1], '66666666-6666-4666-8666-666666666666');
    expect(relationForm.querySelectorAll('input[required]')).toHaveLength(2);
    await submitForm(relationForm);
    expect(mockCreateRelation).toHaveBeenLastCalledWith(fixture.resource.public_id, {
      target_resource_public_id: '55555555-5555-4555-8555-555555555555',
      relation_type: 'fork_of',
      source_version_public_id: 'map-version-1',
      target_version_public_id: '66666666-6666-4666-8666-666666666666',
    });
  });
});
