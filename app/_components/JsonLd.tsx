// Renders a JSON-LD structured-data block. `data` always comes from our own
// lib/seo/structured-data.ts builders (never raw user input), so a plain
// JSON.stringify into dangerouslySetInnerHTML is safe here.
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
