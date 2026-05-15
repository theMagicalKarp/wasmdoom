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
//
//-----------------------------------------------------------------------------

#include <stdlib.h>
#include <string.h>

#include "d_event.h"
#include "d_net.h"
#include "i_system.h"
#include "m_argv.h"

#include "doomstat.h"

#ifdef __GNUG__
#pragma implementation "i_net.h"
#endif
#include "i_net.h"

//
// I_InitNetwork
//
void I_InitNetwork(void) {
  doomcom = malloc(sizeof(*doomcom));
  memset(doomcom, 0, sizeof(*doomcom));

  doomcom->id = DOOMCOM_ID;
  doomcom->ticdup = 1;
  doomcom->extratics = 0;
  doomcom->numnodes = 1;
  doomcom->numplayers = 1;
  doomcom->deathmatch = false;
  doomcom->consoleplayer = 0;

  netgame = false;
}

void I_NetCmd(void) {}
