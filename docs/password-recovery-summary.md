# Resumo da correção de recuperação de senha

- A solicitação de recuperação não informa mais sucesso em falhas internas.
- O envio precisa ser aceito pelo provedor de e-mail para gerar `success=1`.
- O formulário de nova senha só aparece com token de recuperação válido ou em migração explícita.
- Logs de geração, envio, verificação e atualização foram melhorados sem expor tokens sensíveis.
