document.querySelectorAll('[data-ui-chip]').forEach((chip) => {
  chip.addEventListener('click', (event) => {
    const group = chip.closest('[data-ui-chip-group]');
    if (!group) return;
    group.querySelectorAll('[data-ui-chip]').forEach((node) => node.classList.remove('is-active'));
    chip.classList.add('is-active');
  });
});
