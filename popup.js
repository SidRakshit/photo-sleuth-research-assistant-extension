// popup.js
const chatOutput = document.getElementById("chatOutput");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const getBioButton = document.getElementById("getBioButton");
const statusElement = document.getElementById("status");

let pageDataCache = null;
let isFetchingData = false;
let isWaitingForBot = false;

sendButton.addEventListener("click", handleUserInput);

chatInput.addEventListener("keypress", (event) => {
	if (event.key === "Enter") {
		handleUserInput();
	}
});

getBioButton.addEventListener("click", handleBioRequest);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "extractedDataResponse") {
		isFetchingData = false;
		if (
			message.data &&
			typeof message.data.pageHtml === "string" &&
			!message.data.error
		) {
			pageDataCache = message.data;

			const pendingAction = sessionStorage.getItem("pendingAction");
			const pendingQuestion = sessionStorage.getItem("pendingQuestion");

			if (!pageDataCache) {
				addMessageToChat("Internal error: Failed to process page data.", "bot");
				statusElement.textContent = "Error.";
				isWaitingForBot = false;
				return;
			}

			if (pendingAction === "getBio") {
				sessionStorage.removeItem("pendingAction");
				getBiographicalInfo(pageDataCache);
			} else if (pendingAction === "generalQuestion" && pendingQuestion) {
				sessionStorage.removeItem("pendingAction");
				sessionStorage.removeItem("pendingQuestion");
				callChatbotAPI(pendingQuestion, pageDataCache);
			} else {
				addMessageToChat(
					"Error: Could not determine the action after fetching data.",
					"bot"
				);
				statusElement.textContent = "";
				isWaitingForBot = false;
				return;
			}
		} else {
			const errorMessage =
				message.data?.error ||
				"Received invalid data structure from content script.";
			addMessageToChat(
				"Error extracting HTML from page: " + errorMessage,
				"bot"
			);
			statusElement.textContent = "Error extracting HTML.";
			isWaitingForBot = false;
			sessionStorage.removeItem("pendingAction");
			sessionStorage.removeItem("pendingQuestion");
			return;
		}
	} else if (message.action === "extractionError") {
		addMessageToChat("Error extracting HTML: " + message.error, "bot");
		statusElement.textContent = "Extraction failed.";
		isFetchingData = false;
		isWaitingForBot = false;
		sessionStorage.removeItem("pendingAction");
		sessionStorage.removeItem("pendingQuestion");
	}
});

function handleUserInput() {
	const question = chatInput.value.trim();
	if (!question || isWaitingForBot || isFetchingData) {
		return;
	}
	addMessageToChat(question, "user");
	chatInput.value = "";
	statusElement.textContent = "Thinking...";
	isWaitingForBot = true;
	checkCacheOrRequestData("generalQuestion", question);
}

function handleBioRequest() {
	if (isWaitingForBot || isFetchingData) {
		return;
	}
	addMessageToChat("Requesting biographical info...", "user");
	statusElement.textContent = "Preparing bio request...";
	isWaitingForBot = true;
	checkCacheOrRequestData("getBio");
}

function checkCacheOrRequestData(actionType, question = null) {
	if (pageDataCache) {
		if (actionType === "getBio") {
			getBiographicalInfo(pageDataCache);
		} else if (actionType === "generalQuestion" && question) {
			callChatbotAPI(question, pageDataCache);
		}
	} else {
		statusElement.textContent = "Extracting page HTML...";
		isFetchingData = true;
		sessionStorage.setItem("pendingAction", actionType);
		if (question) {
			sessionStorage.setItem("pendingQuestion", question);
		}
		requestDataFromContentScript();
	}
}

function requestDataFromContentScript() {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (tabs[0] && tabs[0].id) {
			const targetTabId = tabs[0].id;
			setTimeout(() => {
				chrome.tabs.sendMessage(
					targetTabId,
					{ action: "extractDataRequest" },
					(response) => {
						if (chrome.runtime.lastError) {
						}
					}
				);
			}, 100);
		} else {
			addMessageToChat("Cannot access the current tab.", "bot");
			statusElement.textContent = "Tab access error.";
			isFetchingData = false;
			isWaitingForBot = false;
			sessionStorage.removeItem("pendingAction");
			sessionStorage.removeItem("pendingQuestion");
		}
	});
}

async function callPerplexityAPI(systemPrompt, userPrompt) {
	const apiKey = "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";

	if (apiKey === "pplx**********" || !apiKey) {
		throw new Error(
			"API key is missing or is still the placeholder value. Please configure it."
		);
	}

	const apiUrl = "https://api.perplexity.ai/chat/completions";
	const modelName = "sonar";

	const messages = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: userPrompt },
	];

	const response = await fetch(apiUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			model: modelName,
			messages: messages,
		}),
	});

	if (!response.ok) {
		let errorBody = await response.text();
		try {
			const errorJson = JSON.parse(errorBody);
			errorBody =
				errorJson.error?.message ||
				errorJson.detail ||
				JSON.stringify(errorJson);
		} catch (e) {}
		throw new Error(
			`API Error: ${response.status} ${response.statusText} - ${errorBody}`
		);
	}

	const result = await response.json();

	const botAnswer = result.choices?.[0]?.message?.content?.trim();

	if (!botAnswer) {
		throw new Error("Received an unexpected response format from the API.");
	}

	return botAnswer;
}

async function callChatbotAPI(question, pageContextData) {
	statusElement.textContent = "Asking Perplexity AI...";

	const systemPrompt = `You are a helpful research assistant specializing in the American Civil War.
Use the provided HTML content of a photo page from civilwarphotosleuth.com as the primary context for your answer.
Analyze the HTML to understand the photo's details, identified individuals, evidence, and any other relevant text.
You also have access to the internet to supplement information or answer broader questions.
Be concise and directly answer the user's question based on the HTML context and web search if necessary.

Context URL: ${pageContextData.pageUrl}
Webpage HTML Content:
\`\`\`html
${pageContextData.pageHtml}
\`\`\`
`;

	try {
		const botAnswer = await callPerplexityAPI(systemPrompt, question);
		addMessageToChat(botAnswer, "bot");
		statusElement.textContent = "";
	} catch (error) {
		addMessageToChat(`Sorry, I encountered an error: ${error.message}`, "bot");
		statusElement.textContent = "Error.";
	} finally {
		isWaitingForBot = false;
	}
}

async function getBiographicalInfo(pageContextData) {
	statusElement.textContent = "Getting biographical info...";

	const systemPrompt = `You are a helpful research assistant specializing in the American Civil War.
Use the provided HTML content of a photo page from civilwarphotosleuth.com as the primary context.
Analyze the HTML to identify the main subject(s) of the photo and extract any available biographical details (name, dates, regiment, etc.).
Supplement this with information found via web search to generate a biography.
If information for a field is unavailable from the HTML or web search, state "Unknown".

Context URL: ${pageContextData.pageUrl}
Webpage HTML Content:
\`\`\`html
${pageContextData.pageHtml}
\`\`\`
`;

	const template_fields = [
		"Full Name",
		"Date of Birth",
		"Birthplace",
		"Parents",
		"Education",
		"Occupation",
		"Notable Events Before War",
		"Affiliation (Union/Confederate)",
		"Regiment(s) and Rank(s)",
		"Major Battles/Campaigns Participated In",
		"Key Contributions or Service Notes",
		"Post-War Life/Later Career",
		"Personal Life (Spouse, Children)",
		"Date of Death",
		"Place of Death",
		"Burial Site",
		"Notes on Historical Significance or Legacy",
	];

	const user_prompt =
		`Based *primarily* on the provided HTML content, please identify the main individual depicted or identified on the page. Then, provide a detailed biography for that person using both the information from the HTML and external web search results. Structure the biography using the following fields. If information is not found for a field, state "Unknown".\n\nFields:\n` +
		template_fields.join("\n");

	try {
		console.log("POPUP SCRIPT: About to call Perplexity API (Bio Info)...");
		const botAnswer = await callPerplexityAPI(systemPrompt, user_prompt);
		console.log(
			"POPUP SCRIPT: Perplexity API call succeeded (Bio Info). Response length:",
			botAnswer ? botAnswer.length : "null/undefined"
		);
		addMessageToChat(botAnswer, "bot");
		statusElement.textContent = "";
	} catch (error) {
		addMessageToChat(
			`Sorry, I encountered an error while fetching biographical info: ${error.message}`,
			"bot"
		);
		statusElement.textContent = "Error.";
	} finally {
		isWaitingForBot = false;
	}
}

function addMessageToChat(text, sender) {
	const messageDiv = document.createElement("div");
	messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");

	if (sender === "bot") {
		try {
			if (typeof marked === "function" && typeof DOMPurify === "object") {
				const rawHtml = marked.parse ? marked.parse(text) : marked(text);
				messageDiv.innerHTML = DOMPurify.sanitize(rawHtml);
			} else {
				messageDiv.textContent = text;
			}
		} catch (e) {
			messageDiv.textContent = text;
		}
	} else {
		messageDiv.textContent = text;
	}

	chatOutput.appendChild(messageDiv);
	chatOutput.scrollTop = chatOutput.scrollHeight;
}

pageDataCache = null;
sessionStorage.removeItem("pendingAction");
sessionStorage.removeItem("pendingQuestion");
