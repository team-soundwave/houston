# Houston Architecture

## Topology

```text
[Edge Backend on Capture Machine]
  - capture worker
  - modular cubesat pipeline
  - strict mock vs real mode gate
  - local spool
  - outbound device websocket
  - artifact uploader

            WebSocket
                +
           HTTP uploads
                |
                v

[Ground Backend on Computer]
  - device websocket server
  - command dispatcher
  - SQLite metadata store
  - artifact filesystem store
  - UI websocket broadcast hub
  - REST API

                |
                v

[Browser UI]
  - dashboard
  - command panel
  - capture review
  - live event feed
```

## Real-Time Messages

Edge to ground over WebSocket:

- `hello`
- `heartbeat`
- `capture_started`
- `capture_completed`
- `command_ack`
- `command_result`
- `error`

Ground to edge over WebSocket:

- `command`

Ground to browser over WebSocket:

- `snapshot`
- `device`
- `capture`
- `command`
- `event`

## Capture Data

Each capture produces:

- raw image PNG
- intensity map PNG
- binary mask PNG
- compressed matrix `npy`
- packet JSON

The edge keeps these artifacts locally first, then uploads them to the
ground node. Ground stores the same artifacts and records the metadata in
SQLite for query and replay.
