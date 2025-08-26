// content_script.js 腳本

// --- For "Add to AutoQueryN" via context menu ---
let lastRightClickedElement = null;

// Listen for mousedown to capture the element that was right-clicked
// Using capture phase to ensure it's caught before any other event handlers
// might stop propagation.
document.addEventListener('mousedown', function(event) {
    if (event.button === 2) { // 2 corresponds to the right mouse button
        lastRightClickedElement = event.target;
        // console.log('AutoQueryN [CS]: Right clicked on:', lastRightClickedElement); // For debugging
    }
}, true);

/**
 * Generates a CSS selector for a given DOM element.
 * Prioritizes ID, then unique combination of tag + classes, then short path.
 * Uses CSS.escape for special characters in IDs and classes.
 * @param {Element} el The DOM element.
 * @returns {string|null} A CSS selector string or null if a selector cannot be generated.
 */
function generateCSSSelector(el) {
    if (!(el instanceof Element)) {
        console.warn("AutoQueryN [CS]: generateCSSSelector called with non-Element", el);
        return null;
    }

    // 1. Priority 1: Element ID (if unique)
    if (el.id) {
        const idSelector = `#${CSS.escape(el.id)}`;
        try {
            // Check if this ID is unique enough. For simplicity, we assume it mostly is if it exists.
            // A stricter check would be: document.querySelectorAll(idSelector).length === 1
            // However, querySelectorAll itself can throw errors if ID starts with digit without escape,
            // but CSS.escape should handle that.
            return idSelector;
        } catch (e) {
            console.warn(`AutoQueryN [CS]: Error validating ID selector "${idSelector}"`, e);
        }
    }

    // 2. Priority 2: Tag name + Classes (if unique enough)
    const tagName = el.nodeName.toLowerCase();
    const classList = Array.from(el.classList);
    let classSelectorPart = "";
    if (classList.length > 0) {
        // Create a selector with all classes for better specificity initially
        classSelectorPart = "." + classList.map(cls => CSS.escape(cls)).join('.');
        const combinedSelector = tagName + classSelectorPart;
        try {
            if (document.querySelectorAll(combinedSelector).length === 1) {
                return combinedSelector;
            }
        } catch(e) {
            // console.warn(`AutoQueryN [CS]: Error validating tag+class selector "${combinedSelector}"`, e);
        }
    }

    // 3. Priority 3: Short path (tag + classes for current element and its parent)
    const pathParts = [];
    let currentEl = el;
    let depth = 0;

    while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE && depth < 3) { // Limit path depth
        let part = currentEl.nodeName.toLowerCase();
        const currentElClassList = Array.from(currentEl.classList);
        if (currentElClassList.length > 0) {
            // Take up to 2 classes for brevity in path segments
            part += "." + currentElClassList.slice(0, 2).map(cls => CSS.escape(cls)).join('.');
        }
        pathParts.unshift(part);

        // Check if current path is unique enough
        const tempSelector = pathParts.join(' > ');
        try {
             if (document.querySelectorAll(tempSelector).length === 1 && tempSelector.length > 0) {
                return tempSelector;
            }
        } catch (e) {
            // console.warn(`AutoQueryN [CS]: Error validating path selector "${tempSelector}"`, e);
        }

        if (currentEl.id) { // If an ancestor has an ID, prepend it and stop.
             pathParts.unshift(`#${CSS.escape(currentEl.id)}`);
             return pathParts.join(' > ');
        }

        if (currentEl === document.body || !currentEl.parentNode) break;
        currentEl = currentEl.parentNode;
        depth++;
    }

    // Fallback to the constructed path, even if not guaranteed unique or too long
    if (pathParts.length > 0) {
        return pathParts.join(' > ');
    }

    // Absolute fallback: just the tag name (least specific)
    return tagName;
}

// Listener for messages from the service worker (or popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getClickedElementSelector") {
        if (lastRightClickedElement) {
            const selector = generateCSSSelector(lastRightClickedElement);
            // console.log("AutoQueryN [CS]: Generated selector:", selector, "for element:", lastRightClickedElement);
            sendResponse({ selector: selector, pageUrl: window.location.href, pageTitle: document.title });
            lastRightClickedElement = null; // Reset after use
        } else {
            console.warn("AutoQueryN [CS]: Service Worker requested selector, but no element was recorded from a right-click.");
            sendResponse({ selector: null, error: "No element was right-clicked or recorded." });
        }
        // return true; // Keep channel open for async response, though generateCSSSelector is sync here. Good practice.
        // For synchronous sendResponse, returning true is not strictly necessary unless other async operations were involved.
        // However, to be safe and future-proof, it's often included.
    }
    // Keep this return true if any path in the listener might use sendResponse asynchronously.
    // For this specific case, if generateCSSSelector is always sync, it's not essential.
    // But if generateCSSSelector were to become async, this `return true` would be vital.
    // Let's assume it's mostly synchronous for now.
});


// --- For checking task content (existing function) ---
/**
 * 根據 CSS 選擇器獲取元素的 innerText。
 * @param {string} selector CSS 選擇器
 * @returns {string|null} 元素的 innerText，如果找不到元素則返回 null。
 */
function getElementContentBySelector(selector) {
    const element = document.querySelector(selector);
    if (element) {
        return element.innerText;
    } else {
        // console.warn(`[AutoQueryN content_script] 找不到元素: ${selector}`); // Can be verbose
        return null;
    }
}
