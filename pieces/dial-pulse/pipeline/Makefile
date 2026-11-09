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
	node render_poster.mjs
	$(PY) shrink_png.py ../../../public/dial-pulse/poster.png

test:
	$(PY) -m pytest tests -q
