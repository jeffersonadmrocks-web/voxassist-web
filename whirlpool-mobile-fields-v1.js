/* VoxAssist Web — PWA-1: corrige a sobreposição de texto no formulário
   Whirlpool em telas estreitas (achado do usuário, com dados reais de
   produção -- OS 7015285017).

   Causa raiz (confirmada reproduzindo a OS real num harness Playwright,
   não suposta): os campos (.wp-exact-field) são flex row (rótulo em
   <span> + valor em <input>/<textarea> lado a lado, whirlpool-exact-
   factory-layout-v0813.js) dentro de tabelas table-layout:fixed com
   colunas em %. Isso é FIEL ao PDF impresso (que sempre tem ~210mm de
   largura disponível, por isso funciona perfeitamente na impressão) mas
   em uma tela real de celular (320-430px), cada coluna vira uma fração
   minúscula disso -- o rótulo (white-space:nowrap, intencional para
   fidelidade) não tem opção além de "vazar" visualmente por cima da
   célula vizinha (overflow:visible, também intencional). Já tínhamos
   identificado essa classe de bug no diagnóstico PWA-0 e adiado a
   correção (exigia redesenhar a apresentação mobile do formulário, sem
   mexer na fidelidade A4) -- com dados reais o vazamento ficou severo
   o bastante (rótulos e valores inteiros sobrepostos) para não dar mais
   pra adiar.

   Fix (só dentro de @media screen and (max-width:900px) -- a MESMA janela
   de largura que já ativa a apresentação responsiva do documento, com
   "screen" explícito: uma página A4 tem ~210mm=~794px, ou seja mais
   estreita que 900px -- sem o "screen", esta regra poderia em teoria
   disputar cascata com as regras @media print existentes durante a
   própria impressão. @media print e telas >900px continuam bit-a-bit
   iguais): empilha rótulo ACIMA do valor em
   vez de lado a lado, e transforma os grupos inline (CEP/REGIÃO,
   FONE/INSC.ESTADUAL etc.) em blocos empilhados de largura total. Como
   cada rótulo passa a ter a linha inteira só pra si, none dos rótulos
   reais deste formulário (o mais longo tem ~22 caracteres) precisa
   quebrar linha nem vaza mais pra célula nenhuma. As alturas fixas em
   mm dos blocos de cabeçalho (calculadas para caberem exatamente no
   layout lado-a-lado) são relaxadas pra auto, já que o conteúdo
   empilhado fica mais alto. */
(function () {
  const style = document.createElement('style');
  style.textContent = `
@media screen and (max-width:900px){
  #vxWpForm .wp-exact-field{flex-direction:column!important;align-items:flex-start!important;gap:0!important}
  #vxWpForm .wp-exact-field>span{margin:0 0 1px 0!important}
  #vxWpForm .wp-exact-field input,#vxWpForm .wp-exact-field textarea{width:100%!important}
  #vxWpForm .wp-exact-inline-group{display:block!important}
  #vxWpForm .wp-exact-inline-group .wp-exact-field{display:flex!important;width:100%!important;margin:0 0 4px 0!important}
  #vxWpForm .wp-header-phone-ie{grid-template-columns:1fr!important;row-gap:4px!important}
  #vxWpForm .wp-block-head td{height:auto!important;min-height:0!important}
  #vxWpForm .wp-block-os tr:first-child{height:auto!important;min-height:0!important}
  #vxWpForm .wp-block-os td{vertical-align:top!important}
  /* whirlpool-a4-fidelity-hotfix-v0813.js define #vxWpForm .wp-block-os
     .wp-exact-label-target{white-space:nowrap!important} (2 classes+id) --
     mesma especificidade que um simples "#vxWpForm .wp-exact-label-
     target" perde essa disputa dependendo da ordem de inserção no DOM
     (já vimos essa mesma classe de bug várias vezes nesta base de
     código). "html" extra garante especificidade estritamente maior,
     ganhando sempre, independente de ordem. */
  html #vxWpForm .wp-block-os .wp-exact-label-target{white-space:normal!important;padding-top:4mm!important;overflow-wrap:break-word!important}
  /* Rótulos curtos ("DEFEITO RECLAMADO", "LAUDO TÉCNICO" etc.) moram numa
     célula de rótulo estreita (14% de ~210mm) ao lado da célula de
     valor, na MESMA linha de tabela -- correto pra impressão, onde 14%
     de 210mm é ~29mm, de sobra pra "RECLAMAÇÃO"/"CONSTATADO". Em 14% de
     ~350px reais (~49px) nenhuma dessas palavras cabe inteira; testado
     com overflow-wrap/hyphens (quebra crua tipo "RECL-AMAD-O", ou
     hifenização que depende de dicionário do sistema operacional nem
     sempre disponível) -- nenhum dos dois ficou realmente legível.
     Solução mais robusta: a linha inteira (rótulo + valor) vira uma
     coluna flex empilhada -- o rótulo ganha a largura TOTAL do
     formulário (~350px) em vez de 14% dela, cabendo numa linha só sem
     precisar quebrar em lugar nenhum, com o valor abaixo. Identificado
     por estrutura (uma <td> cujo único filho é um <b>, o padrão usado
     só pelos rótulos estreitos de lado, nunca pelas células de valor)
     -- não depende de nenhuma classe nova nem mexe em como o documento
     é montado. */
  #vxWpForm .wp-exact-table tr:has(>td>b:only-child){display:flex!important;flex-direction:column!important}
  #vxWpForm .wp-exact-table tr:has(>td>b:only-child)>td{display:block!important;width:100%!important;text-align:left!important;vertical-align:top!important}
  #vxWpForm .wp-exact-doc td,#vxWpForm .wp-exact-doc th{overflow-wrap:break-word!important}
  #vxWpForm .wpf-parts th{white-space:normal!important;height:auto!important;min-height:16px!important;padding:2px!important}
  /* "TOTAL DE PEÇAS"/"TOTAL DE ORÇAMENTO": whirlpool-dimension-fix-v0813.js
     força white-space:nowrap!important nessa célula (correto pra
     impressão, onde 16% de 210mm sobra); overflow-wrap não tem efeito
     nenhum enquanto nowrap estiver ativo (não existe quebra de linha
     pra ele agir), por isso esse rótulo continuava vazando por cima do
     valor mesmo com a regra genérica acima. Mesmo seletor, só que
     depois na ordem de carregamento -- reverte nowrap->normal só aqui. */
  #vxWpForm table:has(#wpfTotalParts) tr:first-child td:nth-child(2){white-space:normal!important}
  #vxWpForm table:has(#wpfTotalParts) tr:first-child td:nth-child(3){white-space:normal!important}
  /* Mesmo padrão pro cabeçalho PARCELAS/VENCIMENTO/VALOR/CONDIÇÃO DE
     PAGAMENTO -- mesmo arquivo, mesma técnica (:has), força nowrap na
     linha inteira exceto a 1ª célula (ORÇAMENTO, rowspan). */
  #vxWpForm table:has(#wpfBudgetValue) tr:first-child td:not(:first-child){white-space:normal!important}
}
  `;
  document.head.appendChild(style);
})();
