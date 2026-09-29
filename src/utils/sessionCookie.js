// Secure sempre: navegadores aceitam cookie Secure em http://localhost, e em
// produção o app só roda em HTTPS.
const ACCESS_TOKEN_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

function setSessionCookie(res, { token, expiresIn }) {
  res.cookie('access_token', token, { ...ACCESS_TOKEN_COOKIE, maxAge: expiresIn * 1000 });
}

// Com os mesmos atributos do login, senão o navegador não apaga.
function clearSessionCookie(res) {
  res.clearCookie('access_token', ACCESS_TOKEN_COOKIE);
}

module.exports = { setSessionCookie, clearSessionCookie };
