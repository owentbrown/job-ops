import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { renderAppearanceCss } from "./css";
import { buildTokens, mix, resolveTokens } from "./tokens";
import { COLOUR_IDS, RESOLVED_MODES, THEME_IDS } from "./types";

describe("mix", () => {
  it("returns the endpoints at k=0 and k=1 (lowercased)", () => {
    expect(mix("#F5F3EE", "#0E5E54", 0)).toBe("#f5f3ee");
    expect(mix("#F5F3EE", "#0E5E54", 1)).toBe("#0e5e54");
  });

  it("rounds half up like the reference Math.round blend", () => {
    // 255 * 0.5 = 127.5 -> 128
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  it("matches hand-computed blends", () => {
    // 245*.96+14*.04=235.76, 243*.96+94*.04=237.04, 238*.96+84*.04=231.84
    expect(mix("#F5F3EE", "#0E5E54", 0.04)).toBe("#ecede8");
    // 14*.4+10*.6=11.6, 94*.4+15*.6=46.6, 84*.4+18*.6=44.4
    expect(mix("#0E5E54", "#0A0F12", 0.6)).toBe("#0c2f2c");
  });
});

describe("buildTokens", () => {
  it("Editorial · Evergreen · light", () => {
    const t = buildTokens("editorial", "evergreen", "light");
    expect(t["--background"]).toBe("#ecede8");
    expect(t["--sidebar"]).toBe("#0c2f2c");
    // mix(#FFFFFF, #0c2f2c, 0.28) = 186.96, 196.76, 195.92
    expect(t["--sidebar-foreground"]).toBe("#bbc5c4");
    expect(t["--primary"]).toBe("#C2531F");
    expect(t["--primary-foreground"]).toBe("#FFFFFF");
    expect(t["--bucket-offer"]).toBe("#0E5E54");
    expect(t["--heading-font"]).toBe("Newsreader, Georgia, serif");
    expect(t["--heading-weight"]).toBe("500");
    expect(t["--heading-tracking"]).toBe("-0.01em");
    expect(t["--radius"]).toBe("14px");
  });

  it("Editorial · Evergreen · dark", () => {
    const t = buildTokens("editorial", "evergreen", "dark");
    // mix(#0A0A0A, #5FD3BC, 0.12) = 20.2, 34.12, 31.36
    expect(t["--sidebar"]).toBe("#14221f");
    expect(t["--sidebar-foreground"]).toBe("#C9C2B6");
    expect(t["--primary-foreground"]).toBe("#0B0C14");
    expect(t["--bucket-rejected"]).toBe("#B9696A");
    expect(t["--destructive"]).toBe("#FF9B9B");
  });

  it("Soft · Slate · light carries the structural tokens", () => {
    const t = buildTokens("soft", "slate", "light");
    expect(t["--radius"]).toBe("28px");
    expect(t["--radius-button"]).toBe("999px");
    expect(t["--card-border-width"]).toBe("0px");
    expect(t["--card-shadow"]).toBe("0 8px 28px rgba(36,27,61,0.09)");
    expect(t["--sidebar-foreground"]).toBe("rgba(255,255,255,0.78)");
    expect(t["--bar-height"]).toBe("20px");
  });

  it("Ledger · Harbour · light uses a light sidebar with a divider", () => {
    const t = buildTokens("ledger", "harbour", "light");
    expect(t["--sidebar-border"]).toBe("#CDD5E0");
    expect(t["--sidebar-border-width"]).toBe("1px");
    expect(t["--sidebar-foreground"]).toBe("#4C5B70");
  });
});

describe("generated CSS", () => {
  it("is current (run `npm --prefix orchestrator run appearance:css`)", () => {
    const committed = readFileSync(
      resolve(__dirname, "../../../styles/appearance.generated.css"),
      "utf8",
    );
    expect(committed).toBe(renderAppearanceCss());
  });

  it("has one block per combination", () => {
    const css = renderAppearanceCss();
    expect(css.startsWith("/*\n * generated — do not edit")).toBe(true);
    expect(css.match(/^html\[data-theme=/gm)).toHaveLength(36);
  });
});

describe("contrast (WCAG AA 4.5:1) for all 36 combinations", () => {
  const combos = THEME_IDS.flatMap((theme) =>
    COLOUR_IDS.flatMap((colours) =>
      RESOLVED_MODES.map((mode) => ({ theme, colours, mode })),
    ),
  );

  it.each(combos)("$theme · $colours · $mode", ({ theme, colours, mode }) => {
    const t = resolveTokens(theme, colours, mode);
    // [label, foreground, background, opaque colour the background sits on]
    const pairs: Array<[string, string, string, string?]> = [
      ["ink on bg", t.ink, t.bg],
      ["ink on surf", t.ink, t.surf],
      ["mut on surf", t.mut, t.surf],
      ["accInk on acc", t.accInk, t.acc],
      ["sideInk on side", t.sideInk, t.side],
      ["navOnInk on navOnBg (over side)", t.navOnInk, t.navOnBg, t.side],
      ["destructive-foreground on destructive", t.accInk, t.dFg],
    ];
    const failures = pairs
      .map(([label, fg, bg, base]) => ({
        label,
        ratio: contrastRatio(fg, bg, base),
      }))
      .filter((p) => p.ratio < 4.5)
      .map((p) => `${p.label}: ${p.ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  it.each(
    combos,
  )("Soft tile tints keep tile text readable: $theme · $colours · $mode", ({
    theme,
    colours,
    mode,
  }) => {
    const t = resolveTokens(theme, colours, mode);
    const tokens = buildTokens(theme, colours, mode);
    for (const n of [1, 2, 3]) {
      const tint = tokens[`--tile-tint-${n}`];
      expect(tint).toMatch(/^#[0-9a-f]{6}$/);
      // Labels and links on filled tiles use ink (4.5:1); a calm muted
      // zero is large text (3:1).
      expect(contrastRatio(t.ink, tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.mut, tint)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(
    combos,
  )("sidebar focus ring ≥ 3:1 on the sidebar: $theme · $colours · $mode", ({
    theme,
    colours,
    mode,
  }) => {
    const t = resolveTokens(theme, colours, mode);
    const tokens = buildTokens(theme, colours, mode);
    expect(tokens["--sidebar-ring"]).toBe(t.sideRing);
    expect(contrastRatio(t.sideRing, t.side)).toBeGreaterThanOrEqual(3);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and composites translucent colours", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    // 50% white over black is #808080 (lum ~0.2158): (1.05)/(0.2658) ~ 3.95
    expect(
      contrastRatio("#FFFFFF", "rgba(255,255,255,0.5)", "#000000"),
    ).toBeCloseTo(3.95, 1);
  });
});
