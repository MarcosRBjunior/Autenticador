// Olho da senha: alterna o campo entre password e text. É o único script das
// páginas (a CSP do helmet bloqueia script embutido).
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-toggle-password]');
  if (!button) return;
  const input = button.parentElement.querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  button.querySelector('[data-icon="hide"]').hidden = show;
  button.querySelector('[data-icon="show"]').hidden = !show;
});
