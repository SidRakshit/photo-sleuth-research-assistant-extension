// Extension/content.js

console.log("Content script loaded and listening for messages.");

function extractPageHtml() {
	console.log("CONTENT SCRIPT: Entering extractPageHtml function.");
	const data = {
		pageUrl: "Not Found",
		pageHtml: "Not Found",
		error: null,
	};
	try {
		data.pageUrl = window.location.href;
		console.log("CONTENT SCRIPT: Attempting to get outerHTML...");
		data.pageHtml = document.documentElement.outerHTML;
		console.log(
			"CONTENT SCRIPT: outerHTML retrieved, length:",
			data.pageHtml ? data.pageHtml.length : "null"
		);

		if (!data.pageHtml) {
			throw new Error("Could not retrieve document outerHTML.");
		}

		console.log(`--- Extracted Page HTML (URL: ${data.pageUrl}) ---`);
		console.log(`HTML Length: ${data.pageHtml.length} characters`);
		console.log("-----------------------------");
	} catch (error) {
		console.error("CONTENT SCRIPT: Error during HTML extraction logic:", error);
		data.error = error.message;
		data.pageHtml = "Error during extraction";
	}
	console.log("CONTENT SCRIPT: Exiting extractPageHtml function.");
	return data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "extractDataRequest") {
		console.log("CONTENT SCRIPT: Received extractDataRequest.");
		try {
			const extractedData = extractPageHtml();
			console.log(
				"CONTENT SCRIPT: Attempting to send extractedDataResponse back to popup. Error:",
				extractedData.error
			);
			chrome.runtime.sendMessage({
				action: "extractedDataResponse",
				data: extractedData,
			});
			console.log("CONTENT SCRIPT: Sent extractedDataResponse.");
		} catch (error) {
			console.error(
				"CONTENT SCRIPT: Error processing extractDataRequest or sending response:",
				error
			);
			try {
				chrome.runtime.sendMessage({
					action: "extractionError",
					error: error.message,
				});
			} catch (sendError) {
				console.error(
					"CONTENT SCRIPT: Failed to send error message back to popup:",
					sendError
				);
			}
		}
	}
});
