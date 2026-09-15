import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const digits = (value) => String(value || "").replace(/\D/g, "");
const pick = (text, regex) => clean(text.match(regex)?.[1] || "");

function brDateToIso(value) {
  const match = String(value || "").trim().match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  return match
    ? `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`
    : "";
}

function normalizePeriod(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized.includes("MANH")) return "MANHA";
  if (normalized.includes("TARD")) return "TARDE";
  return "";
}

export async function extractPdfText(bytes) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise;
  let text = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += "\n" + content.items.map((item) => item.str).join(" ");
  }
  return text;
}

export function parseWhirlpoolPdf(text) {
  const manufacturer = /\bCONSUL\b/i.test(text)
    ? "CONSUL"
    : /\bBRASTEMP\b/i.test(text)
      ? "BRASTEMP"
      : "WHIRLPOOL";
  const productLine = pick(text, /PRODUTO:\s*(.*?)\s+MARCA:\s*(BRASTEMP|CONSUL)/i);
  const defect =
    pick(text, /DEFEITO\s+RECLAMADO\s+1\s+\d+\s+(.+?)(?:\s+2\s+|\s+DEFEITO\s+CONSTATADO)/i) ||
    pick(text, /DEFEITO\s+RECLAMADO\s+(.+?)\s+DEFEITO\s+CONSTATADO/i);

  return {
    externalOrderId: pick(text, /N[ÚU]MERO\s+DA\s+OS\s+(\d{6,})/i),
    manufacturer,
    entryDate: brDateToIso(pick(text, /DATA\s+CHAMADO:\s*([0-9.\/-]+)/i)),
    appointmentDate: brDateToIso(pick(text, /DATA\s+AGENDA:\s*([0-9.\/-]+)/i)),
    appointmentPeriod: normalizePeriod(
      pick(text, /PER[IÍ]ODO:\s*([A-ZÃÕÇÉÊÍÓÚ ]+?)(?:\s+TIPO\s+AGENDA:|\s+CONSUMIDOR:)/i),
    ),
    appointmentType: pick(text, /TIPO\s+AGENDA:\s*(.+?)(?:\s+CONSUMIDOR:|$)/i),
    customer: {
      name: pick(text, /CONSUMIDOR:\s*(.+?)\s+ENDERE[ÇC]O:/i),
      document: digits(pick(text, /CNPJ\/CPF:\s*([0-9.\-\/]+)/i)),
      phone: digits(pick(text, /FONE\s+RESID[ÊE]NCIA:\s*([0-9 ()+\-]+)/i)),
      email: pick(text, /ENDERE[ÇC]O\s+ELETR[ÔO]NICO:\s*([^\s]+@[^\s]+)/i),
      address: pick(text, /ENDERE[ÇC]O:\s*(.+?)\s+COMPLEMENTO:/i),
      complement: pick(text, /COMPLEMENTO:\s*(.+?)\s+CNPJ\/CPF:/i),
      zipCode: pick(text, /CEP:\s*([0-9\-]+)/i),
      neighborhood: pick(text, /BAIRRO:\s*(.+?)\s+CIDADE:/i),
      city: pick(text, /CIDADE:\s*(.+?)\s+UF:/i),
      state: pick(text, /UF:\s*([A-Z]{2})/i),
    },
    equipment: {
      productLine,
      model: clean(productLine.split(/\s+/)[0] || ""),
      serial: pick(text, /S[ÉE]RIE:\s*([A-Z0-9-]*)\s+NOME\s+COMERCIAL:/i),
      commercialName: pick(text, /NOME\s+COMERCIAL:\s*(.*?)\s*TEMPO\s+DE\s+USO:/i),
      purchaseDate: brDateToIso(pick(text, /DATA\s+COMPRA:\s*([0-9.\/-]+)/i)),
      invoiceNumber: pick(text, /NR\s+NOTA\s+FISCAL:\s*([^\s]*)\s+DATA\s+COMPRA:/i),
      voltage: pick(text, /VOLTAGEM:\s*(.+?)\s+CAPACIDADE:/i),
    },
    service: {
      orderType: pick(text, /TIPO\s+DE\s+OS:\s*(.+?)\s+NR\s+NOTA\s+FISCAL:/i),
      reportedDefect: defect,
      complaint: pick(text, /RECLAMA[ÇC][ÃA]O\s+ATENDIMENTO\s+(.+?)\s+LAUDO\s+T[ÉE]CNICO/i),
    },
  };
}
