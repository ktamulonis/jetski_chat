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
  let transparentToggle = null
  let keyColorInput = null
  let keyAutoToggle = null
  let keyListEl = null
  let keyColors = []
  let keyTolerance = 0.2
  let keyClearButton = null
  let autoKeyColors = []
  let toleranceInput = null
  let toleranceLabel = null

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
    overlayImage.dataset.originalSrc = item.img.src
    overlayImage.src = item.img.src
    overlayImage.alt = item.img.alt || "Gallery image"
    if (overlayCounter) {
      overlayCounter.textContent = `${currentIndex + 1} / ${imageItems.length}`
    }
    setActiveThumb(item.messageId)
    updatePickingState()
    updatePreview()
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

  const normalizeHex = (value) => {
    if (!value) return null
    const hex = value.toString().trim()
    if (!hex.startsWith("#") || hex.length !== 7) return null
    return hex.toUpperCase()
  }

  const renderKeyList = () => {
    if (!keyListEl) return
    keyListEl.innerHTML = ""
    keyColors.forEach((color) => {
      const chip = document.createElement("button")
      chip.type = "button"
      chip.className = "gallery-key-chip"
      chip.style.background = color
      chip.dataset.color = color
      chip.title = `Remove ${color}`
      keyListEl.appendChild(chip)
    })
  }

  const getManualKeyColors = () => {
    if (!keyListEl) return keyColors
    const colors = Array.from(
      keyListEl.querySelectorAll(".gallery-key-chip")
    ).map((chip) => chip.dataset.color)
    return colors.filter(Boolean)
  }

  const addKeyColor = (color) => {
    const hex = normalizeHex(color)
    if (!hex) return
    if (!keyColors.includes(hex)) keyColors.push(hex)
    renderKeyList()
  }

  const removeKeyColor = (color) => {
    keyColors = keyColors.filter((item) => item !== color)
    renderKeyList()
  }

  const clearKeyColors = () => {
    keyColors = []
    renderKeyList()
  }

  const getAutoColorsFromImage = (img) => {
    if (!img || !img.complete) return []
    const canvas = document.createElement("canvas")
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (!width || !height) return []
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return []
    ctx.drawImage(img, 0, 0)
    const midX = Math.floor(width / 2)
    const midY = Math.floor(height / 2)
    const points = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
      [midX, 0],
      [midX, height - 1],
      [0, midY],
      [width - 1, midY]
    ]
    const colors = points
      .map(([x, y]) => ctx.getImageData(x, y, 1, 1).data)
      .map((data) =>
        `#${[data[0], data[1], data[2]]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")}`.toUpperCase()
      )
    return Array.from(new Set(colors))
  }

  const collectAutoColors = async () => {
    const colors = new Set()
    for (const item of imageItems) {
      const imgEl = item.img
      if (imgEl.complete && imgEl.naturalWidth) {
        getAutoColorsFromImage(imgEl).forEach((color) => colors.add(color))
      } else {
        const image = new Image()
        image.src = imgEl.src
        await new Promise((resolve) => {
          image.onload = resolve
          image.onerror = resolve
        })
        getAutoColorsFromImage(image).forEach((color) => colors.add(color))
      }
    }
    autoKeyColors = Array.from(colors)
    return autoKeyColors
  }

  const resetAutoColors = () => {
    autoKeyColors = []
  }

  const applyPreview = (colors) => {
    if (!overlayImage) return
    if (!colors.length) {
      const original = overlayImage.dataset.originalSrc
      if (original) overlayImage.src = original
      return
    }
    const original = overlayImage.dataset.originalSrc
    if (!original) return
    const sourceImage = new Image()
    sourceImage.onload = () => {
      const canvas = document.createElement("canvas")
      const width = sourceImage.naturalWidth
      const height = sourceImage.naturalHeight
      if (!width || !height) return
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(sourceImage, 0, 0)
      const imageData = ctx.getImageData(0, 0, width, height)
      const data = imageData.data
      const targets = colors.map((hex) => ({
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
      }))
      const tolerance = Math.round(255 * keyTolerance)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        for (const target of targets) {
          if (
            Math.abs(r - target.r) <= tolerance &&
            Math.abs(g - target.g) <= tolerance &&
            Math.abs(b - target.b) <= tolerance
          ) {
            data[i + 3] = 0
            break
          }
        }
      }
      ctx.putImageData(imageData, 0, 0)
      overlayImage.src = canvas.toDataURL("image/png")
    }
    sourceImage.src = original
  }

  const updatePreview = () => {
    if (!transparentToggle?.checked) return
    const auto = keyAutoToggle?.checked
    let colors = auto ? autoKeyColors : getManualKeyColors()
    if (auto && (!colors || !colors.length)) {
      colors = getAutoColorsFromImage(overlayImage)
      autoKeyColors = colors
    }
    applyPreview(colors)
  }

  const updatePickingState = () => {
    if (!overlay) return
    const picking = transparentToggle?.checked && !keyAutoToggle?.checked
    overlay.classList.toggle("is-picking", !!picking)
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
    transparentToggle = overlay?.querySelector("[data-gallery-transparent]")
    keyColorInput = overlay?.querySelector("[data-gallery-key-color]")
    keyAutoToggle = overlay?.querySelector("[data-gallery-key-auto]")
    keyListEl = overlay?.querySelector("[data-gallery-key-list]")
    keyClearButton = overlay?.querySelector("[data-gallery-key-clear]")
    toleranceInput = overlay?.querySelector("[data-gallery-tolerance]")
    toleranceLabel = overlay?.querySelector("[data-gallery-tolerance-label]")

    closeBtn?.addEventListener("click", close)
    prevBtn?.addEventListener("click", () => openAt(currentIndex - 1))
    nextBtn?.addEventListener("click", () => openAt(currentIndex + 1))
    deleteBtn?.addEventListener("click", deleteCurrent)
    autoplayButton?.addEventListener("click", () => {
      const enabled = !autoplayTimer
      setAutoplay(enabled)
    })

    overlayImage?.addEventListener("click", () => {
      if (transparentToggle?.checked && !keyAutoToggle?.checked) return
      openAt(currentIndex + 1)
    })

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

    keyListEl?.addEventListener("click", (event) => {
      const chip = event.target.closest(".gallery-key-chip")
      if (!chip) return
      const color = chip.dataset.color
      if (color) removeKeyColor(color)
      updatePreview()
    })

    keyClearButton?.addEventListener("click", () => {
      clearKeyColors()
      updatePreview()
    })

    if (toleranceInput) {
      const initial = Number(toleranceInput.value || "0.2")
      keyTolerance = Math.max(0.02, Math.min(0.6, initial))
      if (toleranceLabel) {
        toleranceLabel.textContent = keyTolerance.toFixed(2)
      }
      toleranceInput.addEventListener("input", () => {
        const next = Number(toleranceInput.value || "0.2")
        keyTolerance = Math.max(0.02, Math.min(0.6, next))
        if (toleranceLabel) {
          toleranceLabel.textContent = keyTolerance.toFixed(2)
        }
        updatePreview()
      })
    }

    keyAutoToggle?.addEventListener("change", () => {
      resetAutoColors()
      updatePickingState()
      updatePreview()
    })

    transparentToggle?.addEventListener("change", () => {
      resetAutoColors()
      updatePickingState()
      updatePreview()
    })

    overlayImage?.addEventListener("click", (event) => {
      if (!transparentToggle?.checked) return
      if (keyAutoToggle?.checked) return
      const rect = overlayImage.getBoundingClientRect()
      const x = Math.round(
        ((event.clientX - rect.left) / rect.width) * overlayImage.naturalWidth
      )
      const y = Math.round(
        ((event.clientY - rect.top) / rect.height) * overlayImage.naturalHeight
      )
      const canvas = document.createElement("canvas")
      const width = overlayImage.naturalWidth
      const height = overlayImage.naturalHeight
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(overlayImage, 0, 0)
      const data = ctx.getImageData(
        Math.max(0, Math.min(width - 1, x)),
        Math.max(0, Math.min(height - 1, y)),
        1,
        1
      ).data
      const hex = `#${[data[0], data[1], data[2]]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`.toUpperCase()
      addKeyColor(hex)
      resetAutoColors()
      updatePreview()
      event.stopPropagation()
    })

    downloadButton?.addEventListener("click", async () => {
      if (!imageItems.length) return
      if (!chatId) return

      if (transparentToggle?.checked && keyAutoToggle?.checked) {
        await collectAutoColors()
      }

      const payload = {
        message_ids: imageItems.map((item) => item.messageId),
        interval: autoplayInterval / 1000,
        transparent: transparentToggle?.checked ? "1" : "0",
        key_color: keyColorInput?.value || "#ffffff",
        key_auto: keyAutoToggle?.checked ? "1" : "0",
        key_colors: keyAutoToggle?.checked
          ? autoKeyColors
          : getManualKeyColors(),
        key_tolerance: keyTolerance
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
        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(errorText || `HTTP ${res.status}`)
        }
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
        alert(`GIF download failed: ${error.message}`)
      } finally {
        downloadButton.textContent = originalLabel
        downloadButton.disabled = false
      }
    })

    timelineEl?.addEventListener("click", (event) => {
      const thumb = event.target.closest(".gallery-thumb")
      if (!thumb) return
      const messageId = thumb.dataset.messageId
      if (messageId) {
        const index = imageItems.findIndex(
          (item) => item.messageId === messageId
        )
        if (index >= 0) {
          openAt(index)
          return
        }
      }
      const fallbackIndex = Number(thumb.dataset.index)
      if (!Number.isNaN(fallbackIndex)) openAt(fallbackIndex)
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
