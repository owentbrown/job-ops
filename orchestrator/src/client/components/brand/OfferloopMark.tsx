import { cn } from "@/lib/utils";

/**
 * Offerloop logo. The ring is the search, the dot is the offer that closes it.
 *
 * - The ring uses `currentColor`, so it follows the surrounding text colour
 *   (sidebar ink, page foreground) in every theme and mode.
 * - The dot uses `--primary`, the colour set by the Appearance colour picker.
 *   (In this app `--accent` is the pale hover background, not the picker
 *   colour.)
 *
 * Brand rules: don't recolour the ring, don't move the dot, don't rotate or
 * stretch the mark, keep it at 16px or larger.
 */
type MarkProps = {
  /** Width and height. A number is pixels; a string is any CSS length. */
  size?: number | string;
  className?: string;
  /** Accessible name. Pass "" when a visible wordmark sits next to it. */
  title?: string;
};

export function OfferloopMark({
  size = 32,
  className,
  title = "Offerloop",
}: MarkProps) {
  const decorative = title === "";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      data-offerloop-mark=""
    >
      <path
        d="M96.7 50.2A38 38 0 1 1 69.8 23.3"
        fill="none"
        stroke="currentColor"
        strokeWidth={11}
        strokeLinecap="round"
      />
      <circle cx="86.9" cy="33.1" r="9.5" fill="var(--primary)" />
    </svg>
  );
}

/**
 * Mark + lowercase "offerloop" wordmark in Sora 600. Sized by the font size
 * it inherits (the mark scales with it), so callers set text size only.
 */
export function OfferloopLogo({
  className,
  wordmarkClassName,
}: {
  className?: string;
  /** Extra classes for the "offerloop" text, e.g. to hide it at some widths. */
  wordmarkClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.3em] leading-none",
        className,
      )}
      data-offerloop-logo=""
    >
      <OfferloopMark size="1.15em" title="" />
      <span
        aria-hidden="true"
        className={cn(
          "font-['Sora',Inter,system-ui,sans-serif] font-semibold tracking-[-0.03em]",
          wordmarkClassName,
        )}
      >
        offerloop
      </span>
      <span className="sr-only">Offerloop</span>
    </span>
  );
}
