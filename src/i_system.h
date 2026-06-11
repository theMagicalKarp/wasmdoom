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
// DESCRIPTION:
//	System specific interface stuff.
//
//-----------------------------------------------------------------------------

#ifndef __I_SYSTEM__
#define __I_SYSTEM__

#include "d_event.h"
#include "d_ticcmd.h"

// Called by DoomMain.
void I_Init(void);

// Called by startup code
// to get the ammount of memory to malloc
// for the zone management.
byte *I_ZoneBase(int *size);

// @EDIT D_DoomLoop -> D_DoomLoopTick in doc comments
// The three doc strings below referenced the upstream `D_DoomLoop`; they were
// retargeted to wasmdoom's per-frame `D_DoomLoopTick` (see d_main.c). Pure
// doc-comment change — none of these function signatures changed.

// Called by D_DoomLoopTick,
// returns current time in tics.
int I_GetTime(void);

// Called once per host frame (top of wasmdoom_tick) to advance the
// tick counter that I_GetTime reports.
void I_AdvanceTime(void);

//
// Called by D_DoomLoopTick,
// called before processing any tics in a frame
// (just after displaying a frame).
// Time consuming syncronous operations
// are performed here (joystick reading).
// Can call D_PostEvent.
//
void I_StartFrame(void);

//
// Called by D_DoomLoopTick,
// called before processing each tic in a frame.
// Quick syncronous operations are performed here.
// Can call D_PostEvent.
void I_StartTic(void);

// Asynchronous interrupt functions should maintain private queues
// that are read by the synchronous functions
// to be converted into events.

// Either returns a null ticcmd,
// or calls a loadable driver to build it.
// This ticcmd will then be modified by the gameloop
// for normal input.
ticcmd_t *I_BaseTiccmd(void);

// Called by M_Responder when quit is selected.
// Clean exit, displays sell blurb.
void I_Quit(void);

void I_Tactile(int on, int off, int total);

void I_Error(char *error, ...);

// Diagnostic log sinks routed to the host (console.log / console.warn). Replace
// the engine's old fprintf(stdout/stderr, ...) calls.
void I_Info(char *fmt, ...);
void I_Warning(char *fmt, ...);

int I_SaveGame(char const *name, void *source, int length);
int I_LoadGame(char const *name, byte **buffer);

// Reads up to `length` bytes from the start of a saved game into `buffer`.
// Returns the number of bytes copied, or -1 if no save exists.
int I_ReadSaveString(char const *name, char *buffer, int length);

#endif
//-----------------------------------------------------------------------------
//
// $Log:$
//
//-----------------------------------------------------------------------------
