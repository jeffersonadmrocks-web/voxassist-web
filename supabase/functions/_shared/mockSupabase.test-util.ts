// Cliente Supabase falso, só pra testar a lógica de vínculo/criação de
// técnico com dados fictícios em memória — sem banco real. Cobre só as
// operações que technicianMatch.ts realmente usa (from/select/eq/or/
// maybeSingle/single/update/upsert + auth.admin.createUser).
//
// auth.admin.createUser() aqui também simula a trigger real do projeto
// (on_auth_user_created_voxassist -> handle_new_auth_user(), não
// versionada neste repo) que cria sozinha uma linha em profiles assim
// que o usuário é criado, com role='ATENDENTE' e origin='VOXASSIST' —
// foi exatamente essa linha pré-existente que fazia o INSERT original
// falhar por PK duplicada em produção. Sem essa simulação, o mock não
// teria pego esse bug (like não pegou o anterior).
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
  private updatePayload: Row | null = null;

  constructor(
    private tables: Map<string, Row[]>,
    private table: string
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

  update(row: Row) {
    this.updatePayload = { ...row };
    return this;
  }

  async single() {
    if (this.updatePayload) {
      const arr = this.tables.get(this.table) || [];
      const idx = arr.findIndex((r) => this.filters.every((f) => matchesEq(r, f.col, f.val)));
      if (idx < 0) {
        // PostgREST: update que não bate em nenhuma linha + .single() =
        // erro (0 rows), não sucesso silencioso.
        return { data: null, error: { code: "PGRST116", message: "no rows updated (fixture)" } };
      }
      arr[idx] = { ...arr[idx], ...this.updatePayload };
      this.tables.set(this.table, arr);
      return { data: { id: arr[idx].id }, error: null };
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
}) {
  const tables = new Map<string, Row[]>();
  tables.set("profiles", seed?.profiles ? [...seed.profiles] : []);
  tables.set(
    "external_technician_link_suggestions",
    seed?.external_technician_link_suggestions ? [...seed.external_technician_link_suggestions] : []
  );

  let dormantUserCounter = 0;

  return {
    tables,
    from(table: string) {
      return new QueryBuilder(tables, table);
    },
    auth: {
      admin: {
        async createUser(input: { email: string; email_confirm: boolean }) {
          dormantUserCounter++;
          const id = `dormant-auth-user-${dormantUserCounter}`;
          // Mesma trigger do banco real: cria a linha em profiles sozinha,
          // com campos "genéricos" que o chamador precisa corrigir depois
          // via UPDATE (nunca INSERT — a PK já está ocupada).
          const arr = tables.get("profiles") || [];
          arr.push({
            id,
            full_name: input.email.split("@")[0].toUpperCase(),
            role: "ATENDENTE",
            origin: "VOXASSIST",
            registration_status: "ATIVO",
            active: true,
          });
          tables.set("profiles", arr);
          return { data: { user: { id } }, error: null };
        },
      },
    },
  };
}
