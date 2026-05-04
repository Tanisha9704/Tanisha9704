// Re-export the canonical engine from the shared package so server-side modules
// can import from a single, stable path. Game logic is universal — same rules
// run on the server (authoritative) and in the browser (AI mode).
export {
  GameError,
  acceptWildDrawFour,
  callUno,
  catchUno,
  challengeWildDrawFour,
  createGame,
  drawCard,
  playCard,
  projectForPlayer,
  resolveDrawnCard,
  scoreForWinner,
} from '@uno/shared';
export type { ActionResult, CreateGameOptions } from '@uno/shared';
