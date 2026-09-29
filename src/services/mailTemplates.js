// E-mails em texto simples. O link fica sozinho na linha para o cliente de
// e-mail reconhecê-lo inteiro. Nada escolhido no cadastro entra no texto: quem
// se cadastra pode usar o e-mail de outra pessoa, e um username como
// "secure-login.evil.io" viraria link numa mensagem do nosso remetente.

function formatValidity(minutes) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

function activation({ url, expiresInMinutes }) {
  return {
    subject: 'Ative sua conta',
    text: [
      'Olá!',
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

function passwordReset({ url, expiresInMinutes }) {
  return {
    subject: 'Redefina sua senha',
    text: [
      'Olá!',
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
