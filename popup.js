// popup.js 腳本
const PENDING_TASK_STORAGE_KEY = 'pendingTaskForPopup';
const ALARM_NAME_PREFIX = 'autoqueryn-task-';
let countdownIntervalId = null;

function formatTime(ms) { /* ... (same) ... */
    if (ms < 0) ms = 0;
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    if (hours > 0) {
        hours = hours < 10 ? '0' + hours : hours;
        return `${hours}:${minutes}:${seconds}`;
    } else {
        return `${minutes}:${seconds}`;
    }
}
function updateSingleCountdownElement(element, alarmName) { /* ... (same) ... */
    if (!chrome.alarms || !chrome.alarms.get) {
        element.textContent = '下次檢查: API錯誤';
        return;
    }
    chrome.alarms.get(alarmName, (alarm) => {
        if (chrome.runtime.lastError) {
            element.textContent = '下次檢查: 錯誤';
            return;
        }
        if (alarm && alarm.scheduledTime) {
            const remainingMs = alarm.scheduledTime - Date.now();
            if (remainingMs < -30000) {
                element.textContent = '下次檢查: 等待更新...';
            } else if (remainingMs < 0) {
                element.textContent = '下次檢查: 即將執行...';
            } else {
                element.textContent = `下次檢查: ${formatTime(remainingMs)}`;
            }
        } else {
            element.textContent = '下次檢查: 未排程';
        }
    });
}
function updateAllCountdowns() { /* ... (same) ... */
    const countdownElements = document.querySelectorAll('.task-countdown');
    if (countdownElements.length === 0) return;
    countdownElements.forEach(el => {
        const alarmName = el.dataset.alarmName;
        if (alarmName) {
            updateSingleCountdownElement(el, alarmName);
        } else {
            el.textContent = '下次檢查: 無鬧鐘名';
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    const addTaskBtn = document.getElementById('addTaskBtn');
    const openAllUnreadBtn = document.getElementById('openAllUnreadBtn');
    const addTaskFormContainer = document.getElementById('addTaskFormContainer');
    const addTaskForm = document.getElementById('addTaskForm');
    const cancelAddTaskBtn = document.getElementById('cancelAddTaskBtn');
    const getCurrentUrlBtn = document.getElementById('getCurrentUrlBtn');
    const taskUrlInput = document.getElementById('taskUrl');
    const taskSelectorInput = document.getElementById('taskSelector');
    const taskNameInput = document.getElementById('taskName');
    const taskListDiv = document.getElementById('taskList');

    const taskComparisonModeSelect = document.getElementById('taskComparisonMode');
    const comparisonValueContainer = document.getElementById('comparisonValueContainer');
    const taskComparisonValueInput = document.getElementById('taskComparisonValue');

    function resetComparisonFields() { /* ... (same) ... */
        if (taskComparisonModeSelect) taskComparisonModeSelect.value = 'anyChange';
        if (taskComparisonValueInput) taskComparisonValueInput.value = '';
        if (taskComparisonModeSelect && comparisonValueContainer) {
            taskComparisonModeSelect.dispatchEvent(new Event('change'));
        } else if (comparisonValueContainer) {
            comparisonValueContainer.style.display = 'none';
        }
    }
    function setFormToMode(mode, taskData = null) { /* ... (same) ... */
        if (!addTaskForm) return;
        addTaskForm.dataset.mode = mode;
        const submitButton = addTaskForm.querySelector('button[type="submit"]');
        if (mode === 'edit' && taskData) {
            addTaskForm.dataset.editingTaskId = taskData.id;
            if (submitButton) submitButton.textContent = '更新任務';
            taskNameInput.value = taskData.name || '';
            taskUrlInput.value = taskData.url;
            taskSelectorInput.value = taskData.selector;
            document.getElementById('taskFrequency').value = taskData.frequency;
            if (taskComparisonModeSelect) taskComparisonModeSelect.value = taskData.comparisonMode || 'anyChange';
            if (taskComparisonValueInput) taskComparisonValueInput.value = taskData.comparisonValue || '';
            if (taskComparisonModeSelect) taskComparisonModeSelect.dispatchEvent(new Event('change'));
        } else {
            addTaskForm.removeAttribute('data-editing-task-id');
            if (submitButton) submitButton.textContent = '儲存任務';
            addTaskForm.reset();
            resetComparisonFields();
            if (taskData) {
                if(taskNameInput) taskNameInput.value = taskData.name || '';
                if(taskUrlInput) taskUrlInput.value = taskData.url;
                if(taskSelectorInput) taskSelectorInput.value = taskData.selector;
            }
        }
    }

    if(addTaskForm) setFormToMode('add');

    if (taskComparisonModeSelect) { /* ... (event listener same) ... */
        taskComparisonModeSelect.addEventListener('change', function(event) {
            const selectedValue = event.target.value;
            if (comparisonValueContainer) {
                if (selectedValue === 'includesText' || selectedValue === 'regexMatch') {
                    comparisonValueContainer.style.display = 'block';
                } else {
                    comparisonValueContainer.style.display = 'none';
                    if (taskComparisonValueInput) taskComparisonValueInput.value = '';
                }
            }
        });
    }

    async function displayTasks() {
        if (!taskListDiv) return;
        taskListDiv.innerHTML = '';
        taskListDiv.style.display = 'block';
        let hasAnyUnread = false;
        try {
            const data = await chrome.storage.local.get(['tasks']);
            const tasks = data.tasks || [];
            if (tasks.length === 0) {
                taskListDiv.innerHTML = '<p>目前沒有任務</p>';
                if (openAllUnreadBtn) openAllUnreadBtn.style.display = 'none';
                return;
            }
            tasks.forEach(task => {
                const isEnabled = task.isEnabled !== false;
                if (task.hasUnreadUpdate) hasAnyUnread = true;
                const taskItem = document.createElement('div');
                taskItem.className = 'task-item';
                taskItem.classList.toggle('task-item-unread', !!task.hasUnreadUpdate);
                taskItem.classList.toggle('task-item-disabled', !isEnabled);
                taskItem.dataset.taskId = task.id;
                const taskHeader = document.createElement('div');
                taskHeader.className = 'task-item-header';
                const taskNameElement = document.createElement('h4');
                taskNameElement.textContent = task.name || `任務 (ID: ${task.id.slice(-6)})`;
                taskNameElement.className = 'task-name';
                const switchContainer = document.createElement('div');
                switchContainer.className = 'task-enable-switch-container';
                const switchLabel = document.createElement('label');
                switchLabel.className = 'task-enable-switch';
                const switchCheckbox = document.createElement('input');
                switchCheckbox.type = 'checkbox';
                switchCheckbox.className = 'task-enable-checkbox';
                switchCheckbox.dataset.taskId = task.id;
                switchCheckbox.checked = isEnabled;
                const switchSlider = document.createElement('span');
                switchSlider.className = 'task-switch-slider round';
                switchLabel.appendChild(switchCheckbox);
                switchLabel.appendChild(switchSlider);
                switchContainer.appendChild(switchLabel);
                taskHeader.appendChild(taskNameElement);
                taskHeader.appendChild(switchContainer);
                taskItem.appendChild(taskHeader);

                // ... (rest of task info elements as in previous step) ...
                const taskUrlElement = document.createElement('p');
                taskUrlElement.textContent = `URL: ${task.url}`;
                taskUrlElement.className = 'task-info task-url';
                taskItem.appendChild(taskUrlElement);
                const taskSelectorElement = document.createElement('p');
                taskSelectorElement.textContent = `選擇器: ${task.selector}`;
                taskSelectorElement.className = 'task-info task-selector';
                taskItem.appendChild(taskSelectorElement);
                const taskFrequencyElement = document.createElement('p');
                const frequencyInMinutes = Math.round(task.frequency / 60000);
                taskFrequencyElement.textContent = `頻率: 每 ${frequencyInMinutes} 分鐘`;
                taskFrequencyElement.className = 'task-info task-frequency';
                taskItem.appendChild(taskFrequencyElement);
                const taskCompModeElement = document.createElement('p');
                taskCompModeElement.textContent = `比對模式: ${task.comparisonMode || 'anyChange'}`;
                taskCompModeElement.className = 'task-info task-comparison-mode';
                taskItem.appendChild(taskCompModeElement);
                if(task.comparisonMode === 'includesText' || task.comparisonMode === 'regexMatch'){
                    const taskCompValueElement = document.createElement('p');
                    taskCompValueElement.textContent = `比對值: ${task.comparisonValue || '未設定'}`;
                    taskCompValueElement.className = 'task-info task-comparison-value';
                    taskItem.appendChild(taskCompValueElement);
                }
                const countdownElement = document.createElement('p');
                countdownElement.className = 'task-info task-countdown';
                countdownElement.textContent = isEnabled ? '下次檢查: 計算中...' : '下次檢查: 已暫停';
                countdownElement.dataset.alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
                taskItem.appendChild(countdownElement);
                const lastContentDisplayContainer = document.createElement('div');
                lastContentDisplayContainer.className = 'task-last-content-display-container task-info-sub-group';
                const lastContentDisplayLabel = document.createElement('span');
                lastContentDisplayLabel.className = 'task-info-label';
                lastContentDisplayLabel.textContent = task.hasUnreadUpdate ? '最新內容: ' : '已讀內容: ';
                lastContentDisplayContainer.appendChild(lastContentDisplayLabel);
                const lastContentDisplayValue = document.createElement('span');
                lastContentDisplayValue.className = 'task-last-content-value';
                let displayContent, displayNumeric;
                if (task.hasUnreadUpdate) {
                    displayContent = task.lastContent;
                    displayNumeric = task.lastNumericValue;
                } else {
                    displayContent = task.lastAcknowledgedContent;
                    displayNumeric = task.lastAcknowledgedNumericValue;
                }
                if ((task.comparisonMode === 'numberGreater' || task.comparisonMode === 'numberLesser') && displayNumeric !== null && !isNaN(displayNumeric)) {
                    lastContentDisplayValue.textContent = String(displayNumeric);
                } else {
                    const contentStr = (displayContent === null || displayContent === undefined) ? '' : String(displayContent);
                    lastContentDisplayValue.textContent = contentStr ? (contentStr.substring(0, 50) + (contentStr.length > 50 ? '...' : '')) : (task.hasUnreadUpdate ? '無內容' : '尚未確認');
                }
                lastContentDisplayContainer.appendChild(lastContentDisplayValue);
                taskItem.appendChild(lastContentDisplayContainer);
                const actionsContainer = document.createElement('div');
                actionsContainer.className = 'task-actions-container';
                if (task.hasUnreadUpdate) {
                    const markAsReadButton = document.createElement('button');
                    markAsReadButton.textContent = '查看新內容';
                    markAsReadButton.className = 'mark-as-read-btn task-action-btn';
                    markAsReadButton.dataset.taskId = task.id;
                    actionsContainer.appendChild(markAsReadButton);
                }
                const editButton = document.createElement('button');
                editButton.textContent = '編輯設定';
                editButton.className = 'edit-task-btn task-action-btn';
                editButton.dataset.taskId = task.id;
                // Edit button should always be enabled
                actionsContainer.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.textContent = '刪除任務';
                deleteButton.className = 'delete-task-btn task-action-btn';
                deleteButton.dataset.taskId = task.id;
                // Delete button should always be enabled
                actionsContainer.appendChild(deleteButton);
                taskItem.appendChild(actionsContainer);

                const baselineControlWrapper = document.createElement('div');
                baselineControlWrapper.className = 'baseline-control-wrapper';
                const editBaselineBtn = document.createElement('button');
                editBaselineBtn.textContent = '修改基準值';
                editBaselineBtn.className = 'edit-baseline-btn task-action-btn';
                editBaselineBtn.dataset.taskId = task.id;
                // Baseline button should be disabled if the task is not enabled
                editBaselineBtn.disabled = !isEnabled;
                baselineControlWrapper.appendChild(editBaselineBtn);
                const baselineEditContainer = document.createElement('div');
                baselineEditContainer.className = 'baseline-edit-container';
                baselineEditContainer.style.display = 'none';
                baselineEditContainer.dataset.taskId = task.id;
                const textBaselineSection = document.createElement('div');
                textBaselineSection.className = 'baseline-text-section';
                const textBaselineLabel = document.createElement('label');
                textBaselineLabel.textContent = '新文本基準:';
                textBaselineLabel.htmlFor = `baseline-text-${task.id}`;
                const textBaselineInput = document.createElement('textarea');
                textBaselineInput.className = 'baseline-text-input';
                textBaselineInput.id = `baseline-text-${task.id}`;
                textBaselineInput.rows = 2;
                textBaselineSection.appendChild(textBaselineLabel);
                textBaselineSection.appendChild(textBaselineInput);
                baselineEditContainer.appendChild(textBaselineSection);
                const numericBaselineSection = document.createElement('div');
                numericBaselineSection.className = 'baseline-numeric-section';
                const numericBaselineLabel = document.createElement('label');
                numericBaselineLabel.textContent = '新數字基準:';
                numericBaselineLabel.htmlFor = `baseline-numeric-${task.id}`;
                const numericBaselineInput = document.createElement('input');
                numericBaselineInput.type = 'number';
                numericBaselineInput.id = `baseline-numeric-${task.id}`;
                numericBaselineInput.className = 'baseline-numeric-input';
                numericBaselineSection.appendChild(numericBaselineLabel);
                numericBaselineSection.appendChild(numericBaselineInput);
                baselineEditContainer.appendChild(numericBaselineSection);
                const saveBaselineBtn = document.createElement('button');
                saveBaselineBtn.textContent = '儲存基準';
                saveBaselineBtn.className = 'save-baseline-btn task-action-btn';
                const cancelBaselineBtn = document.createElement('button');
                cancelBaselineBtn.textContent = '取消';
                cancelBaselineBtn.className = 'cancel-baseline-btn task-action-btn';
                const baselineActionsDiv = document.createElement('div');
                baselineActionsDiv.className = 'baseline-edit-actions';
                baselineActionsDiv.appendChild(saveBaselineBtn);
                baselineActionsDiv.appendChild(cancelBaselineBtn);
                baselineEditContainer.appendChild(baselineActionsDiv);
                baselineControlWrapper.appendChild(baselineEditContainer);
                taskItem.appendChild(baselineControlWrapper);

                taskListDiv.appendChild(taskItem);
            });

            if (openAllUnreadBtn) {
                openAllUnreadBtn.style.display = hasAnyUnread ? 'inline-block' : 'none';
            }
            updateAllCountdowns();
        } catch (error) {
            console.error('讀取或顯示任務時發生錯誤:', error);
            taskListDiv.innerHTML = '<p>讀取任務列表失敗。</p>';
            if (openAllUnreadBtn) openAllUnreadBtn.style.display = 'none';
        }
    }

    if (addTaskBtn) { /* ... same ... */
        addTaskBtn.addEventListener('click', function() {
            setFormToMode('add');
            addTaskFormContainer.style.display = 'block';
            addTaskBtn.style.display = 'none';
            if (openAllUnreadBtn) openAllUnreadBtn.style.display = 'none';
            if(taskListDiv) taskListDiv.style.display = 'none';
        });
    }
    if (cancelAddTaskBtn) { /* ... same ... */
        cancelAddTaskBtn.addEventListener('click', function() {
            addTaskFormContainer.style.display = 'none';
            setFormToMode('add');
            if(addTaskBtn) addTaskBtn.style.display = 'block';
            if(taskListDiv) taskListDiv.style.display = 'block';
            displayTasks();
        });
    }
    if (getCurrentUrlBtn && taskUrlInput) { /* ... same ... */
        getCurrentUrlBtn.addEventListener('click', function() {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (chrome.runtime.lastError) { console.error("查詢分頁時出錯:", chrome.runtime.lastError.message); return; }
                if (tabs && tabs.length > 0) taskUrlInput.value = tabs[0].url;
                else console.warn("無法獲取當前分頁 URL");
            });
        });
    }
    if (addTaskForm) { /* ... same submit logic ... */
        addTaskForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const taskName = taskNameInput.value.trim();
            const taskUrlValue = taskUrlInput.value.trim();
            const taskSelectorValue = taskSelectorInput.value.trim();
            const taskFrequencyValue = document.getElementById('taskFrequency').value;
            const comparisonMode = taskComparisonModeSelect.value;
            const comparisonValue = (comparisonMode === 'includesText' || comparisonMode === 'regexMatch')
                                     ? taskComparisonValueInput.value.trim() : '';
            if (!taskUrlValue || !taskSelectorValue || !taskFrequencyValue) { alert("請填寫所有必填欄位：URL、選擇器和頻率。"); return; }
            const taskFrequency = parseInt(taskFrequencyValue, 10);
            if (isNaN(taskFrequency) || taskFrequency < 60000) { alert("檢查頻率必須是至少 60000 毫秒（1 分鐘）的數字。"); return; }
            const mode = addTaskForm.dataset.mode;
            const editingTaskId = addTaskForm.dataset.editingTaskId;
            if (mode === 'edit' && !editingTaskId) { alert("錯誤：處於編輯模式但找不到任務ID。請取消並重試。"); return; }
            let messageAction;
            let messagePayload = {};
            if (mode === 'edit') {
                messageAction = 'updateTask';
                messagePayload.taskId = editingTaskId;
                messagePayload.updatedDetails = {
                    name: taskName || '', url: taskUrlValue, selector: taskSelectorValue, frequency: taskFrequency,
                    comparisonMode: comparisonMode, comparisonValue: comparisonValue
                };
            } else {
                messageAction = 'addTask';
                messagePayload.task = {
                    id: Date.now().toString(), name: taskName || '', url: taskUrlValue, selector: taskSelectorValue, frequency: taskFrequency,
                    comparisonMode: comparisonMode, comparisonValue: comparisonValue,
                    lastContent: '', lastNumericValue: null, createdAt: Date.now(),
                    lastAcknowledgedContent: '', lastAcknowledgedNumericValue: null, hasUnreadUpdate: false,
                    isEnabled: true
                };
            }
            messagePayload.action = messageAction;
            chrome.runtime.sendMessage(messagePayload, function(response) {
                const successMessageAction = mode === 'edit' ? '更新' : '新增';
                const currentTaskId = mode === 'edit' ? editingTaskId : messagePayload.task.id;
                if (chrome.runtime.lastError) { alert(`${successMessageAction}任務失敗: ${chrome.runtime.lastError.message}`);
                } else if (response && response.success) {
                    setFormToMode('add');
                    addTaskFormContainer.style.display = 'none';
                    if(addTaskBtn) addTaskBtn.style.display = 'block';
                } else { alert(`${successMessageAction}任務失敗: ${response ? response.message : '未知錯誤'}`); }
                displayTasks();
            });
        });
    }

    // Combined event listener for clicks and changes on the task list
    if (taskListDiv) {
        // For buttons
        taskListDiv.addEventListener('click', function(event) {
            const targetButton = event.target.closest('.task-action-btn');
            if (!targetButton) return;
            const taskId = targetButton.dataset.taskId;
            const taskItem = targetButton.closest('.task-item');
            const baselineEditContainer = taskItem ? taskItem.querySelector('.baseline-edit-container') : null;

            if (targetButton.classList.contains('delete-task-btn')) { /* ... delete logic ... */
                 if (taskId && window.confirm(`確定要刪除此任務嗎？\n(ID: ${taskId})`)) {
                    chrome.runtime.sendMessage({ action: "deleteTask", taskId: taskId }, function(response) {
                        if (chrome.runtime.lastError || !response || !response.success) {
                            alert(`刪除任務失敗: ${response ? response.message : chrome.runtime.lastError.message || '未知錯誤'}`);
                        }
                        displayTasks();
                    });
                }
            } else if (targetButton.classList.contains('edit-task-btn')) { /* ... edit settings logic ... */
                 if (taskId) {
                    chrome.storage.local.get(['tasks'], function(result) {
                        if (chrome.runtime.lastError) { alert("讀取任務資料失敗。"); return; }
                        const tasks = result.tasks || [];
                        const taskToEdit = tasks.find(task => task.id === taskId);
                        if (taskToEdit) {
                            setFormToMode('edit', taskToEdit);
                            addTaskFormContainer.style.display = 'block';
                            if(addTaskBtn) addTaskBtn.style.display = 'none';
                            if(openAllUnreadBtn) openAllUnreadBtn.style.display = 'none';
                            if(taskListDiv) taskListDiv.style.display = 'none';
                        } else { alert('找不到要編輯的任務。'); }
                    });
                }
            } else if (targetButton.classList.contains('edit-baseline-btn')) { /* ... edit baseline logic ... */
                if (taskId && baselineEditContainer) {
                    chrome.storage.local.get(['tasks'], function(result) {
                        if (chrome.runtime.lastError) { alert("讀取任務資料以修改基準時失敗。"); return; }
                        const tasks = result.tasks || [];
                        const taskToEditBaseline = tasks.find(task => task.id === taskId);
                        if (!taskToEditBaseline) { alert('找不到要修改基準的任務。'); return; }
                        const textSection = baselineEditContainer.querySelector('.baseline-text-section');
                        const numericSection = baselineEditContainer.querySelector('.baseline-numeric-section');
                        const textInput = baselineEditContainer.querySelector('.baseline-text-input');
                        const numericInput = baselineEditContainer.querySelector('.baseline-numeric-input');
                        if (!textSection || !numericSection || !textInput || !numericInput) { return; }
                        const mode = taskToEditBaseline.comparisonMode || 'anyChange';
                        if (mode === 'numberGreater' || mode === 'numberLesser') {
                            numericInput.value = taskToEditBaseline.lastAcknowledgedNumericValue !== null ? String(taskToEditBaseline.lastAcknowledgedNumericValue) : '';
                            numericSection.style.display = 'block'; textSection.style.display = 'none';
                        } else {
                            textInput.value = taskToEditBaseline.lastAcknowledgedContent || '';
                            textSection.style.display = 'block'; numericSection.style.display = 'none';
                        }
                        baselineEditContainer.dataset.editingBaselineForTaskId = taskId;
                        baselineEditContainer.style.display = 'block';
                        targetButton.style.display = 'none';
                    });
                }
            } else if (targetButton.classList.contains('save-baseline-btn')) { /* ... save baseline logic ... */
                if (baselineEditContainer) {
                    const currentTaskId = baselineEditContainer.dataset.editingBaselineForTaskId;
                    chrome.storage.local.get(['tasks'], function(result) {
                        if (chrome.runtime.lastError) { alert("讀取任務失敗，無法儲存基準。"); return; }
                        const tasks = result.tasks || [];
                        const task = tasks.find(t => t.id === currentTaskId);
                        if (!task) { alert('錯誤：找不到任務以儲存基準值。'); return; }
                        let newBaselineData = {};
                        const mode = task.comparisonMode || 'anyChange';
                        if (mode === 'numberGreater' || mode === 'numberLesser') {
                            const numericInput = baselineEditContainer.querySelector('.baseline-numeric-input');
                            const numericValue = parseFloat(numericInput.value);
                            if (isNaN(numericValue)) { alert('請輸入有效的數字作為基準值。'); return; }
                            newBaselineData.numericValue = numericValue;
                        } else {
                            const textInput = baselineEditContainer.querySelector('.baseline-text-input');
                            newBaselineData.content = textInput.value;
                        }
                        chrome.runtime.sendMessage({ action: "updateTaskBaseline", taskId: currentTaskId, newBaseline: newBaselineData }, function(response) {
                            if (response && response.success) {
                                baselineEditContainer.style.display = 'none';
                                const taskItemForButton = baselineEditContainer.closest('.task-item');
                                if (taskItemForButton) {
                                    const editBtn = taskItemForButton.querySelector('.edit-baseline-btn');
                                    if (editBtn) editBtn.style.display = 'inline-block';
                                }
                                displayTasks();
                            } else { alert(`儲存基準值失敗: ${response ? response.message : '未知錯誤'}`); }
                        });
                    });
                }
            } else if (targetButton.classList.contains('cancel-baseline-btn')) { /* ... cancel baseline logic ... */
                if (baselineEditContainer) {
                    baselineEditContainer.style.display = 'none';
                    const taskItemForButton = baselineEditContainer.closest('.task-item');
                    if (taskItemForButton) {
                        const editBtn = taskItemForButton.querySelector('.edit-baseline-btn');
                        if (editBtn) editBtn.style.display = 'inline-block';
                    }
                }
            } else if (targetButton.classList.contains('mark-as-read-btn')) { /* ... mark as read logic ... */
                if (taskId) {
                    chrome.storage.local.get(['tasks'], function(result) {
                        if (chrome.runtime.lastError) { console.error("Error fetching task for opening URL:", chrome.runtime.lastError.message); }
                        const tasks = result.tasks || [];
                        const taskToOpen = tasks.find(t => t.id === taskId);
                        if (taskToOpen && taskToOpen.url) {
                            chrome.tabs.create({ url: taskToOpen.url, active: true });
                        } else console.warn(`Popup: 找不到任務 ${taskId} 的URL以打開。`);
                        chrome.runtime.sendMessage({ action: "markTaskAsRead", taskId: taskId }, function(response) {
                            if (chrome.runtime.lastError || !response || !response.success) {
                                alert(`標記任務 ${taskId} 為已讀時失敗: ${response ? response.message : '未知錯誤'}`);
                            }
                            displayTasks();
                        });
                    });
                }
            }
        });

        // For checkbox change event
        taskListDiv.addEventListener('change', function(event) {
            if (event.target.classList.contains('task-enable-checkbox')) {
                const checkbox = event.target;
                const taskId = checkbox.dataset.taskId;
                const isEnabled = checkbox.checked;

                checkbox.disabled = true; // Disable to prevent rapid toggling

                chrome.runtime.sendMessage({ action: "toggleTaskEnabled", taskId: taskId, isEnabled: isEnabled }, function(response) {
                    checkbox.disabled = false; // Re-enable after operation completes

                    if (response && response.success) {
                        console.log(`Popup: 任務 ${taskId} 狀態已成功更新為: ${isEnabled}`);
                        // Refresh the entire list to update all related UI (countdown text, styles, etc.)
                        displayTasks();
                    } else {
                        console.error(`Popup: 切換任務 ${taskId} 狀態失敗。`, response);
                        alert('切換任務狀態失敗，請重試。');
                        // Revert the UI to its previous state on failure
                        checkbox.checked = !isEnabled;
                        const taskItem = checkbox.closest('.task-item');
                        if (taskItem) {
                            taskItem.classList.toggle('task-item-disabled', !isEnabled);
                        }
                    }
                });
            }
        });
    }

    if (countdownIntervalId !== null) clearInterval(countdownIntervalId);
    countdownIntervalId = setInterval(updateAllCountdowns, 1000);

    chrome.storage.local.get([PENDING_TASK_STORAGE_KEY], async function(result) {
        const pendingTask = result[PENDING_TASK_STORAGE_KEY];
        if (pendingTask && pendingTask.url && pendingTask.selector) {
            console.log("Popup: 發現來自右鍵選單的待處理任務資料:", pendingTask);
            setFormToMode('add', pendingTask);
            addTaskFormContainer.style.display = 'block';
            if(addTaskBtn) addTaskBtn.style.display = 'none';
            if(openAllUnreadBtn) openAllUnreadBtn.style.display = 'none';
            if(taskListDiv) taskListDiv.style.display = 'none';
            await new Promise(resolve => chrome.storage.local.remove(PENDING_TASK_STORAGE_KEY, resolve));
            if (chrome.runtime.lastError) console.error("Popup: 清除 pendingTaskForPopup 失敗:", chrome.runtime.lastError.message);
        } else {
            await displayTasks();
        }
    });
});
