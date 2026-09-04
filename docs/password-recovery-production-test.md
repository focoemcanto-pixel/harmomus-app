# Smoke test de produção — recuperação de senha

Após o deploy:

1. Solicitar recuperação para um usuário de teste real.
2. Confirmar log `recovery email sent` com `deliveryId`.
3. Abrir o e-mail recebido e redefinir a senha.
4. Confirmar log `password updated`.
5. Entrar com a nova senha.
6. Repetir especificamente para o endereço relatado no suporte, acompanhando os logs, caso autorizado.
