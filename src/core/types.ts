/**
 * Supported schema type literals.
 * Append "?" to make the variable optional.
 *
 * Future extension: add 'url' | 'email' | 'port' here and in parseSingleValue().
 */
export type BaseTypeString = 'string' | 'number' | 'boolean';
export type SchemaTypeString = BaseTypeString | `${BaseTypeString}?`;

/**
 * Rich schema descriptor — alternative to plain SchemaTypeString.
 */
export interface SchemaDescriptor {
  type: SchemaTypeString;
  /**
   * Default value used when the env variable is absent.
   * Only valid for optional types ("string?", "number?", "boolean?").
   */
  default?: string | number | boolean;
  /**
   * When true, this variable is ALWAYS redacted — even on direct property
   * access (env.API_KEY). Use for the most sensitive credentials.
   * @default false
   */
  secret?: boolean;
}

/** A schema entry is either a simple type string or a rich descriptor. */
export type SchemaEntry = SchemaTypeString | SchemaDescriptor;

/** The schema object the user passes to createEnv. */
export type EnvSchema = Record<string, SchemaEntry>;

/** Resolved descriptor — all fields fully typed. */
export type ResolvedDescriptor = Required<Pick<SchemaDescriptor, 'type'>> &
  Pick<SchemaDescriptor, 'default' | 'secret'>;

/** Map a single SchemaTypeString to its TypeScript type. */
type InferSingle<T extends SchemaTypeString> =
  T extends 'string'   ? string :
  T extends 'number'   ? number :
  T extends 'boolean'  ? boolean :
  T extends 'string?'  ? string | undefined :
  T extends 'number?'  ? number | undefined :
  T extends 'boolean?' ? boolean | undefined :
  never;

/** Resolve the type string from a SchemaEntry. */
type EntryTypeStr<E extends SchemaEntry> =
  E extends SchemaTypeString ? E :
  E extends SchemaDescriptor ? E['type'] :
  never;

/**
 * Maps a full schema to its TypeScript type.
 *
 * @example
 * type Env = InferEnv<{ DATABASE_URL: 'string'; PORT: { type: 'number?'; default: 3000 } }>
 * // => { DATABASE_URL: string; PORT: number | undefined }
 */
export type InferEnv<S extends EnvSchema> = {
  readonly [K in keyof S]: InferSingle<EntryTypeStr<S[K]>>;
};

/** Options accepted by createEnv. */
export interface CreateEnvOptions {
  /**
   * Enable Proxy-based redaction. When true, the returned env object intercepts
   * toJSON, util.inspect.custom, toString, and Symbol.toPrimitive to return
   * ***REDACTED*** instead of real values in serialization contexts.
   * Variables marked secret: true are always redacted even on direct access.
   * @default false
   */
  redact?: boolean;

  /**
   * Parse and load a .env file before validation.
   * process.env values take precedence over .env file values.
   * @default false
   */
  loadDotEnv?: boolean;

  /**
   * Path to the .env file. Only used when loadDotEnv is true.
   * @default '.env'
   */
  dotEnvPath?: string;

  /**
   * Custom env source — overrides both process.env and loadDotEnv.
   * Use in tests and non-Node runtimes (Cloudflare Workers, Deno, Bun).
   */
  env?: Record<string, string | undefined>;
}
