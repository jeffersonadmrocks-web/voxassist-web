# VoxAssist — Descoberta do Dia

## Objetivo
Criar no Dashboard uma experiência diária, curta e agradável, que gere curiosidade, aprendizado e pequenas doses de conhecimento sem interromper o trabalho.

## Nome oficial
**Descoberta do Dia**

## Regras funcionais
- Exibir no primeiro acesso diário de cada usuário.
- A descoberta não pode ser desativada pelo usuário.
- Depois de exibida, permanece acessível de forma discreta no Dashboard durante o dia.
- O usuário só pode consultar conteúdos que já tenham sido apresentados a ele.
- A biblioteca completa não fica disponível para navegação por usuários comuns.
- A meta inicial é uma biblioteca de aproximadamente **1.000 conteúdos validados**.
- Não existe teto fixo: o banco deve poder crescer continuamente.
- Evitar repetição recente para o mesmo usuário.
- Permitir conteúdos comuns a toda a equipe e também conteúdos direcionados por cargo.

## Tipos de conteúdo
- Ciência
- Tecnologia
- Eletrônica
- Refrigeração
- História das invenções
- Espaço
- Natureza
- Brasil
- Matemática
- Comunicação
- Atendimento
- Vendas
- Segurança
- Gestão
- Liderança
- Produtividade
- Desenvolvimento pessoal
- Curiosidades gerais
- Frases de autores importantes
- Aprendizado do próprio trabalho

## Frases e autores
- Toda frase, pensamento ou citação deve exibir o autor, mesmo quando for curta.
- Não publicar citações de autoria duvidosa.
- Preferir fontes confiáveis e autoria verificável.

## Níveis de leitura
Cada descoberta pode ter:
1. **Texto curto principal** — leitura em poucos segundos.
2. **Informação curta** — 2 a 3 linhas adicionais na própria tela.
3. **Quero saber mais** — explicação ampliada para quem quiser aprofundar.

## Personalização por cargo
- Técnico: maior peso para eletrônica, diagnóstico, segurança, refrigeração e boas práticas técnicas.
- Atendente: atendimento, comunicação, vendas, experiência do cliente e operação.
- Gestor: liderança, gestão, produtividade, indicadores, cultura e desenvolvimento de equipe.
- Todos: ciência, tecnologia, história, curiosidades, invenções e desenvolvimento pessoal.

## Histórico individual
Criar área **Minhas Descobertas** com acesso somente ao histórico já apresentado ao próprio usuário.

Registrar por usuário:
- discovery_id
- data/hora de apresentação
- se abriu Informação Curta
- se clicou em Quero saber mais
- categoria

Esses dados servem para melhorar relevância e curadoria, nunca como avaliação de desempenho do funcionário.

## Curadoria e automação
- Novos conteúdos podem ser buscados/gerados automaticamente, mas não devem ir direto para publicação sem validação.
- Conteúdo novo entra como rascunho.
- Deve existir validação de fonte, autoria, data e confiabilidade.
- Conteúdos internos de trabalho podem ser gerados a partir de procedimentos, regras do VoxAssist e boas práticas da empresa.
- Gestor terá visão administrativa da biblioteca e poderá aprovar/rejeitar conteúdos e definir uma descoberta específica para todos em determinada data.

## Estratégia da biblioteca
- Meta inicial: ~1.000 conteúdos aprovados.
- Banco vivo e expansível.
- Misturar conteúdos comuns e personalizados.
- Controlar histórico por usuário.
- Não permitir que o usuário "queime" descobertas futuras navegando na base.

## Sugestão inicial de distribuição
- 25% Ciência e Tecnologia
- 15% História e Invenções
- 20% Trabalho e Operação
- 10% Eletrônica/Refrigeração
- 10% Curiosidades Gerais
- 10% Gestão/Comunicação/Produtividade
- 10% Frases e autores importantes

Percentuais são configuráveis e podem ser refinados pelo uso real.

## Segurança e administração
- Gestor pode administrar toda a biblioteca.
- Usuários comuns veem apenas conteúdos já apresentados a eles.
- Conteúdos futuros não ficam expostos em busca, histórico ou API de leitura comum.
- Permissões devem respeitar a futura estrutura de cargos e liberações individuais do VoxAssist.

## Status
Especificação consolidada em 2026-08-18 para impedir perda das decisões feitas em conversas de desktop e celular.
