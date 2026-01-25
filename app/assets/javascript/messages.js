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
  let historyIndex = null
  let iterationStatus = null
  let iterationStatusLabel = null
  let iterationStatusFill = null
  let iterationTarget = 0
  let iterationBaseCount = 0
  let updateIterationStatus = () => {}

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
    if (label && String(label).trim() !== "") {
      messageEl?.classList?.remove("is-pending")
      updateIterationStatus()
    }
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
    const normalized = (() => {
      const lines = String(rawText || "").replace(/\r\n/g, "\n").split("\n")
      while (lines.length && lines[0].trim() === "") lines.shift()
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop()
      return lines.join("\n")
    })()
    messageInput.value = normalized
    messageInput.focus()
    const end = messageInput.value.length
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

  const getUserMessageHistory = () => {
    if (!messagesEl) return []
    const userMessages = Array.from(messagesEl.querySelectorAll(".message.user"))
    return userMessages
      .map((messageEl) =>
        messageEl.querySelector('[data-jetski-attr="content"]')
      )
      .map((contentEl) => (contentEl ? getRawContent(contentEl) : ""))
      .map((text) => {
        const lines = String(text || "")
          .replace(/\r\n/g, "\n")
          .split("\n")
        while (lines.length && lines[0].trim() === "") lines.shift()
        while (lines.length && lines[lines.length - 1].trim() === "") lines.pop()
        return lines.join("\n")
      })
      .filter((text) => text.trim() !== "")
  }

  const wireInitialRender = () => {
    messagesEl
      .querySelectorAll('[data-jetski-attr="content"]')
      .forEach((messageContent) => {
        const rawText = messageContent.textContent || ""
        renderMessageContent(messageContent, rawText)
        const messageEl = messageContent.closest(".message")
        if (messageEl) {
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
      if (payload.attribute === "content" && nextValue.trim() !== "") {
        messageEl.classList.remove("is-pending")
        updateIterationStatus()
      }
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
            if (attr === "content" && String(value || "").trim() !== "") {
              messageEl.classList.remove("is-pending")
              updateIterationStatus()
            }
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
    const messageForm = document.querySelector("form.message-form")
    iterationStatus = document.querySelector("[data-iteration-status]")
    iterationStatusLabel = document.querySelector("[data-iteration-status-label]")
    iterationStatusFill = document.querySelector("[data-iteration-status-fill]")
    const iterationCancel = document.querySelector("[data-iteration-cancel]")
    const chatPanel = document.querySelector("[data-chat-id]")
    const chatId = chatPanel?.dataset?.chatId

    const imageToggle = document.querySelector("[data-image-toggle]")
    const imageModeInput = document.querySelector("[data-image-mode-input]")
    const serverImageMode = chatPanel?.dataset?.imageMode

    if (imageToggle && imageModeInput) {
      const updateToggle = (enabled, persist = false) => {
        imageToggle.classList.toggle("is-active", enabled)
        imageToggle.setAttribute("aria-pressed", enabled.toString())
        imageToggle.textContent = enabled ? "Image: On" : "Image: Off"
        imageModeInput.value = enabled ? "1" : "0"
        if (persist && chatId) {
          fetch("/chat-image-mode", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              chat_id: chatId,
              image_mode: enabled ? "1" : "0"
            })
          }).catch((error) => {
            console.warn("Image mode update failed", error)
          })
        }
      }

      const initialMode = serverImageMode === "1" ? "1" : "0"
      imageModeInput.value = initialMode
      updateToggle(imageModeInput.value === "1")

      imageToggle.addEventListener("click", () => {
        const enabled = imageModeInput.value !== "1"
        updateToggle(enabled, true)
      })

      messageForm?.addEventListener("submit", () => {
        const enabled = imageToggle.classList.contains("is-active")
        imageModeInput.value = enabled ? "1" : "0"
        updateToggle(enabled)
      })
    }

    if (messageInput) {
      window.setTimeout(() => {
        messageInput.focus()
      }, 0)
    }

    const startIterationStatus = (forcedCount = null, forcedBase = null) => {
      if (!iterationStatus || !iterationStatusLabel || !iterationStatusFill) {
        return
      }
      const iterationsInput = document.querySelector("[data-iterations-input]")
      const nextTarget = forcedCount ?? Number(iterationsInput?.value || "1")
      iterationTarget = Number.isNaN(nextTarget)
        ? 1
        : Math.max(1, Math.min(9, nextTarget))
      iterationBaseCount =
        forcedBase ??
        (messagesEl
          ? messagesEl.querySelectorAll(".message.assistant:not(.is-pending)").length
          : 0)
      iterationStatus.hidden = false
      iterationStatusLabel.textContent =
        iterationTarget > 0
          ? `Running 1 of ${iterationTarget}`
          : "Running 0 of 0"
      iterationStatusFill.style.width = "0%"
      if (iterationsInput) iterationsInput.disabled = true
    }

    updateIterationStatus = () => {
      if (!iterationStatus || iterationTarget <= 0) return
      const currentCount = messagesEl
        ? messagesEl.querySelectorAll(".message.assistant:not(.is-pending)").length
        : 0
      const completed = Math.min(
        iterationTarget,
        Math.max(0, currentCount - iterationBaseCount)
      )
      if (iterationStatusLabel) {
        if (completed >= iterationTarget) {
          iterationStatusLabel.textContent = `Completed ${iterationTarget} of ${iterationTarget}`
        } else {
          const current = Math.min(iterationTarget, completed + 1)
          iterationStatusLabel.textContent = `Running ${current} of ${iterationTarget}`
        }
      }
      if (iterationStatusFill) {
        const percent = (completed / iterationTarget) * 100
        iterationStatusFill.style.width = `${percent}%`
      }
      if (completed >= iterationTarget) {
        window.setTimeout(() => {
          if (iterationStatus) iterationStatus.hidden = true
          const iterationsInput = document.querySelector("[data-iterations-input]")
          if (iterationsInput) iterationsInput.disabled = false
          if (chatId) {
            try {
              window.localStorage.removeItem(`jetski-iterations:${chatId}`)
              window.localStorage.removeItem(`jetski-iterations-submit:${chatId}`)
            } catch {}
          }
        }, 800)
      }
    }

    iterationCancel?.addEventListener("click", () => {
      if (!chatId) return
      fetch("/iterations-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ chat_id: chatId })
      }).catch((error) => {
        console.warn("Iteration cancel failed", error)
      })
      if (iterationStatusLabel) {
        iterationStatusLabel.textContent = "Cancelled"
      }
      if (iterationStatusFill) {
        iterationStatusFill.style.width = "0%"
      }
      iterationTarget = 0
      if (iterationStatus) iterationStatus.hidden = true
      const iterationsInput = document.querySelector("[data-iterations-input]")
      if (iterationsInput) iterationsInput.disabled = false
      if (chatId) {
        try {
          window.localStorage.removeItem(`jetski-iterations:${chatId}`)
          window.localStorage.removeItem(`jetski-iterations-submit:${chatId}`)
        } catch {}
      }
    })

    const iterationsInput = document.querySelector("[data-iterations-input]")

    messageForm?.addEventListener("submit", () => {
      const iterationsInput = document.querySelector("[data-iterations-input]")
      const target = Number(iterationsInput?.value || "1")
      if (chatId) {
        try {
          window.localStorage.setItem(
            `jetski-iterations-submit:${chatId}`,
            String(Date.now())
          )
          if (target <= 1) {
            window.localStorage.removeItem(`jetski-iterations:${chatId}`)
          }
        } catch {}
      }
      if (target > 1) {
        startIterationStatus(target)
      }
    })

    messageForm?.addEventListener("iterations:submit", (event) => {
      const count = Number(event?.detail?.iterations || 1)
      if (count > 1) {
        startIterationStatus(count)
      }
    })

    if (chatId) {
      try {
        const pendingAssistants = messagesEl.querySelectorAll(
          ".message.assistant.is-pending"
        ).length
        if (pendingAssistants === 0) {
          window.localStorage.removeItem(`jetski-iterations:${chatId}`)
          window.localStorage.removeItem(`jetski-iterations-submit:${chatId}`)
        } else {
          const stored = window.localStorage.getItem(`jetski-iterations:${chatId}`)
          const storedSubmit = window.localStorage.getItem(
            `jetski-iterations-submit:${chatId}`
          )
          const submitAt = Number(storedSubmit || "0")
          const isFresh = submitAt && Date.now() - submitAt < 2 * 60 * 1000
          if (stored) {
            const data = JSON.parse(stored)
            if (isFresh && data?.target && Number(data.target) > 1) {
              startIterationStatus(
                Number(data.target || 1),
                Number(data.baseAssistantCount || 0)
              )
              updateIterationStatus()
            } else if (!isFresh) {
              window.localStorage.removeItem(`jetski-iterations:${chatId}`)
              window.localStorage.removeItem(`jetski-iterations-submit:${chatId}`)
            }
          }
        }
      } catch {}
    }

    messageInput?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp") return
      if (!messageInput) return
      const history = getUserMessageHistory()
      if (!history.length) return
      event.preventDefault()
      if (historyIndex == null) {
        historyIndex = history.length - 1
      } else {
        historyIndex = Math.max(0, historyIndex - 1)
      }
      messageInput.value = history[historyIndex]
      const end = messageInput.value.length
      messageInput.setSelectionRange(end, end)
    })

    messageInput?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown") return
      if (!messageInput) return
      if (historyIndex == null) return
      const history = getUserMessageHistory()
      if (!history.length) return
      event.preventDefault()
      historyIndex = Math.min(history.length - 1, historyIndex + 1)
      messageInput.value = history[historyIndex]
      const end = messageInput.value.length
      messageInput.setSelectionRange(end, end)
    })

    messageInput?.addEventListener("input", () => {
      historyIndex = null
    })

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
            updateImageProgress(messageEl, getRawContent(messageContent))
          })
        })
      })
      updateIterationStatus()
    })
    observer.observe(messagesEl, { childList: true, subtree: true })
    wireStreaming()
  }

  return { init }
})()
