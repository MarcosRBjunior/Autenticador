// E-mails em texto simples. O link fica sozinho na linha para o cliente de
// e-mail reconhecê-lo inteiro.

function formatValidity(minutes) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

function activation({ username, url, expiresInMinutes }) {
  return {
    subject: 'Ative sua conta',
    text: [
      `Olá, ${username}!`,
      '',
      'Para ativar sua conta, abra o link abaixo:',
      '',
      url,
      '',
      `O link vale por ${formatValidity(expiresInMinutes)}.`,
      '',
      'Se você não criou esta conta, ignore este e-mail.',
    ].join('\n'),
  };
}

function passwordReset({ username, url, expiresInMinutes }) {
  return {
    subject: 'Redefina sua senha',
    text: [
      `Olá, ${username}!`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta. Para escolher uma nova senha, abra o link abaixo:',
      '',
      url,
      '',
      `O link vale por ${formatValidity(expiresInMinutes)}.`,
      '',
      'Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma.',
    ].join('\n'),
  };
}

module.exports = { activation, passwordReset };
