/**
 * Déclarations pour le banc d'essai base de données (`harness.mjs`).
 * Le banc reste en JavaScript — il s'exécute hors du bundle de l'app — mais les
 * tests qui l'utilisent sont en TypeScript strict.
 */

export type Row = Record<string, unknown>;

export interface QueryResult<T extends Row = Row> {
  rows: T[];
  affectedRows?: number;
  rowCount?: number;
  command?: string;
}

export interface TestDatabase {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

export declare const projectRoot: string;

export declare function createTestDatabase(options?: { seed?: boolean }): Promise<TestDatabase>;

export declare function migrationFiles(): Promise<string[]>;

/**
 * Exécute `fn` avec les privilèges d'un utilisateur donné (`null` = visiteur
 * anonyme), en simulant ce que fait PostgREST.
 */
export declare function actingAs<T>(
  db: TestDatabase,
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T>;

export declare function assertRlsApplies(db: TestDatabase): Promise<{
  role: string;
  uid: string;
  bypasses: boolean;
}>;
