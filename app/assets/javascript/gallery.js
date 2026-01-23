window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.gallery = (() => {
  let messagesEl = null
  let overlay = null
  let overlayImage = null
  let overlayCounter = null
  let countBadge = null
  let currentIndex = 0
  let imageItems = []
  let autoplayTimer = null
  let autoplayButton = null
  let autoplayInterval = 2000
  let intervalInput = null
  let intervalLabel = null
  let timelineEl = null
  let chatId = null
  let downloadButton = null

  const refreshImages = () => {
    if (!messagesEl) return
    const images = Array.from(messagesEl.querySelectorAll(".message-content img"))
    imageItems = images
      .map((img) => {
        const messageEl = img.closest(".message")
        const messageId = messageEl?.dataset?.jetskiId
        if (!messageId) return null
        img.dataset.messageId = messageId
        wrapImage(img)
        return { img, messageId }
      })
      .filter(Boolean)
    applyTimelineOrder()
    imageItems.forEach((item, index) => {
      item.img.dataset.galleryIndex = String(index)
    })
    updateCount()
    renderTimeline()
  }

  const storageKey = () =>
    chatId ? `jetski-gallery-order:${chatId}` : null

  const loadOrder = () => {
    const key = storageKey()
    if (!key) return []
    try {
      const raw = window.localStorage.getItem(key)
      const parsed = JSON.parse(raw || "[]")
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }

  const saveOrder = (order) => {
    const key = storageKey()
    if (!key) return
    try {
      window.localStorage.setItem(key, JSON.stringify(order))
    } catch {}
  }

  const applyTimelineOrder = () => {
    const order = loadOrder()
    if (!order.length) return
    const map = new Map(imageItems.map((item) => [item.messageId, item]))
    const ordered = []
    order.forEach((id) => {
      const item = map.get(id)
      if (item) {
        ordered.push(item)
        map.delete(id)
      }
    })
    map.forEach((item) => ordered.push(item))
    imageItems = ordered
    saveOrder(imageItems.map((item) => item.messageId))
  }

  const updateCount = () => {
    if (!countBadge) return
    countBadge.textContent = String(imageItems.length)
  }

  const wrapImage = (img) => {
    if (!img || img.closest(".message-image")) return
    const wrapper = document.createElement("div")
    wrapper.className = "message-image"
    img.parentNode.insertBefore(wrapper, img)
    wrapper.appendChild(img)

    const actions = document.createElement("div")
    actions.className = "message-image-actions"
    actions.innerHTML = `
      <button class="message-image-btn" type="button" data-gallery-open aria-label="Open gallery">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 6H20V18H4V6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M8 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M8 14H14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="message-image-btn delete" type="button" data-image-delete aria-label="Delete image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M6 7H18M9 7V5H15V7M10 11V17M14 11V17M7 7L8 19H16L17 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `
    wrapper.appendChild(actions)
  }

  const openAt = (index) => {
    refreshImages()
    if (!imageItems.length) return
    currentIndex = (index + imageItems.length) % imageItems.length
    const item = imageItems[currentIndex]
    if (!item || !overlayImage) return
    overlayImage.src = item.img.src
    overlayImage.alt = item.img.alt || "Gallery image"
    if (overlayCounter) {
      overlayCounter.textContent = `${currentIndex + 1} / ${imageItems.length}`
    }
    setActiveThumb(item.messageId)
    overlay.hidden = false
  }

  const close = () => {
    if (!overlay) return
    overlay.hidden = true
    setAutoplay(false)
  }

  const deleteMessage = async (messageId) => {
    const messageEl = messagesEl?.querySelector(
      `[data-jetski-model="Message"][data-jetski-id="${messageId}"]`
    )
    if (messageEl) messageEl.remove()
    try {
      const res = await fetch("/message-delete", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ message_id: messageId })
      })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
      const fallbackImg = messagesEl?.querySelector(
        `.message img[data-message-id="${messageId}"]`
      )
      const fallbackMessage = fallbackImg?.closest(".message")
      if (fallbackMessage) fallbackMessage.remove()
      if (messageId) {
        const nextOrder = loadOrder().filter((id) => id !== String(messageId))
        saveOrder(nextOrder)
      }
      refreshImages()
      if (!overlay?.hidden) {
        if (!imageItems.length) {
          close()
        } else {
          const safeIndex = Math.min(currentIndex, imageItems.length - 1)
          openAt(safeIndex)
        }
      }
    } catch (error) {
      console.warn("Image delete failed", error)
    }
  }

  const deleteCurrent = () => {
    const item = imageItems[currentIndex]
    if (!item) return
    deleteMessage(item.messageId)
    if (imageItems.length <= 1) {
      close()
      return
    }
    window.setTimeout(() => openAt(currentIndex), 120)
  }

  const setAutoplay = (enabled) => {
    if (autoplayTimer) {
      window.clearInterval(autoplayTimer)
      autoplayTimer = null
    }
    if (autoplayButton) {
      autoplayButton.textContent = enabled ? "Stop" : "Autoplay"
    }
    if (!enabled) return
    autoplayTimer = window.setInterval(
      () => openAt(currentIndex + 1),
      autoplayInterval
    )
  }

  const setActiveThumb = (messageId) => {
    if (!timelineEl) return
    timelineEl
      .querySelectorAll(".gallery-thumb")
      .forEach((thumb) =>
        thumb.classList.toggle(
          "is-active",
          thumb.dataset.messageId === String(messageId)
        )
      )
  }

  const renderTimeline = () => {
    if (!timelineEl) return
    timelineEl.innerHTML = ""
    imageItems.forEach((item, index) => {
      const thumb = document.createElement("button")
      thumb.type = "button"
      thumb.className = "gallery-thumb"
      thumb.dataset.messageId = item.messageId
      thumb.dataset.index = String(index)
      thumb.draggable = true
      thumb.innerHTML = `<img src="${item.img.src}" alt="Thumbnail" />`
      timelineEl.appendChild(thumb)
    })
    if (imageItems[currentIndex]) {
      setActiveThumb(imageItems[currentIndex].messageId)
    }
  }

  const reorderTimeline = (dragId, targetId) => {
    if (!dragId || !targetId || dragId === targetId) return
    const order = imageItems.map((item) => item.messageId)
    const fromIndex = order.indexOf(String(dragId))
    const toIndex = order.indexOf(String(targetId))
    if (fromIndex < 0 || toIndex < 0) return
    order.splice(toIndex, 0, order.splice(fromIndex, 1)[0])
    saveOrder(order)
    applyTimelineOrder()
    renderTimeline()
    const newIndex = order.indexOf(String(dragId))
    if (newIndex >= 0) {
      currentIndex = newIndex
      openAt(currentIndex)
    }
  }

  const bindEvents = () => {
    if (!messagesEl) return
    messagesEl.addEventListener("click", (event) => {
      const openBtn = event.target.closest("[data-gallery-open]")
      if (openBtn) {
        const img = openBtn.closest(".message-image")?.querySelector("img")
        if (img?.dataset?.galleryIndex) {
          openAt(Number(img.dataset.galleryIndex))
        } else {
          refreshImages()
          const index = imageItems.findIndex((item) => item.img === img)
          openAt(index >= 0 ? index : 0)
        }
      }

      const deleteBtn = event.target.closest("[data-image-delete]")
      if (deleteBtn) {
        const img = deleteBtn.closest(".message-image")?.querySelector("img")
        const messageId = img?.dataset?.messageId
        if (messageId) deleteMessage(messageId)
      }
    })

    const toggle = document.querySelector("[data-gallery-toggle]")
    if (toggle) {
      toggle.addEventListener("click", () => openAt(0))
    }

    const closeBtn = overlay?.querySelector("[data-gallery-close]")
    const prevBtn = overlay?.querySelector("[data-gallery-prev]")
    const nextBtn = overlay?.querySelector("[data-gallery-next]")
    const deleteBtn = overlay?.querySelector("[data-gallery-delete]")
    autoplayButton = overlay?.querySelector("[data-gallery-autoplay]")
    intervalInput = overlay?.querySelector("[data-gallery-interval]")
    intervalLabel = overlay?.querySelector("[data-gallery-interval-label]")
    timelineEl = overlay?.querySelector("[data-gallery-timeline]")
    downloadButton = overlay?.querySelector("[data-gallery-download]")

    closeBtn?.addEventListener("click", close)
    prevBtn?.addEventListener("click", () => openAt(currentIndex - 1))
    nextBtn?.addEventListener("click", () => openAt(currentIndex + 1))
    deleteBtn?.addEventListener("click", deleteCurrent)
    autoplayButton?.addEventListener("click", () => {
      const enabled = !autoplayTimer
      setAutoplay(enabled)
    })

    overlayImage?.addEventListener("click", () => openAt(currentIndex + 1))

    const updateIntervalLabel = (valueMs) => {
      if (!intervalLabel) return
      intervalLabel.textContent = `${(valueMs / 1000).toFixed(1)}s`
    }

    if (intervalInput) {
      const initialSeconds = Number(intervalInput.value || "2")
      autoplayInterval = Math.max(200, Math.min(10000, initialSeconds * 1000))
      updateIntervalLabel(autoplayInterval)
      intervalInput.addEventListener("input", () => {
        const seconds = Number(intervalInput.value || "2")
        autoplayInterval = Math.max(200, Math.min(10000, seconds * 1000))
        updateIntervalLabel(autoplayInterval)
        if (autoplayTimer) {
          setAutoplay(true)
        }
      })
    }

    downloadButton?.addEventListener("click", async () => {
      if (!imageItems.length) return
      if (!chatId) return

      const payload = {
        message_ids: imageItems.map((item) => item.messageId),
        interval: autoplayInterval / 1000
      }

      const originalLabel = downloadButton.textContent
      downloadButton.textContent = "Preparing..."
      downloadButton.disabled = true
      try {
        const res = await fetch("/gallery-gif", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            chat_id: chatId,
            payload: JSON.stringify(payload)
          })
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `chat-${chatId}-gallery.gif`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
      } catch (error) {
        console.warn("GIF download failed", error)
      } finally {
        downloadButton.textContent = originalLabel
        downloadButton.disabled = false
      }
    })

    timelineEl?.addEventListener("click", (event) => {
      const thumb = event.target.closest(".gallery-thumb")
      if (!thumb) return
      const index = Number(thumb.dataset.index)
      if (!Number.isNaN(index)) openAt(index)
    })

    timelineEl?.addEventListener("dragstart", (event) => {
      const thumb = event.target.closest(".gallery-thumb")
      if (!thumb) return
      event.dataTransfer?.setData("text/plain", thumb.dataset.messageId || "")
      event.dataTransfer?.setDragImage(thumb, 20, 20)
    })

    timelineEl?.addEventListener("dragover", (event) => {
      if (event.target.closest(".gallery-thumb")) {
        event.preventDefault()
      }
    })

    timelineEl?.addEventListener("drop", (event) => {
      const target = event.target.closest(".gallery-thumb")
      if (!target) return
      const dragId = event.dataTransfer?.getData("text/plain")
      reorderTimeline(dragId, target.dataset.messageId)
    })
  }

  const observeMessages = () => {
    if (!messagesEl) return
    const observer = new MutationObserver(() => refreshImages())
    observer.observe(messagesEl, { childList: true, subtree: true })
  }

  const init = () => {
    messagesEl = document.getElementById("jetski-messages")
    overlay = document.querySelector("[data-gallery-overlay]")
    overlayImage = overlay?.querySelector("[data-gallery-image]")
    overlayCounter = overlay?.querySelector("[data-gallery-counter]")
    countBadge = document.querySelector("[data-gallery-count]")
    chatId = document.querySelector("[data-chat-id]")?.dataset?.chatId
    if (!messagesEl || !overlay) return
    refreshImages()
    bindEvents()
    observeMessages()
  }

  return { init }
})()
