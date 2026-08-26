// Cliente Supabase falso, só pra testar a lógica de vínculo/criação de
// técnico com dados fictícios em memória — sem banco real. Cobre só as
// operações que technicianMatch.ts realmente usa (from/select/eq/or/
// maybeSingle/single/insert/upsert + auth.admin.createUser).
type Row = Record<string, unknown>;

function matchesEq(row: Row, col: string, val: unknown): boolean {
  return row[col] === val;
}

function matchesOrExpr(row: Row, expr: string): boolean {
  // formato: "role.eq.TECNICO,external_schedule_enabled.eq.true"
  return expr.split(",").some((clause) => {
    const [col, , rawVal] = clause.split(".");
    const val = rawVal === "true" ? true : rawVal === "false" ? false : rawVal;
    return row[col] === val;
  });
}

class QueryBuilder {
  private filters: Array<{ col: string; val: unknown }> = [];
  private orExpr: string | null = null;
  private insertPayload: Row | null = null;

  constructor(
    private tables: Map<string, Row[]>,
    private table: string,
    private fkViolationBudget?: { remaining: number }
  ) {}

  select(_cols?: string) {
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }

  or(expr: string) {
    this.orExpr = expr;
    return this;
  }

  private rows(): Row[] {
    const all = this.tables.get(this.table) || [];
    return all.filter((r) => {
      const passFilters = this.filters.every((f) => matchesEq(r, f.col, f.val));
      const passOr = this.orExpr ? matchesOrExpr(r, this.orExpr) : true;
      return passFilters && passOr;
    });
  }

  async maybeSingle() {
    const found = this.rows()[0] || null;
    return { data: found, error: null };
  }

  insert(row: Row) {
    this.insertPayload = { ...row };
    return this;
  }

  async single() {
    if (this.fkViolationBudget && this.fkViolationBudget.remaining > 0) {
      this.fkViolationBudget.remaining--;
      return { data: null, error: { code: "23503", message: "fk violation (fixture)" } };
    }
    const arr = this.tables.get(this.table) || [];
    const row = { id: `generated-${arr.length + 1}`, ...(this.insertPayload || {}) };
    arr.push(row);
    this.tables.set(this.table, arr);
    return { data: { id: row.id }, error: null };
  }

  async upsert(row: Row, opts: { onConflict: string }) {
    const arr = this.tables.get(this.table) || [];
    const conflictCols = opts.onConflict.split(",");
    const existingIdx = arr.findIndex((r) => conflictCols.every((c) => r[c] === row[c]));
    if (existingIdx >= 0) {
      arr[existingIdx] = { ...arr[existingIdx], ...row };
    } else {
      arr.push({ id: `generated-${arr.length + 1}`, ...row });
    }
    this.tables.set(this.table, arr);
    return { data: null, error: null };
  }

  // Torna o builder "thenable" pra permitir
  // `const { data } = await supabase.from(...).select().eq().or()` sem
  // precisar de um `.exec()`/`.maybeSingle()` terminal explícito — é assim
  // que matchOrCreateTechnician busca a lista de técnicos candidatos.
  then<TResult1, TResult2>(
    onFulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows(), error: null }).then(onFulfilled, onRejected);
  }
}

export function createMockSupabase(seed?: {
  profiles?: Row[];
  external_technician_link_suggestions?: Row[];
  forceProfilesInsertFkViolationOnce?: boolean;
}) {
  const tables = new Map<string, Row[]>();
  tables.set("profiles", seed?.profiles ? [...seed.profiles] : []);
  tables.set(
    "external_technician_link_suggestions",
    seed?.external_technician_link_suggestions ? [...seed.external_technician_link_suggestions] : []
  );

  let dormantUserCounter = 0;
  // Compartilhado entre TODAS as QueryBuilder de "profiles" (inclusive a
  // tentativa de retry depois do fallback) — consumido de verdade só uma vez.
  const fkViolationBudget = { remaining: seed?.forceProfilesInsertFkViolationOnce ? 1 : 0 };

  return {
    tables,
    from(table: string) {
      return new QueryBuilder(tables, table, table === "profiles" ? fkViolationBudget : undefined);
    },
    auth: {
      admin: {
        async createUser(_input: { email: string; email_confirm: boolean }) {
          dormantUserCounter++;
          return { data: { user: { id: `dormant-auth-user-${dormantUserCounter}` } }, error: null };
        },
      },
    },
  };
}
