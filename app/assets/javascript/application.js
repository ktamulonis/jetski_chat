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

    target.textContent += payload.delta
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
      if (target) target.textContent = value
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
