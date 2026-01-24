window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.inputController = (() => {
  let form = null
  let textarea = null
  let iterationsInput = null
  let iterationsHint = null
  let iterationsValue = null
  let hintTimer = null
  let chatId = null
  let menuToggle = null
  let menuPanel = null
  let lastHotkeyAt = 0
  let iterationsArmed = false

  const clampIterations = (value) => {
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return 1
    return Math.max(1, Math.min(9, parsed))
  }

  const showIterationsHint = (count = null) => {
    if (!iterationsHint) return
    if (count != null) {
      iterationsHint.textContent = `Runs set to ${count}. Ctrl+Shift+1-9 to change.`
    }
    iterationsHint.classList.add("is-visible")
    window.clearTimeout(hintTimer)
    hintTimer = window.setTimeout(() => {
      iterationsHint.classList.remove("is-visible")
    }, 1600)
  }

  const submitForm = (iterations) => {
    if (!form) return
    if (textarea && document.activeElement !== textarea) {
      textarea.focus()
    }
    if (!iterationsArmed && iterationsInput) {
      iterationsInput.value = 1
    }
    if (iterationsValue && iterationsInput) {
      iterationsValue.value = clampIterations(iterationsInput.value)
    }
    if (chatId) {
      const baseAssistantCount = document.querySelectorAll(
        ".message.assistant:not(.is-pending)"
      ).length
      const target =
        iterations ?? clampIterations(iterationsInput?.value || 1)
      try {
        window.localStorage.setItem(
          `jetski-iterations-submit:${chatId}`,
          String(Date.now())
        )
        if (target > 1) {
          window.localStorage.setItem(
            `jetski-iterations:${chatId}`,
            JSON.stringify({
              target,
              baseAssistantCount,
              startedAt: Date.now()
            })
          )
        } else {
          window.localStorage.removeItem(`jetski-iterations:${chatId}`)
        }
      } catch {}
    }
    if (iterations != null) {
      const detail = { iterations }
      form.dispatchEvent(
        new CustomEvent("iterations:submit", { detail, bubbles: true })
      )
    }
    if (form.requestSubmit) {
      form.requestSubmit()
    } else {
      form.submit()
    }
    if (iterationsInput) {
      window.setTimeout(() => {
        iterationsInput.value = 1
        iterationsInput.dispatchEvent(new Event("input", { bubbles: true }))
        iterationsInput.dispatchEvent(new Event("change", { bubbles: true }))
      }, 0)
    }
    iterationsArmed = false
  }

  const handleHotkey = (event) => {
    if (!(event.ctrlKey && event.shiftKey)) return
    if (event.repeat) return

    if (
      event.key === "Enter" ||
      event.key === "Return" ||
      event.code === "Enter" ||
      event.code === "NumpadEnter"
    ) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      lastHotkeyAt = Date.now()
      submitForm()
      return
    }

    const digitMatch = event.code?.match(/^Digit([1-9])$/)
    const numpadMatch = event.code?.match(/^Numpad([1-9])$/)
    const keyCode =
      typeof event.keyCode === "number" ? event.keyCode : null
    const keyCodeValue =
      keyCode && keyCode >= 49 && keyCode <= 57
        ? String(keyCode - 48)
        : null
    const iterationValue =
      digitMatch?.[1] ||
      numpadMatch?.[1] ||
      keyCodeValue ||
      (/^[1-9]$/.test(event.key) ? event.key : null)
    if (!iterationValue) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    lastHotkeyAt = Date.now()
    if (iterationsInput) {
      const nextValue = clampIterations(iterationValue)
      iterationsInput.value = nextValue
      iterationsInput.dispatchEvent(new Event("input", { bubbles: true }))
      iterationsInput.dispatchEvent(new Event("change", { bubbles: true }))
      showIterationsHint(nextValue)
      iterationsArmed = true
      if (iterationsValue) {
        iterationsValue.value = nextValue
      }
    }
    submitForm(clampIterations(iterationValue))
  }

  const init = () => {
    form = document.querySelector("form.message-form")
    if (!form) return
    chatId = document.querySelector("[data-chat-id]")?.dataset?.chatId
    textarea = form.querySelector("textarea")
    iterationsInput = document.querySelector("[data-iterations-input]")
    iterationsHint = document.querySelector("[data-iterations-hint]")
    iterationsValue = document.querySelector("[data-iterations-value]")
    menuToggle = document.querySelector("[data-input-menu-toggle]")
    menuPanel = document.querySelector("[data-input-menu]")

    document.addEventListener("keydown", handleHotkey, true)
    document.addEventListener(
      "contextmenu",
      (event) => {
        if (Date.now() - lastHotkeyAt < 600) {
          event.preventDefault()
        }
      },
      true
    )

    menuToggle?.addEventListener("click", (event) => {
      event.preventDefault()
      if (!menuPanel) return
      const isHidden = menuPanel.hasAttribute("hidden")
      if (isHidden) {
        menuPanel.removeAttribute("hidden")
      } else {
        menuPanel.setAttribute("hidden", "")
      }
    })

    document.addEventListener("click", (event) => {
      if (!menuPanel || !menuToggle) return
      if (menuPanel.hasAttribute("hidden")) return
      if (menuPanel.contains(event.target) || menuToggle.contains(event.target)) {
        return
      }
      menuPanel.setAttribute("hidden", "")
    })

    iterationsInput?.addEventListener("change", () => {
      iterationsInput.value = clampIterations(iterationsInput.value)
      showIterationsHint(iterationsInput.value)
      iterationsArmed = true
    })

    iterationsInput?.addEventListener("input", () => {
      showIterationsHint(iterationsInput.value)
    })

    if (iterationsInput) iterationsInput.value = 1
    if (iterationsValue) iterationsValue.value = 1

    form.addEventListener("submit", () => {
      if (iterationsValue && iterationsInput) {
        iterationsValue.value = clampIterations(iterationsInput.value)
      }
    })

    textarea?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return
      if (event.ctrlKey && event.shiftKey) return
      const hint = document.querySelector("[data-send-hint]")
      if (hint) {
        hint.classList.add("is-visible")
        window.clearTimeout(hint.__hideTimer)
        hint.__hideTimer = window.setTimeout(() => {
          hint.classList.remove("is-visible")
        }, 1600)
      }
    })
  }

  return { init }
})()
