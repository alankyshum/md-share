// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  /** Server-injected metadata for KV-backed short URLs (set by /functions/s/[key].ts).
   *  Absent for fragment-URL shares. */
  interface MdShareMeta {
    key: string;
    /** ISO 8601 expiration timestamp (sliding — refreshed on each access). */
    expiresAt: string;
    /** TTL behaviour. 'sliding' = renews on every read; 'fixed' = absolute. */
    ttlMode: 'sliding' | 'fixed';
    /** TTL window in seconds. */
    ttlSeconds: number;
    /** Stored markdown size in bytes. */
    sizeBytes: number;
  }

  interface Window {
    __MD_INLINE?: string;
    __MD_META?: MdShareMeta;
  }
}

export {};
