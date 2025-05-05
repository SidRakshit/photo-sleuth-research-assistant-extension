// popup.js

const chatOutput = document.getElementById("chatOutput");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const getBioButton = document.getElementById("getBioButton");
const statusElement = document.getElementById("status");

let pageDataCache = null;
let isFetchingData = false;
let isWaitingForBot = false;
let pendingActionHandler = null;

document.addEventListener("DOMContentLoaded", (event) => {
	console.log("DOM fully loaded and parsed, setting up listeners.");

	sendButton.addEventListener("click", handleUserInput);

	chatInput.addEventListener("keypress", (event) => {
		if (event.key === "Enter") {
			handleUserInput();
		}
	});

	getBioButton.addEventListener("click", handleBioRequest);

	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		console.log(
			"POPUP SCRIPT: Received message via runtime.onMessage:",
			message.action
		);

		if (message.action === "extractedDataResponse") {
			isFetchingData = false;

			if (
				message.data &&
				typeof message.data.pageHtml === "string" &&
				!message.data.error
			) {
				console.log(
					"POPUP SCRIPT: Successfully extracted page data via runtime message. Length:",
					message.data.pageHtml.length
				);
				pageDataCache = message.data;

				if (typeof pendingActionHandler === "function") {
					console.log("POPUP SCRIPT: Executing pending action handler.");
					try {
						pendingActionHandler();
					} catch (error) {
						console.error(
							"POPUP SCRIPT: Error executing pending action handler:",
							error
						);
						addMessageToChat(
							`Error processing request: ${error.message}`,
							"bot"
						);
						statusElement.textContent = "Processing Error.";
						isWaitingForBot = false;
					} finally {
						pendingActionHandler = null;
					}
				} else {
					console.log(
						"POPUP SCRIPT: No pending action after fetching data via runtime message."
					);
					if (!isWaitingForBot) {
						statusElement.textContent = "Page data loaded.";
					}
				}
			} else {
				const errorMessage =
					message.data?.error ||
					"Received invalid data structure from content script.";
				console.error(
					"POPUP SCRIPT: Error in extractedDataResponse received via runtime message:",
					errorMessage
				);
				addMessageToChat(
					"Error extracting HTML from page: " + errorMessage,
					"bot"
				);
				statusElement.textContent = "Error extracting HTML.";
				isWaitingForBot = false;
				pendingActionHandler = null;
			}
		} else if (message.action === "extractionError") {
			console.error(
				"POPUP SCRIPT: Received extractionError via runtime message:",
				message.error
			);
			addMessageToChat("Error extracting HTML: " + message.error, "bot");
			statusElement.textContent = "Extraction failed.";
			isFetchingData = false;
			isWaitingForBot = false;
			pendingActionHandler = null;
		}
	});

	pageDataCache = null;
	pendingActionHandler = null;
	console.log("POPUP SCRIPT: Initial state reset.");
});

function addMessageToChat(text, sender) {
	const messageDiv = document.createElement("div");
	messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");

	if (sender === "bot") {
		try {
			if (
				typeof DOMPurify !== "undefined" &&
				typeof DOMPurify.sanitize === "function"
			) {
				if (
					typeof marked !== "undefined" &&
					typeof marked.parse === "function"
				) {
					const rawHtml = marked.parse(text, { breaks: true });
					const sanitizedHtml = DOMPurify.sanitize(rawHtml);
					messageDiv.innerHTML = sanitizedHtml;
				} else {
					console.warn("Marked library not ready, using DOMPurify only.");
					const sanitizedText = DOMPurify.sanitize(text);
					messageDiv.innerHTML = sanitizedText.replace(/\n/g, "<br>");
				}
			} else {
				console.error("DOMPurify not ready or sanitize method missing.");
				messageDiv.textContent = text;
			}
		} catch (e) {
			console.error("Error processing or sanitizing bot message:", e);
			messageDiv.textContent = text;
		}
	} else {
		messageDiv.textContent = text;
	}

	chatOutput.appendChild(messageDiv);
	chatOutput.scrollTop = chatOutput.scrollHeight;
}

function handleUserInput() {
	const question = chatInput.value.trim();
	if (!question || isWaitingForBot || isFetchingData) {
		console.log(
			`Input blocked: question=${!!question}, isWaitingForBot=${isWaitingForBot}, isFetchingData=${isFetchingData}`
		);
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
		console.log(
			`Bio request blocked: isWaitingForBot=${isWaitingForBot}, isFetchingData=${isFetchingData}`
		);
		return;
	}
	addMessageToChat("Requesting biographical info...", "user");
	statusElement.textContent = "Preparing bio request...";
	isWaitingForBot = true;
	checkCacheOrRequestData("getBio");
}

function checkCacheOrRequestData(actionType, question = null) {
	console.log(
		"POPUP SCRIPT: Checking cache or requesting data for action:",
		actionType
	);
	if (pageDataCache) {
		console.log("POPUP SCRIPT: Using cached page data.");
		if (actionType === "getBio") {
			getBiographicalInfo(pageDataCache);
		} else if (actionType === "generalQuestion" && question) {
			callChatbotAPI(question, pageDataCache);
		} else {
			console.warn(
				"POPUP SCRIPT: Cached data available but action type unknown:",
				actionType
			);
			isWaitingForBot = false;
			statusElement.textContent = "";
		}
	} else {
		console.log(
			"POPUP SCRIPT: No cached data, requesting from content script."
		);
		statusElement.textContent = "Extracting page content...";
		isFetchingData = true;

		if (actionType === "getBio") {
			pendingActionHandler = () => getBiographicalInfo(pageDataCache);
		} else if (actionType === "generalQuestion" && question) {
			pendingActionHandler = () => callChatbotAPI(question, pageDataCache);
		} else {
			pendingActionHandler = null;
		}

		requestDataFromContentScript();
	}
}

function requestDataFromContentScript() {
	console.log(
		"POPUP SCRIPT: Sending extractDataRequest to content script via tabs.sendMessage."
	);
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (chrome.runtime.lastError) {
			console.error(
				"POPUP SCRIPT: Error querying tabs:",
				chrome.runtime.lastError.message
			);
			addMessageToChat(
				`Error accessing current tab: ${chrome.runtime.lastError.message}`,
				"bot"
			);
			statusElement.textContent = "Tab query error.";
			isFetchingData = false;
			isWaitingForBot = false;
			pendingActionHandler = null;
			return;
		}
		if (tabs[0] && tabs[0].id) {
			const targetTabId = tabs[0].id;
			chrome.tabs.sendMessage(
				targetTabId,
				{ action: "extractDataRequest" },
				(response) => {
					if (chrome.runtime.lastError) {
						console.error(
							"POPUP SCRIPT: Error encountered during tabs.sendMessage to content script:",
							chrome.runtime.lastError.message
						);
						if (
							chrome.runtime.lastError.message.includes(
								"Receiving end does not exist"
							)
						) {
							addMessageToChat(
								"Error: Cannot connect to the page. Check if it's the correct URL and try refreshing.",
								"bot"
							);
							statusElement.textContent = "Connection error.";
							isFetchingData = false;
							isWaitingForBot = false;
							pendingActionHandler = null;
						} else if (
							chrome.runtime.lastError.message.includes("message port closed")
						) {
							console.warn(
								"POPUP SCRIPT: tabs.sendMessage port closed before response. Waiting for runtime.sendMessage response."
							);
						} else {
							addMessageToChat(
								`Error communicating with page: ${chrome.runtime.lastError.message}`,
								"bot"
							);
							statusElement.textContent = "Communication error.";
							isFetchingData = false;
							isWaitingForBot = false;
							pendingActionHandler = null;
						}
					} else {
						console.log(
							"POPUP SCRIPT: extractDataRequest message sent via tabs.sendMessage (Waiting for response via runtime.onMessage)."
						);
					}
				}
			);
		} else {
			console.error("POPUP SCRIPT: Could not find active tab ID.");
			addMessageToChat("Cannot access the current tab.", "bot");
			statusElement.textContent = "Tab access error.";
			isFetchingData = false;
			isWaitingForBot = false;
			pendingActionHandler = null;
		}
	});
}

async function callPerplexityAPI(systemPrompt, userPrompt) {
	const apiKey = "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";
	const apiUrl = "https://api.perplexity.ai/chat/completions";
	const modelName = "sonar";

	const messages = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: userPrompt },
	];

	console.log("POPUP SCRIPT: Calling Perplexity API...");
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
		let errorBody = "Could not retrieve error details.";
		let responseText = "";
		try {
			responseText = await response.text();
			errorBody = responseText;
			const errorJson = JSON.parse(responseText);
			errorBody =
				errorJson.error?.message ||
				errorJson.detail ||
				JSON.stringify(errorJson);
		} catch (e) {
			console.warn(
				"POPUP SCRIPT: Could not parse API error response as JSON.",
				responseText
			);
		}
		console.error(
			`POPUP SCRIPT: API Error ${response.status} ${response.statusText}: ${errorBody}`
		);
		console.error("POPUP SCRIPT: Raw API Error Response Text:", responseText);
		throw new Error(`API request failed: ${response.status} - ${errorBody}`);
	}

	const result = await response.json();
	console.log("POPUP SCRIPT: Raw API Success Response:", result);

	const botAnswer = result.choices?.[0]?.message?.content?.trim();

	if (!botAnswer) {
		console.error(
			"POPUP SCRIPT: Unexpected API response format. 'content' not found:",
			result
		);
		throw new Error(
			`Received an unexpected response format from the API: ${JSON.stringify(
				result
			)}`
		);
	}

	return botAnswer;
}

async function callChatbotAPI(question, pageContextData) {
	if (
		!pageContextData ||
		typeof pageContextData.pageHtml !== "string" ||
		typeof pageContextData.pageUrl !== "string"
	) {
		console.error(
			"POPUP SCRIPT: callChatbotAPI called without valid pageContextData."
		);
		addMessageToChat(
			"Internal error: Missing page data for chatbot request.",
			"bot"
		);
		statusElement.textContent = "Error.";
		isWaitingForBot = false;
		return;
	}
	console.log("POPUP SCRIPT: Preparing general question for API.");
	statusElement.textContent = "Asking Perplexity AI...";

	const systemPrompt = `You are a helpful research assistant specializing in the American Civil War.
Use the provided HTML content of a photo page from civilwarphotosleuth.com as the primary context for your answer.
Analyze the HTML to understand the photo's details, identified individuals, evidence, and any other relevant text.
You also have access to the internet to supplement information or answer broader questions.
Answer the user's question based *primarily* on the HTML context. Use web search only if necessary to supplement or clarify information *directly hinted at* in the HTML.
Be concise. Format your answer using Markdown.

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
		console.error("POPUP SCRIPT: Error in callChatbotAPI:", error);
		addMessageToChat(`Sorry, I encountered an error: ${error.message}`, "bot");
		statusElement.textContent = "API Error.";
	} finally {
		console.log(
			"POPUP SCRIPT: Finalizing callChatbotAPI, resetting isWaitingForBot."
		);
		isWaitingForBot = false;
	}
}

async function getBiographicalInfo(pageContextData) {
	if (
		!pageContextData ||
		typeof pageContextData.pageHtml !== "string" ||
		typeof pageContextData.pageUrl !== "string"
	) {
		console.error(
			"POPUP SCRIPT: getBiographicalInfo called without valid pageContextData."
		);
		addMessageToChat(
			"Internal error: Missing page data for bio request.",
			"bot"
		);
		statusElement.textContent = "Error.";
		isWaitingForBot = false;
		return;
	}
	console.log("POPUP SCRIPT: Preparing bio request for API.");
	statusElement.textContent = "Getting biographical info...";

	const systemPrompt = `You are a helpful research assistant specializing in the American Civil War.
Use the provided HTML content of a photo page from civilwarphotosleuth.com as the primary context.
Analyze the HTML to identify the main subject(s) of the photo and extract any available biographical details (name, dates, regiment, etc.).
Supplement this with information found via web search to generate a comprehensive biography.
Format the output clearly using Markdown. Structure the biography using the fields provided by the user.
If information for a field is unavailable from the HTML or web search, state "Unknown" for that field.

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
		`Based *primarily* on the provided HTML content, please identify the main individual depicted or identified on the page. Then, provide a detailed biography for that person using both the information from the HTML and external web search results. Structure the biography using the following fields. If information is not found for a field, state "Unknown".\n\n**Fields:**\n` +
		template_fields.map((field) => `- **${field}:**`).join("\n");

	try {
		const botAnswer = await callPerplexityAPI(systemPrompt, user_prompt);
		addMessageToChat(botAnswer, "bot");
		statusElement.textContent = "";
	} catch (error) {
		console.error("POPUP SCRIPT: Error in getBiographicalInfo:", error);
		addMessageToChat(
			`Sorry, I encountered an error while fetching biographical info: ${error.message}`,
			"bot"
		);
		statusElement.textContent = "API Error.";
	} finally {
		console.log(
			"POPUP SCRIPT: Finalizing getBiographicalInfo, resetting isWaitingForBot."
		);
		isWaitingForBot = false;
	}
}
