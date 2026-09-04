# Nota de incidente — recuperação de senha

Data: 2026-09-04

Sintoma: cliente relata dificuldade para entrar e para recuperar a senha.

Causa confirmada no código: a rota de solicitação de recuperação sempre retornava a interface de sucesso, inclusive quando Supabase ou Resend retornavam erro. Isso impedia distinguir envio real de falha silenciosa.

Estado após correção: sucesso visual depende de geração válida do token e confirmação de aceite do e-mail pelo provedor. Falhas passam a gerar estado de erro e logs específicos.
