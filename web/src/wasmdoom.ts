export const WASMDOOM_KEYS = {
  // Movement / view
  RIGHT: 0xae,
  LEFT: 0xac,
  UP: 0xad,
  DOWN: 0xaf,

  MOVE_FORWARD: 0xad,
  MOVE_BACKWARD: 0xaf,
  TURN_LEFT: 0xac,
  TURN_RIGHT: 0xae,
  STRAFE_LEFT: 0x2c,
  STRAFE_RIGHT: 0x2e,
  STRAFE_ON: 0x80 + 0x38,

  // Combat / interaction
  FIRE: 0x80 + 0x1d,
  USE: 0x20,
  RUN: 0x80 + 0x36,

  // Weapon select
  WEAPON_1: 0x31, // fist / chainsaw
  WEAPON_2: 0x32, // pistol
  WEAPON_3: 0x33, // shotgun
  WEAPON_4: 0x34, // chaingun
  WEAPON_5: 0x35, // rocket launcher
  WEAPON_6: 0x36, // plasma rifle
  WEAPON_7: 0x37, // BFG 9000

  // Menu / system
  MENU_OPEN: 0x1b,
  MENU_CONFIRM: 0xd,
  MENU_BACK: 0x7f,
  PAUSE: 0xff,
  VIEW_SIZE_UP: 0x3d,
  VIEW_SIZE_DOWN: 0x2d,

  // Automap
  AUTOMAP_TOGGLE: 0x9,
  AUTOMAP_FOLLOW: 0x66,
  AUTOMAP_GRID: 0x67,
  AUTOMAP_MARK: 0x6d,
  AUTOMAP_CLEARMARK: 0x63,
  AUTOMAP_GOBIG: 0x30,

  // Function-key features (F1-F12)
  HELP: 0x80 + 0x3b, // F1
  SAVE: 0x80 + 0x3c, // F2
  LOAD: 0x80 + 0x3d, // F3
  SOUND_VOLUME: 0x80 + 0x3e, // F4
  DETAIL: 0x80 + 0x3f, // F5
  QUICKSAVE: 0x80 + 0x40, // F6
  END_GAME: 0x80 + 0x41, // F7
  MESSAGES: 0x80 + 0x42, // F8
  QUICKLOAD: 0x80 + 0x43, // F9
  QUIT: 0x80 + 0x44, // F10
  GAMMA: 0x80 + 0x57, // F11
  SPY: 0x80 + 0x58, // F12
} as const;

export const WASMDOOM_MOUSE_BUTTONS = {
  FIRE: 1 << 0,
  STRAFE: 1 << 1,
  USE: 1 << 2,
} as const;
