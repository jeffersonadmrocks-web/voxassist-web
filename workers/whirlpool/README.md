# Robô Whirlpool — fundação segura

Branch de desenvolvimento: `feat/whirlpool-robot-foundation`

## Objetivo

Automatizar a integração Whirlpool da filial Serra em duas direções:

1. Portal Whirlpool → VoxAssist: localizar OS novas ou alteradas, abrir detalhes e importar sem duplicidade.
2. VoxAssist → Portal Whirlpool: publicar agendamentos criados ou alterados no VoxAssist.

O portal não oferece API ou arquivo estruturado. A integração será feita exclusivamente por navegador automatizado com perfil persistente.

## Segurança

- O perfil local fica em `.playwright-profile/serra` e não entra no Git.
- Senha, cookies, páginas e dados das OS não entram no código ou no Git.
- O primeiro login é manual na janela local.
- O mapeador salva apenas controles, atributos e cabeçalhos; valores dos campos e linhas de clientes não são capturados.
- O worker deve usar Node.js 22 ou superior.
- A futura chave secreta do Supabase ficará somente no ambiente do worker, nunca no frontend.

## Preparação local

Na raiz do repositório:

```bash
cd workers/whirlpool
npm install
npm run install-browser
npm run login
```

Se o portal acusar erro de cookie, permitir cookies para `larcrm7.whirlpool.com`, fechar todas as janelas do worker e repetir `npm run login`.

## Mapeamento inicial

Mapear separadamente:

```bash
npm run map-page
```

Telas necessárias:

1. `busca-os`
2. `resultado-busca`
3. `detalhe-os`
4. `todas-as-os`
5. `paginacao-os`
6. `incluir-agendamento`
7. `alterar-agendamento`
8. `confirmacao-agendamento`

Os arquivos são gravados em `.artifacts/` e permanecem somente na máquina local.

## OS de homologação fornecidas

- Novas: 7015769978, 7015766640, 7015769061
- Alteradas: 7015759452, 7015742815
- Com agendamento: 7015754326, 7015732211
- Encerradas: 7015752064, 7015700316

Nesta fase, consultar somente. Não editar nenhuma OS no portal.

## Regras aprovadas

### Identidade e deduplicação

Chave única: fabricante + conexão/filial + número externo Whirlpool.

### Endereço

- Nova OS: comparar o endereço recebido com os endereços do cliente.
- Se não existir, usar o fluxo existente de adicionar endereço, com nome inicial `Whirlpool — OS [número]`.
- Vincular o endereço à nova OS sem substituir automaticamente o endereço principal.
- Depois da importação, o portal Whirlpool nunca sobrescreve o endereço daquela OS.
- Uma OS futura do mesmo cliente processa novamente o endereço e pode criar outro.
- A OS preserva uma cópia histórica do endereço usado no atendimento.

### Situações externas Whirlpool

O status externo nunca altera silenciosamente o status interno da OS.

- `CANCELADA`: cancelamento possivelmente realizado pelo robô da Whirlpool. Criar caso de atenção obrigatório, manter a OS preservada e aguardar revisão humana. A revisão deve registrar responsável, conclusão e tratativa: confirmar cancelamento, contestar/solicitar reativação ou manter acompanhamento.
- `LIQUIDADA`: atendimento encerrado pela própria Vox. Tratar como estado terminal externo; não gerar novas tarefas nem tentar atualizar agendamento. Manter apenas histórico e auditoria.
- Uma OS `CANCELADA` não deve ser confundida com ausência/exclusão da listagem.
- Uma OS desconhecida já `CANCELADA` entra no catálogo externo e na fila de revisão, sem abertura automática de atendimento ativo.
- Uma OS desconhecida já `LIQUIDADA` entra somente no catálogo/histórico, salvo decisão manual de importação.

### Descoberta automática

A Whirlpool não possui fila de novas OS. O worker abre a visualização de todas as OS, percorre a paginação e compara os números com o catálogo local. Número desconhecido é candidato a nova OS; número ausente segue a regra de reconfirmação de exclusão.

### Agendamento VoxAssist → Whirlpool

O agendamento altera o item `VISITA NORMAL`; a OS principal permanece com status `ABERTO`.

Sequência obrigatória no portal:

1. No item, alterar o status de `Agendar` para `Agendado`.
2. Alterar o motivo de status para `AGENDAMENTO`.
3. Em Datas, preencher `Data início anterior` com a data da visita e o horário inicial definido pelo período.
4. Não preencher `Última data de início`: o SAP atualiza esse campo automaticamente.
5. Clicar em `Voltar` no item para retornar à OS.
6. Preencher `Parceiro Técnico` no item `VISITA NORMAL`, usando o mapeamento do técnico do VoxAssist.
7. Clicar em `Salvar` na OS.
8. Verificar na grade: status Agendado, data, período, motivo AGENDAMENTO e parceiro técnico.
9. Clicar obrigatoriamente em `Encerrar` antes de abrir outra OS, evitando mistura de dados de consumidores.

Técnicos Whirlpool inicialmente conhecidos na filial Serra:

- BRENDO PEREIRA FERREIRA
- DORLEAN ANASTACIO ELIAS

- Inclusão e alteração de agendamento de OS Whirlpool geram item em fila.
- A fila só é marcada como concluída depois de reler o portal e confirmar data/período.
- Falhas são retentadas e exibidas ao gestor.
- Nenhuma alteração será enviada durante o mapeamento somente leitura.

### Exclusão com reconfirmação

Uma ausência na busca não significa exclusão confirmada.

1. Primeira ausência: marcar `SUSPEITA_DE_EXCLUSAO`.
2. Fazer nova consulta direta pelo número da OS.
3. Reconsultar em janela de até 24 horas.
4. Confirmar exclusão somente após duas ausências independentes e consulta direta sem resultado.
5. Se a OS reaparecer, cancelar a suspeita e registrar falso positivo.
6. Nunca excluir a OS do VoxAssist; apenas registrar o estado externo e alertar o gestor.

## Próxima etapa

Após obter os mapas sanitizados, implementar seletores estáveis, parser de detalhes, fila Supabase, escrita de agendamento e testes automatizados. O worker só poderá operar em modo de escrita depois da homologação explícita.
