import { getMetadataArgsStorage } from "typeorm";

/**
 * TypeORM rejects PostgreSQL-only column types (enum, uuid, decimal, timestamp)
 * on better-sqlite3. Remap them in-memory for e2e tests without touching
 * production entity source files.
 */
export function patchTypeOrmColumnsForSqlite(): void {
  const storage = getMetadataArgsStorage();

  for (const column of storage.columns) {
    const options = column.options;
    if (!options) {
      continue;
    }

    if (options.type === "enum") {
      options.type = "simple-enum";
    }

    if (options.type === "uuid") {
      options.type = "varchar";
      options.length = options.length ?? 36;
    }

    if (options.type === "decimal" || options.type === "numeric") {
      options.type = "real";
    }

    if (options.type === "timestamp" || options.type === "timestamptz") {
      options.type = "datetime";
    }
  }
}
