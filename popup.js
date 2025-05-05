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
let pendingActionHandler = null; // Variable to hold the function to call after data fetch

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
	// This listener handles responses sent via chrome.runtime.sendMessage from content.js
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		console.log(
			"POPUP SCRIPT: Received message via runtime.onMessage:",
			message.action
		);

		if (message.action === "extractedDataResponse") {
			isFetchingData = false; // Data fetch attempt is complete (successfully or with error)

			if (
				message.data &&
				typeof message.data.pageHtml === "string" &&
				!message.data.error
			) {
				console.log(
					"POPUP SCRIPT: Successfully extracted page data via runtime message. Length:",
					message.data.pageHtml.length
				);
				pageDataCache = message.data; // Store the fetched data

				// Check if there's a function waiting to be called
				if (typeof pendingActionHandler === "function") {
					console.log("POPUP SCRIPT: Executing pending action handler.");
					try {
						// Execute the stored handler. It will manage its own status and isWaitingForBot state.
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
						isWaitingForBot = false; // Reset state fully on handler execution error
					} finally {
						// Clear the handler after execution attempt.
						// isWaitingForBot is reset within the handler's own finally block.
						pendingActionHandler = null;
					}
				} else {
					// If no pending action, data might have been fetched proactively or by an unrelated event.
					console.log(
						"POPUP SCRIPT: No pending action after fetching data via runtime message."
					);
					// Only update status if the bot isn't supposed to be doing something else.
					if (!isWaitingForBot) {
						statusElement.textContent = "Page data loaded.";
					}
				}
			} else {
				// Handle errors in the received data structure
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
				isWaitingForBot = false; // Reset state fully on data error
				pendingActionHandler = null; // Clear pending action
			}
		} else if (message.action === "extractionError") {
			// Handle specific extraction errors sent from content script via runtime message
			console.error(
				"POPUP SCRIPT: Received extractionError via runtime message:",
				message.error
			);
			addMessageToChat("Error extracting HTML: " + message.error, "bot");
			statusElement.textContent = "Extraction failed.";
			isFetchingData = false;
			isWaitingForBot = false; // Reset state fully on extraction error
			pendingActionHandler = null; // Clear pending action
		}
		// Do NOT use `return true;` here unless you intend to send an async response back to the sender (content.js)
	});

	// --- Initial State Reset ---
	pageDataCache = null;
	pendingActionHandler = null;
	console.log("POPUP SCRIPT: Initial state reset.");

	// Initial bot message moved to HTML for simplicity
}); // End of DOMContentLoaded listener

// === Function Definitions ===

function addMessageToChat(text, sender) {
	const messageDiv = document.createElement("div");
	messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");

	if (sender === "bot") {
		try {
			// Ensure DOMPurify and Marked are loaded before using them
			if (
				typeof DOMPurify !== "undefined" &&
				typeof DOMPurify.sanitize === "function"
			) {
				if (
					typeof marked !== "undefined" &&
					typeof marked.parse === "function"
				) {
					const rawHtml = marked.parse(text, { breaks: true }); // Convert markdown with line breaks
					const sanitizedHtml = DOMPurify.sanitize(rawHtml); // Sanitize the HTML
					messageDiv.innerHTML = sanitizedHtml;
				} else {
					console.warn("Marked library not ready, using DOMPurify only.");
					const sanitizedText = DOMPurify.sanitize(text); // Sanitize text directly
					messageDiv.innerHTML = sanitizedText.replace(/\n/g, "<br>"); // Basic line breaks
				}
			} else {
				console.error("DOMPurify not ready or sanitize method missing.");
				messageDiv.textContent = text; // Fallback to plain text
			}
		} catch (e) {
			console.error("Error processing or sanitizing bot message:", e);
			messageDiv.textContent = text; // Fallback in case of any error
		}
	} else {
		// User messages are plain text
		messageDiv.textContent = text;
	}

	chatOutput.appendChild(messageDiv);
	// Ensure the chat scrolls to the bottom
	chatOutput.scrollTop = chatOutput.scrollHeight;
}

function handleUserInput() {
	const question = chatInput.value.trim();
	// Prevent action if already waiting for bot OR fetching data
	if (!question || isWaitingForBot || isFetchingData) {
		console.log(
			`Input blocked: question=${!!question}, isWaitingForBot=${isWaitingForBot}, isFetchingData=${isFetchingData}`
		);
		return;
	}
	addMessageToChat(question, "user");
	chatInput.value = "";
	statusElement.textContent = "Thinking..."; // Set initial status
	isWaitingForBot = true; // Set waiting flag HERE
	checkCacheOrRequestData("generalQuestion", question);
}

function handleBioRequest() {
	// Prevent action if already waiting for bot OR fetching data
	if (isWaitingForBot || isFetchingData) {
		console.log(
			`Bio request blocked: isWaitingForBot=${isWaitingForBot}, isFetchingData=${isFetchingData}`
		);
		return;
	}
	addMessageToChat("Requesting biographical info...", "user");
	statusElement.textContent = "Preparing bio request..."; // Set initial status
	isWaitingForBot = true; // Set waiting flag HERE
	checkCacheOrRequestData("getBio");
}

// Check cache or initiate data request
function checkCacheOrRequestData(actionType, question = null) {
	console.log(
		"POPUP SCRIPT: Checking cache or requesting data for action:",
		actionType
	);
	if (pageDataCache) {
		// Data is cached, execute the action directly
		console.log("POPUP SCRIPT: Using cached page data.");
		// The functions below will manage the `isWaitingForBot` state and status updates.
		if (actionType === "getBio") {
			getBiographicalInfo(pageDataCache);
		} else if (actionType === "generalQuestion" && question) {
			callChatbotAPI(question, pageDataCache);
		} else {
			console.warn(
				"POPUP SCRIPT: Cached data available but action type unknown:",
				actionType
			);
			// If the action was unknown but we had cache, reset state just in case.
			isWaitingForBot = false;
			statusElement.textContent = "";
		}
	} else {
		// Data not cached, request it
		console.log(
			"POPUP SCRIPT: No cached data, requesting from content script."
		);
		statusElement.textContent = "Extracting page content...";
		isFetchingData = true; // Set fetching flag

		// Store the correct handler function to be called after data arrives.
		// Use closures to ensure `pageDataCache` is accessed *after* it's updated.
		if (actionType === "getBio") {
			pendingActionHandler = () => getBiographicalInfo(pageDataCache);
		} else if (actionType === "generalQuestion" && question) {
			pendingActionHandler = () => callChatbotAPI(question, pageDataCache);
		} else {
			pendingActionHandler = null; // Safety reset
		}

		requestDataFromContentScript(); // Initiate the data request
	}
}

// Sends request to content script via tabs.sendMessage
function requestDataFromContentScript() {
	console.log(
		"POPUP SCRIPT: Sending extractDataRequest to content script via tabs.sendMessage."
	);
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		// Handle errors getting the active tab
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
			// Reset state fully on error
			isFetchingData = false;
			isWaitingForBot = false;
			pendingActionHandler = null;
			return;
		}
		if (tabs[0] && tabs[0].id) {
			const targetTabId = tabs[0].id;
			// Send the message. The response/data will primarily be handled by the runtime.onMessage listener.
			// The callback here is mainly for catching immediate errors (e.g., content script not injected).
			chrome.tabs.sendMessage(
				targetTabId,
				{ action: "extractDataRequest" },
				(response) => {
					// This callback might not receive the actual data if content script uses runtime.sendMessage.
					// Check chrome.runtime.lastError for immediate connection issues.
					if (chrome.runtime.lastError) {
						console.error(
							"POPUP SCRIPT: Error encountered during tabs.sendMessage to content script:",
							chrome.runtime.lastError.message
						);
						// Handle specific errors
						if (
							chrome.runtime.lastError.message.includes(
								"Receiving end does not exist"
							)
						) {
							// Content script likely not injected or accessible
							addMessageToChat(
								"Error: Cannot connect to the page. Check if it's the correct URL and try refreshing.",
								"bot"
							);
							statusElement.textContent = "Connection error.";
							// Reset state fully ONLY if we're sure the content script isn't there
							isFetchingData = false;
							isWaitingForBot = false;
							pendingActionHandler = null;
						} else if (
							chrome.runtime.lastError.message.includes("message port closed")
						) {
							// Port closed early. This might happen if content script takes too long.
							// We will rely on the runtime.onMessage listener, so just log a warning.
							console.warn(
								"POPUP SCRIPT: tabs.sendMessage port closed before response. Waiting for runtime.sendMessage response."
							);
						} else {
							// Other immediate errors sending the message
							addMessageToChat(
								`Error communicating with page: ${chrome.runtime.lastError.message}`,
								"bot"
							);
							statusElement.textContent = "Communication error.";
							// Reset state fully on other errors
							isFetchingData = false;
							isWaitingForBot = false;
							pendingActionHandler = null;
						}
					} else {
						// Message was apparently sent successfully via tabs.sendMessage
						console.log(
							"POPUP SCRIPT: extractDataRequest message sent via tabs.sendMessage (Waiting for response via runtime.onMessage)."
						);
						// Do NOT change state here; wait for the actual response or error in the runtime listener.
					}
				} // End of sendMessage callback
			); // End of sendMessage call
		} else {
			// Error getting tab ID
			console.error("POPUP SCRIPT: Could not find active tab ID.");
			addMessageToChat("Cannot access the current tab.", "bot");
			statusElement.textContent = "Tab access error.";
			// Reset state fully on error
			isFetchingData = false;
			isWaitingForBot = false;
			pendingActionHandler = null;
		}
	}); // End of tabs.query
}

// --- Perplexity API Call ---
async function callPerplexityAPI(systemPrompt, userPrompt) {
	// IMPORTANT: Keep API key secure. Avoid hardcoding in production.
	const apiKey = "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";
	const apiUrl = "https://api.perplexity.ai/chat/completions";
	const modelName = "sonar"; // Ensure this is the desired model

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
		let responseText = ""; // Variable to store raw response text
		try {
			responseText = await response.text(); // Get raw text first
			errorBody = responseText; // Use raw text as default error body
			const errorJson = JSON.parse(responseText); // Then try to parse
			errorBody =
				errorJson.error?.message ||
				errorJson.detail ||
				JSON.stringify(errorJson);
		} catch (e) {
			console.warn(
				"POPUP SCRIPT: Could not parse API error response as JSON.",
				responseText // Log the raw text
			);
		}
		console.error(
			`POPUP SCRIPT: API Error ${response.status} ${response.statusText}: ${errorBody}`
		);
		// Log the raw text too for non-ok responses
		console.error("POPUP SCRIPT: Raw API Error Response Text:", responseText);
		throw new Error(`API request failed: ${response.status} - ${errorBody}`);
	}

	const result = await response.json();
	console.log("POPUP SCRIPT: Raw API Success Response:", result); // Log raw success response

	const botAnswer = result.choices?.[0]?.message?.content?.trim();

	if (!botAnswer) {
		console.error(
			"POPUP SCRIPT: Unexpected API response format. 'content' not found:",
			result // Log the result that caused the error
		);
		// Add the raw result to the error message if possible
		throw new Error(
			`Received an unexpected response format from the API: ${JSON.stringify(
				result
			)}`
		);
	}

	return botAnswer;
}

// --- callChatbotAPI (Handles its own state reset) ---
async function callChatbotAPI(question, pageContextData) {
	// Validate context data before proceeding
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
		isWaitingForBot = false; // Reset state on early exit
		return;
	}
	console.log("POPUP SCRIPT: Preparing general question for API.");
	statusElement.textContent = "Asking Perplexity AI..."; // Update status before async call

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
		statusElement.textContent = "API Error."; // More specific status
	} finally {
		console.log(
			"POPUP SCRIPT: Finalizing callChatbotAPI, resetting isWaitingForBot."
		);
		isWaitingForBot = false; // Reset waiting state ONLY after API call finishes/fails
	}
}

// --- getBiographicalInfo (Handles its own state reset) ---
async function getBiographicalInfo(pageContextData) {
	// Validate context data before proceeding
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
		isWaitingForBot = false; // Reset state on early exit
		return;
	}
	console.log("POPUP SCRIPT: Preparing bio request for API.");
	statusElement.textContent = "Getting biographical info..."; // Update status before async call

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
		statusElement.textContent = ""; // Clear status on success
	} catch (error) {
		console.error("POPUP SCRIPT: Error in getBiographicalInfo:", error);
		addMessageToChat(
			`Sorry, I encountered an error while fetching biographical info: ${error.message}`,
			"bot"
		);
		statusElement.textContent = "API Error."; // More specific status
	} finally {
		console.log(
			"POPUP SCRIPT: Finalizing getBiographicalInfo, resetting isWaitingForBot."
		);
		isWaitingForBot = false; // Reset waiting state ONLY after API call finishes/fails
	}
}
