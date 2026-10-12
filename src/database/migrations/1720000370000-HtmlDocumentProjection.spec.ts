import { HtmlDocumentProjection1720000370000 } from './1720000370000-HtmlDocumentProjection';

it('also expands the version projection used by first resource publication', async () => {
  const query = jest.fn().mockResolvedValue([]);
  await new HtmlDocumentProjection1720000370000().up({ query } as any);
  expect(query).toHaveBeenCalledWith('ALTER TABLE `resource_versions` MODIFY `release_notes_html` MEDIUMTEXT NULL');
});

it('refuses a rollback before any ALTER when published HTML would be truncated', async () => {
  const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ exists: 1 }]);
  await expect(new HtmlDocumentProjection1720000370000().down({ query } as any)).rejects.toThrow('replies.content_html');
  expect(query.mock.calls.some(([sql]) => sql.startsWith('ALTER'))).toBe(false);
});
