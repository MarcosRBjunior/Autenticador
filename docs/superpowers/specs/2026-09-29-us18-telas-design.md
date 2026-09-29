# US-18: telas EJS com o visual do glass-login

Issue: [AUT-22](https://linear.app/autenticator/issue/AUT-22/us-18-telas-ejs-login-registro-esquecireset-e-usuarios) · Requisito RF-15 · Decisões D-04, D-06, D-08, D-11

As telas do sistema passam a existir em EJS, renderizadas pelo próprio Express, com o visual da tela React `glass-login-react` (fundo azul com formas 3D, card de vidro fosco, fonte Outfit). Com elas, os links dos e-mails de ativação e de reset deixam de dar 404.

## Decisões

| Tema              | Decisão                                                                      | Por quê                                                                                             |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Tecnologia        | EJS com o visual do React (não React, não os dois)                           | O PDF exige `login.ejs` (D-11); a tela React é marcação + CSS, fácil de portar                      |
| Lista de usuários | Opção B dos mockups: barra de vidro no topo + um cartão por usuário          | Escolha do usuário; a barra vira o cabeçalho das páginas logadas (reaproveitada no painel da US-19) |
| Funcionamento     | Formulários tratados no servidor, POST + redirect (PRG)                      | Segue a D-11 (JS mínimo) e funciona sem JavaScript                                                  |
| CSRF              | Token de duplo envio assinado (HMAC), sem dependência                        | Padrão da OWASP; cobre também o formulário de login                                                 |
| Idioma            | Português; "Auth System" no lugar de "Your logo"; sem botões de login social | O app é todo em português; OAuth está fora do escopo                                                |

Mockups: https://claude.ai/artifact/B2umQu9k3yUBFR4LC4cEmo

## Estrutura

- Dependência nova: `ejs`. Partes comuns como _partials_, sem biblioteca de layout.
- `src/views/`: `login`, `register`, `forgot-password`, `reset-password`, `activate`, `resend-activation` (card de vidro), `users` (barra + cartões), `error` (403/404/429/500, no card).
- `src/views/partials/`: `head`, `decor` (SVG das formas 3D, gerado uma vez do componente `DecorBackground` do React), `topbar` (Usuários · Admin só para admin · nome · Sair), `field` (rótulo, input, erro do campo).
- `public/`: `css/app.css` (tokens e CSS do glass-login adaptados), `fonts/` (Outfit 500 e 700), `js/password-toggle.js` (olho da senha).
- `src/routes/page.routes.js` ganha as rotas; `src/controllers/page.controller.js` chama os mesmos services da API (`AuthService`, `UserService`).
- `src/app.js`: `express.static('public')` antes do guard; `express.urlencoded({ extended: false, limit: '10kb' })`; `views` por caminho absoluto (funciona na Vercel).
- O card mantém 410 px de largura, com altura pelo conteúdo; em telas estreitas ocupa a largura disponível (regra que o CSS do React já tem).

## Fluxos

Todo POST termina em redirect 303. Avisos depois do redirect vêm de um parâmetro fixo (`?activated=1`, `?reset=1`, `?registered=1`, `?sent=1`) que corresponde a um texto do app, nunca a texto do usuário.

| Tela                     | GET                                                                                                                | POST: sucesso                                                                                | POST: erro                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/login`                 | "Usuário ou e-mail", "Senha"; logado vai para `/users`; mostra avisos de conta criada, ativada ou senha redefinida | Grava o cookie `access_token` (mesmos atributos da API) → `/users`                           | 401: mensagem genérica, usuário preenchido, senha vazia · 403 inativa: aviso com link para reenviar ativação |
| `/register`              | username, e-mail, senha, confirmar senha, regras de senha visíveis                                                 | → `/login?registered=1`; e-mail de ativação em segundo plano (`background.run`), como na API | Erros por campo (validação, "já cadastrado", senhas diferentes), valores preenchidos menos as senhas         |
| `/forgot-password`       | e-mail                                                                                                             | → `/forgot-password?sent=1` com aviso genérico; envio em segundo plano                       | E-mail inválido: erro no campo                                                                               |
| `/resend-activation`     | e-mail                                                                                                             | → `/resend-activation?sent=1` com aviso genérico                                             | E-mail inválido: erro no campo                                                                               |
| `/reset-password?token=` | senha nova + confirmação, token em campo oculto; sem token: aviso com botão "Pedir novo link"                      | → `/login?reset=1`                                                                           | Senha fora das regras: erro no campo, link continua valendo · link inválido: aviso + "Pedir novo link"       |
| `/activate?token=`       | card "Ativar conta" com botão **Ativar minha conta** (só o POST ativa)                                             | → `/login?activated=1`                                                                       | Link inválido: aviso + link para reenviar                                                                    |
| `/users` (logado)        | Barra + busca por username + cartões + paginação de 20                                                             | —                                                                                            | —                                                                                                            |
| `/`                      | Logado → `/users`; senão → `/login`                                                                                | —                                                                                            | —                                                                                                            |

- `/users` usa `userService.listUsers(req.user, …)`: pela D-08, o usuário comum vê username e data de criação; o admin vê também e-mail, perfil e status.
- "Sair" é o `GET /logout` que já existe (US-14).
- Rate limits: as rotas de página usam **as mesmas instâncias** da API (login, cadastro, forgot, reenvio, reset, ativação), com o mesmo contador.

## Segurança e erros

- **CSRF:** na primeira visita, cookie aleatório `csrf` (`httpOnly`, `Secure`, `SameSite=Lax`); cada formulário leva num campo oculto o HMAC-SHA256 desse valor com o `JWT_SECRET`. No POST, recalcula e compara com `timingSafeEqual`; divergência → 403 "A página expirou, recarregue e tente de novo", sem efeito. Vale para todos os formulários, inclusive o login. A API JSON segue sem CSRF (Bearer ou cookie `SameSite=Lax`, só aceita JSON).
- **Sessão:** o mesmo cookie `access_token` da API (1 h). Páginas logadas com `Cache-Control: no-store`.
- **Sem login:** fora de `/api`, o guard redireciona para `/login` e apaga um cookie inválido; em `/api` continua o 401 em JSON.
- **Allowlist nova:** `GET /`; `GET` e `POST` de `/login`, `/register`, `/forgot-password`, `/reset-password`, `/activate`, `/resend-activation`. Arquivos de `public/` servidos antes do guard.
- **Erros:** fora de `/api`, o `errorHandler` renderiza `error.ejs` (403 "Sem permissão", 404 "Página não encontrada", 429 "Muitas tentativas", 500 "Algo deu errado", com link de volta); a API segue em JSON.
- **Saída:** dados do usuário só com `<%= %>`; `<%- %>` só para `include` de partials. Sem script embutido (CSP do helmet); o único script é `public/js/password-toggle.js`. `form-action 'self'` do helmet.

## Testes

- **Integração (Jest + supertest):** `request.agent` guarda os cookies; helpers pequenos leem o token CSRF e as mensagens do HTML (sem dependência nova). Cobrem, por tela: sucesso (redirect + aviso), erros por campo com valores preenchidos e sem repetir senha, link inválido. E também: CSRF ausente ou errado → 403 sem efeito; `/users` sem login → redirect para `/login` e API → 401 JSON; 404/500 em HTML nas páginas e em JSON na API; `?search=<script>` escapado; rate limits compartilhados com a API; `no-store` nas páginas logadas; visão D-08 dos cartões.
- **E2E (Playwright, critério de aceite):** `@playwright/test` como dependência de desenvolvimento, testes em `e2e/` (fora do Jest). Um script sobe o app com Mongo em memória e um usuário ativo. Fluxos: login → `/users` com os cartões → Sair → `/login`; cadastro → ativação (link capturado pelo teste) → login. CI: instala só o Chromium e roda `npm run test:e2e`.
- **Revisão visual:** prints das telas reais pelo Playwright, publicados no link dos mockups antes do merge.

## Fora do escopo

- Painel admin (`admin.ejs`, US-19); o link "Admin" da barra aponta para `/admin`, que dá 404 até lá.
- Edição e exclusão de usuários nas telas (D-06: ficam no painel admin).
- Deploy e servir `public/` pela CDN da Vercel (US-20).

## Ordem de implementação

1. Estrutura: EJS, `public/` (CSS, fontes, script do olho), partials, `error.ejs`, `errorHandler` para páginas, redirect para `/login` no guard, `GET /`.
2. CSRF.
3. Login.
4. Cadastro.
5. Ativação e reenvio.
6. Esqueci a senha e nova senha.
7. Usuários.
8. E2E com Playwright e CI.
