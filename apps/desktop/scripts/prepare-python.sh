#!/usr/bin/env bash
# Builds a self-contained Python (with PyTorch + Demucs and the htdemucs_6s
# model) under build/, which electron-builder copies into the app bundle.
# Uses python-build-standalone: a relocatable CPython that doesn't depend on
# anything installed on the machine. Safe to re-run; skipped once built.
#
#   prepare-python.sh [mac|win]     (default: mac)
#
# `win` builds a Windows x64 environment from this Mac by fetching the Windows
# interpreter and installing Windows wheels (pip --platform). It needs the
# `mac` build first, for the shared model files and a pip to run.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-mac}"
PBS_TAG="20260901"
PY_VERSION="3.13.15"

fetch_python() { # $1 = triple, $2 = destination dir name under build/
  local archive="cpython-${PY_VERSION}%2B${PBS_TAG}-$1-install_only.tar.gz"
  echo "[python] downloading CPython ${PY_VERSION} ($1)"
  curl -fL --progress-bar "https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${archive}" -o build/python.tar.gz
  rm -rf "build/$2" build/_extract
  mkdir build/_extract
  tar -xzf build/python.tar.gz -C build/_extract
  mv build/_extract/python "build/$2"
  rm -rf build/_extract build/python.tar.gz
}

prune() { # $1 = python dir, $2 = site-packages dir
  find "$1" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
  rm -rf "$1/lib/python3.13/test" "$1/lib/python3.13/idlelib" "$1/lib/python3.13/tkinter" \
         "$1/Lib/test" "$1/Lib/idlelib" "$1/Lib/tkinter" "$1/tcl" \
         "$2/torch/include" "$2/torch/test" "$1/share"
}

mkdir -p build

REQ="../../worker/requirements.txt"

if [ "$TARGET" = "mac" ]; then
  if [ -f build/.python-ready ]; then
    if [ ! "$REQ" -nt build/.python-ready ]; then echo "[python] mac already prepared (delete build/ to rebuild)"; exit 0; fi
    echo "[python] requirements changed - updating the bundled packages"
    build/python/bin/python3 -m pip install --no-cache-dir --disable-pip-version-check -r "$REQ"
    prune build/python build/python/lib/python3.13/site-packages
    touch build/.python-ready
    exit 0
  fi
  rm -rf build/hf-home
  fetch_python aarch64-apple-darwin python
  PY="build/python/bin/python3"

  echo "[python] installing worker requirements (PyTorch, Demucs...)"
  "$PY" -m pip install --no-cache-dir --disable-pip-version-check -r ../../worker/requirements.txt

  echo "[python] fetching the htdemucs_6s model into the bundle"
  HF_HOME="$PWD/build/hf-home" "$PY" -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')"

  echo "[python] pruning"
  prune build/python build/python/lib/python3.13/site-packages

  # Prove the bundled interpreter can load the model offline before declaring success.
  HF_HOME="$PWD/build/hf-home" HF_HUB_OFFLINE=1 "$PY" -c \
    "import torch; from demucs.api import Separator; s = Separator(model='htdemucs_6s', device='cpu'); print('[python] ok, sources:', s.model.sources)"
  touch build/.python-ready
  du -sh build/python build/hf-home

elif [ "$TARGET" = "win" ]; then
  [ -f build/.python-ready ] || bash "$0" mac
  UPGRADE=""
  if [ -f build/.python-win-ready ]; then
    if [ ! "$REQ" -nt build/.python-win-ready ]; then echo "[python] win already prepared (delete build/python-win to rebuild)"; exit 0; fi
    echo "[python] requirements changed - updating the bundled Windows packages"
    UPGRADE="--upgrade"
  else
    fetch_python x86_64-pc-windows-msvc python-win
  fi

  SITE="build/python-win/Lib/site-packages"
  mkdir -p "$SITE"
  echo "[python] installing Windows wheels (torch is the CPU build from PyPI)"
  build/python/bin/python3 -m pip install --no-cache-dir --disable-pip-version-check \
    --platform win_amd64 --python-version 3.13 --implementation cp --abi cp313 --only-binary=:all: \
    $UPGRADE --target "$SITE" -r "$REQ"

  echo "[python] pruning"
  prune build/python-win "$SITE"
  find build/python-win -name "*.pdb" -delete   # debug symbols, tens of MB, not needed at runtime
  touch build/.python-win-ready
  du -sh build/python-win
else
  echo "usage: prepare-python.sh [mac|win]" >&2; exit 1
fi
