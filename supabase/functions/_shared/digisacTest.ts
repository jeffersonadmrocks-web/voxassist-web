// Teste de conexão Digisac — etapa 1 da integração (só leitura de baixo
// risco, sem enviar mensagem/criar contato/abrir atendimento). Lógica pura,
// sem tocar rede: a edge function faz o fetch e só então chama isto pra
// classificar o resultado. Nunca presume/fixa um endpoint "/me" — a
// documentação oficial da Digisac (documenter.getpostman.com, redirecionada
// por docs.digisac.app) não expõe uma rota de identificação de conta/usuário
// documentada. O caminho testado vem inteiro de DIGISAC_TEST_PATH (uma env
// var), nunca hardcoded aqui — só assim dá pra trocar de endpoint depois
// sem tocar em código.
export type DigisacConfig = {
  apiUrl: string | null;
  apiToken: string | null;
  testPath: string | null;
};

export type MissingConfigVar = "DIGISAC_API_URL" | "DIGISAC_API_TOKEN" | "DIGISAC_TEST_PATH";

export function findMissingConfigVar(cfg: DigisacConfig): MissingConfigVar | null {
  if (!cfg.apiUrl) return "DIGISAC_API_URL";
  if (!cfg.apiToken) return "DIGISAC_API_TOKEN";
  if (!cfg.testPath) return "DIGISAC_TEST_PATH";
  return null;
}

// Monta a URL final sem duplicar barras — apiUrl e testPath podem ou não
// vir com barra nas pontas, dependendo de como foram cadastrados.
export function buildTestUrl(apiUrl: string, testPath: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  const path = testPath.startsWith("/") ? testPath : `/${testPath}`;
  return `${base}${path}`;
}

export type ConnectionStatus =
  | "CONEXAO_VALIDA"
  | "TOKEN_RECUSADO"
  | "ENDPOINT_INDISPONIVEL"
  | "CONFIGURACAO_AUSENTE";

// 4 estágios pedidos pelo usuário depois do diagnóstico do HTTP 500 real:
// um único rótulo final ("Endpoint indisponível") escondia que Edge
// Function, chegada na Digisac e validação de token já tinham passado —
// só o endpoint específico testado não respondeu de forma "funcional".
// edgeFunctionReached é sempre true aqui (só é construído depois da nossa
// function já ter processado a requisição); os outros 3 formam uma escada
// — um estágio só pode ser true se o anterior também for.
export type DigisacTestStages = {
  edgeFunctionReached: true;
  digisacReached: boolean;
  tokenValidated: boolean;
  endpointFunctional: boolean;
};

const STAGES_NEVER_LEFT_EDGE_FUNCTION: DigisacTestStages = {
  edgeFunctionReached: true,
  digisacReached: false,
  tokenValidated: false,
  endpointFunctional: false,
};

export type ClassifyInput = { httpStatus: number; looksLikeJson: boolean };

// 401/403 = token rejeitado. 429 = limite de requisições (agrupado como
// "indisponível" no status sanitizado, mas com mensagem própria). >=500 =
// Digisac fora do ar. Qualquer outra resposta (2xx, 3xx, 400, 404 etc.) só
// conta como "conexão válida" se realmente parecer um corpo JSON da API —
// uma página HTML de erro/login em 200 (ex.: URL base errada) não deve
// passar como sucesso.
export function classifyResponse(input: ClassifyInput): {
  status: ConnectionStatus;
  httpStatus: number;
  message: string;
  stages: DigisacTestStages;
} {
  const { httpStatus, looksLikeJson } = input;
  // Só chega aqui depois de um fetch() que respondeu (não lançou) — logo a
  // Digisac foi alcançada, independente do status code que ela devolveu.
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: "TOKEN_RECUSADO",
      httpStatus,
      message: "Digisac recusou o token informado.",
      stages: { edgeFunctionReached: true, digisacReached: true, tokenValidated: false, endpointFunctional: false },
    };
  }
  // A partir daqui, Digisac não recusou o token (não é 401/403) — token validado.
  if (httpStatus === 429) {
    return {
      status: "ENDPOINT_INDISPONIVEL",
      httpStatus,
      message: "Limite de requisições da API Digisac atingido — tente novamente mais tarde.",
      stages: { edgeFunctionReached: true, digisacReached: true, tokenValidated: true, endpointFunctional: false },
    };
  }
  if (httpStatus >= 500) {
    return {
      status: "ENDPOINT_INDISPONIVEL",
      httpStatus,
      message: "A API da Digisac respondeu com erro de servidor.",
      stages: { edgeFunctionReached: true, digisacReached: true, tokenValidated: true, endpointFunctional: false },
    };
  }
  if (!looksLikeJson) {
    return {
      status: "ENDPOINT_INDISPONIVEL",
      httpStatus,
      message: "Resposta inesperada (não parece vir da API da Digisac) — verifique DIGISAC_API_URL e DIGISAC_TEST_PATH.",
      stages: { edgeFunctionReached: true, digisacReached: true, tokenValidated: true, endpointFunctional: false },
    };
  }
  return {
    status: "CONEXAO_VALIDA",
    httpStatus,
    message: "Conexão com a API Digisac validada com sucesso.",
    stages: { edgeFunctionReached: true, digisacReached: true, tokenValidated: true, endpointFunctional: true },
  };
}

export function classifyNetworkError(e: unknown): {
  status: ConnectionStatus;
  httpStatus: null;
  message: string;
  stages: DigisacTestStages;
} {
  const isTimeout = e instanceof Error && e.name === "AbortError";
  return {
    status: "ENDPOINT_INDISPONIVEL",
    httpStatus: null,
    message: isTimeout ? "Tempo limite excedido ao contatar a API da Digisac." : "Não foi possível contatar a API da Digisac.",
    stages: STAGES_NEVER_LEFT_EDGE_FUNCTION,
  };
}

export function stagesForMissingConfig(): DigisacTestStages {
  return STAGES_NEVER_LEFT_EDGE_FUNCTION;
}

export function messageForMissingVar(v: MissingConfigVar): string {
  return `Variável de configuração ausente: ${v}.`;
}

export function isAuthorizedRole(role: string | null): boolean {
  return role === "GESTOR";
}

// CORS — a function é chamada direto do navegador (cross-origin: o front
// fica em voxassist-web.vercel.app, a function em *.supabase.co), então o
// navegador manda um preflight OPTIONS antes do POST real sempre que há
// headers customizados (Authorization/apikey). Sem isso, o preflight é
// bloqueado e o fetch nunca sai — foi exatamente essa a causa real do
// "Falha ao chamar a função de teste" reportado em produção: a function
// nunca respondia OPTIONS nem mandava nenhum header CORS em resposta
// nenhuma. Allowlist explícita (nunca "*") — origem fora da lista não
// recebe Access-Control-Allow-Origin, e o navegador bloqueia sozinho.
export const ALLOWED_ORIGINS = ["https://voxassist-web.vercel.app"];

export function buildCorsHeaders(origin: string | null, allowedOrigins: string[] = ALLOWED_ORIGINS): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
