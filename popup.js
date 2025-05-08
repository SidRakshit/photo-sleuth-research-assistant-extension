// popup.js

const chatOutput = document.getElementById("chatOutput");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const getBioButton = document.getElementById("getBioButton");
const getMilitaryServiceButton = document.getElementById(
	"getMilitaryServiceButton"
);
const statusElement = document.getElementById("status");

const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyButton = document.getElementById("saveApiKeyButton");
const apiKeyStatus = document.getElementById("apiKeyStatus");
const resetChatButton = document.getElementById("resetChatButton");
const resetApiKeyButton = document.getElementById("resetApiKeyButton");

let pageDataCache = null;
let isFetchingData = false;
let isWaitingForBot = false;
let pendingActionHandler = null;
let userApiKey = null;

// --- Function to Load API Key ---
function loadApiKey() {
	chrome.storage.local.get(["perplexityApiKey"], (result) => {
		if (chrome.runtime.lastError) {
			console.error("Error loading API key:", chrome.runtime.lastError.message);
			apiKeyStatus.textContent = "Error loading key.";
			updateUiForApiKeyStatus(false);
		} else if (result.perplexityApiKey) {
			console.log("API Key loaded from storage.");
			userApiKey = result.perplexityApiKey;
			apiKeyInput.placeholder = "API Key is set";
			apiKeyStatus.textContent = "API Key loaded.";
			updateUiForApiKeyStatus(true);
		} else {
			console.log("No API Key found in storage.");
			apiKeyStatus.textContent = "Please enter your Perplexity API key.";
			updateUiForApiKeyStatus(false);
			if (!chatOutput.hasChildNodes()) {
				addMessageToChat(
					"Welcome! Please enter your Perplexity API key below and click 'Save' to begin.",
					"bot"
				);
			}
		}
	});
}

// --- Function to Save API Key ---
function saveApiKey() {
	const key = apiKeyInput.value.trim();
	if (!key) {
		apiKeyStatus.textContent = "Please enter a valid API key.";
		return;
	}
	chrome.storage.local.set({ perplexityApiKey: key }, () => {
		if (chrome.runtime.lastError) {
			console.error("Error saving API key:", chrome.runtime.lastError.message);
			apiKeyStatus.textContent = "Error saving key.";
			updateUiForApiKeyStatus(false);
		} else {
			console.log("API Key saved successfully.");
			userApiKey = key;
			apiKeyInput.value = "";
			apiKeyInput.placeholder = "API Key is set";
			apiKeyStatus.textContent = "API Key saved successfully!";
			updateUiForApiKeyStatus(true);
			const firstBotMessage = chatOutput.querySelector(".bot-message");
			if (
				firstBotMessage &&
				firstBotMessage.textContent.includes("enter your Perplexity API key")
			) {
				chatOutput.innerHTML = "";
				addMessageToChat("API Key set. You can now ask questions!", "bot");
			}
			setTimeout(() => {
				apiKeyStatus.textContent = "API Key loaded.";
			}, 2000);
		}
	});
}

// --- Function to update UI based on API key presence ---
function updateUiForApiKeyStatus(isKeySet) {
	const elementsToToggle = [
		chatInput,
		sendButton,
		getBioButton,
		getMilitaryServiceButton,
		resetChatButton,
	];
	if (isKeySet) {
		elementsToToggle.forEach((el) => (el.disabled = false));
		chatInput.placeholder = "Ask a general question...";
	} else {
		elementsToToggle.forEach((el) => (el.disabled = true));
		chatInput.placeholder = "Set API Key below to enable chat";
	}
}

// function handleRefresh() {
// 	console.log("Resetting chat and API key.");

// 	// 1. Clear Chat UI
// 	chatOutput.innerHTML = "";

// 	// 2. Clear API Key from storage and memory
// 	chrome.storage.local.remove("perplexityApiKey", () => {
// 		if (chrome.runtime.lastError) {
// 			console.error(
// 				"Error removing API key:",
// 				chrome.runtime.lastError.message
// 			);
// 			apiKeyStatus.textContent = "Error clearing key.";
// 		} else {
// 			console.log("API Key removed from storage.");
// 			apiKeyStatus.textContent = "API Key cleared. Please re-enter.";
// 		}
// 	});
// 	userApiKey = null;
// 	apiKeyInput.value = ""; // Clear the input field visually
// 	apiKeyInput.placeholder = "pplx-..."; // Reset placeholder

// 	// 3. Reset other state
// 	pageDataCache = null;
// 	pendingActionHandler = null;
// 	isFetchingData = false;
// 	isWaitingForBot = false;
// 	statusElement.textContent = ""; // Clear any processing status

// 	// 4. Update UI
// 	updateUiForApiKeyStatus(false); // Disable controls
// 	addMessageToChat(
// 		"Chat and API Key reset. Please enter your Perplexity API key below to continue.",
// 		"bot"
// 	);
// 	apiKeyInput.focus(); // Focus input for convenience
// }

function handleResetChat() {
	console.log("Resetting chat.");
	// 1. Clear Chat UI
	chatOutput.innerHTML = "";
	// chatHistory = []; // Clear history if implemented

	// 2. Optionally add a confirmation message
	addMessageToChat("Chat cleared.", "bot");

	// 3. Clear main status
	statusElement.textContent = "";

	// 4. Reset waiting flags (in case a request was pending)
	isWaitingForBot = false;
	isFetchingData = false;
	pendingActionHandler = null;
}
// --- End New Reset Chat Function ---

// --- New Reset API Key Function ---
function handleResetApiKey() {
	console.log("Resetting API key.");
	// 1. Clear API Key from storage and memory
	chrome.storage.local.remove("perplexityApiKey", () => {
		if (chrome.runtime.lastError) {
			console.error(
				"Error removing API key:",
				chrome.runtime.lastError.message
			);
			apiKeyStatus.textContent = "Error clearing key.";
		} else {
			console.log("API Key removed from storage.");
			apiKeyStatus.textContent = "API Key cleared. Please re-enter.";
		}
	});
	userApiKey = null;
	apiKeyInput.value = ""; // Clear the input field visually
	apiKeyInput.placeholder = "pplx-..."; // Reset placeholder

	// 2. Update UI
	updateUiForApiKeyStatus(false); // Disable controls
	// Add message only if the API key prompt isn't already the only message
	if (
		!chatOutput
			.querySelector(".bot-message")
			?.textContent.includes("enter your Perplexity API key")
	) {
		addMessageToChat(
			"API key cleared. Please re-enter your key to use the chat.",
			"bot"
		);
	}
	apiKeyInput.focus(); // Focus input for convenience
}

document.addEventListener("DOMContentLoaded", (event) => {
	console.log("DOM fully loaded and parsed, setting up listeners.");

	// --- Load API Key on startup ---
	loadApiKey();

	sendButton.addEventListener("click", handleUserInput);
	chatInput.addEventListener("keypress", (event) => {
		if (event.key === "Enter") {
			handleUserInput();
		}
	});
	getBioButton.addEventListener("click", handleBioRequest);
	getMilitaryServiceButton.addEventListener(
		"click",
		handleMilitaryServiceRequest
	);

	// --- Add listener for Save API Key button ---
	saveApiKeyButton.addEventListener("click", saveApiKey);
	resetApiKeyButton.addEventListener("click", handleResetApiKey);
	resetChatButton.addEventListener("click", handleResetChat);
	// refreshButton.addEventListener("click", handleRefresh);

	// Rest of the DOMContentLoaded...
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
				pageDataCache = message.data;
				if (typeof pendingActionHandler === "function") {
					try {
						pendingActionHandler();
					} catch (error) {
						console.error("Error executing pending handler:", error);
						addMessageToChat(`Error: ${error.message}`, "bot");
						statusElement.textContent = "Error.";
						isWaitingForBot = false; // Reset flag on error
					} finally {
						pendingActionHandler = null; // Clear handler
					}
				} else if (!isWaitingForBot) {
					statusElement.textContent = "Page data loaded.";
				}
			} else {
				const errorMessage =
					message.data?.error || "Invalid data from content script.";
				console.error("Error in extractedDataResponse:", errorMessage);
				addMessageToChat("Error extracting HTML: " + errorMessage, "bot");
				statusElement.textContent = "Error extracting HTML.";
				isWaitingForBot = false;
				isFetchingData = false; // Reset flags
				pendingActionHandler = null;
			}
		} else if (message.action === "extractionError") {
			console.error("Received extractionError:", message.error);
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
				messageDiv.textContent = text; // Fallback
			}
		} catch (e) {
			console.error("Error processing or sanitizing bot message:", e);
			messageDiv.textContent = text; // Fallback
		}
	} else {
		messageDiv.textContent = text;
	}

	chatOutput.appendChild(messageDiv);
	chatOutput.scrollTop = chatOutput.scrollHeight;
}

// --- Modified API Call Function ---
async function callPerplexityAPI(systemPrompt, userPrompt) {
	if (!userApiKey) {
		throw new Error(
			"API key is not set. Please save your key in the settings below."
		);
	}
	const apiKey = userApiKey;

	const apiUrl = "https://api.perplexity.ai/chat/completions";
	const modelName = "sonar";

	const messages = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: userPrompt },
	];

	console.log("POPUP SCRIPT: Calling Perplexity API...");
	try {
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
				if (response.status === 401) {
					errorBody = "Authentication failed. Please check your API key.";
					updateUiForApiKeyStatus(false);
					apiKeyStatus.textContent = "Invalid API Key.";
				}
			} catch (e) {
				console.warn(
					"Could not parse API error response as JSON.",
					responseText
				);
			}
			console.error(
				`API Error ${response.status} ${response.statusText}: ${errorBody}`
			);
			console.error("Raw API Error Response Text:", responseText);
			throw new Error(`API request failed: ${response.status} - ${errorBody}`);
		}

		const result = await response.json();
		console.log("Raw API Success Response:", result);

		const botAnswer = result.choices?.[0]?.message?.content?.trim();

		if (!botAnswer) {
			console.error(
				"Unexpected API response format. 'content' not found:",
				result
			);
			throw new Error(`Received an unexpected response format from the API.`);
		}

		return botAnswer;
	} catch (error) {
		console.error("Error during API call:", error);
		if (!error.message.startsWith("API request failed")) {
			throw new Error(`Failed to communicate with API: ${error.message}`);
		} else {
			throw error;
		}
	}
}

// --- Minor changes to handlers to check API key first ---
function handleUserInput() {
	const question = chatInput.value.trim();
	if (!userApiKey) {
		addMessageToChat("Please set your API key first.", "bot");
		apiKeyInput.focus();
		return;
	}
	if (!question || isWaitingForBot || isFetchingData) return;
	addMessageToChat(question, "user");
	chatInput.value = "";
	statusElement.textContent = "Thinking...";
	isWaitingForBot = true;
	checkCacheOrRequestData("generalQuestion", question);
}

function handleBioRequest() {
	if (!userApiKey) {
		addMessageToChat("Please set your API key first.", "bot");
		apiKeyInput.focus();
		return;
	}
	if (isWaitingForBot || isFetchingData) return;
	addMessageToChat("Requesting biographical info...", "user");
	statusElement.textContent = "Preparing bio request...";
	isWaitingForBot = true;
	checkCacheOrRequestData("getBio");
}

function handleMilitaryServiceRequest() {
	if (!userApiKey) {
		addMessageToChat("Please set your API key first.", "bot");
		apiKeyInput.focus();
		return;
	}
	if (isWaitingForBot || isFetchingData) return;
	addMessageToChat("Requesting military service summary...", "user");
	statusElement.textContent = "Preparing military service request...";
	isWaitingForBot = true;
	checkCacheOrRequestData("getMilitaryService");
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
		} else if (actionType === "getMilitaryService") {
			getMilitaryServiceSummary(pageDataCache);
		} else if (actionType === "generalQuestion" && question) {
			callChatbotAPI(question, pageDataCache);
		} else {
			console.warn("Unknown action type with cached data:", actionType);
			isWaitingForBot = false;
			statusElement.textContent = "";
		}
	} else {
		console.log("POPUP SCRIPT: Requesting data from content script.");
		statusElement.textContent = "Extracting page content...";
		isFetchingData = true;

		if (actionType === "getBio") {
			pendingActionHandler = () => getBiographicalInfo(pageDataCache);
		} else if (actionType === "getMilitaryService") {
			pendingActionHandler = () => getMilitaryServiceSummary(pageDataCache);
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
			console.error("Error querying tabs:", chrome.runtime.lastError.message);
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
							"Error during tabs.sendMessage:",
							chrome.runtime.lastError.message
						);
						if (
							chrome.runtime.lastError.message.includes(
								"Receiving end does not exist"
							)
						) {
							addMessageToChat(
								"Error: Cannot connect to page. Refresh or check URL.",
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
								"tabs.sendMessage port closed. Waiting for runtime."
							);
						} else {
							addMessageToChat(
								`Communication error: ${chrome.runtime.lastError.message}`,
								"bot"
							);
							statusElement.textContent = "Communication error.";
							isFetchingData = false;
							isWaitingForBot = false;
							pendingActionHandler = null;
						}
					} else {
						console.log("extractDataRequest sent via tabs.sendMessage.");
					}
				}
			);
		} else {
			console.error("Could not find active tab ID.");
			addMessageToChat("Cannot access the current tab.", "bot");
			statusElement.textContent = "Tab access error.";
			isFetchingData = false;
			isWaitingForBot = false;
			pendingActionHandler = null;
		}
	});
}

async function callChatbotAPI(question, pageContextData) {
	if (
		!pageContextData ||
		typeof pageContextData.pageHtml !== "string" ||
		typeof pageContextData.pageUrl !== "string"
	) {
		console.error("callChatbotAPI: Invalid pageContextData.");
		addMessageToChat("Internal error: Missing page data.", "bot");
		statusElement.textContent = "Error.";
		isWaitingForBot = false;
		return;
	}
	console.log("Preparing general question for API.");
	statusElement.textContent = "Asking Perplexity AI...";
	const systemPrompt = `You are a helpful research assistant specializing in the American Civil War... Context URL: ${pageContextData.pageUrl}\nWebpage HTML Content:\n\`\`\`html\n${pageContextData.pageHtml}\n\`\`\``;
	try {
		const botAnswer = await callPerplexityAPI(systemPrompt, question);
		addMessageToChat(botAnswer, "bot");
		statusElement.textContent = "";
	} catch (error) {
		console.error("Error in callChatbotAPI:", error);
		addMessageToChat(`Sorry, I encountered an error: ${error.message}`, "bot");
		statusElement.textContent = "API Error.";
	} finally {
		isWaitingForBot = false;
	}
}

async function getBiographicalInfo(pageContextData) {
	if (
		!pageContextData ||
		typeof pageContextData.pageHtml !== "string" ||
		typeof pageContextData.pageUrl !== "string"
	) {
		console.error("getBiographicalInfo: Invalid pageContextData.");
		addMessageToChat("Internal error: Missing page data.", "bot");
		statusElement.textContent = "Error.";
		isWaitingForBot = false;
		return;
	}
	console.log("Preparing bio request for API.");
	statusElement.textContent = "Getting biographical info...";
	const systemPrompt = `You are a helpful research assistant specializing in the American Civil War... Context URL: ${pageContextData.pageUrl}\nWebpage HTML Content:\n\`\`\`html\n${pageContextData.pageHtml}\n\`\`\``;
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
		`Based primarily on the provided HTML content... \nFields:\n` +
		template_fields.map((field) => `- **${field}:**`).join("\n");
	try {
		const botAnswer = await callPerplexityAPI(systemPrompt, user_prompt);
		addMessageToChat(botAnswer, "bot");
		statusElement.textContent = "";
	} catch (error) {
		console.error("Error in getBiographicalInfo:", error);
		addMessageToChat(`Error fetching bio info: ${error.message}`, "bot");
		statusElement.textContent = "API Error.";
	} finally {
		isWaitingForBot = false;
	}
}

async function getMilitaryServiceSummary(pageContextData) {
	if (
		!pageContextData ||
		typeof pageContextData.pageHtml !== "string" ||
		typeof pageContextData.pageUrl !== "string"
	) {
		console.error("getMilitaryServiceSummary: Invalid pageContextData.");
		addMessageToChat("Internal error: Missing page data.", "bot");
		statusElement.textContent = "Error.";
		isWaitingForBot = false;
		return;
	}
	console.log("Preparing military service request for API.");
	statusElement.textContent = "Getting military service summary...";
	const systemPrompt = `You are a helpful research assistant specializing in the American Civil War military records... Context URL: ${pageContextData.pageUrl}\nWebpage HTML Content:\n\`\`\`html\n${pageContextData.pageHtml}\n\`\`\``;
	const user_prompt = `Give me more details about the units that this person served in.`;
	try {
		const botAnswer = await callPerplexityAPI(systemPrompt, user_prompt);
		addMessageToChat(botAnswer, "bot");
		statusElement.textContent = "";
	} catch (error) {
		console.error("Error in getMilitaryServiceSummary:", error);
		addMessageToChat(
			`Error fetching military summary: ${error.message}`,
			"bot"
		);
		statusElement.textContent = "API Error.";
	} finally {
		isWaitingForBot = false;
	}
}
