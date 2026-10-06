import { entities } from './index';

describe('root TypeORM entity registration', () => {
  it('registers every Resource Center V2 entity in the application DataSource', () => {
    const names = entities.map((entity) => entity.name);

    expect(names).toEqual(expect.arrayContaining([
      'ResourceMember', 'ResourceRelation', 'ResourceReviewEvent', 'ResourceReviewAnnotation',
      'ResourceAnalysisRun', 'ResourceAnalysisOverride', 'ResourceCompatibility', 'ResourceDependency',
      'ResourceVersionDiff', 'ResourceSourceSync',
      'ModProfile', 'ModIdAlias', 'ModVersionMetadata', 'ModContent', 'ModContentAlias', 'ModLocalization',
      'ModCompatibilityReport', 'ModIssueReport', 'ModConflictReport', 'ModConflictMember',
      'SchematicVersionMetadata', 'SchematicBlock', 'SchematicMaterial', 'SchematicLogicProcessor', 'SchematicAnalysis',
      'MapVersionMetadata', 'MapResourceEntry', 'MapSpawn', 'MapCore', 'MapWaveSummary', 'MapAnalysis', 'MapFeedback',
      'ModReportAttachment',
    ]));
    expect(new Set(names).size).toBe(names.length);
  });
});
