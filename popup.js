// popup.js

// --- Get references to DOM elements ---
const chatOutput = document.getElementById("chatOutput");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const getBioButton = document.getElementById("getBioButton");
const statusElement = document.getElementById("status");

// --- State variables ---
let pageDataCache = null;
let isFetchingData = false;
let isWaitingForBot = false;

// === Wait for the DOM to be fully loaded before setting up listeners ===
document.addEventListener("DOMContentLoaded", (event) => {
	console.log("DOM fully loaded and parsed, setting up listeners.");

	// --- Event Listeners ---
	sendButton.addEventListener("click", handleUserInput);

	chatInput.addEventListener("keypress", (event) => {
		if (event.key === "Enter") {
			handleUserInput();
		}
	});

	getBioButton.addEventListener("click", handleBioRequest);

	// --- Chrome Runtime Message Listener ---
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		console.log("POPUP SCRIPT: Received message:", message.action); // Log received actions

		if (message.action === "extractedDataResponse") {
			isFetchingData = false;
			statusElement.textContent = "Processing data..."; // Update status

			if (
				message.data &&
				typeof message.data.pageHtml === "string" &&
				!message.data.error
			) {
				console.log(
					"POPUP SCRIPT: Successfully extracted page data. Length:",
					message.data.pageHtml.length
				);
				pageDataCache = message.data;

				const pendingAction = sessionStorage.getItem("pendingAction");
				const pendingQuestion = sessionStorage.getItem("pendingQuestion");
				console.log(
					"POPUP SCRIPT: Pending action:",
					pendingAction,
					"Pending question:",
					!!pendingQuestion
				);

				sessionStorage.removeItem("pendingAction"); // Always clear pending action once data is received
				sessionStorage.removeItem("pendingQuestion"); // Always clear pending question

				if (!pageDataCache) {
					// This check might be redundant now but safe to keep
					addMessageToChat(
						"Internal error: Failed to process page data.",
						"bot"
					);
					statusElement.textContent = "Error.";
					isWaitingForBot = false;
					return;
				}

				if (pendingAction === "getBio") {
					getBiographicalInfo(pageDataCache);
				} else if (pendingAction === "generalQuestion" && pendingQuestion) {
					callChatbotAPI(pendingQuestion, pageDataCache);
				} else {
					// If no pending action, maybe just update status or do nothing
					console.log("POPUP SCRIPT: No pending action after fetching data.");
					statusElement.textContent = ""; // Clear status if nothing else to do
					isWaitingForBot = false; // Ensure bot isn't marked as waiting
					// Potentially add a message like "Page data loaded." if desired
				}
			} else {
				const errorMessage =
					message.data?.error ||
					"Received invalid data structure from content script.";
				console.error(
					"POPUP SCRIPT: Error in extractedDataResponse:",
					errorMessage
				);
				addMessageToChat(
					"Error extracting HTML from page: " + errorMessage,
					"bot"
				);
				statusElement.textContent = "Error extracting HTML.";
				isWaitingForBot = false;
				// Clear any pending actions on error
				sessionStorage.removeItem("pendingAction");
				sessionStorage.removeItem("pendingQuestion");
			}
		} else if (message.action === "extractionError") {
			console.error("POPUP SCRIPT: Received extractionError:", message.error);
			addMessageToChat("Error extracting HTML: " + message.error, "bot");
			statusElement.textContent = "Extraction failed.";
			isFetchingData = false;
			isWaitingForBot = false;
			sessionStorage.removeItem("pendingAction");
			sessionStorage.removeItem("pendingQuestion");
		}
		// Note: It's generally not recommended to use sendResponse asynchronously
		// in onMessage listeners unless necessary. If not sending a response back
		// to the sender (content.js in this case), you don't need sendResponse.
	});

	// --- Initial State Reset ---
	pageDataCache = null;
	sessionStorage.removeItem("pendingAction");
	sessionStorage.removeItem("pendingQuestion");
	console.log("POPUP SCRIPT: Initial state reset.");

	// Add initial bot message if needed
	// addMessageToChat("Ask a question or request biographical info!", "bot");
}); // End of DOMContentLoaded listener

// === Function Definitions (can be outside DOMContentLoaded) ===

function addMessageToChat(text, sender) {
	const messageDiv = document.createElement("div");
	messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");

	if (sender === "bot") {
		try {
			// Check if DOMPurify and its sanitize method are ready
			// Use a more robust check, ensuring DOMPurify itself is defined first
			if (
				typeof DOMPurify !== "undefined" &&
				typeof DOMPurify.sanitize === "function"
			) {
				// Check if Marked is ready too
				if (
					typeof marked !== "undefined" &&
					typeof marked.parse === "function"
				) {
					console.log(
						"POPUP SCRIPT: Using Marked and DOMPurify for bot message."
					);
					const rawHtml = marked.parse(text, { breaks: true }); // Parse Markdown, convert \n to <br>
					const sanitizedHtml = DOMPurify.sanitize(rawHtml); // Sanitize the result
					messageDiv.innerHTML = sanitizedHtml;
				} else {
					console.warn(
						"Marked library not ready, falling back to DOMPurify only."
					);
					// Fallback using only DOMPurify if Marked isn't ready
					const sanitizedText = DOMPurify.sanitize(text); // Sanitize raw text (won't parse Markdown)
					messageDiv.innerHTML = sanitizedText.replace(/\n/g, "<br>"); // Basic newline conversion
				}
			} else {
				// Log the state if DOMPurify isn't ready
				console.error(
					"DOMPurify not ready or sanitize method missing at time of execution."
				);
				console.log("typeof DOMPurify:", typeof DOMPurify);
				// Fallback to plain text if DOMPurify isn't available
				messageDiv.textContent = text;
			}
		} catch (e) {
			console.error("Error processing or sanitizing bot message:", e);
			messageDiv.textContent = text; // Fallback in case of any error during processing
		}
	} else {
		// For user messages, just display as plain text
		messageDiv.textContent = text;
	}

	chatOutput.appendChild(messageDiv);
	// Ensure the chat scrolls to the bottom to show the new message
	chatOutput.scrollTop = chatOutput.scrollHeight;
}

function handleUserInput() {
	const question = chatInput.value.trim();
	if (!question || isWaitingForBot || isFetchingData) {
		return;
	}
	addMessageToChat(question, "user");
	chatInput.value = ""; // Clear input after sending
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
			// Added else to handle cases where action might not match expected after cache check
			console.warn(
				"POPUP SCRIPT: Cached data available but action type unknown:",
				actionType
			);
			isWaitingForBot = false; // Ensure bot isn't stuck waiting
			statusElement.textContent = "";
		}
	} else {
		console.log(
			"POPUP SCRIPT: No cached data, requesting from content script."
		);
		statusElement.textContent = "Extracting page content..."; // More accurate status
		isFetchingData = true;
		sessionStorage.setItem("pendingAction", actionType);
		if (question) {
			sessionStorage.setItem("pendingQuestion", question);
		}
		requestDataFromContentScript();
	}
}

function requestDataFromContentScript() {
	console.log("POPUP SCRIPT: Sending extractDataRequest to content script.");
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (chrome.runtime.lastError) {
			console.error(
				"POPUP SCRIPT: Error querying tabs:",
				chrome.runtime.lastError.message
			);
			addMessageToChat(
				"Error accessing current tab: " + chrome.runtime.lastError.message,
				"bot"
			);
			statusElement.textContent = "Tab query error.";
			isFetchingData = false;
			isWaitingForBot = false;
			sessionStorage.removeItem("pendingAction");
			sessionStorage.removeItem("pendingQuestion");
			return;
		}
		if (tabs[0] && tabs[0].id) {
			const targetTabId = tabs[0].id;
			// Using setTimeout might still be okay as a small buffer, but isn't strictly necessary
			// if the content script is already loaded and listening reliably.
			// setTimeout(() => {
			chrome.tabs.sendMessage(
				targetTabId,
				{ action: "extractDataRequest" },
				(response) => {
					// This callback in sendMessage is often less reliable for checking success
					// than the listener in the content script sending a response back.
					// Rely on the chrome.runtime.onMessage listener for the actual data/error.
					if (chrome.runtime.lastError) {
						// This error often means the content script isn't ready or listening
						console.error(
							"POPUP SCRIPT: Error sending message to content script:",
							chrome.runtime.lastError.message
						);
						// Check if it's the specific "no receiving end" error
						if (
							chrome.runtime.lastError.message.includes(
								"Receiving end does not exist"
							)
						) {
							addMessageToChat(
								"Error: Cannot connect to the page. Try refreshing the page or ensure you're on a valid civilwarphotosleuth.com/photos/view/ page.",
								"bot"
							);
							statusElement.textContent = "Connection error.";
						} else {
							addMessageToChat(
								"Error communicating with page: " +
									chrome.runtime.lastError.message,
								"bot"
							);
							statusElement.textContent = "Communication error.";
						}
						// Reset state if sending failed
						isFetchingData = false;
						isWaitingForBot = false;
						sessionStorage.removeItem("pendingAction");
						sessionStorage.removeItem("pendingQuestion");
					} else {
						console.log(
							"POPUP SCRIPT: extractDataRequest message sent successfully."
						);
						// Success here just means the message was sent, not that data was extracted.
						// Wait for the onMessage listener to handle the response.
					}
				}
			);
			// }, 100); // Delay might not be needed
		} else {
			console.error("POPUP SCRIPT: Could not find active tab ID.");
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
	// IMPORTANT: Hardcoding API keys is insecure. Consider using chrome.storage or a backend.
	const apiKey = "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"; // Replace with your actual key IF NEEDED FOR TESTING, but ideally remove

	const apiUrl = "https://api.perplexity.ai/chat/completions";
	const modelName = "sonar"; // Updated model

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
			// stream: false // Ensure streaming is off if not handled
		}),
	});

	if (!response.ok) {
		let errorBody = "Could not retrieve error details.";
		try {
			errorBody = await response.text(); // Always try to get text first
			const errorJson = JSON.parse(errorBody); // Then try to parse
			errorBody =
				errorJson.error?.message ||
				errorJson.detail ||
				JSON.stringify(errorJson);
		} catch (e) {
			console.warn(
				"POPUP SCRIPT: Could not parse API error response as JSON.",
				errorBody
			);
		}
		console.error(
			`POPUP SCRIPT: API Error ${response.status} ${response.statusText}: ${errorBody}`
		);
		throw new Error(`API Error: ${response.status} - ${errorBody}`);
	}

	const result = await response.json();
	console.log("POPUP SCRIPT: API Response Received:", result); // Log the raw result

	// Adjust access based on potential variations in Perplexity's response structure
	const botAnswer = result.choices?.[0]?.message?.content?.trim();

	if (!botAnswer) {
		console.error(
			"POPUP SCRIPT: Unexpected API response format. 'content' not found:",
			result
		);
		throw new Error("Received an unexpected response format from the API.");
	}

	return botAnswer;
}

async function callChatbotAPI(question, pageContextData) {
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
		statusElement.textContent = ""; // Clear status on success
	} catch (error) {
		console.error("POPUP SCRIPT: Error in callChatbotAPI:", error);
		addMessageToChat(`Sorry, I encountered an error: ${error.message}`, "bot");
		statusElement.textContent = "Error.";
	} finally {
		isWaitingForBot = false; // Always ensure this resets
	}
}

async function getBiographicalInfo(pageContextData) {
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

	// Using Markdown formatting in the prompt itself
	const user_prompt =
		`Based *primarily* on the provided HTML content, please identify the main individual depicted or identified on the page. Then, provide a detailed biography for that person using both the information from the HTML and external web search results. Structure the biography using the following fields. If information is not found for a field, state "Unknown".\n\n**Fields:**\n` +
		template_fields.map((field) => `- **${field}:**`).join("\n"); // Format fields as a Markdown list

	try {
		// console.log("POPUP SCRIPT: About to call Perplexity API (Bio Info)..."); // Already logged in callPerplexityAPI
		const botAnswer = await callPerplexityAPI(systemPrompt, user_prompt);
		// console.log( // Already logged in callPerplexityAPI
		//     "POPUP SCRIPT: Perplexity API call succeeded (Bio Info). Response length:",
		//     botAnswer ? botAnswer.length : "null/undefined"
		// );
		addMessageToChat(botAnswer, "bot");
		statusElement.textContent = ""; // Clear status on success
	} catch (error) {
		console.error("POPUP SCRIPT: Error in getBiographicalInfo:", error);
		addMessageToChat(
			`Sorry, I encountered an error while fetching biographical info: ${error.message}`,
			"bot"
		);
		statusElement.textContent = "Error.";
	} finally {
		isWaitingForBot = false; // Always ensure this resets
	}
}
