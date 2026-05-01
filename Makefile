SHELL := /bin/bash

PREFIX := $(HOME)/.local
BINDIR := $(PREFIX)/bin
SHAREDIR := $(PREFIX)/share/mihome-tools
PKGDIR := $(SHAREDIR)/mihome_feeder

PROJECT_ROOT := $(CURDIR)
SRC_ROOT := $(PROJECT_ROOT)/src
BIN_ROOT := $(PROJECT_ROOT)/bin

.PHONY: install uninstall reinstall run-feed run-stats

install:
	mkdir -p "$(BINDIR)" "$(SHAREDIR)"
	rm -rf "$(PKGDIR)"
	cp -R "$(SRC_ROOT)/mihome_feeder" "$(PKGDIR)"
	cp "$(BIN_ROOT)/mihome-feed" "$(BINDIR)/mihome-feed"
	cp "$(BIN_ROOT)/mihome-feed-stats" "$(BINDIR)/mihome-feed-stats"
	chmod +x "$(BINDIR)/mihome-feed" "$(BINDIR)/mihome-feed-stats"

uninstall:
	rm -f "$(BINDIR)/mihome-feed" "$(BINDIR)/mihome-feed-stats"
	rm -rf "$(PKGDIR)"

reinstall: uninstall install

run-feed:
	set -a; . "$$HOME/.config/mihome/feeder.env"; set +a; \
	PYTHONPATH="$(SRC_ROOT)" python3 -m mihome_feeder.cli_feed $(ARGS)

run-stats:
	set -a; . "$$HOME/.config/mihome/feeder.env"; set +a; \
	PYTHONPATH="$(SRC_ROOT)" python3 -m mihome_feeder.cli_stats $(ARGS)
