import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { env } from "../config.js";
import type { ProviderProfile, TutorSession, TutorState } from "../types.js";

type SqliteStatement = { run(...values: unknown[]): unknown; get(...values: unknown[]): unknown; all(...values: unknown[]): unknown[] };
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement };
const require = createRequire(import.meta.url);
// Vite 5 does not recognise node:sqlite as a builtin during Vitest transforms.
// Runtime Node 22.13+ resolves this native module normally.
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabase };

type SessionRow = {
  id: string;
  state_json: string;
  created_at: string;
  updated_at: string;
  expires_at: number;
};

type ProviderProfileRow = {
  id: string;
  profile_json: string;
  created_at: string;
  updated_at: string;
};

/**
 * Anonymous, single-device session persistence. No user identity, cookies, or
 * account data is stored. A review extends the expiry, and expired context is
 * deleted before every access and by the scheduled cleanup task.
 */
export class SessionStore {
  private readonly database: SqliteDatabase;
  private readonly ttlMs: number;

  constructor(databasePath = env.SESSION_DB_PATH, ttlMs = env.SESSION_TTL_MINUTES * 60 * 1000) {
    this.ttlMs = ttlMs;
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS tutor_sessions (
        id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS tutor_sessions_expiry_idx ON tutor_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS api_quotas (
        bucket TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS api_quotas_expiry_idx ON api_quotas(expires_at);
      CREATE TABLE IF NOT EXISTS provider_profiles (
        id TEXT PRIMARY KEY,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  private removeExpired(): void {
    this.database.prepare("DELETE FROM tutor_sessions WHERE expires_at <= ?").run(Date.now());
  }

  private fromRow(row: SessionRow | undefined): TutorSession | undefined {
    if (!row) return undefined;
    const state = JSON.parse(row.state_json) as TutorState;
    // Existing anonymous sessions predate the chat-turn model. Preserve their
    // mentor feedback without claiming to know the learner text that produced it.
    if (!state.turns) {
      state.turns = (state.feedbackHistory ?? []).map((mentorMessage, index) => ({
        id: `legacy-${index}`,
        learnerMessage: "Previous learner approach unavailable.",
        mentorMessage,
        verdict: index === (state.feedbackHistory?.length ?? 0) - 1 && state.isSolved ? "solved" : "keep_iterating",
        createdAt: row.updated_at
      }));
    }
    return { id: row.id, state, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private profileFromRow(row: ProviderProfileRow | undefined): ProviderProfile | undefined {
    if (!row) return undefined;
    const profile = JSON.parse(row.profile_json) as ProviderProfile;
    return { ...profile, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  create(state: TutorState): TutorSession {
    this.removeExpired();
    const now = new Date().toISOString();
    const session: TutorSession = { id: randomUUID(), state, createdAt: now, updatedAt: now };
    this.database.prepare("INSERT INTO tutor_sessions (id, state_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(session.id, JSON.stringify(state), now, now, Date.now() + this.ttlMs);
    return session;
  }

  get(id: string): TutorSession | undefined {
    this.removeExpired();
    const row = this.database.prepare("SELECT id, state_json, created_at, updated_at, expires_at FROM tutor_sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return this.fromRow(row);
  }

  update(id: string, state: TutorState): TutorSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    const updated: TutorSession = { ...session, state, updatedAt: new Date().toISOString() };
    this.database.prepare("UPDATE tutor_sessions SET state_json = ?, updated_at = ?, expires_at = ? WHERE id = ?")
      .run(JSON.stringify(state), updated.updatedAt, Date.now() + this.ttlMs, id);
    return updated;
  }

  cleanup(): void { this.removeExpired(); }

  listProviderProfiles(): ProviderProfile[] {
    return this.database.prepare("SELECT id, profile_json, created_at, updated_at FROM provider_profiles ORDER BY updated_at DESC")
      .all()
      .map((row) => this.profileFromRow(row as ProviderProfileRow))
      .filter((profile): profile is ProviderProfile => Boolean(profile));
  }

  getProviderProfile(id: string): ProviderProfile | undefined {
    const row = this.database.prepare("SELECT id, profile_json, created_at, updated_at FROM provider_profiles WHERE id = ?").get(id) as ProviderProfileRow | undefined;
    return this.profileFromRow(row);
  }

  upsertProviderProfile(input: Omit<ProviderProfile, "createdAt" | "updatedAt">): ProviderProfile {
    const existing = this.getProviderProfile(input.id);
    const now = new Date().toISOString();
    const profile: ProviderProfile = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.database.prepare(`
      INSERT INTO provider_profiles (id, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
    `).run(profile.id, JSON.stringify(profile), profile.createdAt, profile.updatedAt);
    return profile;
  }

  deleteProviderProfile(id: string): boolean {
    const result = this.database.prepare("DELETE FROM provider_profiles WHERE id = ?").run(id) as { changes?: number };
    return (result.changes ?? 0) > 0;
  }

  /**
   * Durable fixed-window counter used for provider-wide quotas. It is stored
   * alongside anonymous sessions so container restarts cannot reset an API key's
   * daily allowance.
   */
  consumeQuota(bucket: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.database.prepare("DELETE FROM api_quotas WHERE expires_at <= ?").run(now);
    const row = this.database.prepare("SELECT count, expires_at FROM api_quotas WHERE bucket = ?").get(bucket) as { count: number; expires_at: number } | undefined;
    if (!row) {
      this.database.prepare("INSERT INTO api_quotas (bucket, count, expires_at) VALUES (?, ?, ?)").run(bucket, 1, now + windowMs);
      return true;
    }
    if (row.count >= limit) return false;
    this.database.prepare("UPDATE api_quotas SET count = count + 1 WHERE bucket = ?").run(bucket);
    return true;
  }
}
