/** Keep each HTTP request within the API's 100-target boundary. */
export async function fetchInBatches<T>(
  ids: number[], fetchBatch: (ids: number[]) => Promise<Record<number, T>>,
): Promise<Record<number, T>> {
  const unique = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  const result: Record<number, T> = {};
  // Sequential chunks cap concurrent load even on an unusually large view.
  for (let start = 0; start < unique.length; start += 100) {
    Object.assign(result, await fetchBatch(unique.slice(start, start + 100)));
  }
  return result;
}
