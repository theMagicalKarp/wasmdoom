.PHONY: check fix fmt-check fmt web-format web-format-check wasm web-typecheck web-test web-build

check: fmt-check wasm web-format-check web-typecheck web-test web-build

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

web-test:
	cd web && npm run test

web-build: wasm
	cd web && npm run build
