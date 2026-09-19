# Resource V2 rollout

Resource V2 is additive. The legacy `resources` and `resource_versions`
columns remain readable during rollout, while new submissions also persist an
attribution, release, file delivery record, and optional compatibility rows.

Run the following against the target database after migrations have completed:

```bash
npm run backfill:resources-v2 -- --mode=dry-run
npm run backfill:resources-v2 -- --mode=write
```

The write command exits non-zero when a row fails or reconciliation finds a
non-deleted resource without a submitter attribution, root release, or primary
file. Do not enable the V1 structured read surface until both reports are clean.
Keep legacy reads available for rollback; do not delete or reinterpret legacy
version strings as Mindustry builds. Game build compatibility is stored on the
release compatibility record.
