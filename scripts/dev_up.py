from __future__ import annotations

import argparse
import os
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "apps" / "web"
DEFAULT_PORTS = {"ground_api": "8000", "ground_web": "5173", "edge_api": "8001"}


def main() -> int:
    args = parse_args()
    peer_ip = None if args.role == "all" else args.peer_ip or input(f"Enter the {peer_label(args.role)} IP: ").strip()
    local_ip = discover_local_ip(peer_ip)
    print_summary(args.role, local_ip, peer_ip)
    ensure_dependencies(args.role)
    if args.role == "ground":
        return run_ground(local_ip, peer_ip or "127.0.0.1")
    if args.role == "edge":
        return run_edge(local_ip, peer_ip or "127.0.0.1")
    return run_all(local_ip)

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Houston dev launcher")
    parser.add_argument("role", choices=["ground", "edge", "all"])
    parser.add_argument("--peer-ip", help="IP address of the other machine")
    return parser.parse_args()

def peer_label(role: str) -> str:
    return "Pi" if role == "ground" else "ground station" if role == "edge" else "peer"

def discover_local_ip(peer_ip: str | None) -> str:
    target = peer_ip or "8.8.8.8"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect((target, 80))
        return sock.getsockname()[0]
    except OSError:
        return socket.gethostbyname(socket.gethostname())
    finally:
        sock.close()

def print_summary(role: str, local_ip: str, peer_ip: str | None) -> None:
    print()
    print(f"Houston {role} dev launcher")
    print(f"Local IP : {local_ip}")
    if peer_ip:
        print(f"Peer IP  : {peer_ip}")
    if role == "ground":
        print(f"Ground API: http://{local_ip}:{DEFAULT_PORTS['ground_api']}")
        print(f"Web UI   : http://{local_ip}:{DEFAULT_PORTS['ground_web']}")
        print("Starts   : ground backend + web dashboard")
    elif role == "edge":
        print(f"Edge API : http://{local_ip}:{DEFAULT_PORTS['edge_api']}")
        print("Starts   : edge service in foreground")
    else:
        print(f"Ground API: http://{local_ip}:{DEFAULT_PORTS['ground_api']}")
        print(f"Web UI   : http://{local_ip}:{DEFAULT_PORTS['ground_web']}")
        print(f"Edge API : http://{local_ip}:{DEFAULT_PORTS['edge_api']}")
        print("Starts   : ground backend + web dashboard + edge service")
    print()

def ensure_dependencies(role: str) -> None:
    run_step(["uv", "sync", "--all-packages"], ROOT, "Syncing Python packages")
    if role in {"ground", "all"} and not (WEB_DIR / "node_modules").exists():
        run_step(["npm", "install"], WEB_DIR, "Installing frontend packages")
    if role in {"edge", "all"}:
        ensure_edge_dependencies()

def run_ground(local_ip: str, peer_ip: str) -> int:
    env = ground_env(local_ip, peer_ip)
    processes = ground_processes(env)
    print(f"Open the dashboard at http://{local_ip}:{DEFAULT_PORTS['ground_web']}")
    return wait_forever(processes)

def run_edge(local_ip: str, peer_ip: str) -> int:
    env = edge_env(peer_ip)
    processes = edge_processes(env)
    return wait_forever(processes)

def run_all(local_ip: str) -> int:
    ground = ground_env(local_ip, local_ip)
    edge = edge_env("127.0.0.1")
    processes = [*ground_processes(ground), *edge_processes(edge)]
    print(f"Open the dashboard at http://{local_ip}:{DEFAULT_PORTS['ground_web']}")
    return wait_forever(processes)

def ground_env(local_ip: str, peer_ip: str) -> dict[str, str]:
    env = os.environ.copy()
    env["HOUSTON_GROUND_HOST"] = "0.0.0.0"
    env["HOUSTON_GROUND_PORT"] = DEFAULT_PORTS["ground_api"]
    env["VITE_GROUND_HTTP_BASE"] = f"http://{local_ip}:{DEFAULT_PORTS['ground_api']}"
    env["VITE_GROUND_WS_URL"] = f"ws://{local_ip}:{DEFAULT_PORTS['ground_api']}/ws/ui"
    env["HOUSTON_EDGE_HINT_IP"] = peer_ip
    return env

def ground_processes(env: dict[str, str]) -> list[subprocess.Popen[str]]:
    return [
        start_process(
            ["uv", "run", "--package", "houston-ground", "uvicorn", "houston_ground.main:app", "--host", "0.0.0.0", "--port", DEFAULT_PORTS["ground_api"]],
            ROOT,
            env,
            "ground",
        ),
        start_process(
            ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", DEFAULT_PORTS["ground_web"]],
            WEB_DIR,
            env,
            "web",
        ),
    ]

def edge_env(peer_ip: str) -> dict[str, str]:
    env = os.environ.copy()
    env["HOUSTON_EDGE_MODE"] = "real"
    env["HOUSTON_GROUND_WS_URL"] = f"ws://{peer_ip}:{DEFAULT_PORTS['ground_api']}/ws/edge"
    env["HOUSTON_GROUND_HTTP_URL"] = f"http://{peer_ip}:{DEFAULT_PORTS['ground_api']}"
    env["HOUSTON_DEVICE_ID"] = f"edge-{socket.gethostname().lower()}"
    env["HOUSTON_ADCS_SOURCE"] = env.get("HOUSTON_ADCS_SOURCE", "mock")
    return env

def edge_processes(env: dict[str, str]) -> list[subprocess.Popen[str]]:
    cubesat_dir = find_cubesat_dir()
    processes = []
    if cubesat_dir is not None:
        env["HOUSTON_CAPTURE_SOURCE"] = "bridge"
        env["HOUSTON_BRIDGE_WATCH_DIR"] = str(cubesat_dir)
        processes.append(start_process([sys.executable, "main.py"], cubesat_dir, os.environ.copy(), "legacy"))
        print(f"Edge mode : real")
        print(f"Capture   : bridge ({cubesat_dir})")
        print("Camera    : existing cubesat/main.py")
        print("ADCS      : legacy cubesat placeholder")
    else:
        env["HOUSTON_CAPTURE_SOURCE"] = "picamera"
        print("Edge mode : real")
        print("Capture   : picamera")
        print("Camera    : direct Houston edge capture")
        print("ADCS      : unavailable unless HOUSTON_ADCS_COMMAND is configured")
        print("No cubesat/main.py found next to Houston. Starting direct picamera mode.")
    processes.append(
        start_process(
            ["uv", "run", "--package", "houston-edge", "uvicorn", "houston_edge.main:app", "--host", "0.0.0.0", "--port", DEFAULT_PORTS["edge_api"]],
            ROOT,
            env,
            "edge",
        )
    )
    return processes


def find_cubesat_dir() -> Path | None:
    if os.environ.get("HOUSTON_CUBESAT_DIR"):
        path = Path(os.environ["HOUSTON_CUBESAT_DIR"]).expanduser()
        return path if (path / "main.py").exists() else None
    sibling = ROOT.parent / "cubesat"
    return sibling if (sibling / "main.py").exists() else None


def ensure_edge_dependencies() -> None:
    cubesat_dir = find_cubesat_dir()
    if cubesat_dir is not None:
        ensure_python_module(sys.executable, "numpy", ["-m", "pip", "install", "numpy"])
        ensure_python_module(sys.executable, "cv2", ["-m", "pip", "install", "opencv-python-headless"])
        ensure_python_module(sys.executable, "picamera2", ["-m", "pip", "install", "picamera2"], required=False)
        return
    venv_python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if venv_python.exists():
        ensure_python_module(str(venv_python), "picamera2", ["-m", "pip", "install", "picamera2"], required=False)


def ensure_python_module(python_exe: str, module: str, install_args: list[str], required: bool = True) -> None:
    check = subprocess.run([python_exe, "-c", f"import {module}"], capture_output=True)
    if check.returncode == 0:
        return
    try:
        run_step([python_exe, *install_args], ROOT, f"Installing {module}")
    except subprocess.CalledProcessError:
        if required:
            raise
        print(f"Warning: unable to install optional dependency {module}.")


def run_step(command: list[str], cwd: Path, label: str) -> None:
    command = resolved_command(command)
    print(f"{label}: {' '.join(shlex.quote(part) for part in command)}")
    subprocess.run(command, cwd=cwd, check=True)


def start_process(command: list[str], cwd: Path, env: dict[str, str], label: str) -> subprocess.Popen[str]:
    command = resolved_command(command)
    print(f"Starting {label}: {' '.join(shlex.quote(part) for part in command)}")
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    threading.Thread(target=stream_output, args=(label, process.stdout), daemon=True).start()
    return process


def stream_output(label: str, output) -> None:
    for line in output:
        print(f"[{label}] {line.rstrip()}")


def wait_forever(processes: list[subprocess.Popen[str]]) -> int:
    def shutdown(*_args) -> None:
        for process in processes:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    while True:
        for process in processes:
            code = process.poll()
            if code is not None:
                shutdown()
                return code
        time.sleep(0.5)


def resolved_command(command: list[str]) -> list[str]:
    executable = shutil.which(command[0])
    if executable:
        return [executable, *command[1:]]
    return command


if __name__ == "__main__":
    raise SystemExit(main())
