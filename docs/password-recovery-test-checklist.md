# Checklist de teste — recuperação de senha

1. Acesse `/recuperar-senha` deslogado.
2. Informe um e-mail de usuário existente.
3. Confirme que a tela só mostra sucesso depois do POST concluir.
4. Verifique nos logs `[auth.password.reset] recovery email sent` e o `deliveryId`.
5. Abra apenas o e-mail mais recente.
6. Confirme que a URL abre `/redefinir-senha` com o formulário habilitado.
7. Informe duas senhas diferentes e confirme a mensagem `As senhas não conferem.`.
8. Informe senha com menos de 6 caracteres e confirme a validação.
9. Salve uma senha válida.
10. Confirme redirecionamento para `/login?reset=success`.
11. Faça login com a nova senha.
12. Reabra o mesmo link de recuperação já usado e confirme que ele é rejeitado como inválido/expirado.
13. Teste um link sem `token_hash` e confirme que nenhum formulário de alteração é exibido.

## Diagnóstico esperado nos logs

- Geração falhou: `[auth.password.reset] generateLink failed`
- Token não retornado: `[auth.password.reset] generated link without hashed token`
- E-mail falhou: `[auth.password.reset] recovery email failed`
- E-mail aceito pelo provedor: `[auth.password.reset] recovery email sent`
- Token inválido/expirado: `[auth.password.update] recovery token verification failed`
- Atualização falhou: `[auth.password.update] admin password update failed`
- Senha atualizada: `[auth.password.update] password updated`
