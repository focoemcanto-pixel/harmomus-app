# Observabilidade da recuperação de senha

O fluxo público usa logs estruturados com os seguintes marcadores:

- `[auth.password.reset] generateLink failed`
- `[auth.password.reset] generated link without hashed token`
- `[auth.password.reset] recovery email failed`
- `[auth.password.reset] recovery email sent`
- `[auth.password.update] recovery token verification failed`
- `[auth.password.update] admin password update failed`
- `[auth.password.update] password updated`

Nenhum desses logs deve incluir o `token_hash` ou a senha informada pelo usuário.
