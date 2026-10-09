export default function AdminPagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-lg text-sm text-ink-muted">{description}</p>
    </div>
  );
}
