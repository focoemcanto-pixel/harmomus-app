# Referência rápida de logs

Durante um teste de recuperação, procure em ordem:

1. `[auth.password.reset] recovery email sent`
2. `[auth.password.update] password updated`

Se o primeiro não aparecer, procure `generateLink failed`, `generated link without hashed token` ou `recovery email failed`.

Se o primeiro aparecer e o segundo não, procure `recovery token verification failed` ou `admin password update failed`.
