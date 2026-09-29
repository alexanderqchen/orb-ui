document.querySelectorAll('.copy-code').forEach((button) => {
  if (!navigator.clipboard) return
  button.hidden = false
  button.addEventListener('click', async () => {
    const code = button.closest('.code-block').querySelector('code')
    try {
      await navigator.clipboard.writeText(code.textContent)
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Select and copy manually'
    }
    setTimeout(() => {
      button.textContent = 'Copy code'
    }, 2500)
  })
})
