# Civil War Photo Sleuth Chatbot - Chrome Extension

**Version:** 1.6 (as per manifest.json)

## Description

This Chrome extension adds a side panel to photo detail pages on `civilwarphotosleuth.com`. It allows users to ask general questions about the photo, request detailed biographical information, or request a military service summary for individuals identified in the photo's context. The extension utilizes the Perplexity AI API (`sonar` model) to generate responses, using the current page's HTML content as context.

## Features

- **Side Panel Interface**: Provides a chat UI within a Chrome side panel.
- **Contextual Chat**: Ask general questions about the content of the current Civil War Photo Sleuth page.
- **Biographical Info**: Request a structured biography of the individual featured on the page.
- **Military Service Summary**: Request a summary of the individual's military service during the Civil War.
- **Markdown Rendering**: Displays AI responses formatted using Markdown.
- **HTML Sanitization**: Ensures safe rendering of AI responses using DOMPurify.

## Target Website

- `civilwarphotosleuth.com/photos/view/*`

## Technology Stack

- Chrome Extension Manifest V3
- JavaScript (Background Service Worker, Content Script, Side Panel Logic)
- HTML / CSS (Side Panel UI)
- **AI**: Perplexity AI API (`sonar` model)
- **Styling**: Tailwind CSS
- **Markdown**: Marked.js
- **Security**: DOMPurify

## Setup & Installation (Local Development)

1.  **Clone/Download**: Get the code repository onto your local machine.
2.  **API Key**:
    - Open the `Extension/popup.js` file.
    - Locate the `callPerplexityAPI` function.
    - **IMPORTANT:** Replace the placeholder API key (`YOUR_PERP_API_KEY`) with your actual Perplexity AI API key. **Do not commit your real API key to public repositories.** Consider more secure methods like `chrome.storage` or environment variables for actual distribution.
3.  **Load Extension in Chrome**:
    - Open Chrome and navigate to `chrome://extensions/`.
    - Enable "Developer mode" (usually a toggle in the top-right corner).
    - Click "Load unpacked".
    - Select the `Extension` folder containing the `manifest.json` file.
4.  The extension icon should appear in your Chrome toolbar.

## Usage

1.  Navigate to a photo detail page on `civilwarphotosleuth.com` (e.g., `https://www.civilwarphotosleuth.com/photos/view/some-photo-id`).
2.  Click the extension icon in your Chrome toolbar to open the side panel.
3.  **Ask a Question**: Type a general question about the photo or its context into the input field at the bottom and press Enter or click "Send".
4.  **Get Bio Info**: Click the green "Get Bio Info" button.
5.  **Get Military Service Summary**: Click the orange "Military Service Summary" button.
6.  The extension will extract page content (if not already cached), query the Perplexity AI API, and display the response in the chat panel. A status message indicates progress.
