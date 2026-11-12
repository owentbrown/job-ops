/**
 * Mode / theme / colour controls, shared by the sidebar Appearance popover
 * (compact) and Settings -> Appearance (large). Every option applies
 * instantly through the AppearanceProvider; nothing here is saved by a form.
 *
 * Previews never hard-code colours: each theme card sets that theme's
 * variables (from `buildTokens`) on its own wrapper, so the card shows the
 * other theme while the page keeps the current one.
 */

import { useAppearance } from "@client/lib/appearance/AppearanceProvider";
import {
  buildTokens,
  COLOUR_PAIRS,
  colourPair,
  THEMES,
} from "@client/lib/appearance/tokens";
import {
  type AppearanceChoice,
  type ColourPair,
  type Mode,
  type ResolvedMode,
  THEME_IDS,
  type ThemeId,
} from "@client/lib/appearance/types";
import type React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppearanceControlsSize = "compact" | "large";

const MODE_OPTIONS: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const modeLabel = (mode: Mode) =>
  MODE_OPTIONS.find((o) => o.id === mode)?.label ?? mode;

/** "Editorial · Evergreen · System": the sidebar item's subtitle. */
export function describeAppearance(choice: AppearanceChoice): string {
  return [
    THEMES[choice.theme].name,
    colourPair(choice.colours).name,
    modeLabel(choice.mode),
  ].join(" · ");
}

/** "Evergreen: sidebar teal, actions coral" */
export const swatchLabel = (pair: ColourPair) =>
  `${pair.name}: sidebar ${pair.navName}, actions ${pair.actionName}`;

const swatchColours = (pair: ColourPair, mode: ResolvedMode) =>
  mode === "light"
    ? { nav: pair.navLight, action: pair.actionLight }
    : { nav: pair.navDark, action: pair.actionDark };

const CAPTION_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

interface ThemePreviewProps {
  theme: ThemeId;
  style: React.CSSProperties;
  size: AppearanceControlsSize;
}

/** Mini sidebar + tile in the theme's own variables (set on the wrapper). */
const ThemePreview: React.FC<ThemePreviewProps> = ({ theme, style, size }) => {
  const { sideStyle, tileStyle } = THEMES[theme];
  const large = size === "large";
  const tileClass = cn(
    "block min-w-0 flex-1 rounded-[min(var(--radius-tile),8px)]",
    tileStyle === "filled" ? "bg-(--tint)" : "border border-border bg-card",
  );
  return (
    <span
      aria-hidden="true"
      data-theme-preview={theme}
      style={style}
      className={cn(
        "flex gap-1.5 rounded-[min(var(--radius),10px)] border border-border bg-background p-1.5",
        large ? "h-24" : "h-12.5",
      )}
    >
      <span
        data-preview-sidebar={sideStyle}
        className={cn(
          "flex shrink-0 flex-col gap-1 bg-sidebar p-1",
          large ? "w-7" : "w-3.5",
          sideStyle === "float" && "rounded-md",
          sideStyle === "dark" && "rounded-xs",
          sideStyle === "light" && "border-r border-sidebar-border",
        )}
      >
        {large ? (
          <>
            <span className="block h-1 rounded-full bg-sidebar-accent" />
            <span className="block h-1 rounded-full bg-sidebar-foreground/30" />
            <span className="block h-1 rounded-full bg-sidebar-foreground/30" />
          </>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        {large ? (
          <span className="block font-heading text-sm leading-none text-foreground">
            Aa
          </span>
        ) : null}
        <span className="flex min-h-0 flex-1 gap-1.5">
          <span data-preview-tile={tileStyle} className={tileClass} />
          {large ? <span className={tileClass} /> : null}
        </span>
      </span>
    </span>
  );
};

interface AppearanceControlsProps {
  size?: AppearanceControlsSize;
  className?: string;
}

export const AppearanceControls: React.FC<AppearanceControlsProps> = ({
  size = "compact",
  className,
}) => {
  const { choice, resolvedMode, setMode, setTheme, setColours } =
    useAppearance();
  const large = size === "large";
  const currentPair = colourPair(choice.colours);

  return (
    <div
      data-appearance-controls={size}
      className={cn("flex flex-col", large ? "gap-6" : "gap-4.5", className)}
    >
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={cn(CAPTION_CLASS, "mb-2 p-0")}>Mode</legend>
        <div className={cn("flex gap-1.5", large && "max-w-md")}>
          {MODE_OPTIONS.map((option) => {
            const pressed = choice.mode === option.id;
            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={pressed ? "default" : "outline"}
                aria-pressed={pressed}
                onClick={() => setMode(option.id)}
                className={cn("flex-1", pressed && "font-semibold")}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
        {large ? (
          <p className="mt-2 text-sm text-muted-foreground">
            System follows your computer's light/dark setting and updates live.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={cn(CAPTION_CLASS, "mb-2 p-0")}>Theme</legend>
        <div className={cn("grid grid-cols-3", large ? "gap-3" : "gap-2")}>
          {THEME_IDS.map((id) => {
            const pressed = choice.theme === id;
            const preview = buildTokens(
              id,
              choice.colours,
              resolvedMode,
            ) as React.CSSProperties;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={pressed}
                onClick={() => setTheme(id)}
                className={cn(
                  "flex min-w-0 cursor-pointer flex-col items-stretch gap-2 rounded-[min(var(--radius-popover),12px)] bg-transparent text-left text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  large ? "p-2.5" : "p-2",
                  pressed
                    ? "border-2 border-primary"
                    : "m-px border border-border",
                )}
              >
                <ThemePreview theme={id} style={preview} size={size} />
                <span
                  className={cn("font-semibold", large ? "text-sm" : "text-xs")}
                >
                  {THEMES[id].name}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={cn(CAPTION_CLASS, "mb-2 p-0")}>
          Colours{" "}
          <span className="font-normal normal-case tracking-normal">
            · {currentPair.name}{" "}
            <span className="opacity-70">(left: sidebar, right: actions)</span>
          </span>
        </legend>
        <div className={cn("flex flex-wrap p-1", large ? "gap-3" : "gap-2.5")}>
          {COLOUR_PAIRS.map((pair) => {
            const pressed = choice.colours === pair.id;
            const { nav, action } = swatchColours(pair, resolvedMode);
            return (
              <button
                key={pair.id}
                type="button"
                aria-pressed={pressed}
                aria-label={swatchLabel(pair)}
                title={pair.name}
                onClick={() => setColours(pair.id)}
                style={{
                  backgroundImage: `linear-gradient(90deg, ${nav} 50%, ${action} 50%)`,
                }}
                className={cn(
                  "shrink-0 cursor-pointer rounded-full p-0 ring-offset-2 ring-offset-background transition-shadow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
                  large ? "size-10" : "size-8.5",
                  pressed ? "ring-2 ring-foreground" : "ring-1 ring-border",
                )}
              />
            );
          })}
        </div>
      </fieldset>
    </div>
  );
};
