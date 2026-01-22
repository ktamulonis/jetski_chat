window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.sidebar = (() => {
  const init = () => {
    const sidebarToggle = document.querySelector("[data-sidebar-toggle]")
    const sidebarContainer = document.querySelector("[data-sidebar-container]")
    if (!sidebarToggle || !sidebarContainer) return

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

  return { init }
})()
