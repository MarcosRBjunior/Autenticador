# Deploy na Vercel

São dois projetos na Vercel:

| Projeto                                     | O que publica                                                    | Configuração                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **API** (este repositório)                  | A API `/api/v1` e as páginas EJS (painel admin), como uma função | `index.js` (entrada da Vercel) e `vercel.json` (região `gru1`, São Paulo, a mesma do cluster do Atlas) |
| **Front** (repositório `glass-login-react`) | O React (Vite) estático                                          | `vercel.json`: repassa `/api/*` para a API e manda os outros caminhos para o `index.html`              |

O front repassa `/api` para a API (proxy) em vez de chamá-la direto porque a sessão
é um cookie httpOnly `SameSite=Lax`. Dois endereços `*.vercel.app` são sites
diferentes para o navegador, que não mandaria o cookie numa chamada direta. Pelo
proxy, front e API ficam na mesma origem, como o proxy do Vite em desenvolvimento.

## 1. MongoDB Atlas

Em **Network Access**, libere `0.0.0.0/0`: os IPs das funções da Vercel mudam.

## 2. Projeto do front

1. Suba o `glass-login-react` para um repositório próprio no GitHub (ele já tem
   `.gitignore`).
2. Na Vercel: **Add New → Project**, importe esse repositório. O framework (Vite) vem
   do `vercel.json`; não precisa de variável de ambiente.
3. Anote o domínio de produção em **Settings → Domains** (ex.:
   `https://autenticador.vercel.app`). Por enquanto o login não funciona: o
   `vercel.json` ainda aponta para `https://dominio-da-api.invalid`, que não existe.

## 3. Projeto da API

1. **Add New → Project**, importe este repositório (`MarcosRBjunior/Autenticador`).
   O framework é detectado como Express e a entrada é o `index.js`.
2. Em **Environment Variables** (Production), cadastre:

| Variável      | Valor                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`    | `production`                                                                                                |
| `MONGODB_URI` | a do Atlas, com o banco no caminho (`...mongodb.net/auth-system?appName=...`)                               |
| `JWT_SECRET`  | um segredo novo, só da produção: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `TRUST_PROXY` | `1`                                                                                                         |
| `APP_URL`     | o domínio do front (passo 2), ex.: `https://autenticador.vercel.app`                                        |
| `CORS_ORIGIN` | o mesmo domínio do front                                                                                    |
| `MAIL_FROM`   | `Auth System <endereço do Gmail>`                                                                           |
| `SMTP_HOST`   | `smtp.gmail.com`                                                                                            |
| `SMTP_PORT`   | `587`                                                                                                       |
| `SMTP_USER`   | o endereço do Gmail                                                                                         |
| `SMTP_PASS`   | a senha de app, sem os espaços                                                                              |
| `LOG_LEVEL`   | `info`                                                                                                      |

Em produção a API não sobe sem `APP_URL` (https), `MAIL_FROM` e as variáveis de SMTP.
As `ADMIN_*` não vão para a Vercel: o seed roda da sua máquina.

3. Faça o deploy e anote o domínio de produção da API em **Settings → Domains** (ex.:
   `https://autenticador-api.vercel.app`). Use esse domínio, não a URL do deployment
   (`...-git-main-....vercel.app`): as URLs de deployment ficam atrás da proteção da
   Vercel e o proxy do front receberia 401.

## 4. Ligar o front à API

No `vercel.json` do front, troque `https://dominio-da-api.invalid` pelo domínio da
API e faça o push: a Vercel publica de novo sozinha.

## 5. Admin

O banco é o mesmo do desenvolvimento, então o admin criado pelo `npm run seed:admin`
já existe. Num banco novo, rode o seed da sua máquina com a `MONGODB_URI` dele e
`NODE_ENV=production` (que exige senha forte).

## 6. Conferir

- `https://<api>/api/v1/health` responde `{"status":"ok","db":"up"}`.
- No front, o login do admin abre a tela "Você entrou" e continua logado depois de
  recarregar a página (o cookie passou pelo proxy).
- Um cadastro com outro e-mail recebe o link de ativação apontando para o front
  (`https://<front>/activate?token=...`).
- `https://<api>/login` abre o painel EJS.
- Nos logs da função da API, a região é `gru1`.

## Limitações conhecidas

- **Rate limit por IP pelo front.** A Vercel não repassa o IP do visitante através
  do proxy, então os limites por IP (cadastro, links por e-mail, ativação e reset)
  contam todos os acessos pelo front juntos. O limite de tentativas de login é por
  conta e não muda. As contagens também ficam em memória, por instância da função.
- **Gmail** envia até cerca de 500 e-mails por dia, e o remetente é a conta usada no
  `SMTP_USER`.
- **Desenvolvimento e produção usam o mesmo banco.** Testes locais (cadastros,
  resets) mexem nos dados de produção. Para separar, crie outro banco no Atlas e dê
  ao usuário permissão nele.
