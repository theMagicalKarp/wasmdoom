.PHONY: check fix fmt-check fmt web-format web-format-check wasm web-typecheck web-build

check: fmt-check wasm web-format-check web-typecheck web-build

fix: fmt web-format

fmt-check:
	zig build fmt-check

fmt:
	zig build fmt

web-format:
	cd web && npm run format

wasm:
	zig build

web-format-check:
	cd web && npm run format:check

web-typecheck:
	cd web && npm run typecheck

web-build: wasm
	cd web && npm run build
