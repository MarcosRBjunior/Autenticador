// Valida req.body, req.query ou req.params com um schema zod. Um ZodError vira
// 400 VALIDATION_ERROR no errorHandler.
//
// - body: req.body é substituído pela versão validada (com trim, minúsculas e
//   sem campos desconhecidos).
// - query/params: no Express 5 req.query é somente leitura, então o resultado
//   fica em req.validated.query / req.validated.params.
function validate(schema, source = 'body') {
  return (req, res, next) => {
    // No Express 5, req.body fica undefined quando não há corpo JSON.
    const data = schema.parse(req[source] ?? {});
    if (source === 'body') {
      req.body = data;
    } else {
      req.validated = { ...req.validated, [source]: data };
    }
    next();
  };
}

module.exports = { validate };
