/**
 * Quiet, neutral button for the document header toolbar. Every tool shares one style so
 * the row reads as a single toolbar instead of competing coloured pills.
 */
export const toolbarButton =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 " +
  "text-sm font-normal text-muted-foreground bg-transparent border-0 shadow-none " +
  "transition-[background-color,color,transform] duration-150 ease-out " +
  "hover:bg-muted hover:text-foreground active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0";
