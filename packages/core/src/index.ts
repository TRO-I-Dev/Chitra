/**
 * @chitra/core — shared types, schemas, and IPC contracts.
 *
 * This package is consumed by both the Electron main process and the renderer.
 * It MUST stay free of Node-only or DOM-only APIs so it can run in both worlds.
 */

export * from "./schemas.js";
export * from "./ipc.js";
export const APP_NAME = "Chitra";
export const PROJECT_FILE_EXT = ".chitra";
export const PROJECT_SCHEMA_VERSION = 1;
