# Auth System

API de autenticação em Node.js, Express e MongoDB. Tem cadastro com ativação por
e-mail, login com JWT, recuperação de senha e gestão de usuários com perfis `user` e
`admin`. O mesmo servidor entrega telas EJS e um painel admin, e um front em React
([glass-login-react](https://github.com/MarcosRBjunior/glass-login-react)) consome a
API.

**No ar**

| O quê                  | Endereço                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Front (React)          | <https://glass-login-react.vercel.app>                                                  |
| API                    | <https://autenticador-five.vercel.app/api/v1/health>                                    |
| Telas EJS e painel     | <https://autenticador-five.vercel.app/login>                                            |
| Documentação (OpenAPI) | [`docs/openapi.yaml`](docs/openapi.yaml) (Swagger UI em `/api-docs`, no ambiente local) |

## Funcionalidades

- **Cadastro com ativação por e-mail.** A conta nasce inativa, e o link de ativação
  vale 24 horas e só pode ser usado uma vez.
- **Login com JWT** (HS256, 1 hora). O token sai no corpo e também num cookie
  httpOnly. A API aceita `Authorization: Bearer` ou o cookie.
- **Logout de verdade.** Cada usuário tem uma versão de token, e o logout, a troca de
  senha e a mudança de perfil derrubam todos os tokens já emitidos dele.
- **Esqueci a senha.** O link vale 30 minutos. A resposta é a mesma com ou sem conta
  para o e-mail, então ninguém descobre quem está cadastrado.
- **Perfis `user` e `admin`.** O usuário comum vê dos outros só o username e a data de cadastro. O admin
  edita, muda o perfil e exclui contas, mas o sistema nunca fica sem nenhum admin
  ativo.
- **Rate limit** no cadastro, no login e nas rotas que mandam e-mail. A contagem fica
  no MongoDB e vale para todas as instâncias da função na Vercel.
- **Telas EJS** (login, cadastro, ativação, recuperação, usuários e painel admin)
  protegidas com CSRF.

## Stack

Node.js 20+, Express 5, MongoDB com Mongoose, JWT (`jsonwebtoken`), bcrypt, zod,
Nodemailer, pino, helmet e EJS. Os testes usam Jest, Supertest,
mongodb-memory-server e Playwright. Em produção, a API roda na Vercel com o banco no
MongoDB Atlas.

## Rodar localmente

Precisa de Node.js 20+ e Docker (para o MongoDB).

```bash
git clone https://github.com/MarcosRBjunior/Autenticador.git && cd Autenticador

npm install
npm run setup          # cria o .env com JWT_SECRET e senha do admin aleatórios
docker compose up -d   # MongoDB local na porta 27017
npm run dev            # http://localhost:3000
```

Depois, abra:

- <http://localhost:3000/login> para as telas.
- <http://localhost:3000/api-docs> para a documentação interativa da API.

**Admin.** Para criar o primeiro admin, rode `npm run seed:admin`. O usuário é
`admin` e a senha está em `ADMIN_PASSWORD` no `.env`.

**E-mails.** Sem `SMTP_HOST` no `.env`, os e-mails de ativação e de recuperação vão
para o [Ethereal](https://ethereal.email), uma caixa de teste. O log do servidor
mostra um link para ver cada mensagem, com o link de ativação dentro.

**Sem Docker.** Troque a `MONGODB_URI` do `.env` pela de um MongoDB que você já tenha
(o Atlas gratuito serve).

## Variáveis de ambiente

O [`.env.example`](.env.example) tem todas, comentadas. A API não sobe se faltar uma
obrigatória.

| Variável                                                        | Para quê                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `MONGODB_URI`                                                   | **Obrigatória.** Conexão com o MongoDB                                  |
| `JWT_SECRET`                                                    | **Obrigatória.** Segredo do JWT, com pelo menos 32 caracteres           |
| `APP_URL`                                                       | Endereço público do app, base dos links dos e-mails (https em produção) |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Envio de e-mails. Obrigatórias em produção                              |
| `CORS_ORIGIN`                                                   | Origens que podem chamar a API com cookies, separadas por vírgula       |
| `TRUST_PROXY`                                                   | Quantos proxies ficam na frente do app: `0` local, `1` na Vercel        |
| `NODE_ENV`, `PORT`, `LOG_LEVEL`                                 | Ambiente, porta (3000) e nível do log                                   |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`               | Só para o `npm run seed:admin`                                          |

## Exemplos com curl

Os exemplos usam o servidor local. Para testar em produção, troque o endereço por
`https://autenticador-five.vercel.app/api/v1`. O `jq` serve só para extrair o token.

```bash
API=http://localhost:3000/api/v1

# Estado da API e do banco
curl $API/health
# {"status":"ok","db":"up"}

# Cadastro: a conta nasce inativa e o link de ativação vai por e-mail
curl -X POST $API/register -H 'Content-Type: application/json' \
  -d '{"username":"ana","email":"ana@example.com","password":"senha-forte-123"}'

# Ativação: o token é o que vem no link do e-mail (/activate?token=...)
curl -X POST $API/auth/activate -H 'Content-Type: application/json' \
  -d '{"token":"<token do e-mail>"}'

# Login com o username ou o e-mail
TOKEN=$(curl -s -X POST $API/login -H 'Content-Type: application/json' \
  -d '{"username":"ana","password":"senha-forte-123"}' | jq -r .token)

# Rotas protegidas
curl $API/me -H "Authorization: Bearer $TOKEN"
curl "$API/users?page=1&limit=10&search=an" -H "Authorization: Bearer $TOKEN"

# Esqueci a senha (a resposta é a mesma com ou sem conta)
curl -X POST $API/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com"}'

# Logout: invalida todos os tokens do usuário
curl -X POST $API/logout -H "Authorization: Bearer $TOKEN"
```

Com o token de um admin:

```bash
curl $API/admin -H "Authorization: Bearer $ADMIN_TOKEN"
# {"totalUsers":2,"admins":1,"inactive":0}

curl -X PATCH $API/users/<id>/role -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"role":"admin"}'
```

Todo erro sai no mesmo formato:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Usuário ou senha inválidos" } }
```

## Rotas da API

Todas ficam sob `/api/v1`. O contrato completo, com corpos, respostas e códigos de
erro, está em [`docs/openapi.yaml`](docs/openapi.yaml).

| Método   | Rota                      | Acesso  | O que faz                                 |
| -------- | ------------------------- | ------- | ----------------------------------------- |
| `GET`    | `/health`                 | público | Estado da API e do banco                  |
| `POST`   | `/register`               | público | Cadastro (conta inativa até a ativação)   |
| `POST`   | `/login`                  | público | Login com username ou e-mail              |
| `POST`   | `/logout`                 | público | Invalida os tokens do usuário             |
| `POST`   | `/auth/activate`          | público | Ativa a conta com o token do e-mail       |
| `POST`   | `/auth/resend-activation` | público | Reenvia o link de ativação                |
| `POST`   | `/auth/forgot-password`   | público | Manda o link para redefinir a senha       |
| `POST`   | `/auth/reset-password`    | público | Define a senha nova com o token do e-mail |
| `GET`    | `/me`                     | logado  | Dados do próprio usuário                  |
| `GET`    | `/users`                  | logado  | Lista paginada, com busca por username    |
| `GET`    | `/users/:id`              | logado  | Um usuário                                |
| `GET`    | `/admin`                  | admin   | Contadores: total, admins e inativos      |
| `PUT`    | `/users/:id`              | admin   | Muda o username ou a senha                |
| `PATCH`  | `/users/:id/role`         | admin   | Muda o perfil                             |
| `DELETE` | `/users/:id`              | admin   | Exclui a conta                            |

## Testes

```bash
npm test             # Jest: unidade e integração, com MongoDB em memória (não precisa de Docker)
npm run test:e2e     # Playwright: fluxos no navegador
npm run lint         # ESLint
npm run format:check # Prettier
```

O CI (GitHub Actions) roda tudo isso a cada pull request, junto com o `npm audit`. A
`main` só aceita merge com o CI verde.

## Deploy

A API e o front são dois projetos na Vercel. O front repassa `/api` para a API, então
o cookie de sessão fica na mesma origem. O passo a passo e as limitações conhecidas
estão em [`docs/deploy-vercel.md`](docs/deploy-vercel.md).

## Estrutura

```text
index.js            entrada da Vercel (conecta ao banco na primeira requisição)
server.js           entrada local (npm start / npm run dev)
src/
  app.js            middlewares, rotas e tratamento de erros
  config/           variáveis de ambiente (validadas com zod) e conexão com o MongoDB
  routes/           rotas da API (/api/v1), das telas EJS e do /api-docs
  middlewares/      guard de autenticação, CSRF, validação, rate limit, erros
  controllers/      HTTP de entrada e saída; controllers/pages/ para as telas
  services/         regras de negócio (auth, usuários, tokens, e-mail)
  repositories/     acesso ao MongoDB
  models/           schemas do Mongoose
  validators/       schemas zod dos corpos e das queries
  views/            telas EJS
scripts/            seed do admin e criação do .env
docs/               OpenAPI e guia de deploy
tests/              Jest
e2e/                Playwright
```
