// Helper to escape backticks in text to avoid breaking template literals
function escapeBackticks(str) {
    return str.replace(/`/g, '\\`');
}

// Convert HTML to plain text with bullet points as "- "
function htmlToPlainText(html) {
    // Fix: Add a line break after </strong> if it ends with ? or :
    html = html.replace(/<\/strong>([^\n])(?=[^\s])/g, '</strong>\n$1');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    function traverse(node) {
        let text = '';
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                text += child.textContent;
            } else if (child.nodeName === 'P') {
                text += traverse(child) + '\n\n';
            } else if (child.nodeName === 'LI') {
                text += '- ' + traverse(child) + '\n';
            } else if (child.nodeName === 'UL' || child.nodeName === 'OL') {
                text += traverse(child);
            } else if (child.nodeName === 'STRONG') {
                text += '<strong>' + traverse(child) + '</strong>';
            } else if (child.nodeName === 'EM') {
                text += '<em>' + traverse(child) + '</em>';
            } else if (child.nodeName === 'BR') {
                text += '\n';
            } else {
                text += traverse(child);
            }
        });
        return text;
    }

    return traverse(tempDiv).trim();
}


// Parse FAQ from textarea input
function parseFAQ(text) {
    const lines = text.trim().split('\n');
    const faqPairs = [];
    let question = '';
    let answerLines = [];
    let inList = false;

    function flushAnswer() {
        if (question && answerLines.length) {
            faqPairs.push({
                question: question,
                answer: answerLines.join('<br>')
            });
        }
        answerLines = [];
        question = '';
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        // Detect <strong> line as question
        if (/^<strong>.*<\/strong>$/.test(line)) {
            flushAnswer();
            question = line;
            continue;
        }

        // Detect bullet point (with or without <strong>)
        if (/^- /.test(line)) {
            if (!inList) {
                answerLines.push('<ul>');
                inList = true;
            }

            // Merge this and possibly next line if it's an indented continuation
            let bullet = line.slice(2).trim();
            while (i + 1 < lines.length && lines[i + 1].startsWith(' ')) {
                bullet += ' ' + lines[++i].trim();
            }

            answerLines.push(`<li>${bullet}</li>`);
        } else {
            if (inList) {
                answerLines.push('</ul>');
                inList = false;
            }
            answerLines.push(line);
        }
    }

    // Close last list and flush
    if (inList) {
        answerLines.push('</ul>');
        inList = false;
    }
    flushAnswer();

    return faqPairs;
}



// Generate HTML for FAQs
function generateFAQHTML(faqs) {
    return faqs.map((faq, index) => {
        const questionSafe = escapeBackticks(faq.question);
        const answerSafe = escapeBackticks(faq.answer);
        return `
      <div class="faq-item${index === 0 ? ' active' : ''}">
        <button class="faq-question">
          ${questionSafe}
          <span class="faq-toggle">${index === 0 ? '+' : '+'}</span>
        </button>
        <div class="faq-answer">
          <p>${answerSafe}</p>
        </div>
      </div>
    `;
    }).join('\n');
}

// Build full output HTML
function buildFullHTML(faqHTML) {
    return `
    <style>
      .faq-item {
        border-bottom: 1px solid #ddd;
        margin-bottom: 10px;
      }
      .faq-question {
        background: none;
        border: none;
        width: 100%;
        text-align: left;
        font-size: 18px;
        padding: 15px;
        cursor: pointer;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
      }
      .faq-toggle {
        font-size: 20px;
        transition: transform 0.3s;
      }
      .faq-answer {
        display: none;
        padding: 0 15px 15px;
        color: #555;
      }
      .faq-item.active .faq-answer {
        display: block;
      }
      .faq-item.active .faq-toggle {
        transform: rotate(45deg); /* Turn "+" into "×" */
      }
    </style>
    <div class="faq-wrapper">
      ${faqHTML}
    </div>
    <script>
      document.addEventListener("DOMContentLoaded", function () {
        const faqItems = document.querySelectorAll(".faq-item");

        faqItems.forEach(item => {
          const button = item.querySelector(".faq-question");

          button.addEventListener("click", () => {
            faqItems.forEach(i => i.classList.remove("active"));
            item.classList.toggle("active");
          });
        });
      });
    </script>
  `;
}

// Generate button click handler with validation
document.getElementById('generateButton').addEventListener('click', () => {
    const rawInput = document.getElementById('faqInput').value.trim();

    if (!rawInput) {
        alert("Please enter some FAQ content before generating.");
        return;
    }

    const faqs = parseFAQ(rawInput);

    if (faqs.length === 0) {
        alert("No valid FAQ pairs found. Please format your content properly.");
        return;
    }

    const faqHTML = generateFAQHTML(faqs);
    const fullHTML = buildFullHTML(faqHTML);
    document.getElementById('htmlCode').textContent = fullHTML;
    document.getElementById('copyButton').disabled = false;
});

// Copy to clipboard
document.getElementById('copyButton').addEventListener('click', () => {
    const htmlCode = document.getElementById('htmlCode').textContent;
    navigator.clipboard.writeText(htmlCode)
        .then(() => alert("HTML copied to clipboard!"))
        .catch(() => alert("Failed to copy HTML."));
});

// DOCX upload handling with bullet and formatting support
document.getElementById('docxUpload').addEventListener('change', function (event) {
    const file = event.target.files[0];

    if (!file || !file.name.endsWith('.docx')) {
        alert("Please upload a valid .docx file.");
        return;
    }

    const reader = new FileReader();

    reader.onload = function (event) {
        const arrayBuffer = event.target.result;

        mammoth.convertToHtml({
            arrayBuffer: arrayBuffer,
            styleMap: [
                "p[style-name='Normal'] => p:fresh",
                "br => br",
                "strong => strong",
                "b => strong",
                "i => em",
                "u => u"
            ]
        })

            .then(result => {
                let html = result.value;

                // Fix unwanted line breaks caused by word wrapping in Word
                html = html.replace(/([a-z0-9.,])<br>\s*\(/gi, '$1 (');

                // Also remove <br> if it's in the middle of a normal sentence (heuristic)
                html = html.replace(/([^>])<br>([a-z])/gi, '$1 $2');

                // Normalize punctuation-ending strong to help parser split
                html = html.replace(/([?:])\s*<\/strong>/g, '$1</strong>\n');

                const plainTextWithTags = htmlToPlainText(html);

                // Normalize spacing
                const cleaned = plainTextWithTags
                    .replace(/\n{3,}/g, '\n\n') // limit line breaks
                    .trim();

                document.getElementById('faqInput').value = cleaned;
                alert("DOCX file loaded with formatting and bullet points preserved.");
            })
            .catch(err => {
                console.error("Error reading DOCX:", err);
                alert("Failed to read the DOCX file.");
            });
    };

    reader.readAsArrayBuffer(file);
});


const fileInput = document.getElementById('docxUpload');
  const fileNameSpan = document.getElementById('fileName');

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      fileNameSpan.textContent = fileInput.files[0].name;
    } else {
      fileNameSpan.textContent = 'No file chosen';
    }
  });