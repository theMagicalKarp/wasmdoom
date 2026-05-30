.PHONY: check fix fmt-check fmt web-format web-format-check wasm wasm-verify web-typecheck web-test web-build tools-format tools-format-check tools-typecheck tools-test tools-render

C_SOURCES := $(shell find src -type f \( -name '*.c' -o -name '*.h' \))

check: fmt-check wasm wasm-verify tools-format-check tools-typecheck tools-test tools-render web-format-check web-typecheck web-test web-build

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

wasm:
	zig build -Doptimize=ReleaseSmall

wasm-verify: wasm
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

web-build: wasm web/node_modules
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

# Smoke-test the music pipeline end to end by generating one short track.
tools-render: wasm tools/node_modules
	node tools/cli.ts render-music ./wads/doom1.wad \
		--wasm ./zig-out/bin/wasmdoom.music.wasm \
		--track E1M1 --out music-out

tools-render-all: wasm tools/node_modules
	node tools/cli.ts render-music ./wads/doom1.wad \
		--wasm ./zig-out/bin/wasmdoom.music.wasm \
		--out music-out
