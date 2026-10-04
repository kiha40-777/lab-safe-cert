import { badRequest } from "./errors";

// Small helpers to read fields of a request body. Every failure is reported as
// { error: { code: "invalidInput", params: { field } } } so the client can tell which field was wrong.

export type Obj = Record<string, unknown>;

const invalid = (field: string) => badRequest("invalidInput", { field });

export function object(value: unknown, field = "body"): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid(field);
  return value as Obj;
}

export function string(obj: Obj, field: string, max = 1000, min = 0): string {
  const value = obj[field];
  if (typeof value !== "string" || value.length > max || value.length < min) throw invalid(field);
  return value;
}

export function optionalString(obj: Obj, field: string, max = 1000): string | undefined {
  return obj[field] === undefined ? undefined : string(obj, field, max);
}

export function integer(obj: Obj, field: string, min: number, max: number): number {
  const value = obj[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw invalid(field);
  return value;
}

export function optionalBoolean(obj: Obj, field: string): boolean | undefined {
  const value = obj[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw invalid(field);
  return value;
}

export function oneOf<T extends string>(obj: Obj, field: string, allowed: readonly T[]): T {
  const value = obj[field];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw invalid(field);
  return value as T;
}

export function stringList(obj: Obj, field: string, maxItems: number, maxLength: number): string[] {
  const value = obj[field];
  if (!Array.isArray(value) || value.length > maxItems) throw invalid(field);
  return value.map((item: unknown) => {
    if (typeof item !== "string" || item.length > maxLength) throw invalid(field);
    return item;
  });
}
