#!/usr/bin/env bash
# Builds a self-contained Python (with PyTorch + Demucs and the htdemucs_6s
# model) under build/, which electron-builder copies into the app bundle.
# Uses python-build-standalone: a relocatable CPython that doesn't depend on
# anything installed on the machine. Safe to re-run; it's skipped once built.
set -euo pipefail
cd "$(dirname "$0")/.."

PBS_TAG="20260901"
PY_VERSION="3.13.15"
ARCHIVE="cpython-${PY_VERSION}%2B${PBS_TAG}-aarch64-apple-darwin-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${ARCHIVE}"

if [ -f build/.python-ready ]; then
  echo "[python] already prepared (delete build/ to rebuild)"
  exit 0
fi

rm -rf build/python build/hf-home build/python.tar.gz
mkdir -p build

echo "[python] downloading CPython ${PY_VERSION}"
curl -fL --progress-bar "$URL" -o build/python.tar.gz
tar -xzf build/python.tar.gz -C build
rm build/python.tar.gz

PY="build/python/bin/python3"
echo "[python] installing worker requirements (PyTorch, Demucs...)"
"$PY" -m pip install --no-cache-dir --disable-pip-version-check -r ../../worker/requirements.txt

echo "[python] fetching the htdemucs_6s model into the bundle"
HF_HOME="$PWD/build/hf-home" "$PY" -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')"

echo "[python] pruning"
find build/python -name "__pycache__" -type d -prune -exec rm -rf {} +
rm -rf build/python/lib/python3.13/test build/python/lib/python3.13/idlelib build/python/lib/python3.13/tkinter \
       build/python/lib/python3.13/site-packages/torch/include build/python/lib/python3.13/site-packages/torch/test \
       build/python/share

# Prove the bundled interpreter can actually load the model offline before
# declaring success.
HF_HOME="$PWD/build/hf-home" HF_HUB_OFFLINE=1 "$PY" -c \
  "import torch; from demucs.api import Separator; s = Separator(model='htdemucs_6s', device='cpu'); print('[python] ok, sources:', s.model.sources)"

touch build/.python-ready
du -sh build/python build/hf-home
