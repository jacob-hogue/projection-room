PY ?= python

.PHONY: all download prepare compute check poster test

all: download prepare compute check

download:
	$(PY) download.py

prepare:
	$(PY) prepare.py

compute:
	$(PY) compute.py

check:
	$(PY) check.py

poster:
	$(PY) render_poster.py

test:
	$(PY) -m pytest tests -q
