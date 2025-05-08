# Civil War Photo Sleuth Chatbot - Chrome Extension

**Version:** 1.7 (updated to reflect recent changes)

## Description

This Chrome extension adds a side panel to photo detail pages on `civilwarphotosleuth.com`. It allows users to ask general questions about the photo, request detailed biographical information, or request a military service summary for individuals identified in the photo's context. The extension utilizes the Perplexity AI API (`sonar` model) to generate responses, using the current page's HTML content as context. Users must provide their own Perplexity API key.

## Features

- **Side Panel Interface**: Provides a chat UI within a Chrome side panel.
- **Contextual Chat**: Ask general questions about the content of the current Civil War Photo Sleuth page.
- **Biographical Info**: Request a structured biography of the individual featured on the page.
- **Military Service Summary**: Request a summary of the individual's military service during the Civil War.
- **User API Key**: Securely stores the user's Perplexity API key using `chrome.storage`.
- **Markdown Rendering**: Displays AI responses formatted using Markdown.
- **HTML Sanitization**: Ensures safe rendering of AI responses using DOMPurify.
- **Chat Reset**: Button to clear the current chat display.
- **API Key Reset**: Button to clear the stored API key.

## Target Website

- `civilwarphotosleuth.com/photos/view/*`

## Technology Stack

- Chrome Extension Manifest V3
- JavaScript (Background Service Worker, Content Script, Side Panel Logic)
- HTML / CSS (Side Panel UI)
- **AI**: Perplexity AI API (`sonar` model)
- **Storage**: `chrome.storage.local`
- **Styling**: Tailwind CSS
- **Markdown**: Marked.js
- **Security**: DOMPurify

## Setup & Installation (Local Development)

1.  **Clone/Download**: Get the code repository onto your local machine.
2.  **Load Extension in Chrome**:
    - Open Chrome and navigate to `chrome://extensions/`.
    - Enable "Developer mode" (usually a toggle in the top-right corner).
    - Click "Load unpacked".
    - Select the `Extension` folder containing the `manifest.json` file.
3.  The extension icon should appear in your Chrome toolbar.
4.  **Set API Key**: After installation, open the side panel on a target page (see Usage). You will be prompted to enter your Perplexity API key in the form at the bottom and click "Save".

## Usage

1.  Navigate to a photo detail page on `civilwarphotosleuth.com` (e.g., `https://www.civilwarphotosleuth.com/photos/view/some-photo-id`).
2.  Click the extension icon in your Chrome toolbar to open the side panel.
3.  **Enter API Key (First Time)**: If prompted, enter your Perplexity API key in the input field at the bottom of the panel and click "Save". The chat controls will become active.
4.  **Ask a Question**: Type a general question about the photo or its context into the input field and press Enter or click "Send".
5.  **Get Bio Info**: Click the green "Get Bio Info" button.
6.  **Get Military Service Summary**: Click the orange "Military Service Summary" button.
7.  **Clear Chat**: Click the "Clear Chat" button near the top right to clear the conversation display.
8.  **Clear API Key**: Click the "Clear Key" button next to the API key input field to remove your saved key and disable the chat functions until a new key is saved.
9.  The extension will extract page content (if not already cached), query the Perplexity AI API using your saved key, and display the response in the chat panel.
