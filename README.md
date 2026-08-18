# VoxAssist Web

Versão web do VoxAssist para desenvolvimento e homologação.

## Estado atual

A primeira base navegável já está publicada na branch `main`.

Inclui:

- Dashboard com indicadores fictícios.
- Ordens de Serviço com listagem e formulário de nova OS.
- Clientes.
- Oficina.
- Estoque.
- Financeiro.
- Testes de Funções.
- Perfis previstos: Gestor, Atendente, Técnico e Estoque.
- Estrutura inicial do banco em `supabase/schema.sql`.

## Ambiente de homologação

Todos os registros exibidos nesta etapa são fictícios. Não utilizar dados reais de clientes antes de configurar autenticação, políticas RLS e permissões no Supabase.

## Executar localmente

Como esta primeira base não possui dependências externas, basta servir a pasta por um servidor HTTP simples e abrir `index.html`.

Exemplo com Python:

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Próximas etapas

1. Conectar o projeto ao Supabase.
2. Implementar autenticação e perfis.
3. Persistir clientes e Ordens de Serviço.
4. Implementar histórico/auditoria de situação.
5. Evoluir cada módulo conforme o Backlog Mestre.

## Segurança

O arquivo `.gitignore` impede o commit acidental de arquivos `.env`. Chaves privadas e `service_role` nunca devem ser gravadas no repositório.