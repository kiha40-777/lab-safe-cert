import { isKnownRole } from "@/lib/certification";
import type { MemberDto } from "@/lib/types";
import type { AppContext } from "../context";
import type { Db, Row } from "../db/types";
import { badRequest, conflict, notFound } from "../http/errors";

export interface MemberRow extends Row {
  id: string;
  name: string;
  name_key: string;
  role: string;
  self_registered: number;
  created_at: string;
  updated_at: string;
}

const MAX_NAME_CHARS = 80;
const MAX_BULK_NAMES = 500;

export function toMemberDto(row: MemberRow): MemberDto {
  return { id: row.id, name: row.name, role: row.role, selfRegistered: row.self_registered === 1 };
}

/** Display form of a name: composed Unicode, single spaces, no leading/trailing space. */
export function cleanName(input: string): string {
  return input.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Comparison key: two names that differ only in case, width (full/half-width),
 * or spacing ("山田 太郎" / "山田太郎", "ann lee" / "Ann Lee") count as the same person.
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function isValidName(name: string): boolean {
  const length = [...name].length;
  return length >= 1 && length <= MAX_NAME_CHARS && !/\p{Cc}/u.test(name);
}

function assertValidName(name: string): void {
  if (!isValidName(name)) throw badRequest("invalidName", { max: MAX_NAME_CHARS });
}

function assertKnownRole(ctx: AppContext, role: string): void {
  if (!isKnownRole(ctx.config, role)) throw badRequest("invalidRole");
}

const COLUMNS = "id, name, name_key, role, self_registered, created_at, updated_at";

export async function listMemberRows(db: Db): Promise<MemberRow[]> {
  return db.all<MemberRow>(`SELECT ${COLUMNS} FROM members ORDER BY created_at, id`);
}

export async function findMemberRow(db: Db, id: string): Promise<MemberRow | undefined> {
  return db.get<MemberRow>(`SELECT ${COLUMNS} FROM members WHERE id = ?`, [id]);
}

export async function requireMemberRow(db: Db, id: string): Promise<MemberRow> {
  const row = await findMemberRow(db, id);
  if (!row) throw notFound("memberNotFound");
  return row;
}

async function insertMember(
  ctx: AppContext,
  tx: Db,
  name: string,
  role: string,
  selfRegistered: boolean,
): Promise<MemberRow> {
  const row: MemberRow = {
    id: ctx.rng.uuid(),
    name,
    name_key: nameKey(name),
    role,
    self_registered: selfRegistered ? 1 : 0,
    created_at: ctx.now().toISOString(),
    updated_at: ctx.now().toISOString(),
  };
  await tx.run(`INSERT INTO members (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    row.id,
    row.name,
    row.name_key,
    row.role,
    row.self_registered,
    row.created_at,
    row.updated_at,
  ]);
  return row;
}

export async function createMember(
  ctx: AppContext,
  input: { name: string; role?: string; selfRegistered?: boolean },
): Promise<MemberRow> {
  const name = cleanName(input.name);
  assertValidName(name);
  const role = input.role ?? ctx.config.defaultRole;
  assertKnownRole(ctx, role);
  return ctx.db.transaction(async (tx) => {
    const taken = await tx.get("SELECT id FROM members WHERE name_key = ?", [nameKey(name)]);
    if (taken) throw conflict("memberNameExists");
    return insertMember(ctx, tx, name, role, input.selfRegistered === true);
  });
}

export interface BulkResult {
  created: MemberRow[];
  skipped: { name: string; reason: "exists" | "invalid" | "duplicate" }[];
}

/** Adds many people at once (one name per line). Existing, invalid and repeated names are skipped and reported. */
export async function createMembersBulk(
  ctx: AppContext,
  names: string[],
  role: string,
): Promise<BulkResult> {
  assertKnownRole(ctx, role);
  if (names.length > MAX_BULK_NAMES) throw badRequest("tooManyNames", { max: MAX_BULK_NAMES });
  return ctx.db.transaction(async (tx) => {
    const result: BulkResult = { created: [], skipped: [] };
    const seen = new Set<string>();
    for (const raw of names) {
      const name = cleanName(raw);
      if (name === "") continue;
      if (!isValidName(name)) {
        result.skipped.push({ name: name.slice(0, MAX_NAME_CHARS), reason: "invalid" });
        continue;
      }
      const key = nameKey(name);
      if (seen.has(key)) {
        result.skipped.push({ name, reason: "duplicate" });
        continue;
      }
      seen.add(key);
      if (await tx.get("SELECT id FROM members WHERE name_key = ?", [key])) {
        result.skipped.push({ name, reason: "exists" });
        continue;
      }
      result.created.push(await insertMember(ctx, tx, name, role, false));
    }
    return result;
  });
}

/** Admin edit. Saving also clears the "self-registered" mark: the admin has looked at this person. */
export async function updateMember(
  ctx: AppContext,
  id: string,
  patch: { name?: string; role?: string },
): Promise<MemberRow> {
  if (patch.role !== undefined) assertKnownRole(ctx, patch.role);
  return ctx.db.transaction(async (tx) => {
    const current = await requireMemberRow(tx, id);
    let name = current.name;
    let key = current.name_key;
    if (patch.name !== undefined) {
      name = cleanName(patch.name);
      assertValidName(name);
      key = nameKey(name);
      const clash = await tx.get("SELECT id FROM members WHERE name_key = ? AND id <> ?", [key, id]);
      if (clash) throw conflict("memberNameExists");
    }
    const role = patch.role ?? current.role;
    const updatedAt = ctx.now().toISOString();
    await tx.run(
      "UPDATE members SET name = ?, name_key = ?, role = ?, self_registered = 0, updated_at = ? WHERE id = ?",
      [name, key, role, updatedAt, id],
    );
    return { ...current, name, name_key: key, role, self_registered: 0, updated_at: updatedAt };
  });
}

export async function deleteMember(ctx: AppContext, id: string): Promise<void> {
  const { changes } = await ctx.db.run("DELETE FROM members WHERE id = ?", [id]);
  if (changes === 0) throw notFound("memberNotFound");
}
