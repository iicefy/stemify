.PHONY: install worker-setup run build

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
