import DatabaseConstructor from "better-sqlite3-multiple-ciphers";

export type SqliteConnection = InstanceType<typeof DatabaseConstructor>;
