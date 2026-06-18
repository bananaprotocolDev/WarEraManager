import Database from "better-sqlite3";

export interface Calibration {
  factor: number;
  samples: number;
  updatedAt: number;
}

export interface CalibrationStore {
  get(): Calibration | null;
  set(c: Calibration): void;
}

export class SqliteCalibrationStore implements CalibrationStore {
  private db: Database.Database;

  constructor(path = "data/prices.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS calibration (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        factor REAL NOT NULL,
        samples INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );`,
    );
  }

  get(): Calibration | null {
    const row = this.db
      .prepare("SELECT factor, samples, updatedAt FROM calibration WHERE id = 1")
      .get() as Calibration | undefined;
    return row ?? null;
  }

  set(c: Calibration): void {
    this.db
      .prepare(
        `INSERT INTO calibration (id, factor, samples, updatedAt) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET factor = excluded.factor, samples = excluded.samples, updatedAt = excluded.updatedAt`,
      )
      .run(c.factor, c.samples, c.updatedAt);
  }
}
