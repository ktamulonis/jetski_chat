window.JetskiChat = window.JetskiChat || {}

window.JetskiChat.markdown = (() => {
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

  return { renderMarkdown, renderMessageContent }
})()
