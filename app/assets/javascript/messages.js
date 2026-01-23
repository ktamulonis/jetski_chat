window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.messages = (() => {
  const streamUrl = "/stream"
  const scrollBottomThreshold = 24
  let es = null
  let messagesEl = null
  let scrollButton = null
  let messageInput = null
  let autoScrollEnabled = true
  let programmaticScroll = false
  const progressModule = window.JetskiChat.progress

  const renderMessageContent = (target, rawText) => {
    const renderer = window.JetskiChat.markdown?.renderMessageContent
    if (renderer) {
      renderer(target, rawText)
    } else if (target) {
      target.textContent = rawText == null ? "" : String(rawText)
    }
  }

  const getRawContent = (target) =>
    window.JetskiChat.markdown?.getRawContent?.(target) ||
    target?.dataset?.raw ||
    ""

  const parseProgressText = (rawText) => {
    const text = (rawText || "").trim()
    if (!/Generating image/i.test(text)) return null
    const match = text.match(/\((\d+)\s*\/\s*(\d+)\)/)
    if (!match) return { text, completed: null, total: null }
    return { text, completed: Number(match[1]), total: Number(match[2]) }
  }

  const updateMessageLabel = (messageEl, label) => {
    const contentEl = messageEl?.querySelector('[data-jetski-attr="content"]')
    if (!contentEl) return
    const current = getRawContent(contentEl) || contentEl.textContent || ""
    if (!/Generating image/i.test(current)) return
    renderMessageContent(contentEl, label)
  }

  const updateImageProgress = (messageEl, rawText) => {
    if (!messageEl) return
    const messageId = messageEl.dataset.jetskiId
    if (!messageId) return
    const contentEl = messageEl.querySelector('[data-jetski-attr="content"]')
    const fallbackText = contentEl?.textContent || ""
    const progressInfo = parseProgressText(rawText) || parseProgressText(fallbackText)
    const trackerId = `image-${messageId}`

    if (!progressInfo) {
      progressModule?.remove(trackerId)
      return
    }

    console.log("🎨 Ollama image progress update", {
      messageId,
      rawText,
      fallbackText
    })
    const tracker = progressModule?.ensure({
      id: trackerId,
      container: messageEl,
      labelPrefix: "Generating image",
      className: "image-progress",
      barClass: "image-progress-bar",
      labelClass: "image-progress-label",
      debug: true,
      logPrefix: "🎨 Ollama image",
      onLabel: (label) => updateMessageLabel(messageEl, label)
    })
    if (!tracker) return

    const completed = progressInfo.completed
    const total = progressInfo.total
    if (completed && total) {
      const ratio = Number(completed) / Math.max(1, Number(total))
      const percent = Math.round(ratio * 100)
      tracker.update({
        completed,
        total,
        label: `Generating image... ${percent}%`
      })
    } else {
      tracker.markPending("Generating image... (waiting for progress)")
    }
  }

  const isAtBottom = () => {
    if (!messagesEl) return true
    const distance =
      messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight
    return distance <= scrollBottomThreshold
  }

  const updateScrollButton = () => {
    if (!messagesEl || !scrollButton) return
    if (isAtBottom()) {
      scrollButton.classList.remove("visible")
    } else {
      scrollButton.classList.add("visible")
    }
  }

  const scrollToBottom = (behavior = "auto") => {
    if (!messagesEl) return
    programmaticScroll = true
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior })
    window.setTimeout(() => {
      programmaticScroll = false
      updateScrollButton()
    }, 80)
  }

  const handleContentUpdate = () => {
    if (!messagesEl) return
    window.requestAnimationFrame(() => {
      if (autoScrollEnabled) {
        scrollToBottom()
      } else {
        updateScrollButton()
      }
    })
  }

  const handleCopyClick = async (event) => {
    const button = event.target.closest(".copy-code")
    if (!button) return
    const block = button.closest(".code-block")
    const codeEl = block?.querySelector("pre code")
    if (!codeEl) return

    const codeText = codeEl.textContent || ""
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codeText)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = codeText
        textarea.setAttribute("readonly", "true")
        textarea.style.position = "absolute"
        textarea.style.left = "-9999px"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }

      const original = button.textContent
      button.textContent = "Copied!"
      window.setTimeout(() => {
        button.textContent = original
      }, 1200)
    } catch (error) {
      console.warn("Copy failed", error)
    }
  }

  const handleEditClick = (event) => {
    const button = event.target.closest("[data-message-edit]")
    if (!button) return
    if (!messageInput) return

    const messageEl = button.closest(".message")
    const contentEl = messageEl?.querySelector('[data-jetski-attr="content"]')
    if (!contentEl) return

    const rawText = getRawContent(contentEl)
    messageInput.value = rawText
    messageInput.focus()
    const end = rawText.length
    messageInput.setSelectionRange(end, end)
  }

  const wireScroll = () => {
    messagesEl.addEventListener("scroll", () => {
      if (programmaticScroll) {
        updateScrollButton()
        return
      }

      autoScrollEnabled = isAtBottom()
      updateScrollButton()
    })

    if (scrollButton) {
      scrollButton.addEventListener("click", () => {
        autoScrollEnabled = true
        scrollToBottom("smooth")
      })
    }
  }

  const wireInitialRender = () => {
    messagesEl
      .querySelectorAll('[data-jetski-attr="content"]')
      .forEach((messageContent) => {
        const rawText = messageContent.textContent || ""
        renderMessageContent(messageContent, rawText)
        const messageEl = messageContent.closest(".message")
        if (messageEl) {
          console.log("🎨 Ollama image initial scan", {
            messageId: messageEl.dataset.jetskiId,
            rawText
          })
          updateImageProgress(messageEl, getRawContent(messageContent))
        }
      })
    scrollToBottom()
    updateScrollButton()
  }

  const wireStreaming = () => {
    console.log("🌊 Opening SSE connection:", streamUrl)
    es = new EventSource(streamUrl)

    es.onopen = () => {
      console.log("🌊 SSE OPEN ✅", streamUrl)
    }

    es.onerror = (e) => {
      console.warn("🌊 SSE error", e)
    }

    es.onmessage = (event) => {
      console.log("🌊 SSE RAW EVENT:", event.data)

      let payload
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }

      const eventType =
        payload.type ||
        (payload.changes ? "model_update" : payload.delta ? "model_append" : "")

      if (eventType === "model_append") {
        const messageEl = document.querySelector(
          `[data-jetski-model="${payload.model}"][data-jetski-id="${payload.id}"]`
        )
        if (!messageEl) return

        const target = messageEl.querySelector(
          `[data-jetski-attr="${payload.attribute}"]`
        )
        if (!target) return

        const nextValue = `${getRawContent(target)}${payload.delta || ""}`
        renderMessageContent(target, nextValue)
        if (payload.attribute === "content") {
          updateImageProgress(messageEl, nextValue)
        }
        handleContentUpdate()
        return
      }

      if (eventType === "model_update") {
        const messageEl = document.querySelector(
          `[data-jetski-model="${payload.model}"][data-jetski-id="${payload.id}"]`
        )
        if (!messageEl) return

        for (const [attr, value] of Object.entries(payload.changes || {})) {
          const target = messageEl.querySelector(`[data-jetski-attr="${attr}"]`)
          if (target) {
            renderMessageContent(target, value)
            if (attr === "content") {
              updateImageProgress(messageEl, getRawContent(target))
            }
          }
        }

        handleContentUpdate()
      }
    }
  }

  const init = () => {
    messagesEl = document.getElementById("jetski-messages")
    if (!messagesEl) return

    scrollButton = document.getElementById("scroll-to-bottom")
    messageInput = document.querySelector("form.message-form textarea")

    const imageToggle = document.querySelector("[data-image-toggle]")
    const imageModeInput = document.querySelector("[data-image-mode-input]")

    if (imageToggle && imageModeInput) {
      const updateToggle = (enabled) => {
        imageToggle.classList.toggle("is-active", enabled)
        imageToggle.setAttribute("aria-pressed", enabled.toString())
        imageToggle.textContent = enabled ? "Image: On" : "Image: Off"
        imageModeInput.value = enabled ? "1" : "0"
      }

      updateToggle(false)

      imageToggle.addEventListener("click", () => {
        const enabled = imageModeInput.value !== "1"
        updateToggle(enabled)
      })
    }

    wireScroll()
    messagesEl.addEventListener("click", handleCopyClick)
    messagesEl.addEventListener("click", handleEditClick)
    wireInitialRender()
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          const contentNodes = node.matches?.('[data-jetski-attr="content"]')
            ? [node]
            : Array.from(node.querySelectorAll?.('[data-jetski-attr="content"]') || [])
          contentNodes.forEach((messageContent) => {
            const messageEl = messageContent.closest(".message")
            if (!messageEl) return
            const rawText = messageContent.textContent || ""
            renderMessageContent(messageContent, rawText)
            console.log("🎨 Ollama image mutation scan", {
              messageId: messageEl.dataset.jetskiId,
              rawText
            })
            updateImageProgress(messageEl, getRawContent(messageContent))
          })
        })
      })
    })
    observer.observe(messagesEl, { childList: true, subtree: true })
    wireStreaming()
  }

  return { init }
})()
