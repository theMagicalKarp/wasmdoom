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

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function base64ToBytes(encoded: string): Uint8Array {
  const bin = atob(encoded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}
