// offscreen.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'parseHTML') {
    const { htmlString, selector } = request;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      const element = doc.querySelector(selector);

      if (element) {
        sendResponse({ success: true, content: element.innerText });
      } else {
        sendResponse({ success: true, content: null });
      }
    } catch (error) {
      console.error('Offscreen document error:', error);
      sendResponse({ success: false, error: error.message });
    }

    // Return true to indicate that the response is sent asynchronously.
    return true;
  }
});
