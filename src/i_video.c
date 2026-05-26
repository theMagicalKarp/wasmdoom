//-----------------------------------------------------------------------------
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
// DESCRIPTION:
//	DOOM graphics stuff.
//
//-----------------------------------------------------------------------------

#include "d_main.h"
#include "doomstat.h"
#include "i_system.h"
#include "m_argv.h"
#include "v_video.h"
#include "wasmdoom.h"

#include "doomdef.h"

void I_ShutdownGraphics(void) {
  // TODO: Expose to Host
}

//
// I_StartFrame
//
void I_StartFrame(void) {}

//
// I_StartTic
//
void I_StartTic(void) {}

//
// I_UpdateNoBlit
//
void I_UpdateNoBlit(void) {}

//
// I_FinishUpdate
//
void I_FinishUpdate(void) { wasmdoom_draw(); }

//
// I_ReadScreen
//
void I_ReadScreen(byte *scr) {
  memcpy(scr, screens[0], SCREENWIDTH * SCREENHEIGHT);
}

//
// I_SetPalette
//
byte doom_palette[768];

void I_SetPalette(byte *palette) { memcpy(doom_palette, palette, 768); }

void I_InitGraphics(void) {}
