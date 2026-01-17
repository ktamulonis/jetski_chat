console.log("🌊 Hello Jetski JS!")

const streamUrl = "/stream"
console.log("🌊 Opening SSE connection:", streamUrl)

const es = new EventSource(streamUrl)

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
  }
}

