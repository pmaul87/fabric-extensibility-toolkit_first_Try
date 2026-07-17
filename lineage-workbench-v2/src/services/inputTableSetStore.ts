import { randomUUID } from "crypto";
import type { NotebookInputTables } from "./notebookPorted/types";

interface InputTableSet {
  id: string;
  createdAtUtc: string;
  tables: NotebookInputTables;
}

export class InputTableSetStore {
  private readonly sets = new Map<string, InputTableSet>();

  create(tables: NotebookInputTables): InputTableSet {
    const set: InputTableSet = {
      id: randomUUID(),
      createdAtUtc: new Date().toISOString(),
      tables,
    };
    this.sets.set(set.id, set);
    return set;
  }

  get(id: string): InputTableSet | undefined {
    return this.sets.get(id);
  }
}
