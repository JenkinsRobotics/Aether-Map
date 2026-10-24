import { withRequestTimeout } from "./request-timeout";
import { documentRequest } from "@aether/session/documents";
import type { MediaRef } from "./document";
import { SaveError } from '@aether/session/autosave';

/** True when served by the Aether Studio host rather than `vite dev`. */
export const hosted = location.pathname.startsWith("/map/");

async function post<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new SaveError(data.error ?? "The request could not be completed.", response.status);
  return data as T;
}

export interface StoredFile {
  id: string;
  name: string;
  revision: number;
  writable: boolean;
  branch?: string;
  branch_id?: string;
  branch_label?: string;
  data_base64?: string;
}

export const library = {
  read: (id: string, branch = "Main") => documentRequest<StoredFile>("map", "read", { app: "map", id, branch }),
  rename: (id: string, revision: number, name: string) => documentRequest<StoredFile>("map", "rename", { app: "map", id, expected_revision: revision, name }),

  create: (name: string, bytes: Uint8Array, scope = "personal", parent?: string) =>
    documentRequest<StoredFile>("map", "create", {
      app: "map",
      kind: "file",
      name,
      scope,
      parent: parent ?? null,
      data_base64: toBase64(bytes),
    }),

  save: (id: string, expectedRevision: number, bytes: Uint8Array, branch = "Main") =>
    documentRequest<StoredFile>("map", "save", {
      app: "map",
      id,
      expected_revision: expectedRevision,
      branch,
      data_base64: toBase64(bytes),
    }),
};

/** Media bytes bypass the library: it requires JSON and caps bodies at 9 MB. */
export function mediaUrl(media: Pick<MediaRef, "file">): string {
  return "/api/map/media/" + media.file;
}

export async function uploadMedia(file: File, storedName: string): Promise<void> {
  const response = await fetch("/api/map/media/" + storedName, {
    method: "PUT",
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "The media could not be uploaded.");
  }
}

export async function deleteMedia(storedName: string): Promise<boolean> {
  const response = await fetch("/api/map/media/" + storedName, { method: "DELETE" });
  if (response.ok) return true;
  // 409 means a saved show still uses it — expected, and not an error here.
  if (response.status === 409) return false;
  const data = await response.json().catch(() => ({}));
  throw new Error(data.error ?? "The media could not be deleted.");
}

export function mediaExtension(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop()! : "";
  if (fromName) return fromName.toLowerCase();
  return file.type.startsWith("audio") ? "mp3" : file.type.startsWith("video") ? "mp4" : "png";
}

function toBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) blows the call stack on a real file.
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export interface MapDevice {
  /** Omitted by older hosts, whose devices are all standalone players. */
  kind?: "player" | "live_receiver";
  id: string;
  name: string;
  mine: boolean;
  claimed: boolean;
  /** Unix seconds of the device's last check-in. */
  seen: number;
  document: string | null;
}

interface CastReply { session_id: string; answer: RTCSessionDescriptionInit | null; state: string }
export const devices = {
  castStart: (device_id: string, sdp: string) => post<CastReply>('/api/map/devices/cast-start', { device_id, sdp }, AbortSignal.timeout(6000)),
  castPoll: (device_id: string, session_id: string, signal?: AbortSignal) => withRequestTimeout(6000, request => post<CastReply>('/api/map/devices/cast-poll', { device_id, session_id }, request), signal),
  castStop: (device_id: string, session_id: string) => post<{ stopped: boolean }>('/api/map/devices/cast-stop', { device_id, session_id }, AbortSignal.timeout(6000)),
  list: () =>
    post<{ devices: MapDevice[] }>("/api/map/devices/list", {}).then((r) => r.devices),
  claim: (code: string) => withRequestTimeout(10000, signal => post<{ device_id: string }>("/api/map/devices/claim", { code }, signal)),
  rename: (device_id: string, name: string) =>
    post<{ device_id: string }>("/api/map/devices/rename", { device_id, name }),
  assign: (device_id: string, document: string | null) =>
    post<{ device_id: string }>("/api/map/devices/assign", { device_id, document }),
  forget: (device_id: string) =>
    post<{ device_id: string }>("/api/map/devices/forget", { device_id }),
};

/** The one-liner a networked device runs, pointed at whatever host serves this page. */
export function installerURL(): string {
  return `${location.origin}/api/map/install.sh`;
}

/**
 * The installer to download and carry to a Pi on a USB stick. It embeds the
 * player. Missing operating-system packages still require internet during installation.
 */
export function installerDownloadURL(): string {
  return `${location.origin}/api/map/aether-projector-setup.sh`;
}

/** A verified optional host artifact, not a promise inferred from app version. */
export function androidReceiverAvailable(): Promise<boolean> {
  return withRequestTimeout(4000, async signal => {
    const response = await fetch('/api/map/ping', { signal, cache: 'no-store' });
    if (!response.ok) return false;
    const data = await response.json() as { androidReceiver?: boolean };
    return data.androidReceiver === true;
  });
}
export function androidReceiverDownloadURL(): string {
  return `${location.origin}/api/map/aether-map-receiver.apk`;
}
