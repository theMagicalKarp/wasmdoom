.PHONY: check fix fmt-check fmt web-format web-format-check wasm wasm-verify web-typecheck web-test web-build

check: fmt-check wasm wasm-verify web-format-check web-typecheck web-test web-build

fix: fmt web-format

fmt-check:
	clang-format --dry-run --Werror src/*.c src/*.h

fmt:
	clang-format -i src/*.c src/*.h

web-format:
	cd web && npm run format

wasm:
	zig build

wasm-verify: wasm
	wasm-as ci/stubs.wat -o ci/stubs.wasm
	wasm-merge \
		--all-features \
		ci/stubs.wasm doom_host \
		zig-out/bin/wasmdoom.wasm wasmdoom \
		-o zig-out/bin/wasmdoom-ci.wasm
	wasmtime run --dir . \
		--env HOME="." \
		--env DOOMWADDIR="./wads" \
		./zig-out/bin/wasmdoom-ci.wasm

web-format-check:
	cd web && npm run format:check

web-typecheck:
	cd web && npm run typecheck

web-test:
	cd web && npm run test

web-build: wasm
	cd web && npm run build
