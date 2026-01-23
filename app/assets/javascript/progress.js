window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.progress = (() => {
  const trackers = new Map()
  const defaults = {
    interval: 2000,
    fakeCap: 70,
    fakeStep: 10,
    fakeTailStep: 2,
    fakeTailCap: 95
  }

  const logEvent = (state, event, data = {}) => {
    if (!state.debug) return
    console.log(`${state.logPrefix} ${event}`, { id: state.id, ...data })
  }

  const ensureElement = (state) => {
    if (!state.container) return null
    if (state.element && state.element.isConnected) return state.element
    let progressEl = state.container.querySelector(`.${state.className}`)
    if (!progressEl) {
      progressEl = document.createElement("div")
      progressEl.className = state.className
      progressEl.setAttribute("role", "progressbar")
      progressEl.setAttribute("aria-valuemin", "0")
      progressEl.setAttribute("aria-valuemax", "100")
      const bar = document.createElement("div")
      bar.className = state.barClass
      const label = document.createElement("div")
      label.className = state.labelClass
      label.textContent = `${state.labelPrefix}...`
      progressEl.appendChild(bar)
      progressEl.appendChild(label)
      state.container.appendChild(progressEl)
    }
    state.element = progressEl
    return progressEl
  }

  const setValue = (state, value, label) => {
    const progressEl = ensureElement(state)
    if (!progressEl) return
    const safeValue = Math.max(0, Math.min(100, value))
    progressEl.dataset.value = safeValue.toFixed(1)
    progressEl.setAttribute("aria-valuenow", Math.round(safeValue).toString())
    const bar = progressEl.querySelector(`.${state.barClass}`)
    if (bar) {
      bar.style.width = `${safeValue}%`
    }
    const labelEl = progressEl.querySelector(`.${state.labelClass}`)
    if (labelEl) {
      const labelText = label || `${state.labelPrefix} ${Math.round(safeValue)}%`
      labelEl.textContent = labelText
    }
    if (state.onLabel && label) {
      state.onLabel(label, safeValue)
    }
  }

  const tick = (state) => {
    let nextValue = state.value
    let label = `${state.labelPrefix}...`
    if (state.hasReal) {
      const target = Math.min(state.target || 0, 100)
      nextValue = Math.min(state.value + state.fakeStep, target || 100)
      label = `${state.labelPrefix} ${Math.round(target)}%`
    } else {
      const target = Math.max(state.target || 0, state.fakeCap)
      if (state.value < target) {
        nextValue = Math.min(state.value + state.fakeStep, target)
      } else {
        nextValue = Math.min(state.value + state.fakeTailStep, state.fakeTailCap)
      }
      label = `${state.labelPrefix} (waiting for progress)`
    }

    if (nextValue > state.value) {
      state.value = nextValue
      setValue(state, state.value, label)
      logEvent(state, "tick", {
        percent: Math.round(state.value),
        hasReal: state.hasReal
      })
    }

    if (state.hasReal && state.value >= 100) {
      stop(state)
    }
  }

  const start = (state) => {
    if (state.timer) return
    ensureElement(state)
    state.timer = window.setInterval(() => tick(state), state.interval)
    logEvent(state, "started")
    tick(state)
  }

  const stop = (state) => {
    if (!state.timer) return
    window.clearInterval(state.timer)
    state.timer = null
    logEvent(state, "stopped")
  }

  const destroy = (state) => {
    stop(state)
    if (state.element) {
      state.element.remove()
      state.element = null
    }
    trackers.delete(state.id)
    logEvent(state, "destroyed")
  }

  const ensure = (options) => {
    if (!options?.id) return null
    const existing = trackers.get(options.id)
    if (existing) {
      existing.state.container = options.container || existing.state.container
      existing.state.labelPrefix = options.labelPrefix || existing.state.labelPrefix
      existing.state.onLabel = options.onLabel || existing.state.onLabel
      existing.state.debug =
        typeof options.debug === "boolean" ? options.debug : existing.state.debug
      existing.state.logPrefix = options.logPrefix || existing.state.logPrefix
      return existing.api
    }

    const state = {
      id: options.id,
      container: options.container || null,
      labelPrefix: options.labelPrefix || "Working",
      className: options.className || "image-progress",
      barClass: options.barClass || "image-progress-bar",
      labelClass: options.labelClass || "image-progress-label",
      interval: options.interval || defaults.interval,
      fakeCap: options.fakeCap || defaults.fakeCap,
      fakeStep: options.fakeStep || defaults.fakeStep,
      fakeTailStep: options.fakeTailStep || defaults.fakeTailStep,
      fakeTailCap: options.fakeTailCap || defaults.fakeTailCap,
      debug: !!options.debug,
      logPrefix: options.logPrefix || "Progress",
      onLabel: options.onLabel || null,
      value: 0,
      target: 0,
      hasReal: false,
      timer: null,
      element: null
    }

    const api = {
      start: () => start(state),
      stop: () => stop(state),
      destroy: () => destroy(state),
      markPending: (label) => {
        state.target = Math.max(state.target, state.fakeCap)
        if (label) {
          setValue(state, state.value, label)
        }
        start(state)
      },
      update: ({ completed, total, label } = {}) => {
        if (completed != null && total != null) {
          const ratio = Number(completed) / Math.max(1, Number(total))
          state.target = Math.max(state.target, Math.min(100, ratio * 100))
          state.hasReal = true
          logEvent(state, "progress", {
            completed: Number(completed),
            total: Number(total),
            percent: Math.round(state.target)
          })
        }
        if (label) {
          setValue(state, Math.max(state.value, state.target), label)
        }
        start(state)
      }
    }

    trackers.set(state.id, { state, api })
    return api
  }

  const remove = (id) => {
    const entry = trackers.get(id)
    if (entry) destroy(entry.state)
  }

  return { ensure, remove }
})()
