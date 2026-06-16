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
// $Log:$
//
// DESCRIPTION:
//	Handles WAD file header, directory, lump I/O.
//
//-----------------------------------------------------------------------------

static const char rcsid[] = "$Id: w_wad.c,v 1.5 1997/02/03 16:47:57 b1 Exp $";

#include "doomtype.h"
#include "i_system.h"
#include "m_swap.h"
#include "wasmdoom.h"
#include "z_zone.h"

#include "w_wad.h"

//
// GLOBALS
//

// Location of each lump on disk.
lumpinfo_t *lumpinfo;
int numlumps;

void **lumpcache;

#define strcmpi strcasecmp

void strupr(char *s) {
  while (*s) {
    *s = toupper(*s);
    s++;
  }
}

void ExtractFileBase(char *path, char *dest) {
  char *src;
  int length;

  src = path + strlen(path) - 1;

  // back up until a \ or the start
  while (src != path && *(src - 1) != '\\' && *(src - 1) != '/') {
    src--;
  }

  // copy up to eight characters
  memset(dest, 0, 8);
  length = 0;

  while (*src && *src != '.') {
    if (++length == 9) {
      I_Error("Filename base of %s >8 chars", path);
    }

    *dest++ = toupper((int)*src++);
  }
}

//
// LUMP BASED ROUTINES.
//

//
// W_AddMemFile
// Builds lumpinfo for the IWAD the host staged into linear memory, reading the
// header and lump directory by memcpy instead of POSIX open/read/lseek. Each
// lump is tagged with WAD_HANDLE_MEM so W_ReadLump serves it from the buffer.
//
void W_AddMemFile(void) {
  const uint8_t *base = wd_wad_data();
  wadinfo_t header;
  lumpinfo_t *lump_p;
  unsigned i;
  int length;
  int startlump;
  filelump_t *fileinfo;

  if (!base) {
    I_Error("W_AddMemFile: no WAD staged in memory");
  }

  I_Info(" adding in-memory WAD (%i bytes)\n", wd_wad_size());
  startlump = numlumps;

  memcpy(&header, base, sizeof(header));
  if (strncmp(header.identification, "IWAD", 4)) {
    if (strncmp(header.identification, "PWAD", 4)) {
      I_Error("WAD buffer doesn't have IWAD or PWAD id\n");
    }
  }
  header.numlumps = LONG(header.numlumps);
  header.infotableofs = LONG(header.infotableofs);
  length = header.numlumps * sizeof(filelump_t);
  fileinfo = alloca(length);
  memcpy(fileinfo, base + header.infotableofs, length);
  numlumps += header.numlumps;

  lumpinfo = Z_Malloc(numlumps * sizeof(lumpinfo_t), PU_STATIC, NULL);

  lump_p = &lumpinfo[startlump];

  for (i = startlump; i < numlumps; i++, lump_p++, fileinfo++) {
    lump_p->handle = WAD_HANDLE_MEM;
    lump_p->position = LONG(fileinfo->filepos);
    lump_p->size = LONG(fileinfo->size);
    strncpy(lump_p->name, fileinfo->name, 8);
  }
}

//
// W_InitFromMemory
// Like W_InitMultipleFiles, but the IWAD comes from the host-staged buffer in
// linear memory. Any additional files in `wadfiles` (e.g. -file PWADs, demo
// .lmp) are still loaded by name afterwards, so they override the IWAD's lumps.
//
void W_InitFromMemory(char **filenames) {
  int size;

  numlumps = 0;

  W_AddMemFile();

  if (!numlumps) {
    I_Error("W_Init: no lumps found");
  }

  // set up caching
  size = numlumps * sizeof(*lumpcache);
  lumpcache = Z_Malloc(size, PU_STATIC, NULL);
  memset(lumpcache, 0, size);
}

//
// W_NumLumps
//
int W_NumLumps(void) { return numlumps; }

//
// W_CheckNumForName
// Returns -1 if name not found.
//

int W_CheckNumForName(char *name) {
  union {
    char s[9];
    int x[2];

  } name8;

  int v1;
  int v2;
  lumpinfo_t *lump_p;

  // make the name into two integers for easy compares
  strncpy(name8.s, name, 8);

  // in case the name was a fill 8 chars
  name8.s[8] = 0;

  // case insensitive
  strupr(name8.s);

  v1 = name8.x[0];
  v2 = name8.x[1];

  // scan backwards so patch lump files take precedence
  lump_p = lumpinfo + numlumps;

  while (lump_p-- != lumpinfo) {
    if (*(int *)lump_p->name == v1 && *(int *)&lump_p->name[4] == v2) {
      return lump_p - lumpinfo;
    }
  }

  // TFB. Not found.
  return -1;
}

//
// W_GetNumForName
// Calls W_CheckNumForName, but bombs out if not found.
//
int W_GetNumForName(char *name) {
  int i;

  i = W_CheckNumForName(name);

  if (i == -1) {
    I_Error("W_GetNumForName: %s not found!", name);
  }

  return i;
}

//
// W_LumpLength
// Returns the buffer size needed to load the given lump.
//
int W_LumpLength(int lump) {
  if (lump >= numlumps) {
    I_Error("W_LumpLength: %i >= numlumps", lump);
  }

  return lumpinfo[lump].size;
}

//
// W_ReadLump
// Loads the lump into the given buffer,
//  which must be >= W_LumpLength().
//
void W_ReadLump(int lump, void *dest) {
  int c;
  lumpinfo_t *l;
  int handle;

  if (lump >= numlumps) {
    I_Error("W_ReadLump: %i >= numlumps", lump);
  }

  l = lumpinfo + lump;

  // ??? I_BeginRead ();

  if (l->handle == WAD_HANDLE_MEM) {
    // lump lives in the host-staged WAD buffer in linear memory
    memcpy(dest, wd_wad_data() + l->position, l->size);
    return;
  }

  I_Error("Unhandled Lump: %d", lump);
}

//
// W_CacheLumpNum
//
void *W_CacheLumpNum(int lump, int tag) {
  byte *ptr;

  if ((unsigned)lump >= numlumps) {
    I_Error("W_CacheLumpNum: %i >= numlumps", lump);
  }

  if (!lumpcache[lump]) {
    // read the lump in

    // printf ("cache miss on lump %i\n",lump);
    ptr = Z_Malloc(W_LumpLength(lump), tag, &lumpcache[lump]);
    W_ReadLump(lump, lumpcache[lump]);
  } else {
    // printf ("cache hit on lump %i\n",lump);
    Z_ChangeTag(lumpcache[lump], tag);
  }

  return lumpcache[lump];
}

//
// W_CacheLumpName
//
void *W_CacheLumpName(char *name, int tag) {
  return W_CacheLumpNum(W_GetNumForName(name), tag);
}
