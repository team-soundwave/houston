function browserOrigin(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }
  return window.location.origin;
}

export function groundHttpBase(): string {
  return import.meta.env.VITE_GROUND_HTTP_BASE ?? browserOrigin();
}

export function groundWsBase(): string {
  if (import.meta.env.VITE_GROUND_WS_URL) {
    return import.meta.env.VITE_GROUND_WS_URL;
  }
  if (typeof window === "undefined") {
    return "ws://127.0.0.1:8000/ws/ui";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/ui`;
}
