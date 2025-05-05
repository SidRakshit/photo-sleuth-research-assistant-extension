// background.js
chrome.action.onClicked.addListener(async (tab) => {
    const windowId = tab.windowId;
    if (windowId) {
        await chrome.sidePanel.open({ windowId: windowId });
        console.log("Side panel opened.");
    } else {
        console.error("Could not get window ID from tab.");
    }
});

chrome.runtime.onInstalled.addListener(() => {
    console.log("Civil War Photo Sleuth Chatbot installed/updated.");
});