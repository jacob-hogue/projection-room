PY ?= python

.PHONY: all download prepare test

all: download prepare

download:
	$(PY) download.py

prepare:
	$(PY) prepare.py

test:
	$(PY) -m pytest tests -q
