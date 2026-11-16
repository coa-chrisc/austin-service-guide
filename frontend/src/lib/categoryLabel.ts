/** Display label for a catalog category slug: "smoking_cessation" -> "Smoking Cessation". */
export function categoryLabel(slug: string): string {
  return slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
