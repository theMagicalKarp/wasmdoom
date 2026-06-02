.PHONY: clean check fix fmt-check fmt web-format web-format-check wasm-release wasm-verify web-typecheck web-test web-build web-check tools-format tools-format-check tools-typecheck tools-test tools-check tools-render-music tools-render-music-all tools-simulate

# Default is a Debug build for fast local iteration. Override (or use the
# `wasm-release` target) to produce the distributable artifact.
ZIG_OPTIMIZE ?= Debug

C_SOURCES := $(shell find src -type f \( -name '*.c' -o -name '*.h' \))

clean:
	rm -rf zig-out
	rm -rf .zig-cache
	rm -rf ci-out
	rm -rf web/dist
	rm -rf web/node_modules
	rm -rf tools/node_modules

check: fmt-check wasm wasm-verify tools-check tools-render-music tools-simulate web-check web-build

fix: fmt web-format tools-format

fmt-check:
	clang-format --dry-run --Werror $(C_SOURCES)

fmt:
	clang-format -i $(C_SOURCES)

# Install web deps; re-runs only when the lockfile changes.
web/node_modules: web/package-lock.json
	cd web && npm ci

web-format: web/node_modules
	cd web && npm run format

zig-out/bin/wasmdoom.wasm: $(C_SOURCES)
	zig build -Doptimize=$(ZIG_OPTIMIZE)
	@touch $@ zig-out/bin/wasmdoom.music.wasm

zig-out/bin/wasmdoom.music.wasm: zig-out/bin/wasmdoom.wasm

wasm: zig-out/bin/wasmdoom.wasm zig-out/bin/wasmdoom.music.wasm

wasm-verify: zig-out/bin/wasmdoom.wasm
	wasm-as ci/stubs.wat -o ci/stubs.wasm
	wasm-merge \
		--all-features \
		ci/stubs.wasm doom_host \
		zig-out/bin/wasmdoom.wasm wasmdoom \
		-o zig-out/bin/wasmdoom.ci.wasm
	wasmtime run --dir . \
		--env HOME="." \
		--env DOOMWADDIR="./wads" \
		./zig-out/bin/wasmdoom.ci.wasm
	rm ./zig-out/bin/wasmdoom.ci.wasm

web-format-check: web/node_modules
	cd web && npm run format:check

web-typecheck: web/node_modules
	cd web && npm run typecheck

web-test: web/node_modules
	cd web && npm run test

# Static-check aggregate for the web frontend. Excludes `web-build` because the
# build requires the wasm artifact, which CI downloads as a separate step.
web-check: web-format-check web-typecheck web-test

web-build: zig-out/bin/wasmdoom.wasm zig-out/bin/wasmdoom.music.wasm web/node_modules
	cd web && npm run build

# Install tools deps; re-runs only when the lockfile changes.
tools/node_modules: tools/package-lock.json
	cd tools && npm ci

tools-format: tools/node_modules
	cd tools && npm run format

tools-format-check: tools/node_modules
	cd tools && npm run format:check

tools-typecheck: tools/node_modules
	cd tools && npm run typecheck

tools-test: tools/node_modules
	cd tools && npm run test

# Static-check aggregate for the tools workspace. Excludes the render and
# simulate targets because they require the wasm artifact, which CI downloads
# as a separate step.
tools-check: tools-format-check tools-typecheck tools-test

# Smoke-test the music pipeline end to end by generating one short track.
tools-render-music: zig-out/bin/wasmdoom.music.wasm tools/node_modules
	node tools/cli.ts render-music ./wads/doom1.wad \
		--wasm ./zig-out/bin/wasmdoom.music.wasm \
		--track E1M1 --out ci-out/music

tools-render-music-all: zig-out/bin/wasmdoom.music.wasm tools/node_modules
	node tools/cli.ts render-music ./wads/doom1.wad \
		--wasm ./zig-out/bin/wasmdoom.music.wasm \
		--out ci-out/music

# Run every scripted simulation under ci/simulations/<wad>/*.json. The WAD name is
# derived from the directory name (e.g. ci/simulations/doom1/ -> ./wads/doom1.wad).
tools-simulate: zig-out/bin/wasmdoom.wasm tools/node_modules
	@for wad_dir in ci/simulations/*/; do \
		wad=$$(basename $$wad_dir); \
		for script in $$wad_dir*.json; do \
			[ -e "$$script" ] || continue; \
			name=$$(basename $$script .json); \
			echo ">>> simulate: $$wad/$$name"; \
			node tools/cli.ts simulate ./wads/$$wad.wad \
				--wasm ./zig-out/bin/wasmdoom.wasm \
				--commands $$script \
				--out ci-out/simulations/$$wad/$$name \
				--quiet || exit 1; \
		done; \
	done
