import type { Media } from "@/lib/media";
import PosterCard from "@/components/PosterCard";

export default function ContentRow({
  title,
  media,
}: {
  title: string;
  media: Media[];
}) {
  return (
    <section className="mt-10 sm:mt-12">
      <h2 className="mb-4 px-4 font-display text-xl font-semibold sm:px-8">
        {title}
      </h2>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 px-4 pb-2 scrollbar-none sm:scroll-pl-8 sm:gap-4 sm:px-8">
        {media.map((m) => (
          <div key={m.id} className="w-[150px] shrink-0 snap-start sm:w-[180px]">
            <PosterCard media={m} />
          </div>
        ))}
      </div>
    </section>
  );
}
