window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.welcomePanel = (() => {
  const init = () => {
    const welcomePanel = document.querySelector(".welcome-panel")
    if (!welcomePanel) return

    const messagesScript = welcomePanel.querySelector("[data-welcome-messages]")
    let welcomeMessages = []
    try {
      welcomeMessages = JSON.parse(messagesScript?.textContent || "[]")
    } catch {
      welcomeMessages = []
    }

    const welcomePill = welcomePanel.querySelector("[data-welcome-pill]")
    const welcomeInput = welcomePanel.querySelector("[data-welcome-input]")
    const nextButton = welcomePanel.querySelector("[data-next-prompt]")
    const clearButton = welcomePanel.querySelector("[data-clear-prompt]")
    const textInput = welcomePanel.querySelector('input[name="content"]')
    const defaultPlaceholder =
      welcomePanel.getAttribute("data-default-placeholder") || "Start a new chat"

    let index = welcomeMessages.indexOf(welcomePill?.textContent?.trim() || "")
    if (index < 0) index = 0

    const applyPrompt = (prompt, isEmpty) => {
      if (!welcomePill || !welcomeInput || !textInput) return
      welcomePill.textContent = prompt
      welcomeInput.value = isEmpty ? "" : prompt
      textInput.placeholder = isEmpty ? defaultPlaceholder : prompt
      welcomePill.classList.toggle("is-empty", isEmpty)
    }

    if (nextButton) {
      nextButton.addEventListener("click", () => {
        if (welcomeMessages.length === 0) return
        index = (index + 1) % welcomeMessages.length
        const prompt = welcomeMessages[index]
        applyPrompt(prompt, false)
      })
    }

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        applyPrompt("", true)
        welcomePill?.classList.add("is-hidden")
        nextButton?.classList.add("is-hidden")
        clearButton.classList.add("is-hidden")
        if (textInput) textInput.value = ""
      })
    }
  }

  return { init }
})()
