/**
 * Packed replay frames - the implementation lives in the shared contract
 * package (packages/api-contract/src/replay.ts) so the server and the
 * Matchzone client encode/decode with the same code. Re-exported here
 * under the server's historical names.
 */
export {
  packFrames,
  unpackFrames,
  isPacked,
  frameCount,
  type MatchFrames,
  type PackedFrames as IPackedFrames,
  type PackedRosterEntry as IPackedRosterEntry,
  type PackedStatusChange,
} from '@repo/api-contract';
