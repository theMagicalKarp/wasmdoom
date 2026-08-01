// Desktop-only control ticker: the key bindings scrolled along the bottom of
// the page as a retro theatre marquee, drawn as a grid of glowing light bulbs
// over dim unlit sockets.
//
// The bulbs are physical: the socket grid never moves. What travels is the
// illumination — each step shifts which column of the message each fixed socket
// is showing, exactly like the real sign. That means repainting, so the cost is
// kept off the 35fps game loop in game-loop.ts three ways: the two bulb states
// are pre-rendered to sprites once (the expensive radial gradient and shadow
// blur are never re-run), the static sockets live on their own canvas that is
// painted once, and the lit layer repaints only on a whole-column step —
// COLS_PER_SEC times a second, not once a frame.

// 5x7 column bitmaps, one hex byte per column, bit n = row n from the top.
// Generated from ASCII art; regenerate rather than hand-editing the hex.
const BLANK_GLYPH = "0000000000";

const FONT_5X7: Record<string, string> = {
  0: "3e5149453e",
  1: "00427f4000",
  2: "4261514946",
  3: "2141454b31",
  4: "1814127f10",
  5: "2745454539",
  6: "3c4a494930",
  7: "0171090503",
  8: "3649494936",
  9: "064949291e",
  A: "7e0909097e",
  B: "7f49494936",
  C: "3e41414122",
  D: "7f4141413e",
  E: "7f49494941",
  F: "7f09090901",
  G: "3e4149493a",
  H: "7f0808087f",
  I: "00417f4100",
  J: "2040413f01",
  K: "7f08142241",
  L: "7f40404040",
  M: "7f020c027f",
  N: "7f0408107f",
  O: "3e4141413e",
  P: "7f09090906",
  Q: "3e4151215e",
  R: "7f09192946",
  S: "4649494931",
  T: "01017f0101",
  U: "3f4040403f",
  V: "1f2040201f",
  W: "7f2018207f",
  X: "6314081463",
  Y: "0304780403",
  Z: "6151494543",
  " ": BLANK_GLYPH,
  "-": "0808080808",
  "=": "1414141414",
  "/": "6010080403",
  ".": "0060600000",
  ",": "0070300000",
  ":": "0036360000",
  // Custom eight-point star used as the separator between bindings.
  "*": "2a1c7f1c2a",
};

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;
/** Blank columns inserted between adjacent glyphs. */
export const GLYPH_GAP = 1;

const BINDINGS = [
  "WASD MOVE",
  "MOUSE TURN",
  "ARROWS MOVE AND TURN",
  "SHIFT RUN",

  "SPACE OR LEFT CLICK FIRE",
  "E USE",
  "1-7 WEAPONS",

  "Q MENU",
  "ENTER CONFIRM",
  "BACKSPACE BACK",
  "TAB MAP",

  "H HIDE THIS",
];

// Separator repeated at the wrap point so the loop reads like the rest of the
// string rather than jamming the last binding against the first.
const WRAP_GAP = " / ";
export const MARQUEE_TEXT = BINDINGS.join(WRAP_GAP);

/** Logical pixels per bulb cell (socket pitch). */
const CELL = 5;
/** Vertical padding inside the bar, so a bulb's glow is never clipped. */
const BLEED = CELL * 2;
/** Message columns the sign advances per second. */
const COLS_PER_SEC = 12;

/** Half-width of a bulb sprite, in cells; wide enough to hold the full glow. */
const SPRITE_CELLS = 2;

/** Key that toggles the sign; unbound in KEY_MAP, so the engine never wants it. */
const TOGGLE_CODE = "KeyH";
// Same "wasmdoom:*" namespace doom-save.ts uses. Absent means shown, so a first
// visit gets the sign and only an explicit hide is remembered.
const HIDDEN_KEY = "wasmdoom:marquee:hidden";

/**
 * Lays `text` out left-to-right as a lit/unlit bulb matrix, indexed
 * `[row][col]` with `GLYPH_HEIGHT` rows. Characters are upper-cased; anything
 * outside the font renders blank.
 */
export function buildGrid(text: string): boolean[][] {
  const chars = [...text.toUpperCase()];
  const width =
    chars.length === 0
      ? 0
      : chars.length * (GLYPH_WIDTH + GLYPH_GAP) - GLYPH_GAP;
  const grid: boolean[][] = [];
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    grid.push(new Array<boolean>(width).fill(false));
  }
  chars.forEach((ch, index) => {
    const hex = FONT_5X7[ch] ?? BLANK_GLYPH;
    const left = index * (GLYPH_WIDTH + GLYPH_GAP);
    for (let col = 0; col < GLYPH_WIDTH; col++) {
      const byte = parseInt(hex.slice(col * 2, col * 2 + 2), 16);
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        grid[row][left + col] = (byte & (1 << row)) !== 0;
      }
    }
  });
  return grid;
}

// localStorage throws outright when storage is disabled (Safari private mode,
// blocked third-party cookies in a frame). The sign is decoration, so a failure
// to remember the state must never take the page down with it.
function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) {
      localStorage.setItem(HIDDEN_KEY, "1");
    } else {
      localStorage.removeItem(HIDDEN_KEY);
    }
  } catch {
    // Toggle still works for this page load; it just won't be remembered.
  }
}

/**
 * Pre-renders one bulb to its own canvas. Called twice at startup, so the
 * gradient and shadow blur cost nothing once the sign is running.
 */
function bulbSprite(lit: boolean, dpr: number): HTMLCanvasElement {
  const size = SPRITE_CELLS * 2 * CELL;
  const sprite = document.createElement("canvas");
  sprite.width = Math.round(size * dpr);
  sprite.height = Math.round(size * dpr);
  const ctx = sprite.getContext("2d");
  if (!ctx) {
    return sprite;
  }
  ctx.scale(dpr, dpr);
  const mid = size / 2;

  if (!lit) {
    ctx.beginPath();
    ctx.arc(mid, mid, CELL * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fill();
    return sprite;
  }

  const radius = CELL * 0.42;
  const gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, radius);
  gradient.addColorStop(0, "#fff1c9");
  gradient.addColorStop(0.45, "#ffb44a");
  gradient.addColorStop(1, "#b30000");
  ctx.beginPath();
  ctx.arc(mid, mid, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  // Matches the .spinner accent in index.html.
  ctx.shadowColor = "#b30000";
  ctx.shadowBlur = CELL * 1.6;
  ctx.fill();
  return sprite;
}

/**
 * Mounts the sign in `#marquee` and starts the message travelling through it.
 * `H` toggles it, and a hidden sign stays hidden across page loads. Call once,
 * on desktop only. No-ops when `#marquee` is absent.
 */
export function createMarquee(): void {
  const container = document.getElementById("marquee");
  if (!container) {
    return;
  }

  // The message pattern, far wider than the sign. Every socket shows one of its
  // columns, and a step advances the whole sign through it modulo this width —
  // so the wrap needs no second copy of anything.
  const grid = buildGrid(MARQUEE_TEXT + WRAP_GAP);
  const patternCols = grid[0]?.length ?? 0;
  if (patternCols === 0) {
    return;
  }

  const sockets = document.createElement("canvas");
  const bulbs = document.createElement("canvas");
  const socketCtx = sockets.getContext("2d");
  const bulbCtx = bulbs.getContext("2d");
  if (!socketCtx || !bulbCtx) {
    return;
  }

  const barHeight = GLYPH_HEIGHT * CELL + 2 * BLEED;
  const dpr = window.devicePixelRatio || 1;
  const socketSprite = bulbSprite(false, dpr);
  const litSprite = bulbSprite(true, dpr);
  const spriteSize = SPRITE_CELLS * 2 * CELL;

  let barWidth = 0;
  let socketCols = 0;
  let originX = 0;
  let offset = 0;
  let hidden = readHidden();

  // Sprites are drawn centred on their socket, so a bulb's glow spills past the
  // cell the way a real one spills past its housing.
  const stamp = (
    ctx: CanvasRenderingContext2D,
    sprite: HTMLCanvasElement,
    col: number,
    row: number,
  ) => {
    ctx.drawImage(
      sprite,
      originX + col * CELL + CELL / 2 - spriteSize / 2,
      BLEED + row * CELL + CELL / 2 - spriteSize / 2,
      spriteSize,
      spriteSize,
    );
  };

  // The sockets are the physical sign: painted on mount and on resize, never
  // per step.
  const paintSockets = () => {
    socketCtx.clearRect(0, 0, barWidth, barHeight);
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < socketCols; col++) {
        stamp(socketCtx, socketSprite, col, row);
      }
    }
  };

  // One step of the sign: relight the fixed sockets from message column
  // `offset` onwards. Only the lit layer is touched.
  const paintBulbs = () => {
    bulbCtx.clearRect(0, 0, barWidth, barHeight);
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const source = grid[row];
      for (let col = 0; col < socketCols; col++) {
        if (source[(offset + col) % patternCols]) {
          stamp(bulbCtx, litSprite, col, row);
        }
      }
    }
  };

  const layout = () => {
    // Hidden means display: none, so there is nothing to measure — the sign is
    // laid out again when it comes back.
    if (hidden) {
      return;
    }
    // The bar is as wide as the canvas, so a partial socket at the end would
    // read as a lopsided sign: fit whole cells only and share the remainder
    // between the two edges.
    barWidth = container.clientWidth;
    socketCols = Math.floor(barWidth / CELL);
    originX = (barWidth - socketCols * CELL) / 2;
    for (const [canvas, ctx] of [
      [sockets, socketCtx],
      [bulbs, bulbCtx],
    ] as const) {
      canvas.width = Math.round(barWidth * dpr);
      canvas.height = Math.round(barHeight * dpr);
      canvas.style.width = `${barWidth}px`;
      canvas.style.height = `${barHeight}px`;
      // Sizing the backing store resets the transform, so rescale after it.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    paintSockets();
    paintBulbs();
  };

  // Showing and hiding are the same operation in both directions: flip the
  // container, and hand #screen back the height the bar was reserving so the
  // canvas grows into it instead of leaving a black gap.
  const applyVisibility = () => {
    container.classList.toggle("visible", !hidden);
    document.documentElement.style.setProperty(
      "--marquee-h",
      hidden ? "0px" : `${barHeight}px`,
    );
    // .visible is what gives the container its width, so measure after it.
    layout();
  };

  container.append(sockets, bulbs);
  applyVisibility();

  // Reduced motion: the sign still lights, it just stops travelling.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.setInterval(() => {
      if (hidden) {
        return;
      }
      offset = (offset + 2) % patternCols;
      paintBulbs();
    }, 1000 / COLS_PER_SEC);
  }

  window.addEventListener("resize", layout);

  // No preventDefault: H is not in input.ts's KEY_MAP, and swallowing it would
  // break typing an "h" into a save name. Modified presses are left alone so
  // Cmd+H (hide the window on macOS) doesn't also toggle the sign.
  window.addEventListener("keydown", (event) => {
    if (event.code !== TOGGLE_CODE || event.metaKey || event.ctrlKey) {
      return;
    }
    hidden = !hidden;
    writeHidden(hidden);
    applyVisibility();
  });
}
