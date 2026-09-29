const templates = require('../src/services/mailTemplates');

const ACTIVATION_URL = 'http://localhost:3000/api/v1/auth/activate/abc123';
const RESET_URL = 'http://localhost:3000/reset-password?token=abc123';

describe('mailTemplates', () => {
  describe.each([
    ['activation', ACTIVATION_URL, /ativ/i],
    ['passwordReset', RESET_URL, /senha/i],
  ])('%s', (name, url, subjectPattern) => {
    const email = templates[name]({ username: 'ana', url, expiresInMinutes: 30 });

    it('tem assunto próprio', () => {
      expect(email.subject).toMatch(subjectPattern);
    });

    it('cumprimenta o usuário pelo nome', () => {
      expect(email.text).toContain('ana');
    });

    // Sozinho na linha, o cliente de e-mail transforma em link sem cortá-lo.
    it('traz o link sozinho em uma linha', () => {
      expect(email.text.split('\n')).toContain(url);
    });

    it('diz por quanto tempo o link vale', () => {
      expect(email.text).toContain('30 minutos');
    });
  });

  it.each([
    [1, '1 minuto'],
    [90, '90 minutos'],
    [60, '1 hora'],
    [1440, '24 horas'],
  ])('escreve %i min de validade como "%s"', (expiresInMinutes, expected) => {
    const { text } = templates.passwordReset({ username: 'ana', url: RESET_URL, expiresInMinutes });

    expect(text).toContain(`${expected}.`);
  });
});
