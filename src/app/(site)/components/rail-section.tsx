import { cn } from "@/lib/utils";

/**
 * A full-width row whose top border runs edge to edge, holding a max-width column
 * with left and right borders. Stacked rows form continuous rails down the page.
 * `backdrop` renders behind the column across the full row, so glows aren't clipped at the rails.
 */
export default function RailSection({
  id,
  className,
  backdrop,
  children,
}: {
  id?: string;
  className?: string;
  backdrop?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="relative w-full overflow-x-clip border-t border-sky-100 scroll-mt-4">
      {backdrop && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {backdrop}
        </div>
      )}
      <div className={cn("relative mx-auto w-full max-w-7xl border-x border-sky-100 px-4 md:px-12", className)}>
        {children}
      </div>
    </section>
  );
}
