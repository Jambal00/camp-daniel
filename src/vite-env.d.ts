/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "local" = sample data in this browser with the "Viewing as" bar (npm run dev:demo). Otherwise Firebase. */
  readonly VITE_DATA?: string;
}

/** Short id of this build (git commit on GitHub). Set in vite.config.ts. */
declare const __BUILD__: string;
