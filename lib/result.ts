/**
 * Result<T, E> — explicit success/failure without exceptions.
 * Use for operations that can fail (e.g. API, parsing).
 */

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T, E = Error>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<T, E = Error>(error: E): Result<T, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { readonly ok: true; readonly value: T } {
  return r.ok === true;
}

export function isErr<T, E>(r: Result<T, E>): r is { readonly ok: false; readonly error: E } {
  return r.ok === false;
}

export function unwrapOr<T, E>(r: Result<T, E>, defaultValue: T): T {
  return r.ok ? r.value : defaultValue;
}

export function unwrapOrElse<T, E>(r: Result<T, E>, fn: (e: E) => T): T {
  return r.ok ? r.value : fn(r.error);
}

export function mapResult<T, U, E>(r: Result<T, E>, fn: (t: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

export function mapError<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}
