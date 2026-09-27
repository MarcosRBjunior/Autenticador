// Substitui req.body pela versão validada (com trim, minúsculas e sem campos
// desconhecidos). Um ZodError vira 400 VALIDATION_ERROR no errorHandler.
function validate(schema) {
  return (req, res, next) => {
    // No Express 5, req.body fica undefined quando não há corpo JSON.
    req.body = schema.parse(req.body ?? {});
    next();
  };
}

module.exports = { validate };
