export default function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-8 sm:py-28">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mt-3 text-ink-secondary">{description}</p>
    </main>
  );
}
