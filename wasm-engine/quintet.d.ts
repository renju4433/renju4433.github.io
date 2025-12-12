/* tslint:disable */
/* eslint-disable */
/**
* @param {number} mode
* @param {number} limit
* @param {Uint8Array} blacks
* @param {Uint8Array} whites
* @param {boolean} black
* @param {number} threat_limit
* @returns {Uint8Array | undefined}
*/
export function solve(mode: number, limit: number, blacks: Uint8Array, whites: Uint8Array, black: boolean, threat_limit: number): Uint8Array | undefined;
/**
* @param {Uint8Array} blacks
* @param {Uint8Array} whites
* @param {boolean} black
* @param {number} limit
* @returns {Uint8Array | undefined}
*/
export function solve_vcf(blacks: Uint8Array, whites: Uint8Array, black: boolean, limit: number): Uint8Array | undefined;
/**
* @param {Uint8Array} blacks
* @param {Uint8Array} whites
* @param {boolean} black
* @param {number} limit
* @returns {Uint8Array | undefined}
*/
export function solve_vct(blacks: Uint8Array, whites: Uint8Array, black: boolean, limit: number): Uint8Array | undefined;
/**
* @param {Uint8Array} blacks
* @param {Uint8Array} whites
* @param {boolean} black
* @param {number} limit
* @returns {Uint8Array | undefined}
*/
export function solve_vct_dfpn(blacks: Uint8Array, whites: Uint8Array, black: boolean, limit: number): Uint8Array | undefined;
/**
* @param {number} x
* @param {number} y
* @returns {number}
*/
export function encode_xy(x: number, y: number): number;
/**
* @param {number} code
* @returns {number}
*/
export function decode_x(code: number): number;
/**
* @param {number} code
* @returns {number}
*/
export function decode_y(code: number): number;
/**
* @param {Uint8Array} blacks
* @param {Uint8Array} whites
* @param {boolean} is_black_turn
* @param {number} max_depth
* @param {number} time_limit_ms
* @returns {any}
*/
export function engine_search(blacks: Uint8Array, whites: Uint8Array, is_black_turn: boolean, max_depth: number, time_limit_ms: number): any;
/**
* @param {Uint8Array} blacks
* @param {Uint8Array} whites
* @param {boolean} is_black_turn
* @returns {number}
*/
export function engine_evaluate(blacks: Uint8Array, whites: Uint8Array, is_black_turn: boolean): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly solve: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly solve_vcf: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly solve_vct: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly solve_vct_dfpn: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly encode_xy: (a: number, b: number) => number;
  readonly decode_x: (a: number) => number;
  readonly decode_y: (a: number) => number;
  readonly engine_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly engine_evaluate: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
