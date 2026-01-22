console.log("🌊 Hello Jetski JS!")

const streamUrl = "/stream"
console.log("🌊 Opening SSE connection:", streamUrl)

const es = new EventSource(streamUrl)
const messagesEl = document.getElementById("jetski-messages")
const scrollButton = document.getElementById("scroll-to-bottom")
const scrollBottomThreshold = 24
let autoScrollEnabled = true
let programmaticScroll = false
const sidebarToggle = document.querySelector("[data-sidebar-toggle]")
const sidebarContainer = document.querySelector("[data-sidebar-container]")

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const applyInlineFormatting = (text) => {
  let formatted = text.replace(/`([^`]+)`/g, "<code>$1</code>")
  formatted = formatted.replace(/(\*\*|__)(.*?)\1/g, "<strong>$2</strong>")
  formatted = formatted.replace(/(\*|_)([^*_]+)\1/g, "<em>$2</em>")
  return formatted
}

const renderMarkdown = (rawText = "") => {
  const sanitized = escapeHtml(rawText.replace(/\r\n/g, "\n"))
  const lines = sanitized.split("\n")
  let html = ""
  let inCodeBlock = false
  let codeBuffer = []
  let inUl = false
  let inOl = false
  let paragraphBuffer = []

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return
    const content = applyInlineFormatting(paragraphBuffer.join("<br>"))
    html += `<p>${content}</p>`
    paragraphBuffer = []
  }

  const closeLists = () => {
    if (inUl) {
      html += "</ul>"
      inUl = false
    }
    if (inOl) {
      html += "</ol>"
      inOl = false
    }
  }

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        const codeText = codeBuffer.join("\n")
        html +=
          '<div class="code-block">' +
          '<button class="copy-code" type="button" aria-label="Copy code">Copy</button>' +
          `<pre><code>${codeText}</code></pre>` +
          "</div>"
        codeBuffer = []
        inCodeBlock = false
      } else {
        flushParagraph()
        closeLists()
        inCodeBlock = true
      }
      return
    }

    if (inCodeBlock) {
      codeBuffer.push(line)
      return
    }

    const trimmed = line.trim()
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/)

    if (orderedMatch) {
      flushParagraph()
      if (inUl) {
        html += "</ul>"
        inUl = false
      }
      if (!inOl) {
        html += "<ol>"
        inOl = true
      }
      html += `<li>${applyInlineFormatting(orderedMatch[2])}</li>`
      return
    }

    if (unorderedMatch) {
      flushParagraph()
      if (inOl) {
        html += "</ol>"
        inOl = false
      }
      if (!inUl) {
        html += "<ul>"
        inUl = true
      }
      html += `<li>${applyInlineFormatting(unorderedMatch[1])}</li>`
      return
    }

    if (trimmed === "") {
      flushParagraph()
      closeLists()
      return
    }

    closeLists()
    paragraphBuffer.push(line)
  })

  if (inCodeBlock) {
    const codeText = codeBuffer.join("\n")
    html +=
      '<div class="code-block">' +
      '<button class="copy-code" type="button" aria-label="Copy code">Copy</button>' +
      `<pre><code>${codeText}</code></pre>` +
      "</div>"
  }
  flushParagraph()
  closeLists()

  return html
}

const renderMessageContent = (target, rawText) => {
  if (!target) return
  const safeText = rawText == null ? "" : String(rawText)
  target.dataset.raw = safeText
  target.innerHTML = renderMarkdown(safeText)
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

  // ------------------------------------------------------------
  // APPEND STREAMING (this is the missing piece)
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // FULL REPLACE (future-proof)
  // ------------------------------------------------------------
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

if (messagesEl) {
  messagesEl.addEventListener("scroll", () => {
    if (programmaticScroll) {
      updateScrollButton()
      return
    }

    autoScrollEnabled = isAtBottom()
    updateScrollButton()
  })
}

if (scrollButton) {
  scrollButton.addEventListener("click", () => {
    autoScrollEnabled = true
    scrollToBottom("smooth")
  })
}

if (messagesEl) {
  messagesEl.addEventListener("click", async (event) => {
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
  })

  messagesEl
    .querySelectorAll('[data-jetski-attr="content"]')
    .forEach((messageContent) => {
      const rawText = messageContent.textContent || ""
      renderMessageContent(messageContent, rawText)
    })
  scrollToBottom()
  updateScrollButton()
}

if (sidebarToggle && sidebarContainer) {
  const updateSidebarToggle = () => {
    const isCollapsed = sidebarContainer.classList.contains("sidebar-collapsed")
    sidebarToggle.setAttribute("aria-expanded", (!isCollapsed).toString())
  }

  updateSidebarToggle()

  sidebarToggle.addEventListener("click", () => {
    sidebarContainer.classList.toggle("sidebar-collapsed")
    updateSidebarToggle()
  })
}

const welcomePanel = document.querySelector(".welcome-panel")
if (welcomePanel) {
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
    welcomePanel.getAttribute("data-default-placeholder") ||
    "Start a new chat"

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
