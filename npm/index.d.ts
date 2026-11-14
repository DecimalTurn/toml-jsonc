export declare class ConversionError extends Error {
  /** Python exception class that caused the failure, e.g. `tomlkit.exceptions.UnexpectedCharError`. */
  readonly type?: string;
  constructor(message: string, options?: { cause?: unknown; type?: string });
}

/** @deprecated Use {@link ConversionError}. */
export declare const TomlJsoncError: typeof ConversionError;

/** Load the Python runtime ahead of the first conversion. */
export declare function warmup(): Promise<void>;

/** Convert a TOML document to JSONC, preserving comments and key order. */
export declare function tomlToJsonc(toml: string): Promise<string>;

/** Convert a JSONC document to TOML, preserving comments. */
export declare function jsoncToToml(jsonc: string): Promise<string>;

export default tomlToJsonc;
