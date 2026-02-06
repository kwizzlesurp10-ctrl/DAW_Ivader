import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrapOr,
  unwrapOrElse,
  mapResult,
  mapError,
} from './result';

describe('result', () => {
  describe('ok / err', () => {
    it('ok creates success result', () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      expect(r.ok && r.value).toBe(42);
    });
    it('err creates failure result', () => {
      const e = new Error('fail');
      const r = err(e);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toBe(e);
    });
  });

  describe('isOk / isErr', () => {
    it('isOk returns true for ok', () => {
      expect(isOk(ok(1))).toBe(true);
      expect(isOk(err(new Error()))).toBe(false);
    });
    it('isErr returns true for err', () => {
      expect(isErr(err(new Error()))).toBe(true);
      expect(isErr(ok(1))).toBe(false);
    });
  });

  describe('unwrapOr', () => {
    it('returns value for ok', () => {
      expect(unwrapOr(ok(10), 0)).toBe(10);
    });
    it('returns default for err', () => {
      expect(unwrapOr(err(new Error()), 0)).toBe(0);
    });
  });

  describe('unwrapOrElse', () => {
    it('returns value for ok', () => {
      expect(unwrapOrElse(ok(10), () => 0)).toBe(10);
    });
    it('returns fn(error) for err', () => {
      expect(unwrapOrElse(err(new Error('x')), (e) => (e as Error).message)).toBe('x');
    });
  });

  describe('mapResult', () => {
    it('maps value for ok', () => {
      const r = mapResult(ok(5), (n) => n * 2);
      expect(isOk(r) && r.value).toBe(10);
    });
    it('passes through err', () => {
      const e = new Error('x');
      const r = mapResult(err<number, Error>(e), (n) => n * 2);
      expect(isErr(r) && r.error).toBe(e);
    });
  });

  describe('mapError', () => {
    it('passes through ok', () => {
      const r = mapError(ok(1), (e: Error) => e.message);
      expect(isOk(r) && r.value).toBe(1);
    });
    it('maps error for err', () => {
      const r = mapError(err<number, Error>(new Error('old')), (e) => e.message);
      expect(isErr(r) && r.error).toBe('old');
    });
  });
});
