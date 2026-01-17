console.log("🌊 Hello Jetski JS!")

const streamUrl = "/stream"
console.log("🌊 Opening SSE connection:", streamUrl)

const es = new EventSource(streamUrl)
const messagesEl = document.getElementById("jetski-messages")
const scrollButton = document.getElementById("scroll-to-bottom")
const scrollBottomThreshold = 24
let autoScrollEnabled = true
let programmaticScroll = false

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
