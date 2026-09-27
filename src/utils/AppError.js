// Erro esperado da aplicação: vira a resposta { error: { code, message, details? } }
// com o status informado. Qualquer outro erro vira 500 genérico.
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = AppError;
