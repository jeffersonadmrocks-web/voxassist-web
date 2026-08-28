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
} {
  const { httpStatus, looksLikeJson } = input;
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: "TOKEN_RECUSADO", httpStatus, message: "Digisac recusou o token informado." };
  }
  if (httpStatus === 429) {
    return {
      status: "ENDPOINT_INDISPONIVEL",
      httpStatus,
      message: "Limite de requisições da API Digisac atingido — tente novamente mais tarde.",
    };
  }
  if (httpStatus >= 500) {
    return { status: "ENDPOINT_INDISPONIVEL", httpStatus, message: "A API da Digisac respondeu com erro de servidor." };
  }
  if (!looksLikeJson) {
    return {
      status: "ENDPOINT_INDISPONIVEL",
      httpStatus,
      message: "Resposta inesperada (não parece vir da API da Digisac) — verifique DIGISAC_API_URL e DIGISAC_TEST_PATH.",
    };
  }
  return { status: "CONEXAO_VALIDA", httpStatus, message: "Conexão com a API Digisac validada com sucesso." };
}

export function classifyNetworkError(e: unknown): { status: ConnectionStatus; httpStatus: null; message: string } {
  const isTimeout = e instanceof Error && e.name === "AbortError";
  return {
    status: "ENDPOINT_INDISPONIVEL",
    httpStatus: null,
    message: isTimeout ? "Tempo limite excedido ao contatar a API da Digisac." : "Não foi possível contatar a API da Digisac.",
  };
}

export function messageForMissingVar(v: MissingConfigVar): string {
  return `Variável de configuração ausente: ${v}.`;
}

export function isAuthorizedRole(role: string | null): boolean {
  return role === "GESTOR";
}
