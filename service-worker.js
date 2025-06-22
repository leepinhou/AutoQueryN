// service-worker.js 腳本

const TASK_STORAGE_KEY = 'tasks';
const ALARM_NAME_PREFIX = 'autoqueryn-task-';
const PENDING_TASK_STORAGE_KEY = 'pendingTaskForPopup'; // Key for storing data from context menu

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.remove("add_to_autoqueryn", () => {
        if (chrome.runtime.lastError) {
            // Optional: Log if needed, but usually fine if it didn't exist
            // console.log("Context menu 'add_to_autoqueryn' not found for removal, or another error: ", chrome.runtime.lastError.message);
        }
        chrome.contextMenus.create({
            id: "add_to_autoqueryn",
            title: "新增到 AutoQueryN 監控",
            contexts: ["all"]
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("創建/更新右鍵選單 'add_to_autoqueryn' 失敗:", chrome.runtime.lastError.message);
            } else {
                console.log("AutoQueryN 右鍵選單已成功創建/更新。");
            }
        });
    });
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add_to_autoqueryn" && tab && tab.id) {
        console.log("右鍵選單項目 'add_to_autoqueryn' 被點擊。");
        // console.log("頁面 URL (來自 context menu info):", info.pageUrl);
        // console.log("分頁資訊 (來自 tab object): ID=", tab.id, "URL=", tab.url, "Title=", tab.title);

        const tabId = Number(tab.id);
        if (isNaN(tabId)) {
            console.error("無效的分頁 ID:", tab.id);
            return;
        }

        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: "getClickedElementSelector" });

            if (response) {
                if (response.error) {
                    console.error("Content script 回傳錯誤:", response.error);
                } else {
                    // console.log("從 content script 收到的回應:", response); // Can be verbose
                    const { selector, pageUrl: csPageUrl, pageTitle: csPageTitle } = response;

                    const pendingTaskData = {
                        url: csPageUrl || info.pageUrl || tab.url, // Prioritize URL from content script
                        selector: selector,
                        name: csPageTitle || tab.title || `監控於 ${new URL(csPageUrl || info.pageUrl || tab.url).hostname}` // Default name from page title or hostname
                    };

                    chrome.storage.local.set({ [PENDING_TASK_STORAGE_KEY]: pendingTaskData }, () => {
                        if (chrome.runtime.lastError) {
                            console.error("Service Worker: 儲存 pendingTaskForPopup 失敗:", chrome.runtime.lastError.message);
                        } else {
                            console.log("Service Worker: pendingTaskForPopup 已儲存到 storage:", pendingTaskData);

                            if (typeof chrome.action !== "undefined" && typeof chrome.action.openPopup === "function") {
                                chrome.action.openPopup({}, (popupWindow) => {
                                    if (chrome.runtime.lastError) {
                                        // This error is common if popup cannot be opened programmatically (e.g., another extension's popup is open, or no user gesture context)
                                        // or if the popup is already open. It's not critical.
                                        console.warn("Service Worker: 調用 chrome.action.openPopup() 失敗:", chrome.runtime.lastError.message);
                                    } else {
                                        if (popupWindow) {
                                            console.log("Service Worker: Popup 視窗已透過 chrome.action.openPopup() 打開。");
                                        } else {
                                            console.log("Service Worker: chrome.action.openPopup() 被調用 (可能 popup 已打開或正在打開)。");
                                        }
                                    }
                                });
                            } else {
                                 console.warn("Service Worker: chrome.action.openPopup() API 在此環境不可用。");
                            }
                        }
                    });
                }
            } else {
                console.warn("Content script 沒有回傳任何回應。");
            }
        } catch (error) {
            console.error(`與 content script (${tab.url}) 通訊時發生異常:`, error.message);
        }
    }
});


async function getTasks() {
    // ... (function remains the same)
    try {
        const result = await chrome.storage.local.get([TASK_STORAGE_KEY]);
        return result[TASK_STORAGE_KEY] || [];
    } catch (error) {
        console.error('讀取任務時發生錯誤:', error);
        return [];
    }
}

async function saveTasks(tasks) {
    // ... (function remains the same)
    try {
        await chrome.storage.local.set({ [TASK_STORAGE_KEY]: tasks });
    } catch (error) {
        console.error('儲存任務時發生錯誤:', error);
        throw error;
    }
}

async function scheduleAlarmForTask(task) {
    // ... (function remains the same)
    const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
    const periodInMinutes = Math.max(1, Math.round(task.frequency / (60 * 1000)));
    try {
        await chrome.alarms.create(alarmName, { periodInMinutes: periodInMinutes });
        console.log(`已為任務 "${task.name || task.id}" (ID: ${task.id}) 設定鬧鐘: ${alarmName}，頻率: ${periodInMinutes} 分鐘`);
    } catch (error) {
        console.error(`為任務 "${task.name || task.id}" (ID: ${task.id}) 設定鬧鐘 ${alarmName} 失敗:`, error);
    }
}

function sendNotification(task, descriptiveMessage, newRawContent) {
    // ... (function remains the same)
    const iconUrl = chrome.runtime.getURL('icons/NewMessages.PNG');
    const soundUrl = chrome.runtime.getURL('Notice.mp3');

    const notificationId = `autoqueryn-notification-${task.id}-${Date.now()}`;

    let messageToShow = descriptiveMessage;
    if (newRawContent) {
        messageToShow += `\n新內容 (預覽): "${newRawContent.substring(0, 80)}..."`;
    }
    messageToShow += `\n點擊查看詳情。`;


    const notificationOptions = {
        type: 'basic',
        iconUrl: iconUrl,
        title: `任務 "${task.name || task.id}" 有更新！`,
        message: messageToShow,
        priority: 2,
        buttons: [
            { title: '前往查看網頁' }
        ]
    };

    chrome.notifications.create(notificationId, notificationOptions, (createdNotificationId) => {
        if (chrome.runtime.lastError) {
            console.error("創建通知失敗:", chrome.runtime.lastError.message);
            return;
        }
        console.log(`通知已創建: ${createdNotificationId}`);

        try {
            const audio = new Audio(soundUrl);
            audio.play().catch(e => console.warn("音效播放失敗:", e));
        } catch (e) {
            console.warn("音效播放時發生例外:", e);
        }
    });
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    // ... (function remains the same)
    console.log(`通知按鈕點擊: ${notificationId}, 按鈕索引: ${buttonIndex}`);
    if (notificationId.startsWith('autoqueryn-notification-')) {
        const parts = notificationId.split('-');
        if (parts.length >= 3) {
            const taskId = parts[2];
            if (buttonIndex === 0) {
                try {
                    const tasks = await getTasks();
                    const taskToOpen = tasks.find(t => t.id === taskId);
                    if (taskToOpen && taskToOpen.url) {
                        chrome.tabs.create({ url: taskToOpen.url, active: true });
                    } else {
                        console.warn(`未找到任務 ${taskId} 或其 URL 以便打開。`);
                    }
                } catch (e) {
                    console.error("處理通知按鈕點擊時出錯:", e);
                }
            }
        }
        chrome.notifications.clear(notificationId, (wasCleared) => {
            if (chrome.runtime.lastError && !wasCleared) {
                 console.warn(`嘗試清除通知 ${notificationId} 失敗 (可能已被清除):`, chrome.runtime.lastError.message);
            }
        });
    }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
    // ... (function remains the same)
    console.log(`通知主體點擊: ${notificationId}`);
    if (notificationId.startsWith('autoqueryn-notification-')) {
        const parts = notificationId.split('-');
        if (parts.length >= 3) {
            const taskId = parts[2];
            try {
                const tasks = await getTasks();
                const taskToOpen = tasks.find(t => t.id === taskId);
                if (taskToOpen && taskToOpen.url) {
                    chrome.tabs.create({ url: taskToOpen.url, active: true });
                } else {
                    console.warn(`未找到任務 ${taskId} 或其 URL 以便打開。`);
                }
            } catch (e) {
                console.error("處理通知主體點擊時出錯:", e);
            }
        }
        chrome.notifications.clear(notificationId, (wasCleared) => {
             if (chrome.runtime.lastError && !wasCleared) {
                 console.warn(`嘗試清除通知 ${notificationId} 失敗 (可能已被清除):`, chrome.runtime.lastError.message);
            }
        });
    }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ... (logic for addTask, deleteTask, updateTask remains the same)
    if (message.action === "addTask" && message.task) {
        (async () => {
            try {
                console.log("Service worker 收到 addTask 請求:", message.task);
                const tasks = await getTasks();
                tasks.push(message.task);
                await saveTasks(tasks);
                await scheduleAlarmForTask(message.task);
                console.log("任務已成功新增並排程。");
                sendResponse({ success: true, message: "任務已成功新增並排程" });
            } catch (error) {
                console.error("新增任務並排程時 service worker 出錯:", error);
                sendResponse({ success: false, message: `新增任務並排程失敗: ${error.message}` });
            }
        })();
        return true;
    } else if (message.action === "deleteTask" && message.taskId) {
        (async () => {
            const taskId = message.taskId;
            const alarmName = `${ALARM_NAME_PREFIX}${taskId}`;
            try {
                const tasks = await getTasks();
                const updatedTasks = tasks.filter(task => task.id !== taskId);

                if (tasks.length === updatedTasks.length) {
                    console.warn(`Service Worker: 嘗試刪除任務 ${taskId}，但在儲存中找不到該任務。`);
                    await chrome.alarms.clear(alarmName);
                    console.log(`Service Worker: 已嘗試清除鬧鐘 ${alarmName} (以防萬一)。`);
                    sendResponse({ success: false, message: "任務未在儲存中找到，但已嘗試清除鬧鐘。" });
                    return;
                }

                await saveTasks(updatedTasks);
                await chrome.alarms.clear(alarmName);
                console.log(`Service Worker: 任務 ${taskId} 已被刪除，相關鬧鐘 ${alarmName} 已清除。`);
                sendResponse({ success: true, message: "任務已成功刪除" });
            } catch (error) {
                console.error(`Service Worker: 刪除任務 ${taskId} 時發生錯誤:`, error);
                try {
                    await chrome.alarms.clear(alarmName);
                    console.log(`Service Worker: 在錯誤處理期間，已嘗試清除鬧鐘 ${alarmName}。`);
                } catch (alarmClearError) {
                    console.error(`Service Worker: 在錯誤處理期間，嘗試清除鬧鐘 ${alarmName} 也失敗:`, alarmClearError);
                }
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    } else if (message.action === "updateTask" && message.taskId && message.updatedDetails) {
        (async () => {
            try {
                const { taskId, updatedDetails } = message;
                const tasks = await getTasks();
                const taskIndex = tasks.findIndex(task => task.id === taskId);

                if (taskIndex === -1) {
                    sendResponse({ success: false, message: `任務 ID ${taskId} 未在儲存中找到。` });
                    return;
                }

                const oldTask = tasks[taskIndex];
                const updatedTaskData = {
                    ...oldTask,
                    name: updatedDetails.name !== undefined ? updatedDetails.name : oldTask.name,
                    url: updatedDetails.url !== undefined ? updatedDetails.url : oldTask.url,
                    selector: updatedDetails.selector !== undefined ? updatedDetails.selector : oldTask.selector,
                    frequency: updatedDetails.frequency !== undefined ? updatedDetails.frequency : oldTask.frequency,
                    comparisonMode: updatedDetails.comparisonMode !== undefined ? updatedDetails.comparisonMode : oldTask.comparisonMode,
                    comparisonValue: updatedDetails.comparisonValue !== undefined ? updatedDetails.comparisonValue : oldTask.comparisonValue,
                };

                tasks[taskIndex] = updatedTaskData;
                await saveTasks(tasks);

                if (oldTask.frequency !== updatedTaskData.frequency) {
                    console.log(`Service Worker: 任務 ${updatedTaskData.id} 頻率從 ${oldTask.frequency} 變為 ${updatedTaskData.frequency}，正在更新鬧鐘。`);
                    const alarmName = `${ALARM_NAME_PREFIX}${updatedTaskData.id}`;
                    await chrome.alarms.clear(alarmName);
                    await scheduleAlarmForTask(updatedTaskData);
                    console.log(`Service Worker: 任務 ${updatedTaskData.id} 的鬧鐘已因頻率改變而更新。`);
                }

                console.log(`Service Worker: 任務 ${updatedTaskData.id} 已成功更新。`);
                sendResponse({ success: true, task: updatedTaskData });

            } catch (error) {
                console.error(`Service Worker: 更新任務 ${message.taskId} 時發生錯誤:`, error);
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    }
});

async function checkTask(task) {
    // ... (checkTask logic remains the same)
    if (!task || !task.url || !task.selector) {
        console.error('無效的任務物件，無法檢查:', task);
        return;
    }

    let newContentRaw;
    try {
        const tabs = await chrome.tabs.query({ url: task.url });
        if (tabs.length === 0) {
            return;
        }
        const tabId = tabs[0].id;

        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: getElementContentBySelector,
            args: [task.selector]
        });

        if (!injectionResults || injectionResults.length === 0 || injectionResults[0].result === undefined) {
            if (task.lastContent !== null && task.lastContent !== "") {
                 console.warn(`任務 "${task.name || task.id}" - 無法從 ${task.url} (選擇器 "${task.selector}") 獲取內容 (之前有內容)。`, injectionResults);
            }
            newContentRaw = null;
        } else {
            newContentRaw = injectionResults[0].result;
        }

    } catch (error) {
        console.error(`檢查任務 "${task.name || task.id}" (${task.url}) 時獲取內容階段發生錯誤:`, error);
        return;
    }

    const mode = task.comparisonMode || 'anyChange';
    const comparisonVal = task.comparisonValue || '';
    const oldContentString = task.lastContent === null || task.lastContent === undefined ? "" : String(task.lastContent);
    let oldNumericValue = task.lastNumericValue;

    let triggerNotification = false;
    let notificationMessage = "";
    const newContentString = (newContentRaw === null || newContentRaw === undefined) ? "" : String(newContentRaw);
    const contentActuallyChanged = (newContentString !== oldContentString);
    let currentNumericValue = null;

    if (mode === 'numberGreater' || mode === 'numberLesser') {
        const cleanedNewContent = newContentString.replace(/[^\d.-]/g, '');
        currentNumericValue = parseFloat(cleanedNewContent);
    }

    if (contentActuallyChanged) {
        switch (mode) {
            case 'anyChange':
                triggerNotification = true;
                notificationMessage = `內容已變更`;
                break;
            case 'includesText':
                if (newContentString.includes(comparisonVal)) {
                    triggerNotification = true;
                    notificationMessage = `內容現在包含 "${comparisonVal}"`;
                }
                break;
            case 'regexMatch':
                try {
                    const regex = new RegExp(comparisonVal);
                    if (regex.test(newContentString)) {
                        triggerNotification = true;
                        notificationMessage = `內容匹配正則 "${comparisonVal}"`;
                    }
                } catch (e) {
                    console.warn(`任務 "${task.name || task.id}" 的正則表達式 "${comparisonVal}" 無效:`, e);
                }
                break;
            case 'numberGreater':
                if (!isNaN(currentNumericValue)) {
                    if (oldNumericValue === null || isNaN(oldNumericValue)) {
                    } else if (currentNumericValue > oldNumericValue) {
                        triggerNotification = true;
                        notificationMessage = `數值從 ${oldNumericValue} 增加到 ${currentNumericValue}`;
                    }
                } else {
                     console.warn(`任務 "${task.name || task.id}"：新內容 "${newContentString.substring(0,30)}..." 不是有效數字，無法進行 'numberGreater' 比較。`);
                }
                break;
            case 'numberLesser':
                if (!isNaN(currentNumericValue)) {
                     if (oldNumericValue === null || isNaN(oldNumericValue)) {
                    } else if (currentNumericValue < oldNumericValue) {
                        triggerNotification = true;
                        notificationMessage = `數值從 ${oldNumericValue} 減少到 ${currentNumericValue}`;
                    }
                } else {
                    console.warn(`任務 "${task.name || task.id}"：新內容 "${newContentString.substring(0,30)}..." 不是有效數字，無法進行 'numberLesser' 比較。`);
                }
                break;
            default:
                console.warn(`任務 "${task.name || task.id}" 的比對模式 "${mode}" 無效。默認按 anyChange 處理。`);
                triggerNotification = true;
                notificationMessage = `內容已變更 (未知比對模式)`;
        }
    }

    let shouldSaveTask = false;
    let taskToSave = { ...task };

    if (triggerNotification) {
        console.log(`任務 "${task.name || task.id}" 偵測到更新，模式: ${mode}。訊息: ${notificationMessage}`);
        sendNotification(taskToSave, notificationMessage, newContentString);

        taskToSave.lastContent = newContentString;
        if (mode === 'numberGreater' || mode === 'numberLesser') {
            if (!isNaN(currentNumericValue)) taskToSave.lastNumericValue = currentNumericValue;
             else taskToSave.lastNumericValue = null;
        } else {
             taskToSave.lastNumericValue = null;
        }
        shouldSaveTask = true;
    } else if (contentActuallyChanged) {
        taskToSave.lastContent = newContentString;
        if (mode === 'numberGreater' || mode === 'numberLesser') {
            if (!isNaN(currentNumericValue)) taskToSave.lastNumericValue = currentNumericValue;
            else taskToSave.lastNumericValue = null;
        } else {
            taskToSave.lastNumericValue = null;
        }
        shouldSaveTask = true;
    }


    if (shouldSaveTask) {
        try {
            const tasks = await getTasks();
            const taskIndex = tasks.findIndex(t => t.id === taskToSave.id);
            if (taskIndex !== -1) {
                tasks[taskIndex] = taskToSave;
                await saveTasks(tasks);
            }
        } catch (error) {
            console.error(`儲存更新後的任務 "${taskToSave.name || taskToSave.id}" 時發生錯誤:`, error);
        }
    }
}

function getElementContentBySelector(selector) {
    const element = document.querySelector(selector);
    if (element) {
        return element.innerText;
    } else {
        return null;
    }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    // ... (logic remains the same)
    if (alarm.name.startsWith(ALARM_NAME_PREFIX)) {
        const taskId = alarm.name.substring(ALARM_NAME_PREFIX.length);
        const tasks = await getTasks();
        const taskToRun = tasks.find(t => t.id === taskId);

        if (taskToRun) {
            await checkTask(taskToRun);
        } else {
            console.warn(`鬧鐘 "${alarm.name}" 觸發，但找不到對應的任務 ID: ${taskId}。可能已被刪除。將嘗試清除此孤立鬧鐘。`);
            try {
                await chrome.alarms.clear(alarm.name);
                console.log(`已清除孤立鬧鐘: ${alarm.name}`);
            } catch (clearError) {
                console.error(`清除孤立鬧鐘 ${alarm.name} 失敗:`, clearError);
            }
        }
    }
});

(async () => {
    // ... (logic remains the same)
    try {
        const tasks = await getTasks();
        if (tasks && tasks.length > 0) {
            let rescheduledCount = 0;
            let existingCount = 0;
            for (const task of tasks) {
                const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
                try {
                    const existingAlarm = await chrome.alarms.get(alarmName);
                    if (!existingAlarm) {
                        await scheduleAlarmForTask(task);
                        rescheduledCount++;
                    } else {
                        existingCount++;
                    }
                } catch (e) {
                    console.error(`處理任務 ${task.id} 的鬧鐘時出錯:`, e);
                }
            }
            console.log(`任務鬧鐘初始化完成。重新排程 ${rescheduledCount} 個鬧鐘，${existingCount} 個鬧鐘已存在。`);
        }
    } catch (initError) {
        console.error("初始化任務鬧鐘時發生錯誤:", initError);
    }
})();
