import { describe, it, expect } from 'vitest';
import { parseJsonResponse } from '../../../../src/infra/ai/parseJsonResponse.js';

describe('parseJsonResponse', () => {
  it('should parse simple JSON', () => {
    const result = parseJsonResponse<{ name: string }>('{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  it('should parse JSON with markdown code fence', () => {
    const result = parseJsonResponse<{ value: number }>('```json\n{"value": 42}\n```');
    expect(result).toEqual({ value: 42 });
  });

  it('should parse JSON with generic code fence', () => {
    const result = parseJsonResponse<{ data: string }>('```\n{"data": "hello"}\n```');
    expect(result).toEqual({ data: 'hello' });
  });

  it('should handle trailing commas', () => {
    const result = parseJsonResponse<{ items: string[] }>('{"items": ["a", "b",]}');
    expect(result).toEqual({ items: ['a', 'b'] });
  });

  it('should handle whitespace around JSON', () => {
    const result = parseJsonResponse<{ key: string }>('  \n  {"key": "value"}  \n  ');
    expect(result).toEqual({ key: 'value' });
  });

  it('should extract JSON object from text with extra content', () => {
    const result = parseJsonResponse<{ result: boolean }>(
      'Here is the result: {"result": true} More text'
    );
    expect(result).toEqual({ result: true });
  });

  it('should extract JSON array from text', () => {
    const result = parseJsonResponse<number[]>('The array is: [1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('should parse nested objects', () => {
    const input = '{"outer": {"inner": {"value": 123}}}';
    const result = parseJsonResponse<{ outer: { inner: { value: number } } }>(input);
    expect(result).toEqual({ outer: { inner: { value: 123 } } });
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseJsonResponse('not valid json at all')).toThrow(
      'Failed to parse JSON response'
    );
  });

  it('should handle case-insensitive code fence language', () => {
    const result = parseJsonResponse<{ test: string }>('```JSON\n{"test": "value"}\n```');
    expect(result).toEqual({ test: 'value' });
  });
});
