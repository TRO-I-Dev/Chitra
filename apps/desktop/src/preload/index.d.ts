import type { ChitraApi } from "./index.js";

declare global {
  interface Window {
    chitra: ChitraApi;
  }
}

export {};
