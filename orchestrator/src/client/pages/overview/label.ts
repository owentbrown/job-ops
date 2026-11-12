/**
 * Small Overview labels (tile labels, stat captions): uppercase and tracked
 * where the theme asks for it (--label-transform / --label-tracking), sentence
 * case otherwise. Callers add the colour.
 */
export const overviewLabelClass =
  "text-xs font-semibold [letter-spacing:var(--label-tracking)] [text-transform:var(--label-transform)]";
