// service-worker.js 腳本

// 任務物件結構範例：
// {
//   id: string, // 唯一ID
//   name: string, // 任務名稱
//   url: string, // 目標網頁 URL
//   selector: string, // CSS 選擇器
//   frequency: number, // 檢查頻率 (毫秒)
//   createdAt: number, // 建立時間戳
//   comparisonMode: string, // 比對模式: 'anyChange', 'includesText', 'numberGreater', 'numberLesser', 'regexMatch'
//   comparisonValue: string, // 比對輔助值 (例如，用於 'includesText' 的特定文本, 'regexMatch' 的正則表達式)
//   lastContent: string, // [扮演 lastCheckedContent 的角色] 上次檢查時從網頁獲取的最新文本內容
//   lastNumericValue: number | null, // [扮演 lastCheckedNumericValue 的角色] 上次檢查時從網頁獲取的最新數值
//   lastAcknowledgedContent: string, // 使用者上次確認/“已讀”時的文本內容
//   lastAcknowledgedNumericValue: number | null, // 使用者上次確認/“已讀”時的數值
//   hasUnreadUpdate: boolean, // 是否有新的、使用者尚未確認的更新
//   isEnabled: boolean // 任務是否啟用，預設為 true
// }

const TASK_STORAGE_KEY = 'tasks';
const ALARM_NAME_PREFIX = 'autoqueryn-task-';
const PENDING_TASK_STORAGE_KEY = 'pendingTaskForPopup';

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.remove("add_to_autoqueryn", () => {
        if (chrome.runtime.lastError) { /* Optional: Log error if needed */ }
        chrome.contextMenus.create({
            id: "add_to_autoqueryn", title: "新增到 AutoQueryN 監控", contexts: ["all"]
        }, () => {
            if (chrome.runtime.lastError) console.error("創建/更新右鍵選單 'add_to_autoqueryn' 失敗:", chrome.runtime.lastError.message);
        });
    });
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add_to_autoqueryn" && tab && tab.id) {
        const tabId = Number(tab.id);
        if (isNaN(tabId)) { console.error("無效的分頁 ID:", tab.id); return; }
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: "getClickedElementSelector" });
            if (response) {
                if (response.error) { console.error("Content script 回傳錯誤:", response.error); }
                else {
                    const { selector, pageUrl: csPageUrl, pageTitle: csPageTitle } = response;
                    const pendingTaskData = {
                        url: csPageUrl || info.pageUrl || tab.url,
                        selector: selector,
                        name: csPageTitle || tab.title || `監控於 ${new URL(csPageUrl || info.pageUrl || tab.url).hostname}`
                    };
                    chrome.storage.local.set({ [PENDING_TASK_STORAGE_KEY]: pendingTaskData }, () => {
                        if (chrome.runtime.lastError) { console.error("SW: 儲存 pendingTaskForPopup 失敗:", chrome.runtime.lastError.message); }
                        else {
                            if (typeof chrome.action !== "undefined" && typeof chrome.action.openPopup === "function") {
                                chrome.action.openPopup({}, (popupWindow) => {
                                    if (chrome.runtime.lastError) console.warn("SW: 調用 chrome.action.openPopup() 失敗:", chrome.runtime.lastError.message);
                                });
                            } else console.warn("SW: chrome.action.openPopup() API 不可用。");
                        }
                    });
                }
            } else console.warn("Content script 沒有回傳任何回應。");
        } catch (error) { console.error(`與 content script (${tab.url}) 通訊時發生異常:`, error.message); }
    }
});

async function getTasks() { /* ... (same) ... */
    try {
        const result = await chrome.storage.local.get([TASK_STORAGE_KEY]);
        return result[TASK_STORAGE_KEY] || [];
    } catch (error) { console.error('讀取任務時發生錯誤:', error); return []; }
}
async function saveTasks(tasks) { /* ... (same) ... */
    try {
        await chrome.storage.local.set({ [TASK_STORAGE_KEY]: tasks });
    } catch (error) { console.error('儲存任務時發生錯誤:', error); throw error; }
}
async function scheduleAlarmForTask(task) { /* ... (same) ... */
    const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
    const periodInMinutes = Math.max(1, Math.round(task.frequency / (60 * 1000)));
    try {
        await chrome.alarms.create(alarmName, { periodInMinutes: periodInMinutes });
        console.log(`鬧鐘已為任務 "${task.name || task.id}" 設定。`);
    } catch (error) { console.error(`為任務 "${task.name || task.id}" 設定鬧鐘 ${alarmName} 失敗:`, error); }
}
function sendNotification(task, descriptiveMessage, newRawContent) { /* ... (same) ... */
    const iconUrl = chrome.runtime.getURL('icons/NewMessages.PNG');
    const soundUrl = chrome.runtime.getURL('Notice.mp3');
    const notificationId = `autoqueryn-notification-${task.id}-${Date.now()}`;
    let messageToShow = descriptiveMessage;
    if (newRawContent && typeof newRawContent === 'string') messageToShow += `\n新內容 (預覽): "${newRawContent.substring(0, 80)}..."`;
    messageToShow += `\n點擊查看詳情。`;
    const notificationOptions = {
        type: 'basic', iconUrl: iconUrl, title: `任務 "${task.name || task.id}" 有更新！`,
        message: messageToShow, priority: 2, buttons: [{ title: '前往查看網頁' }]
    };
    chrome.notifications.create(notificationId, notificationOptions, (createdNotificationId) => {
        if (chrome.runtime.lastError) { console.error("創建通知失敗:", chrome.runtime.lastError.message); return; }
        try { const audio = new Audio(soundUrl); audio.play().catch(e => console.warn("音效播放失敗:", e)); }
        catch (e) { console.warn("音效播放時發生例外:", e); }
    });
}
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => { /* ... (same, including mark as read logic) ... */
    if (notificationId.startsWith('autoqueryn-notification-')) {
        const parts = notificationId.split('-');
        if (parts.length >= 3) {
            const taskId = parts[2];
            if (buttonIndex === 0) {
                try {
                    const tasks = await getTasks();
                    const taskIndex = tasks.findIndex(t => t.id === taskId);
                    if (taskIndex !== -1) {
                        const taskToOpen = tasks[taskIndex];
                        if (taskToOpen.url) chrome.tabs.create({ url: taskToOpen.url, active: true });
                        tasks[taskIndex].hasUnreadUpdate = false;
                        tasks[taskIndex].lastAcknowledgedContent = tasks[taskIndex].lastContent;
                        tasks[taskIndex].lastAcknowledgedNumericValue = tasks[taskIndex].lastNumericValue;
                        await saveTasks(tasks);
                        console.log(`任務 ${taskId} 在點擊通知按鈕後標記為已讀。`);
                    } else console.warn(`未找到任務 ${taskId} 或其 URL 以便打開。`);
                } catch (e) { console.error("處理通知按鈕點擊時出錯:", e); }
            }
        }
        chrome.notifications.clear(notificationId, (wasCleared) => {
            if (chrome.runtime.lastError && !wasCleared) console.warn(`嘗試清除通知 ${notificationId} 失敗:`, chrome.runtime.lastError.message);
        });
    }
});
chrome.notifications.onClicked.addListener(async (notificationId) => { /* ... (same, including mark as read logic) ... */
    if (notificationId.startsWith('autoqueryn-notification-')) {
        const parts = notificationId.split('-');
        if (parts.length >= 3) {
            const taskId = parts[2];
            try {
                const tasks = await getTasks();
                const taskIndex = tasks.findIndex(t => t.id === taskId);
                if (taskIndex !== -1) {
                    const taskToOpen = tasks[taskIndex];
                     if (taskToOpen.url) chrome.tabs.create({ url: taskToOpen.url, active: true });
                    tasks[taskIndex].hasUnreadUpdate = false;
                    tasks[taskIndex].lastAcknowledgedContent = tasks[taskIndex].lastContent;
                    tasks[taskIndex].lastAcknowledgedNumericValue = tasks[taskIndex].lastNumericValue;
                    await saveTasks(tasks);
                    console.log(`任務 ${taskId} 在點擊通知後標記為已讀。`);
                } else console.warn(`未找到任務 ${taskId} 或其 URL 以便打開。`);
            } catch (e) { console.error("處理通知主體點擊時出錯:", e); }
        }
        chrome.notifications.clear(notificationId, (wasCleared) => {
             if (chrome.runtime.lastError && !wasCleared) console.warn(`嘗試清除通知 ${notificationId} 失敗:`, chrome.runtime.lastError.message);
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "addTask" && message.task) { /* ... (same) ... */
        (async () => {
            try {
                const tasks = await getTasks(); tasks.push(message.task); await saveTasks(tasks);
                await scheduleAlarmForTask(message.task);
                sendResponse({ success: true, message: "任務已成功新增並排程" });
            } catch (error) { console.error("SW: addTask Error:", error); sendResponse({ success: false, message: `新增任務並排程失敗: ${error.message}` }); }
        })();
        return true;
    } else if (message.action === "deleteTask" && message.taskId) { /* ... (same) ... */
        (async () => {
            const taskId = message.taskId; const alarmName = `${ALARM_NAME_PREFIX}${taskId}`;
            try {
                const tasks = await getTasks(); const updatedTasks = tasks.filter(task => task.id !== taskId);
                if (tasks.length === updatedTasks.length) {
                    await chrome.alarms.clear(alarmName);
                    sendResponse({ success: false, message: "任務未在儲存中找到，但已嘗試清除鬧鐘。" }); return;
                }
                await saveTasks(updatedTasks); await chrome.alarms.clear(alarmName);
                sendResponse({ success: true, message: "任務已成功刪除" });
            } catch (error) {
                console.error("SW: deleteTask Error:", error);
                try { await chrome.alarms.clear(alarmName); } catch (e) { /*ignore*/ }
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    } else if (message.action === "updateTask" && message.taskId && message.updatedDetails) { /* ... (same, including hasUnreadUpdate=false logic) ... */
        (async () => {
            try {
                const { taskId, updatedDetails } = message; const tasks = await getTasks();
                const taskIndex = tasks.findIndex(task => task.id === taskId);
                if (taskIndex === -1) { sendResponse({ success: false, message: `任務 ID ${taskId} 未在儲存中找到。` }); return; }
                const oldTask = tasks[taskIndex];
                let taskWithUserUpdates = { ...oldTask, ...updatedDetails };
                taskWithUserUpdates.lastAcknowledgedContent = taskWithUserUpdates.lastContent;
                taskWithUserUpdates.lastAcknowledgedNumericValue = taskWithUserUpdates.lastNumericValue;
                taskWithUserUpdates.hasUnreadUpdate = false;
                tasks[taskIndex] = taskWithUserUpdates; await saveTasks(tasks);
                if (oldTask.frequency !== taskWithUserUpdates.frequency) {
                    const alarmName = `${ALARM_NAME_PREFIX}${taskWithUserUpdates.id}`;
                    await chrome.alarms.clear(alarmName); await scheduleAlarmForTask(taskWithUserUpdates);
                    console.log(`SW: 任務 ${taskWithUserUpdates.id} 鬧鐘已因頻率改變而更新。`);
                }
                sendResponse({ success: true, task: taskWithUserUpdates });
            } catch (error) { console.error("SW: updateTask Error:", error); sendResponse({ success: false, message: error.message }); }
        })();
        return true;
    } else if (message.action === "updateTaskBaseline" && message.taskId && message.newBaseline) { /* ... (same, including hasUnreadUpdate=false logic) ... */
        (async () => {
            try {
                const { taskId, newBaseline } = message;
                const tasks = await getTasks();
                const taskIndex = tasks.findIndex(task => task.id === taskId);
                if (taskIndex === -1) { sendResponse({ success: false, message: `任務 ID ${taskId} 未找到以更新基準。` }); return; }
                const taskToUpdate = { ...tasks[taskIndex] };
                if (newBaseline.hasOwnProperty('content')) {
                    taskToUpdate.lastContent = newBaseline.content;
                    taskToUpdate.lastAcknowledgedContent = newBaseline.content;
                    if (taskToUpdate.comparisonMode === 'numberGreater' || taskToUpdate.comparisonMode === 'numberLesser') {
                        const cleanedContent = String(newBaseline.content).replace(/[^\d.-]/g, '');
                        const numVal = parseFloat(cleanedContent);
                        taskToUpdate.lastNumericValue = isNaN(numVal) ? null : numVal;
                        taskToUpdate.lastAcknowledgedNumericValue = taskToUpdate.lastNumericValue;
                    } else {
                        taskToUpdate.lastNumericValue = null;
                        taskToUpdate.lastAcknowledgedNumericValue = null;
                    }
                } else if (newBaseline.hasOwnProperty('numericValue')) {
                    taskToUpdate.lastNumericValue = newBaseline.numericValue;
                    taskToUpdate.lastContent = String(newBaseline.numericValue);
                    taskToUpdate.lastAcknowledgedNumericValue = newBaseline.numericValue;
                    taskToUpdate.lastAcknowledgedContent = String(newBaseline.numericValue);
                } else { sendResponse({ success: false, message: "未提供有效的基準值內容。" }); return; }
                taskToUpdate.hasUnreadUpdate = false;
                tasks[taskIndex] = taskToUpdate;
                await saveTasks(tasks);
                console.log(`SW: 任務 ${taskId} 基準值已手動更新。`);
                sendResponse({ success: true, message: "基準值已更新", updatedTask: taskToUpdate });
            } catch (error) { console.error("SW: updateTaskBaseline Error:", error); sendResponse({ success: false, message: error.message }); }
        })();
        return true;
    } else if (message.action === "markTaskAsRead" && message.taskId) { /* ... (same) ... */
        (async () => {
            try {
                const taskId = message.taskId; const tasks = await getTasks();
                const taskIndex = tasks.findIndex(task => task.id === taskId);
                if (taskIndex === -1) { sendResponse({ success: false, message: `任務 ID ${taskId} 未找到以標記為已讀。` }); return; }
                const taskToMarkRead = { ...tasks[taskIndex] };
                taskToMarkRead.lastAcknowledgedContent = taskToMarkRead.lastContent;
                taskToMarkRead.lastAcknowledgedNumericValue = taskToMarkRead.lastNumericValue;
                taskToMarkRead.hasUnreadUpdate = false;
                tasks[taskIndex] = taskToMarkRead; await saveTasks(tasks);
                console.log(`Service Worker: 任務 ${taskId} 已被標記為已讀。`);
                sendResponse({ success: true, message: "任務已標記為已讀", updatedTask: taskToMarkRead });
            } catch (error) { console.error(`SW: markTaskAsRead Error:`, error); sendResponse({ success: false, message: error.message }); }
        })();
        return true;
    } else if (message.action === "markAllTasksAsReadAndOpen") { /* ... (same) ... */
        (async () => {
            try {
                const tasks = await getTasks();
                let processedCount = 0;
                let tasksWereModified = false;

                for (let i = 0; i < tasks.length; i++) {
                    if (tasks[i].hasUnreadUpdate) {
                        if (tasks[i].url) {
                            await chrome.tabs.create({ url: tasks[i].url, active: false });
                        }
                        tasks[i].lastAcknowledgedContent = tasks[i].lastContent;
                        tasks[i].lastAcknowledgedNumericValue = tasks[i].lastNumericValue;
                        tasks[i].hasUnreadUpdate = false;
                        processedCount++;
                        tasksWereModified = true;
                    }
                }

                if (tasksWereModified) {
                    await saveTasks(tasks);
                }

                console.log(`Service Worker: ${processedCount} 個任務已被標記為已讀並嘗試打開。`);
                sendResponse({ success: true, processedCount: processedCount });

            } catch (error) {
                console.error("Service Worker: 處理 markAllTasksAsReadAndOpen 時發生錯誤:", error);
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    } else if (message.action === "toggleTaskEnabled" && message.taskId !== undefined && message.isEnabled !== undefined) {
        (async () => {
            try {
                const { taskId, isEnabled } = message;
                const tasks = await getTasks();
                const taskIndex = tasks.findIndex(task => task.id === taskId);

                if (taskIndex === -1) {
                    sendResponse({ success: false, message: `任務 ID ${taskId} 未找到。` });
                    return;
                }

                const taskToToggle = tasks[taskIndex];
                taskToToggle.isEnabled = isEnabled;

                await saveTasks(tasks);

                const alarmName = `${ALARM_NAME_PREFIX}${taskId}`;
                if (isEnabled) {
                    await scheduleAlarmForTask(taskToToggle);
                    console.log(`Service Worker: 任務 "${taskToToggle.name || taskId}" 已啟用，鬧鐘已設定。`);
                } else {
                    await chrome.alarms.clear(alarmName);
                    console.log(`Service Worker: 任務 "${taskToToggle.name || taskId}" 已禁用，鬧鐘已清除。`);
                }

                sendResponse({ success: true, message: `任務已${isEnabled ? '啟用' : '禁用'}` });

            } catch (error) {
                console.error(`Service Worker: 切換任務 ${message.taskId} 啟用狀態時發生錯誤:`, error);
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    }
});

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

async function hasOffscreenDocument() {
    if ('getContexts' in chrome.runtime) {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
        });
        return contexts.length > 0;
    } else {
        // Fallback for older browsers
        const views = chrome.extension.getViews({ type: 'OFFSCREEN_DOCUMENT' });
        return views.length > 0;
    }
}

async function setupOffscreenDocument() {
    if (await hasOffscreenDocument()) {
        return;
    }
    await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['DOM_PARSER'],
        justification: 'Parse HTML string to get element content',
    });
}

async function parseHtmlInOffscreen(htmlString, selector) {
    await setupOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
        action: 'parseHTML',
        htmlString,
        selector,
        target: 'offscreen'
    });
    if (response.success) {
        return response.content;
    } else {
        throw new Error(response.error || 'Failed to parse HTML in offscreen document.');
    }
}


async function checkTask(task) {
    if (!task || !task.url || !task.selector) {
        console.error('無效的任務物件，無法檢查:', task);
        return;
    }

    let currentTaskState = { ...task };
    let newContentRaw = null;

    try {
        // First, try to get content from an active tab to be efficient
        const tabs = await chrome.tabs.query({ url: currentTaskState.url });
        let contentFoundInTab = false;
        if (tabs.length > 0) {
            try {
                const tabId = tabs[0].id;
                const injectionResults = await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: getElementContentBySelector,
                    args: [currentTaskState.selector]
                });
                if (injectionResults && injectionResults.length > 0 && injectionResults[0].result !== undefined) {
                    newContentRaw = injectionResults[0].result;
                    contentFoundInTab = true;
                }
            } catch (injectionError) {
                // Ignore injection error, fallback to fetch
            }
        }

        // If no active tab or injection failed, fall back to fetch
        if (!contentFoundInTab) {
            try {
                const response = await fetch(currentTaskState.url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const htmlText = await response.text();
                newContentRaw = await parseHtmlInOffscreen(htmlText, currentTaskState.selector);
            } catch (fetchError) {
                console.error(`任務 "${currentTaskState.name || currentTaskState.id}" 使用 fetch 獲取內容失敗:`, fetchError);
            }
        }

    } catch (error) {
        console.error(`檢查任務 "${currentTaskState.name || currentTaskState.id}" (${currentTaskState.url}) 獲取內容階段發生未知錯誤:`, error);
        return; // Exit if there's a critical error in the logic above
    }

    const newContentString = (newContentRaw === null || newContentRaw === undefined) ? "" : String(newContentRaw);
    let currentNumericValue = null;
    if (currentTaskState.comparisonMode === 'numberGreater' || currentTaskState.comparisonMode === 'numberLesser') {
        currentNumericValue = parseFloat(newContentString.replace(/[^\d.-]/g, ''));
        if (isNaN(currentNumericValue)) currentNumericValue = null;
    }

    const lastCheckedContentChanged = currentTaskState.lastContent !== newContentString;
    const lastCheckedNumericAltered = currentTaskState.lastNumericValue !== currentNumericValue;

    let shouldSaveTaskAfterCheck = false;
    if (lastCheckedContentChanged) {
        currentTaskState.lastContent = newContentString;
        shouldSaveTaskAfterCheck = true;
    }
    if (currentTaskState.comparisonMode.startsWith('number')) {
        if (currentTaskState.lastNumericValue !== currentNumericValue) {
             currentTaskState.lastNumericValue = currentNumericValue;
             shouldSaveTaskAfterCheck = true;
        }
    } else {
        if (currentTaskState.lastNumericValue !== null) {
            currentTaskState.lastNumericValue = null;
            shouldSaveTaskAfterCheck = true;
        }
    }

    const acknowledgedContent = currentTaskState.lastAcknowledgedContent || "";
    const acknowledgedNumeric = currentTaskState.lastAcknowledgedNumericValue;
    let meetsComparisonCriteria = false;
    let notificationMessage = "";
    let relevantChangeForNotification = false;

    if (currentTaskState.comparisonMode.startsWith('number')) {
        if (currentNumericValue !== null && currentNumericValue !== acknowledgedNumeric) relevantChangeForNotification = true;
        else if (currentNumericValue === null && acknowledgedNumeric !== null) relevantChangeForNotification = true;
    } else {
        if (newContentString !== acknowledgedContent) relevantChangeForNotification = true;
    }

    if (relevantChangeForNotification) {
        switch (currentTaskState.comparisonMode) {
            case 'anyChange': meetsComparisonCriteria = true; notificationMessage = `內容已變更`; break;
            case 'includesText': if (newContentString.includes(currentTaskState.comparisonValue)) { meetsComparisonCriteria = true; notificationMessage = `內容現在包含 "${currentTaskState.comparisonValue}"`; } break;
            case 'regexMatch': try { if (new RegExp(currentTaskState.comparisonValue).test(newContentString)) { meetsComparisonCriteria = true; notificationMessage = `內容匹配正則 "${currentTaskState.comparisonValue}"`; } } catch (e) { console.warn(`任務 "${currentTaskState.name||currentTaskState.id}" 正則 "${currentTaskState.comparisonValue}" 無效:`, e); } break;
            case 'numberGreater': if (currentNumericValue !== null && acknowledgedNumeric !== null && currentNumericValue > acknowledgedNumeric) { meetsComparisonCriteria = true; notificationMessage = `數值從 ${acknowledgedNumeric} 增加到 ${currentNumericValue}`; } else if (currentNumericValue !== null && acknowledgedNumeric === null) { meetsComparisonCriteria = true; notificationMessage = `新數值 ${currentNumericValue} (之前無已確認數值)`; } break;
            case 'numberLesser': if (currentNumericValue !== null && acknowledgedNumeric !== null && currentNumericValue < acknowledgedNumeric) { meetsComparisonCriteria = true; notificationMessage = `數值從 ${acknowledgedNumeric} 減少到 ${currentNumericValue}`; } else if (currentNumericValue !== null && acknowledgedNumeric === null) { meetsComparisonCriteria = true; notificationMessage = `新數值 ${currentNumericValue} (之前無已確認數值)`; } break;
            default: console.warn(`任務 "${currentTaskState.name||currentTaskState.id}" 比對模式 "${currentTaskState.comparisonMode}" 無效.`); if (newContentString !== acknowledgedContent) { meetsComparisonCriteria = true; notificationMessage = `內容已變更(未知模式)`;}
        }
    }

    const oldHasUnreadUpdate = currentTaskState.hasUnreadUpdate;
    if (meetsComparisonCriteria) {
        const isActuallyNewSinceLastCheck = lastCheckedContentChanged || (currentTaskState.comparisonMode.startsWith('number') && lastCheckedNumericAltered);
        if (!currentTaskState.hasUnreadUpdate || isActuallyNewSinceLastCheck) {
            sendNotification(currentTaskState, notificationMessage, newContentString);
            currentTaskState.hasUnreadUpdate = true;
        }
    } else {
        if (currentTaskState.hasUnreadUpdate && !relevantChangeForNotification) {
            currentTaskState.hasUnreadUpdate = false;
        } else if (currentTaskState.hasUnreadUpdate && relevantChangeForNotification && !meetsComparisonCriteria) {
            currentTaskState.hasUnreadUpdate = false;
            currentTaskState.lastAcknowledgedContent = newContentString;
            currentTaskState.lastAcknowledgedNumericValue = currentNumericValue;
        }
    }
    if (oldHasUnreadUpdate !== currentTaskState.hasUnreadUpdate) shouldSaveTaskAfterCheck = true;

    if (shouldSaveTaskAfterCheck) {
        try {
            const tasks = await getTasks(); const taskIndex = tasks.findIndex(t => t.id === currentTaskState.id);
            if (taskIndex !== -1) { tasks[taskIndex] = currentTaskState; await saveTasks(tasks); }
        } catch (error) { console.error(`儲存更新任務 "${currentTaskState.name||currentTaskState.id}" 錯誤:`, error); }
    }
}

function getElementContentBySelector(selector) { /* ... (same) ... */
    const element = document.querySelector(selector);
    if (element) return element.innerText;
    return null;
}
chrome.alarms.onAlarm.addListener(async (alarm) => { /* ... (same as last version, with isEnabled check) ... */
    if (alarm.name.startsWith(ALARM_NAME_PREFIX)) {
        const taskId = alarm.name.substring(ALARM_NAME_PREFIX.length);
        const tasks = await getTasks();
        const taskToRun = tasks.find(t => t.id === taskId);

        if (taskToRun) {
            if (taskToRun.isEnabled === false) {
                return;
            }
            await checkTask(taskToRun);

        } else {
            console.warn(`鬧鐘 "${alarm.name}" 觸發，但找不到ID: ${taskId}。嘗試清除孤立鬧鐘。`);
            try { await chrome.alarms.clear(alarm.name); console.log(`已清除孤立鬧鐘: ${alarm.name}`); }
            catch (clearError) { console.error(`清除孤立鬧鐘 ${alarm.name} 失敗:`, clearError); }
        }
    }
});
(async () => { /* ... (same, less verbose) ... */
    try {
        const tasks = await getTasks();
        if (tasks && tasks.length > 0) {
            let rescheduled = 0, existing = 0;
            for (const task of tasks) {
                const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
                try {
                    const existingAlarm = await chrome.alarms.get(alarmName);
                    if (!existingAlarm && (task.isEnabled === undefined || task.isEnabled === true)) { // Only schedule for enabled tasks
                         await scheduleAlarmForTask(task);
                         rescheduled++;
                    } else if (existingAlarm && task.isEnabled === false) { // If task is disabled but alarm exists, clear it
                         await chrome.alarms.clear(alarmName);
                    } else {
                         existing++;
                    }
                } catch (e) { console.error(`處理任務 ${task.id} 鬧鐘錯誤:`, e); }
            }
        }
    } catch (initError) { console.error("初始化任務鬧鐘錯誤:", initError); }
})();
