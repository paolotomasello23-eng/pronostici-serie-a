import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Un Supabase finto, in memoria, per i test che non hanno un database.
 *
 * Imita solo il pezzo di query builder che usa il codice dei punteggi — e,
 * soprattutto, il tetto delle 1000 righe per risposta: è il comportamento
 * che ha prodotto classifiche sbagliate, e un finto che non lo avesse
 * farebbe passare i test anche con il bug ancora lì.
 */

type Row = Record<string, unknown>;

export const MAX_ROWS = 1000;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private from_ = 0;
  private to_: number | null = null;
  private limit_: number | null = null;
  private single_: "one" | "maybe" | null = null;
  private patch: Row | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }
  update(patch: Row): this {
    this.patch = patch;
    return this;
  }
  eq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  neq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  lte(col: string, value: string): this {
    this.filters.push((r) => r[col] !== null && String(r[col]) <= value);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number): this {
    this.from_ = from;
    this.to_ = to;
    return this;
  }
  limit(n: number): this {
    this.limit_ = n;
    return this;
  }
  maybeSingle(): this {
    this.single_ = "maybe";
    return this;
  }
  single(): this {
    this.single_ = "one";
    return this;
  }

  private run(): { data: unknown; error: null } {
    const rows = (this.db.tables[this.table] ??= []);
    const matching = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.patch) {
      for (const r of matching) Object.assign(r, this.patch);
      return { data: null, error: null };
    }

    const sorted = [...matching].sort((a, b) => {
      for (const { col, asc } of this.orders) {
        const x = String(a[col]);
        const y = String(b[col]);
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });

    let out = sorted.slice(this.from_, this.to_ === null ? undefined : this.to_ + 1);
    if (this.limit_ !== null) out = out.slice(0, this.limit_);
    // Il tetto di Supabase: oltre, le righe semplicemente non arrivano.
    out = out.slice(0, MAX_ROWS);

    if (this.single_) return { data: out[0] ?? null, error: null };
    return { data: out.map((r) => ({ ...r })), error: null };
  }

  then<A, B>(
    ok?: ((value: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
    ko?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, ko);
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Punteggi scritti, per lega e giornata, come li riceve la RPC. */
  scores = new Map<string, Row[]>();

  client(): SupabaseClient {
    const fake = {
      from: (table: string) => new Query(this, table),
      rpc: async (name: string, params: Row) => {
        if (name !== "replace_matchday_scores") throw new Error(`rpc ${name}?`);
        const rows = params.p_scores as Row[];
        this.scores.set(`${params.p_league_id}|${params.p_matchday_id}`, rows);
        return { data: rows.length, error: null };
      },
    };
    return fake as unknown as SupabaseClient;
  }
}
