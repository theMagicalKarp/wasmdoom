//-----------------------------------------------------------------------------
//
// $Id:$
//
// Copyright (C) 1993-1996 by id Software, Inc.
//
// This source is available for distribution and/or modification
// only under the terms of the DOOM Source Code License as
// published by id Software. All rights reserved.
//
// The source is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// FITNESS FOR A PARTICULAR PURPOSE. See the DOOM Source Code License
// for more details.
//
//
// $Log:$
//
// DESCRIPTION:
//	Main loop menu stuff.
//	Default Config File.
//	PCX Screenshots.
//
//-----------------------------------------------------------------------------

static const char rcsid[] = "$Id: m_misc.c,v 1.6 1997/02/03 22:45:10 b1 Exp $";

#include "doomdef.h"

#include "z_zone.h"

#include "m_argv.h"
#include "m_swap.h"

#include "w_wad.h"

#include "i_system.h"
#include "i_video.h"
#include "v_video.h"

#include "hu_stuff.h"

// State.
#include "doomstat.h"

// Data.
#include "dstrings.h"

#include "m_misc.h"

//
// M_DrawText
// Returns the final X coordinate
// HU_Init must have been called to init the font
//
extern patch_t *hu_font[HU_FONTSIZE];

int M_DrawText(int x, int y, boolean direct, char *string) {
  int c;
  int w;

  while (*string) {
    c = toupper(*string) - HU_FONTSTART;
    string++;
    if (c < 0 || c > HU_FONTSIZE) {
      x += 4;
      continue;
    }

    w = SHORT(hu_font[c]->width);
    if (x + w > SCREENWIDTH)
      break;
    if (direct)
      V_DrawPatchDirect(x, y, 0, hu_font[c]);
    else
      V_DrawPatch(x, y, 0, hu_font[c]);
    x += w;
  }

  return x;
}

//
// M_WriteFile
//
#ifndef O_BINARY
#define O_BINARY 0
#endif

//
// DEFAULTS
//
int usemouse;
int usejoystick;

extern int key_right;
extern int key_left;
extern int key_up;
extern int key_down;

extern int key_strafeleft;
extern int key_straferight;

extern int key_fire;
extern int key_use;
extern int key_strafe;
extern int key_speed;

extern int mousebfire;
extern int mousebstrafe;
extern int mousebforward;

extern int joybfire;
extern int joybstrafe;
extern int joybuse;
extern int joybspeed;

extern int viewwidth;
extern int viewheight;

extern int mouseSensitivity;
extern int showMessages;

extern int detailLevel;

extern int screenblocks;

extern int showMessages;

// machine-independent sound params
extern int numChannels;

extern char *chat_macros[];

typedef struct {
  char *name;
  int *location;
  int defaultvalue;
  int scantranslate; // PC scan code hack
  int untranslated;  // lousy hack
} default_t;

default_t defaults[] = {
    {"mouse_sensitivity", &mouseSensitivity, 5},
    {"sfx_volume", &snd_SfxVolume, 8},
    {"music_volume", &snd_MusicVolume, 8},
    {"show_messages", &showMessages, 1},

    {"key_right", &key_right, KEY_RIGHTARROW},
    {"key_left", &key_left, KEY_LEFTARROW},
    {"key_up", &key_up, KEY_UPARROW},
    {"key_down", &key_down, KEY_DOWNARROW},
    {"key_strafeleft", &key_strafeleft, ','},
    {"key_straferight", &key_straferight, '.'},

    {"key_fire", &key_fire, KEY_RCTRL},
    {"key_use", &key_use, ' '},
    {"key_strafe", &key_strafe, KEY_RALT},
    {"key_speed", &key_speed, KEY_RSHIFT},

    {"use_mouse", &usemouse, 1},
    {"mouseb_fire", &mousebfire, 0},
    {"mouseb_strafe", &mousebstrafe, 1},
    {"mouseb_forward", &mousebforward, 2},

    {"use_joystick", &usejoystick, 0},
    {"joyb_fire", &joybfire, 0},
    {"joyb_strafe", &joybstrafe, 1},
    {"joyb_use", &joybuse, 3},
    {"joyb_speed", &joybspeed, 2},

    {"screenblocks", &screenblocks, 9},
    {"detaillevel", &detailLevel, 0},

    {"snd_channels", &numChannels, 3},

    {"usegamma", &usegamma, 0},

    {"chatmacro0", (int *)&chat_macros[0], (int)HUSTR_CHATMACRO0},
    {"chatmacro1", (int *)&chat_macros[1], (int)HUSTR_CHATMACRO1},
    {"chatmacro2", (int *)&chat_macros[2], (int)HUSTR_CHATMACRO2},
    {"chatmacro3", (int *)&chat_macros[3], (int)HUSTR_CHATMACRO3},
    {"chatmacro4", (int *)&chat_macros[4], (int)HUSTR_CHATMACRO4},
    {"chatmacro5", (int *)&chat_macros[5], (int)HUSTR_CHATMACRO5},
    {"chatmacro6", (int *)&chat_macros[6], (int)HUSTR_CHATMACRO6},
    {"chatmacro7", (int *)&chat_macros[7], (int)HUSTR_CHATMACRO7},
    {"chatmacro8", (int *)&chat_macros[8], (int)HUSTR_CHATMACRO8},
    {"chatmacro9", (int *)&chat_macros[9], (int)HUSTR_CHATMACRO9}

};

int numdefaults;
char *defaultfile;

//
// M_LoadDefaults
//
extern byte scantokey[128];

void M_LoadDefaults(void) {
  int i;
  boolean isstring;

  // set everything to base values
  numdefaults = sizeof(defaults) / sizeof(defaults[0]);
  for (i = 0; i < numdefaults; i++) {
    *defaults[i].location = defaults[i].defaultvalue;
  }
}
