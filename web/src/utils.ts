export function pathJoin(...segments: string[]): string {
  const joined = segments.filter((segment) => segment !== "").join("/");
  return joined.replace(/\/{2,}/g, "/");
}
