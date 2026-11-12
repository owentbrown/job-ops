/** WCAG 2.x contrast helpers for appearance tokens (hex and rgba strings). */

type Rgba = { r: number; g: number; b: number; a: number };

export function parseColour(value: string): Rgba {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(",").map((p) => Number(p.trim()));
    return { r, g, b, a };
  }
  throw new Error(`Unsupported colour for contrast check: ${value}`);
}

/** Composite a possibly translucent colour over an opaque backdrop. */
export function composite(top: string, backdrop: string): Rgba {
  const f = parseColour(top);
  const b = parseColour(backdrop);
  if (b.a !== 1) throw new Error(`Backdrop must be opaque: ${backdrop}`);
  return {
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  };
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/**
 * Contrast ratio of `fg` on `bg`. `bg` may itself be translucent if `base`
 * (the opaque colour it sits on) is given; `fg` is composited over the
 * resulting background.
 */
export function contrastRatio(fg: string, bg: string, base?: string): number {
  const back = base ? composite(bg, base) : composite(bg, "#000000");
  if (!base && parseColour(bg).a !== 1) {
    throw new Error(`Translucent background needs a base colour: ${bg}`);
  }
  const backHex = toHex(back);
  const front = composite(fg, backHex);
  const l1 = relativeLuminance(front);
  const l2 = relativeLuminance(back);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function toHex(c: Rgba): string {
  return `#${[c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")}`;
}
