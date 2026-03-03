.PHONY: all help install_base install_deps build_docs build test run build_wasm build_docker run_docker

all: help

help:
	@echo "Available commands:"
	@echo "  make install_base  - Install Node.js"
	@echo "  make install_deps  - Install dependencies (npm install)"
	@echo "  make build_docs    - Build API docs and put them in 'docs' directory (or dir given in DOCS_DIR)"
	@echo "  make build         - Build the CLI binary (or to dir given in BIN_DIR)"
	@echo "  make test          - Run tests locally"
	@echo "  make run           - Run the CLI. E.g., make run ARGS='--version'"
	@echo "  make build_wasm    - Build the WASM output"
	@echo "  make build_docker  - Build Docker images"
	@echo "  make run_docker    - Run Docker images"

install_base:
	@echo "Please install Node.js >= 18.0.0 manually if not installed."
	npm --version || echo "npm not found. Please install Node.js."

install_deps:
	npm install

DOCS_DIR ?= docs
build_docs:
	npm run docs

BIN_DIR ?= dist
build:
	npm run build
	@if [ "$(BIN_DIR)" != "dist" ]; then \
		mkdir -p $(BIN_DIR); \
		cp -r dist/* $(BIN_DIR)/; \
	fi

test:
	npm run test

run: build
	node $(BIN_DIR)/cli.js $(ARGS)

build_wasm:
	@echo "Building WASM (browser bundle)..."
	npx esbuild dist/index.js --bundle --platform=browser --outfile=wasm/cdd-ts.js
build_docker:
	docker build -f debian.Dockerfile -t cdd-ts:debian .
	docker build -f alpine.Dockerfile -t cdd-ts:alpine .

run_docker:
	docker run -d -p 8080:8080 --name cdd-ts-test cdd-ts:alpine
	sleep 2
	curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"version","id":1}' http://localhost:8080
	docker stop cdd-ts-test && docker rm cdd-ts-test
