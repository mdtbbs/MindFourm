interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Emits a schema.org JSON-LD block.
 *
 * The forum previously shipped none at all, so Google had no structured signal for
 * discussions, breadcrumbs or profiles.
 *
 * `JSON.stringify` output is escaped for the one sequence that can break out of a
 * `<script>` element. The values themselves are server-rendered from our own data,
 * not from arbitrary HTML.
 */
export default function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
