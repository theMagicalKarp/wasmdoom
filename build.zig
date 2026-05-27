const std = @import("std");

const doom_sources = [_][]const u8{
    "src/opl/opl3.c",
    "src/am_map.c",
    "src/d_items.c",
    "src/d_main.c",
    "src/d_net.c",
    "src/doomdef.c",
    "src/doomstat.c",
    "src/dstrings.c",
    "src/f_finale.c",
    "src/f_wipe.c",
    "src/g_game.c",
    "src/hu_lib.c",
    "src/hu_stuff.c",
    "src/i_main.c",
    "src/i_net.c",
    "src/i_sound.c",
    "src/i_system.c",
    "src/i_video.c",
    "src/info.c",
    "src/m_argv.c",
    "src/m_bbox.c",
    "src/m_cheat.c",
    "src/m_fixed.c",
    "src/m_menu.c",
    "src/m_misc.c",
    "src/m_random.c",
    "src/m_swap.c",
    "src/p_ceilng.c",
    "src/p_doors.c",
    "src/p_enemy.c",
    "src/p_floor.c",
    "src/p_inter.c",
    "src/p_lights.c",
    "src/p_map.c",
    "src/p_maputl.c",
    "src/p_mobj.c",
    "src/p_plats.c",
    "src/p_pspr.c",
    "src/p_saveg.c",
    "src/p_setup.c",
    "src/p_sight.c",
    "src/p_spec.c",
    "src/p_switch.c",
    "src/p_telept.c",
    "src/p_tick.c",
    "src/p_user.c",
    "src/r_bsp.c",
    "src/r_data.c",
    "src/r_draw.c",
    "src/r_main.c",
    "src/r_plane.c",
    "src/r_segs.c",
    "src/r_sky.c",
    "src/r_things.c",
    "src/s_sound.c",
    "src/sounds.c",
    "src/st_lib.c",
    "src/st_stuff.c",
    "src/tables.c",
    "src/v_video.c",
    "src/w_wad.c",
    "src/wasmdoom.c",
    "src/wi_stuff.c",
    "src/z_zone.c",
};

const c_flags = [_][]const u8{
    "-std=gnu99",
    "-DNORMALUNIX",
    "-DLINUX",
    "-Wno-everything",
    "-DSNDSRV",
    // The 1993 DOOM source leans on behavior the C standard calls undefined
    // (signed integer overflow, type-punned/aliased reads, unaligned access,
    // etc). Zig enables LLVM's UndefinedBehaviorSanitizer by default for Debug
    // and ReleaseSafe builds, so without this the game would trap and abort as
    // soon as that code runs. Disabling UBSan lets the original code execute
    // as written.
    "-fno-sanitize=undefined",
};

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{
        .default_target = .{
            .cpu_arch = .wasm32,
            .os_tag = .wasi,
        },
    });
    const optimize = b.standardOptimizeOption(.{});

    const mod = b.createModule(.{
        .target = target,
        .optimize = optimize,
        .link_libc = true, // wasi-libc when targeting wasm32-wasi
    });
    mod.addCSourceFiles(.{
        .files = &doom_sources,
        .flags = &c_flags,
    });
    mod.addIncludePath(b.path("src"));

    const exe = b.addExecutable(.{
        .name = "wasmdoom",
        .root_module = mod,
    });

    b.installArtifact(exe);
}
