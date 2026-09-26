/** Discord snowflake IDs are handled as decimal strings (never JavaScript numbers). */
const SNOWFLAKE = /^[0-9]{5,25}$/;

export function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}
