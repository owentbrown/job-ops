declare module "virtual:settings-search-index" {
  /** Lowercase visible text of each settings section, keyed by section id. */
  const index: Record<string, string>;
  export default index;
}
