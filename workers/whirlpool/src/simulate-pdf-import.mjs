import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_DIR } from "./config.mjs";

const supabaseUrl =
  process.env.VOXASSIST_SUPABASE_URL || "https://dgasmtvpgifceyqufcfg.supabase.co";
const serviceKey = process.env.VOXASSIST_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  throw new Error(
    "Defina VOXASSIST_SUPABASE_SERVICE_ROLE_KEY somente neste PowerShell. Não envie a chave aqui.",
  );
}
const projectUrl = new URL(supabaseUrl);
if (projectUrl.protocol !== "https:" || projectUrl.hostname !== "dgasmtvpgifceyqufcfg.supabase.co") {
  throw new Error("Projeto Supabase diferente do VoxAssist autorizado.");
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
};
async function get(table, params) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Consulta ${table} recusada (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
const digits = (value) => String(value || "").replace(/\D/g, "");

const parsedDir = path.join(ARTIFACT_DIR, "parsed");
const files = (await readdir(parsedDir)).filter((name) => /\.json$/i.test(name)).sort().reverse();
if (!files.length) throw new Error("Nenhum PDF processado em .artifacts/parsed.");

const sourceFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(parsedDir, files[0]);
const envelope = JSON.parse(await readFile(sourceFile, "utf8"));
const parsed = envelope.parsed || envelope;
const externalOrderId = digits(parsed.externalOrderId || parsed.numeroOS);
if (!/^7015\d+$/.test(externalOrderId)) {
  throw new Error("O arquivo não contém um número válido de OS Whirlpool iniciado por 7015.");
}

const connections = await get("whirlpool_connections", {
  filial: "eq.SERRA",
  select: "id,company_id,store_id,filial",
  limit: "1",
});
const connection = connections[0];
if (!connection) throw new Error("Conexão Whirlpool SERRA não encontrada.");

const documentDigits = digits(parsed.customer?.document || parsed.documento);
const clients = documentDigits
  ? await get("clients", {
      company_id: `eq.${connection.company_id}`,
      document_digits: `eq.${documentDigits}`,
      select: "id",
      limit: "2",
    })
  : [];
if (clients.length > 1) throw new Error("Mais de um cliente da empresa possui o mesmo documento.");
const client = clients[0] || null;

const customer = parsed.customer || {};
const incomingAddress = {
  zip_code: customer.zipCode || parsed.cep || "",
  address: customer.address || parsed.endereco || "",
  address_number: customer.addressNumber || parsed.numeroEndereco || "",
  complement: customer.complement || parsed.complemento || "",
  neighborhood: customer.neighborhood || parsed.bairro || "",
  city: customer.city || parsed.cidade || "",
  state: customer.state || parsed.uf || "",
};
let address = null;
if (client) {
  const addresses = await get("client_addresses", {
    client_id: `eq.${client.id}`,
    select: "id,label,zip_code,address,address_number,complement,neighborhood,city,state",
  });
  address = addresses.find((item) =>
    ["zip_code", "address", "address_number", "complement", "neighborhood", "city", "state"]
      .every((field) => clean(item[field]) === clean(incomingAddress[field])),
  ) || null;
}

const equipment = parsed.equipment || {};
const serial = clean(equipment.serial || parsed.serie);
let existingEquipment = null;
if (client && serial) {
  const equipments = await get("equipments", {
    company_id: `eq.${connection.company_id}`,
    current_client_id: `eq.${client.id}`,
    serial_number: `eq.${serial}`,
    select: "id",
    limit: "2",
  });
  if (equipments.length > 1) throw new Error("Mais de um equipamento possui a mesma série para este cliente.");
  existingEquipment = equipments[0] || null;
}

const orders = await get("service_orders", {
  company_id: `eq.${connection.company_id}`,
  or: `(manufacturer_os_number.eq.${externalOrderId},os_number.eq.${externalOrderId})`,
  select: "id",
  limit: "2",
});
if (orders.length > 1) throw new Error("Mais de uma OS existente corresponde ao número Whirlpool.");
const order = orders[0] || null;

let appointment = null;
if (order) {
  const appointments = await get("appointments", {
    service_order_id: `eq.${order.id}`,
    status: "neq.CANCELADO",
    select: "id,appointment_date,period,status,technician_id",
    order: "created_at.desc",
    limit: "1",
  });
  appointment = appointments[0] || null;
}

const appointmentDate = parsed.appointmentDate || parsed.dataAgenda || "";
const appointmentPeriod = parsed.appointmentPeriod || parsed.periodo || "";
const result = {
  mode: "DRY_RUN",
  writesPerformed: 0,
  filial: "SERRA",
  externalOrderId,
  decisions: {
    client: client ? "REUTILIZAR" : "CRIAR",
    address: address ? "REUTILIZAR" : "CRIAR_COM_NOME_WHIRLPOOL",
    equipment: existingEquipment ? "REUTILIZAR_POR_SERIE" : "CRIAR",
    serviceOrder: order ? "REUTILIZAR" : "CRIAR",
    pdfAttachment: order ? "VERIFICAR_ANEXO_EXISTENTE" : "CRIAR",
    appointment: appointment
      ? "REUTILIZAR"
      : appointmentDate && appointmentPeriod
        ? "CRIAR_AGENDADO"
        : "CRIAR_EM_ABERTO",
  },
  safeguards: {
    companyScoped: true,
    existingClientAddressWillNotBeUpdated: true,
    addressLabel: "Whirlpool",
    externalPortalWrite: false,
  },
};
console.log("SIMULAÇÃO CONCLUÍDA — nenhum dado foi gravado no VoxAssist ou na Whirlpool.");
console.log(JSON.stringify(result));
