// content_script.js 腳本

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
        console.warn(`[AutoQueryN] 在 content_script 中找不到元素: ${selector}`);
        return null; // 或者可以拋出一個錯誤，或者返回一個特殊標識
    }
}

// 為了讓此函數能被 executeScript 的 `func` 選項直接呼叫，
// 它需要在全域作用域中可見，或者我們將整個函數作為字串傳遞。
// 目前這樣定義即可。

// 監聽來自 service worker 的訊息 (如果需要 content script 主動監聽的話)
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === "getContent" && request.selector) {
//     const content = getElementContentBySelector(request.selector);
//     sendResponse({ content: content });
//   }
//   return true; // 如果是異步 sendResponse
// });
// 注意：在這個計畫中，我們是由 service-worker 主動執行腳本並獲取結果，
// 而不是由 content-script 監聽訊息然後回傳。所以上面的 onMessage 監聽器暫時不需要。
