window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.messages = (() => {
  const streamUrl = "/stream"
  const scrollBottomThreshold = 24
  let es = null
  let messagesEl = null
  let scrollButton = null
  let autoScrollEnabled = true
  let programmaticScroll = false

  const renderMessageContent = (target, rawText) => {
    const renderer = window.JetskiChat.markdown?.renderMessageContent
    if (renderer) {
      renderer(target, rawText)
    } else if (target) {
      target.textContent = rawText == null ? "" : String(rawText)
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

      if (payload.type === "model_append") {
        const messageEl = document.querySelector(
          `[data-jetski-model="${payload.model}"][data-jetski-id="${payload.id}"]`
        )
        if (!messageEl) return

        const target = messageEl.querySelector(
          `[data-jetski-attr="${payload.attribute}"]`
        )
        if (!target) return

        const nextValue = `${target.dataset.raw || ""}${payload.delta || ""}`
        renderMessageContent(target, nextValue)
        handleContentUpdate()
        return
      }

      if (payload.type === "model_update") {
        const messageEl = document.querySelector(
          `[data-jetski-model="${payload.model}"][data-jetski-id="${payload.id}"]`
        )
        if (!messageEl) return

        for (const [attr, value] of Object.entries(payload.changes || {})) {
          const target = messageEl.querySelector(`[data-jetski-attr="${attr}"]`)
          if (target) renderMessageContent(target, value)
        }

        handleContentUpdate()
      }
    }
  }

  const init = () => {
    messagesEl = document.getElementById("jetski-messages")
    if (!messagesEl) return

    scrollButton = document.getElementById("scroll-to-bottom")

    wireScroll()
    messagesEl.addEventListener("click", handleCopyClick)
    wireInitialRender()
    wireStreaming()
  }

  return { init }
})()
