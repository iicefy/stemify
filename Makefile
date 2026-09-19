.PHONY: install worker-setup run build app app-pack app-dmg app-import

# Install JS deps and set up the Python separation worker (one-time).
install: worker-setup
	npm install

worker-setup:
	cd worker && [ -d .venv ] || python3 -m venv .venv
	worker/.venv/bin/pip install -r worker/requirements.txt

# Start the API (:3001) and web app (:5173) together.
run:
	npm run dev

build:
	npm run build

# --- macOS desktop app (Electron; bundles Python, PyTorch and the model) ---

# Run the desktop app straight from the repo (uses worker/.venv and ./data).
app:
	npm run desktop

# Build Stemify.app into apps/desktop/release/mac-arm64/.
app-pack:
	npm run desktop:pack

# Build the installable .dmg into apps/desktop/release/.
app-dmg:
	npm run desktop:dist

# Copy this repo's library (./data) into the installed app's library. The
# database stores absolute file paths, so they're rewritten to the new
# location. Quit the app first; refuses to overwrite an existing library.
APP_DATA := $(HOME)/Library/Application Support/Stemify/data
app-import:
	@test ! -e "$(APP_DATA)/db.sqlite" || { echo "The app already has a library at $(APP_DATA)"; exit 1; }
	mkdir -p "$(APP_DATA)"
	cp -R data/uploads data/stems "$(APP_DATA)/"
	sqlite3 data/db.sqlite ".backup '$(APP_DATA)/db.sqlite'"
	sqlite3 "$(APP_DATA)/db.sqlite" "UPDATE songs SET original_path = replace(original_path, '$(CURDIR)/data', '$(APP_DATA)'); UPDATE stems SET file_path = replace(file_path, '$(CURDIR)/data', '$(APP_DATA)');"
	@echo "Imported. Open Stemify to see your songs."
