# Auditoria de ações críticas do Admin

Contexto: Server Actions podem falhar em abas abertas por muito tempo quando o cliente tenta invocar uma ação serializada em uma versão antiga do bundle/manifesto do Next.js. Para fluxos interativos e destrutivos, a recomendação é expor uma API route autenticada e chamar via `fetch` no componente client, mantendo revalidação no servidor e atualização visual no cliente.

## Corrigido nesta alteração

- `src/app/admin/membros/page.tsx`: a exclusão na lista de membros deixou de depender de uma Server Action embutida na página. O botão agora chama `DELETE /api/admin/membros/[id]`, fecha o modal e executa `router.refresh()` para remover a linha sem refresh manual.

## Pontos críticos ainda baseados em Server Actions

Prioridade alta para migração para API routes + client fetch:

1. `src/app/admin/membros/[id]/page.tsx`
   - Atualizar plano/status de membro.
   - Cancelar assinatura.
   - Reativar assinatura.
   - Excluir membro no detalhe.
   - Motivo: alterações sensíveis de billing/acesso e exclusão definitiva.

2. `src/app/admin/kits/page.tsx`
   - Excluir kit.
   - Motivo: ação destrutiva de catálogo/conteúdo.

3. `src/app/admin/kits/novo/page.tsx` e `src/app/admin/kits/[id]/editar/page.tsx`
   - Criar/editar kits.
   - Motivo: formulários longos e interativos, com maior chance de aba ficar aberta antes do envio.

4. `src/app/admin/planos/page.tsx` e `src/app/admin/billing/permissoes/page.tsx`
   - Salvar planos e permissões de billing.
   - Motivo: alterações afetam acesso, monetização e autorização de funcionalidades.

5. `src/app/admin/banners/page.tsx` e `src/app/admin/home-sections/page.tsx`
   - Criar/editar/remover banners e seções da home.
   - Motivo: publicação visual no site; risco operacional menor que billing/membros, mas ainda é UI interativa.

6. `src/app/admin/harmomus-premium/solicitacoes/page.tsx`
   - Alterar status e remover solicitações premium.
   - Motivo: fila operacional com ações de status/remover.

7. `src/app/admin/categorias/page.tsx`
   - Salvar categoria.
   - Motivo: formulário simples; prioridade menor, mas também pode ser convertido para consistência.

## Recomendação de padrão

- Para ações sensíveis/interativas do Admin, criar `src/app/api/admin/.../route.ts` com validação `getCurrentUserAccessContext().isAdmin`.
- Manter a mutação no servidor usando helpers reutilizáveis em `src/lib/...` para evitar duplicação entre páginas e APIs.
- Retornar JSON com sucesso/erro claro, por exemplo `{ ok: true }` ou `{ error: "mensagem" }`.
- No client, usar `fetch`, loading, modal local, erro explícito e `router.refresh()` ou remoção otimista da linha.
- Manter `revalidatePath()` no endpoint após mutações que afetam páginas do Admin.
