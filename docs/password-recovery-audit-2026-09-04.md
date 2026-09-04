# Auditoria do fluxo de recuperação de senha — 2026-09-04

## Problema encontrado

A rota pública de recuperação redirecionava sempre para `?success=1`, mesmo quando a geração do link de recuperação pelo Supabase falhava ou quando o envio do e-mail pelo Resend falhava.

Isso fazia a interface informar que o e-mail havia sido enviado sem confirmação real de entrega pela API de e-mail.

## Correções aplicadas

- Falha em `admin.auth.admin.generateLink()` agora retorna estado de erro na interface.
- Ausência de `hashed_token` agora retorna estado de erro.
- Falha em `sendEmail()` agora retorna estado de erro.
- Sucesso só é exibido depois de confirmação `sent.ok`.
- Logs passaram a registrar `deliveryId` quando o Resend aceita o envio.
- A tela de definição de nova senha só renderiza o formulário quando há token de recuperação válido ou fluxo explícito de migração.
- Logs de verificação e atualização de senha ficaram mais diagnósticos, sem registrar o token de recuperação.

## Caso relatado

E-mail informado no atendimento: `nataliamellissa@gmail.com`.

O código do repositório não permite confirmar o estado vivo desse usuário no Supabase Auth nem o histórico de entrega do Resend. Após deploy, um novo teste de recuperação para esse endereço deverá indicar claramente se a falha está na geração do link ou na entrega do e-mail por meio dos logs de produção.
