export function pathJoin(...segments: string[]): string {
  const joined = segments.filter((segment) => segment !== "").join("/");
  return joined.replace(/\/{2,}/g, "/");
}

export type NavigatorLike = {
  userAgent?: string;
  maxTouchPoints?: number;
};

export function isMobileDevice(nav: NavigatorLike | undefined): boolean {
  if (!nav) {
    return false;
  }
  const ua = nav.userAgent ?? "";
  const mobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const touchPoints = nav.maxTouchPoints ?? 0;
  return mobileUA || touchPoints > 1;
}
