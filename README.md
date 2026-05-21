# Harmomus App

Plataforma própria do Harmomus para central administrativa, biblioteca de kits vocais, controle de planos, integração com Cloudflare R2 e assinaturas.

## Primeira fundação

- Next.js App Router
- Tailwind CSS
- Central administrativa em `/admin`
- Estrutura inicial para kits, categorias, planos, usuários e assinaturas
- SQL inicial para Supabase em `supabase/schema.sql`

## Próximos passos

1. Instalar dependências com `npm install`.
2. Configurar `.env.local` baseado em `.env.example`.
3. Criar o projeto no Supabase e rodar `supabase/schema.sql`.
4. Conectar Cloudflare R2 para uploads e leitura de áudios/imagens.
