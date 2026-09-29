# US-19: painel admin

Issue: [AUT-23](https://linear.app/autenticator/issue/AUT-23/us-19-painel-admin-adminejs) · Requisitos RF-11, RF-15 · Decisões D-06, D-09

O admin ganha a página `/admin` com os contadores e a lista de contas, e as ações de editar, mudar o perfil e excluir. A US-19 também fecha duas pendências da US-18: o "Sair" por POST com CSRF e o cookie CSRF com prefixo `__Host-`.

Mockups: https://claude.ai/artifact/MuotqDEFE5e2ykP6rE2pF6 (opção A escolhida).

## Decisões

| Tema             | Decisão                                                                                         | Por quê                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Layout           | Opção A: barra de vidro, três contadores e a tabela de vidro com as ações por linha             | Cabem mais contas por tela; é a tabela que a especificação descreve |
| Funcionamento    | O mesmo da US-18: formulários tratados no servidor, POST + redirect 303, CSRF                   | O painel se encaixa sem nada novo                                   |
| Editar e excluir | Telas próprias no card de vidro, sem JavaScript; a exclusão só acontece no botão da confirmação | Confirmação sem JS, como pede a D-11                                |
| A própria linha  | Marca "(você)", sem "Tornar usuário" e sem "Excluir"                                            | Ninguém se tranca fora do painel por engano                         |
| Rate limit       | Nenhum nas ações do painel                                                                      | Só um admin logado chega nelas                                      |
| "Sair"           | Formulário POST `/logout` com CSRF na barra; `GET /logout` continua                             | Outro site não consegue deslogar ninguém; o PDF pede o `GET`        |
| Cookie CSRF      | `__Host-csrf`                                                                                   | Um subdomínio não consegue plantar o cookie                         |

## Telas e fluxos

Todas as rotas do painel passam pela sessão (guard) e pelo `isAdmin`, nessa ordem: quem não é admin recebe a página 403 "Sem permissão", antes de qualquer checagem de formulário. Um `:id` inválido ou de conta inexistente dá a página 404.

| Rota                           | O que faz                                                                                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin`                   | Contadores (`getStats`: usuários, admins, inativos), busca por username e a tabela (username, e-mail, perfil, status, ações), páginas de 20 (`listUsers`). Mostra o aviso do parâmetro fixo `?done=updated                        | role | deleted`ou`?error=last-admin`. |
| `POST /admin/users/:id/role`   | Botão "Tornar admin" / "Tornar usuário" (`changeRole`). Volta para `/admin` na mesma busca e página, com "Perfil alterado." ou "Não é possível remover o último admin."                                                           |
| `GET /admin/users/:id/edit`    | Card com username e senha nova opcional ("deixe em branco para manter").                                                                                                                                                          |
| `POST /admin/users/:id`        | `updateUser`. Erros por campo (400 validação, 409 username já usado) com o valor digitado; a senha nunca volta. Sucesso → `/admin` com "Usuário atualizado.". Trocar a senha encerra as sessões daquela conta (RN-11, já na API). |
| `GET /admin/users/:id/delete`  | Card "Excluir usuário" com username e e-mail da conta, botão **Excluir conta** (POST) e Cancelar.                                                                                                                                 |
| `POST /admin/users/:id/delete` | `deleteUser`. Sucesso → `/admin` com "Usuário excluído."; último admin → "Não é possível remover o último admin.".                                                                                                                |

A busca e a página da lista viajam como query nos links de editar e excluir e como campos ocultos nos formulários, para cada ação voltar à mesma posição. Avisos só por parâmetros fixos, nunca texto da URL.

## Pendências da US-18

- **"Sair" por POST:** a barra do topo tem um formulário `POST /logout` com o token CSRF e um botão no mesmo visual do link de hoje. `/users` passa a emitir o token CSRF, porque a barra aparece lá. `POST /logout` entra na allowlist e segue a mesma lógica do `GET /logout` (sai mesmo com o token já inválido e redireciona para `/login`).
- **Cookie `__Host-csrf`:** o prefixo exige `Secure`, `path=/` e nenhum `Domain`, que já são as opções de hoje. Um navegador com o cookie antigo recebe um novo na próxima página.

## Testes

- **Jest:** 403 para usuário comum; contadores e tabela; a própria linha sem "Tornar usuário" nem "Excluir"; trocar o perfil (redirect, banco, aviso, busca e página mantidas); último admin; editar com sucesso e com erros por campo (400 e 409); confirmar e excluir; conta inexistente e `:id` inválido → 404; CSRF 403 em cada POST novo (no teste que já cobre todos os formulários); logout por POST com e sem token; o nome `__Host-csrf`.
- **E2E:** o admin entra, abre o painel, promove uma conta criada pelo próprio teste (única por tentativa) e a vê como admin, depois a exclui pela confirmação. O servidor de E2E passa a criar também um admin. O teste atual troca o link "Sair" pelo botão.
- **Revisão visual:** prints das telas reais no link dos mockups antes do merge.

## Fora do escopo

- Criar contas pelo painel (o cadastro já existe).
- Ativar ou desativar contas pelo painel (não há rota na API).
- Bloquear no servidor que o admin rebaixe ou exclua a si mesmo: a interface esconde as ações, e um POST forjado só desloga o próprio admin, porque a sessão dele cai.

## Ordem de implementação

1. Cookie `__Host-csrf` e "Sair" por POST.
2. Painel: contadores, tabela, busca, paginação e troca de perfil.
3. Editar usuário.
4. Excluir usuário com confirmação.
5. E2E do painel.
