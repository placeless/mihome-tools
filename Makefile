SHELL := /bin/bash

PROJECT_ROOT := $(CURDIR)

.PHONY: sync install uninstall reinstall run-feed run-stats run-login
.PHONY: test test-scriptable lint audit build check

sync:
	uv sync --locked --all-groups

install: requirements.lock
	uv tool install --force --constraints "$(PROJECT_ROOT)/requirements.lock" \
		"$(PROJECT_ROOT)"

uninstall:
	uv tool uninstall mihome-tools

reinstall: install

run-feed: sync
	uv run --locked mihome-feed $(ARGS)

run-stats: sync
	uv run --locked mihome-feed-stats $(ARGS)

run-login: sync
	uv run --locked mihome-login $(ARGS)

test: sync
	uv run --locked python -m unittest discover -s tests -v

test-scriptable:
	node --test scriptable/tests/*.test.js

lint: sync
	uv run --locked ruff check src tests
	uv run --locked ruff format --check src tests

audit:
	uv audit --locked

build:
	rm -rf dist
	uv build --no-sources

check: lint test test-scriptable audit build
