# Auditoria inicial do Harmomus App

## Repositório
- `focoemcanto-pixel/harmomus-app`
- Branch principal: `main`
- Stack detectada: Next.js App Router + Supabase + OpenNext Cloudflare.

## Achados iniciais

### 1. Preview dos kits na Home pode não aparecer em todos os kits
Em `src/lib/data/public-kits.ts`, a função `getPublishedKits()` busca apenas os registros da tabela `kits` e monta cada kit com lista de arquivos vazia:

```ts
return kitsRows.map((kit) => mapKit(kit, maps.categoriesMap, maps.plansMap, []));
```

Como `mapKit()` depende dos arquivos de áudio para calcular `previewAudioFileId` quando o campo `preview_audio_file_id` não foi definido manualmente, o botão de preview pode desaparecer na Home e nas listagens que usam `getPublishedKits()`.

Correção recomendada: buscar `kit_audio_files` dos kits publicados e agrupar por `kit_id` antes de chamar `mapKit()`.

### 2. Dependências usando `latest`
O `package.json` usa `latest` para Next, React, Supabase, Wrangler, OpenNext e várias libs. Isso aumenta o risco de quebra inesperada em build/deploy, principalmente no Cloudflare/OpenNext.

Correção recomendada: fixar versões estáveis que já passaram no deploy.

### 3. `next.config.ts` libera imagens de qualquer host
O `remotePatterns` aceita `http` e `https` com hostname `**`. Funciona, mas abre margem para imagens externas não controladas.

Correção recomendada: limitar aos hosts reais usados pelo Harmomus/Supabase/R2.

## Próxima ação sugerida
Aplicar primeiro a correção do preview em `getPublishedKits()`, pois ela impacta diretamente a experiência da Home e o botão discreto de preview que foi planejado.
