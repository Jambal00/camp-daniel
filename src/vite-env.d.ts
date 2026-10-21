/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "local" = sample data in this browser with the "Viewing as" bar (npm run dev:demo). Otherwise Firebase. */
  readonly VITE_DATA?: string;
}
