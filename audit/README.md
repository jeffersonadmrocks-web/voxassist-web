# VoxAssist Audit V1

## Status

Fundação independente da auditoria prática e visual do VoxAssist.

Este diretório pertence à suíte de homologação e não à implementação funcional do VoxAssist. O objetivo é testar o sistema a partir de critérios independentes, com massa sintética rastreável, gabarito externo e comprovação técnica, funcional e visual.

## Princípios obrigatórios

1. **Independência** — os critérios de aprovação não devem ser derivados da implementação que está sendo testada.
2. **Mesmo sistema candidato** — o Audit deve testar o mesmo commit/build que será candidato à produção.
3. **Ambiente isolado** — toda massa operacional do robô deve existir somente no ambiente de homologação/Audit.
4. **Nenhum dado real antes da aprovação** — o início da operação real só ocorre depois da homologação, preservação das evidências e reset controlado da massa fictícia.
5. **Fontes externas protegidas** — Electrolux e qualquer outro repositório/sistema externo real são somente leitura para o Audit. O robô nunca altera, exclui ou corrige a origem.
6. **PASS não basta** — uma funcionalidade deve reconciliar o gabarito externo, o estado real do banco e, quando aplicável, a informação exibida nas telas normais do VoxAssist.
7. **Rastreabilidade** — dados criados pelo robô devem possuir identificação de homologação e permitir reconstruir a jornada completa.
8. **Reprodutibilidade** — cenários determinísticos devem poder ser repetidos com a mesma semente.
9. **Correção contínua** — falhas encontradas durante a janela de testes são corrigidas e retestadas imediatamente; não se espera o quinto dia para começar a correção.
10. **Reset seguro** — ao final, somente a massa operacional de homologação é removida. Schema, migrations, RLS, funções e dados estruturais necessários permanecem.

## Janela inicial

Primeiro ciclo planejado: **5 dias de homologação intensiva**. Cinco dias são o primeiro gate, não uma obrigação de liberação. Se houver P0/P1 relevantes ou cobertura insuficiente, os testes continuam.

## Três provas

Cada cenário relevante pode exigir:

- **Prova técnica:** banco, constraints, RLS, RPCs, auditoria e integridade.
- **Prova funcional:** jornada executada como usuário/operador, inclusive via navegador nos fluxos críticos.
- **Prova visual:** resultado deve ser localizável e coerente nas telas, Dashboard e relatórios utilizados pelos usuários.

## Eixos mínimos de cobertura

- autenticação, usuários, perfis e permissões;
- multiempresa e multiloja;
- clientes e equipamentos;
- Ordem de Serviço e fluxo completo de situações;
- agenda e atendimento externo;
- Chat/mensagens e atribuição/transferência;
- atividades, casos de atenção e tarefas;
- financeiro, pagamentos, parciais, estornos e reconciliação;
- estoque e movimentações;
- **peças e documentação técnica**;
- produtividade, metas, bonificação e campanhas;
- Dashboard;
- relatórios;
- auditoria;
- integrações externas em modo protegido/read-only.

## Peças e documentação técnica — eixo obrigatório

O Audit deve validar não apenas CRUD, mas viabilidade operacional e do banco com volume crescente. Cobrir:

- marcas, tipos, grupos e modelos;
- peças, códigos, equivalências/substituições e aplicações por modelo;
- busca por descrição/código e caminho inverso peça → modelos/documentação;
- vínculo peça ↔ modelo ↔ marca ↔ documentação;
- estoque/localização e uso da peça na OS;
- itens configurados para não movimentar estoque;
- movimentações, devoluções e demais regras existentes;
- manuais, boletins, vistas explodidas, listas de peças, links e anexos técnicos;
- metadados, Storage e detecção de registro órfão/arquivo órfão;
- duplicidades e referências quebradas;
- permissões de consulta/administração;
- desempenho de pesquisa e abertura com massa crescente;
- consistência OS × peças × estoque × movimentações × financeiro × relatórios.

O relatório desse eixo deve responder: funcionalidade correta? integridade correta? desempenho aceitável? arquitetura viável para crescimento?

## Gabarito externo

O Audit manterá resultados esperados fora das funções de cálculo do VoxAssist. Exemplo: se o cenário espera determinado total recebido, esse valor é calculado pelo gabarito e reconciliado independentemente com banco, Financeiro, Dashboard, relatórios e produtividade. Uma mesma função do VoxAssist não pode ser simultaneamente fonte do valor exibido e do valor esperado pelo teste.

## Massa e inspeção visual

A massa deve representar histórias coerentes, e não registros aleatórios. Clientes/OS especiais devem ser pesquisáveis por identificadores de homologação para inspeção manual. Se o robô criar 1.000 clientes, os 1.000 devem existir e ser consultáveis na interface. Situações de OS, agenda, mensagens, recebimentos, estoque e demais efeitos devem aparecer corretamente nas áreas correspondentes.

## Cenários adversos

Incluir concorrência, duplicidade, tentativas de acesso entre empresas/lojas, manipulação de payload, mudança indevida de store/company, pagamentos simultâneos, estornos, cancelamentos, transferências, reagendamentos, tentativas de alteração de registros append-only e demais exceções relevantes.

## Proteção de Electrolux e fontes externas

Classificação de dados:

- **Sintético Audit:** livre para criar/alterar/resetar.
- **Cópia isolada de fonte externa:** pode ser manipulada somente dentro do laboratório.
- **Fonte externa real:** somente leitura.

Antes de testes destrutivos, um pre-flight deve confirmar destinos TEST/READ-ONLY/PROTECTED. Se uma origem externa real estiver acessível com capacidade de escrita, a bateria destrutiva deve abortar como P0.

## Severidade

- **P0:** bloqueia homologação/produção — segurança, isolamento, corrupção/perda de dados, financeiro crítico, escrita indevida em fonte externa etc.
- **P1:** corrigir antes da produção.
- **P2:** melhoria não bloqueante, registrada para evolução.

## Reset e liberação

Após aprovação do ciclo:

1. preservar relatório, evidências, commit/build e resultados;
2. executar rotina oficial e controlada de reset da massa fictícia;
3. provar ausência de clientes/OS/pagamentos/mensagens/agendas/peças/documentos fictícios e resíduos órfãos;
4. nunca tocar em fontes externas protegidas;
5. executar smoke tests pós-reset em banco limpo;
6. somente então liberar o VoxAssist para os primeiros dados operacionais reais.

## Próximos artefatos desta branch

- inventário auditável das funções/requisitos reais do VoxAssist;
- catálogo de cenários e IDs estáveis;
- modelo de gabarito externo;
- gerador determinístico de massa;
- testes SQL/RLS/API;
- testes E2E visuais;
- pre-flight de segurança;
- reconciliador de Dashboard/Financeiro/Relatórios;
- testes de carga/concorrência;
- testes de peças/documentação e crescimento do banco;
- coletor de evidências;
- painel/relatório de execução;
- rotina segura de reset pós-homologação.

**Regra de construção:** esta suíte deve permanecer independente do código funcional e não deve ser ajustada silenciosamente para fazer uma implementação passar.