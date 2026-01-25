window.JetskiChat = window.JetskiChat || {}

const bootJetskiChat = () => {
  window.JetskiChat.inputController?.init?.()
  window.JetskiChat.messages?.init?.()
  window.JetskiChat.gallery?.init?.()
  window.JetskiChat.sidebar?.init?.()
  window.JetskiChat.welcomePanel?.init?.()
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootJetskiChat)
} else {
  bootJetskiChat()
}
