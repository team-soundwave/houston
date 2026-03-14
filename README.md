# Houston

Houston is a two-tier control and telemetry stack for the CubeSat dust
detection pipeline:

- `apps/edge`: runs beside the camera and keeps a persistent outbound
  WebSocket to ground.
- `apps/ground`: accepts device connections, stores captures, exposes a
  browser API, and fans live events out to the UI.
- `apps/web`: browser dashboard for device health, captures, and
  operator commands.
- `packages/protocol`: shared Python message and payload models used by
  edge and ground.

## Architecture

```text
[Capture Worker + Local Spool] -- WS --> [Ground Hub + Storage] -- WS --> [Web UI]
                                     \-- HTTP artifact upload -->/
```

WebSockets carry live status, telemetry, detections, and commands.
Artifacts are uploaded with HTTP after the edge persists them locally.

## Edge Capture Modes

The edge runtime now mirrors the original `cubesat/main.py` pipeline in
modular form:

- ADCS state read
- frame capture
- anomaly intensity calculation
- region detection
- matrix compression
- artifact packet generation

The edge now has two top-level operating modes:

- `HOUSTON_EDGE_MODE=mock`
- `HOUSTON_EDGE_MODE=real`

`mock` is the default. It allows simulator inputs and mocked ADCS so the
stack is runnable on development machines.

`real` is strict about the camera path but does not invent a fake ADCS
implementation. If no real ADCS provider is configured, the edge reports
ADCS as unavailable and does not run self-owned captures.

`real` requires one of:

- `HOUSTON_CAPTURE_SOURCE=picamera`
- `HOUSTON_CAPTURE_SOURCE=bridge`

For a real Raspberry Pi deployment:

```bash
HOUSTON_EDGE_MODE=real
HOUSTON_CAPTURE_SOURCE=picamera
HOUSTON_ADCS_SOURCE=command
HOUSTON_ADCS_COMMAND="/usr/local/bin/read-adcs-state"
```

If the target environment needs `picamera2`, install the optional extra:

```bash
pip install picamera2
```

If you want Houston to attach to the existing `cubesat/main.py` process
instead of capturing itself, use bridge mode. That can still be a real
Pi camera deployment if `cubesat/main.py` is the process talking to the
camera:

```bash
HOUSTON_EDGE_MODE=real
HOUSTON_CAPTURE_SOURCE=bridge
HOUSTON_BRIDGE_WATCH_DIR=/Users/zimengx/Projects/cubesat
```

In bridge mode, Houston watches for completed `capture_*` artifact sets
written by the existing script and forwards them to ground. Commands that
change capture cadence or request new snapshots are not supported in that
mode because the external script still owns acquisition.

## Quick Start

1. Install Python dependencies:

   ```bash
   cd /Users/zimengx/Projects/houston
   uv sync --all-packages
   ```

2. Install frontend dependencies:

   ```bash
   cd /Users/zimengx/Projects/houston/apps/web
   npm install
   ```

3. Start the ground backend:

   ```bash
   cd /Users/zimengx/Projects/houston
   uv run --package houston-ground uvicorn houston_ground.main:app --reload --port 8000
   ```

4. Start the edge service:

   ```bash
   cd /Users/zimengx/Projects/houston
   HOUSTON_GROUND_WS_URL=ws://127.0.0.1:8000/ws/edge \
   HOUSTON_GROUND_HTTP_URL=http://127.0.0.1:8000 \
   uv run --package houston-edge uvicorn houston_edge.main:app --reload --port 8001
   ```

5. Start the web UI:

   ```bash
   cd /Users/zimengx/Projects/houston/apps/web
   npm run dev
   ```

## One-Command Dev Launchers

For interactive development, use the launcher scripts instead of
manually starting each service.

Ground station on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-ground.ps1
```

Edge on the Pi:

```bash
./scripts/dev-edge.sh
```

All three services on one Pi:

```bash
./scripts/dev-all.sh
```

Bootstrap from GitHub on a Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/team-soundwave/houston/main/scripts/bootstrap.sh | bash -s -- all
```

Bootstrap from GitHub on Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/team-soundwave/houston/main/scripts/bootstrap.ps1 | iex
```

Each launcher:

- prints the local machine IP
- prompts for the other machine's IP when needed
- installs missing dependencies
- starts the required services

The edge launcher prefers bridge mode automatically if a sibling
`cubesat/main.py` exists. Otherwise it starts the Houston edge service in
direct `picamera` mode.

The current launcher behavior is:

- if `../cubesat/main.py` exists: start `cubesat/main.py` and run
  Houston edge in `real + bridge` mode
- otherwise: run Houston edge in `real + picamera` mode

This means the Pi-side command is already the easiest supported
foreground flow:

```bash
cd ~/Projects/houston
bash ./scripts/dev-edge.sh
```

If you want to skip the laptop entirely during development and run
ground, web, and edge on the same Pi, use:

```bash
cd ~/Projects/houston
bash ./scripts/dev-all.sh
```

That starts:

- ground backend on `8000`
- web UI on `5173`
- edge service on `8001`
- `cubesat/main.py` too, if bridge mode is available

And the Windows laptop flow is:

```powershell
cd C:\path\to\houston
powershell -ExecutionPolicy Bypass -File .\scripts\dev-ground.ps1
```

Both stay in the foreground and stop with `Ctrl+C`.

## Data Flow

- The edge worker captures frames, computes intensity maps, detects
  regions, and writes raw/intensity/mask/matrix/packet artifacts into a
  local spool directory.
- The edge sends `capture_started`, `capture_completed`, and
  `heartbeat` messages over its persistent device WebSocket.
- The edge uploads artifacts to ground over HTTP. Ground stores them on
  disk, records metadata in SQLite, and broadcasts fresh state to
  connected browsers.
- The browser subscribes to a UI WebSocket for live updates and uses the
  REST API for history and detail pages.
