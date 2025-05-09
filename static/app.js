document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskCycle = document.getElementById('task-cycle');
    const tasksList = document.getElementById('tasks-list');
    const showCompletedCheckbox = document.getElementById('show-completed-checkbox');
    const toggleSidebarButton = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const themeToggle = document.getElementById('theme-toggle');
    
    // Templates
    const taskTemplate = document.getElementById('task-template');
    const subtaskFormTemplate = document.getElementById('subtask-form-template');
    
    let tasks = [];
    let showCompleted = false;
    
    // Initialize
    initTheme();
    loadTasks();
    
    // Event listeners
    if (taskForm) {
        taskForm.addEventListener('submit', handleAddTask);
    }
    
    if (showCompletedCheckbox) {
        showCompletedCheckbox.addEventListener('change', toggleCompletedTasks);
    }
    
    if (toggleSidebarButton) {
        toggleSidebarButton.addEventListener('click', toggleSidebar);
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Theme functions
    function initTheme() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
            if (themeToggle) {
                const icon = themeToggle.querySelector('i');
                if (icon) {
                    icon.classList.replace('fa-sun', 'fa-moon');
                }
            }
        }
    }
    
    function toggleTheme() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        
        // Toggle icon
        const icon = themeToggle.querySelector('i');
        if (isDarkMode) {
            icon.classList.replace('fa-sun', 'fa-moon');
        } else {
            icon.classList.replace('fa-moon', 'fa-sun');
        }
    }
    
    // Task functions
    function loadTasks() {
        console.log('Loading tasks...');
        fetch('/api/tasks')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Tasks loaded:', data);
                tasks = data;
                renderTasks();
            })
            .catch(error => {
                console.error('Error loading tasks:', error);
                showErrorMessage('Failed to load tasks. Please refresh the page.');
            });
    }
    
    function renderTasks() {
        if (!tasksList) return;
        
        console.log('Rendering tasks:', tasks);
        tasksList.innerHTML = '';
        
        if (!tasks || tasks.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'placeholder-message';
            emptyMessage.innerHTML = '<p>No tasks yet. Add one above!</p>';
            tasksList.appendChild(emptyMessage);
            return;
        }
        
        tasks.forEach(task => {
            if (!showCompleted && task.completedAt !== null) {
                return;
            }
            
            const taskElement = createTaskElement(task);
            tasksList.appendChild(taskElement);
            
            // Render subtasks if any
            if (task.subtasks && task.subtasks.length > 0) {
                const subtasksList = taskElement.querySelector('.subtasks-list');
                
                task.subtasks.forEach(subtask => {
                    if (!showCompleted && subtask.completedAt !== null) {
                        return;
                    }
                    
                    const subtaskElement = createTaskElement(subtask, true);
                    subtasksList.appendChild(subtaskElement);
                });
            }
        });
    }
    
    function createTaskElement(task, isSubtask = false) {
        const taskElement = document.importNode(taskTemplate.content, true).firstElementChild;
        
        // Set task data
        taskElement.dataset.id = task.id;
        const taskText = taskElement.querySelector('.task-text');
        const taskCycleSpan = taskElement.querySelector('.task-cycle');
        const checkbox = taskElement.querySelector('.task-checkbox');
        const addSubtaskBtn = taskElement.querySelector('.btn-add-subtask');
        const deleteBtn = taskElement.querySelector('.btn-delete');
        const overdueSpan = taskElement.querySelector('.task-overdue');
        
        // Set task content
        taskText.textContent = task.text;
        
        // Set cycle text
        if (task.cycle) {
            taskCycleSpan.textContent = task.cycle;
        } else {
            taskCycleSpan.remove();
        }
        
        // Check if task is completed
        if (task.completedAt !== null) {
            checkbox.checked = true;
            taskElement.classList.add('task-completed');
        }
        
        // Check if task is overdue
        if (task.cycle && !isTaskCompleted(task) && isTaskOverdue(task)) {
            overdueSpan.classList.remove('hidden');
        }
        
        // Hide add subtask button for subtasks
        if (isSubtask) {
            addSubtaskBtn.remove();
        }
        
        // Add event listeners
        checkbox.addEventListener('change', () => toggleTaskCompletion(task.id, checkbox.checked));
        deleteBtn.addEventListener('click', () => deleteTask(task.id));
        
        if (!isSubtask) {
            addSubtaskBtn.addEventListener('click', () => showAddSubtaskForm(taskElement, task.id));
        }
        
        return taskElement;
    }
    
    function handleAddTask(event) {
        event.preventDefault();
        
        const text = taskInput.value.trim();
        const cycle = taskCycle.value;
        
        console.log('Adding task:', text, cycle);
        
        if (text) {
            addTask(text, cycle);
            taskInput.value = '';
        }
    }
    
    function addTask(text, cycle) {
        const data = JSON.stringify({ text, cycle });
        console.log('Sending task data:', data);
        
        fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: data
        })
        .then(response => {
            if (!response.ok) {
                console.error('Server response not OK:', response.status, response.statusText);
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(task => {
            console.log('Task added successfully:', task);
            // Add the new task to the array
            tasks.push(task);
            // Re-render all tasks
            renderTasks();
        })
        .catch(error => {
            console.error('Error adding task:', error);
            showErrorMessage('Failed to add task. Please try again.');
        });
    }
    
    function showAddSubtaskForm(parentElement, parentId) {
        // Check if form already exists
        if (parentElement.querySelector('.subtask-form-container')) {
            return;
        }
        
        const subtaskForm = document.importNode(subtaskFormTemplate.content, true);
        const form = subtaskForm.querySelector('.subtask-form');
        const cancelBtn = subtaskForm.querySelector('.btn-cancel');
        
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            
            const input = this.querySelector('.subtask-input');
            const cycle = this.querySelector('.subtask-cycle');
            const text = input.value.trim();
            
            if (text) {
                addSubtask(parentId, text, cycle.value);
                this.closest('.subtask-form-container').remove();
            }
        });
        
        cancelBtn.addEventListener('click', function() {
            this.closest('.subtask-form-container').remove();
        });
        
        parentElement.appendChild(subtaskForm);
        parentElement.querySelector('.subtask-input').focus();
    }
    
    function addSubtask(parentId, text, cycle) {
        const data = JSON.stringify({ text, cycle });
        console.log('Sending subtask data:', data);
        
        fetch(`/api/tasks/${parentId}/subtask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: data
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(subtask => {
            console.log('Subtask added successfully:', subtask);
            // Find parent task and add subtask
            const parentTask = tasks.find(task => task.id === parentId);
            if (parentTask) {
                if (!parentTask.subtasks) {
                    parentTask.subtasks = [];
                }
                parentTask.subtasks.push(subtask);
                renderTasks();
            }
        })
        .catch(error => {
            console.error('Error adding subtask:', error);
            showErrorMessage('Failed to add subtask. Please try again.');
        });
    }
    
    function toggleTaskCompletion(id, completed) {
        console.log('Toggling task completion:', id, completed);
        
        fetch(`/api/tasks/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ complete: completed })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            // Update task in local data
            updateTaskCompletionStatus(id, completed);
            renderTasks();
        })
        .catch(error => {
            console.error('Error updating task status:', error);
            showErrorMessage('Failed to update task status. Please try again.');
        });
    }
    
    function updateTaskCompletionStatus(id, completed) {
        // Check main tasks
        for (const task of tasks) {
            if (task.id === id) {
                task.completedAt = completed ? new Date().toISOString() : null;
                return;
            }
            
            // Check subtasks
            if (task.subtasks) {
                for (const subtask of task.subtasks) {
                    if (subtask.id === id) {
                        subtask.completedAt = completed ? new Date().toISOString() : null;
                        
                        // Check if all subtasks are complete to auto-complete parent
                        const allComplete = task.subtasks.every(st => st.completedAt !== null);
                        task.completedAt = allComplete ? new Date().toISOString() : null;
                        return;
                    }
                }
            }
        }
    }
    
    function deleteTask(id) {
        console.log('Deleting task:', id);
        
        fetch(`/api/tasks/${id}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            // Remove task from local data
            removeTaskFromLocalData(id);
            renderTasks();
        })
        .catch(error => {
            console.error('Error deleting task:', error);
            showErrorMessage('Failed to delete task. Please try again.');
        });
    }
    
    function removeTaskFromLocalData(id) {
        // Check for main tasks
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex !== -1) {
            tasks.splice(taskIndex, 1);
            return;
        }
        
        // Check for subtasks
        for (const task of tasks) {
            if (task.subtasks) {
                const subtaskIndex = task.subtasks.findIndex(subtask => subtask.id === id);
                if (subtaskIndex !== -1) {
                    task.subtasks.splice(subtaskIndex, 1);
                    return;
                }
            }
        }
    }
    
    function toggleCompletedTasks() {
        showCompleted = showCompletedCheckbox.checked;
        renderTasks();
    }
    
    function toggleSidebar() {
        sidebar.classList.toggle('sidebar-visible');
    }
    
    function isTaskCompleted(task) {
        return task.completedAt !== null;
    }
    
    function isTaskOverdue(task) {
        if (!task.cycle) return false;
        
        const now = new Date();
        const createdAt = new Date(task.createdAt);
        const cycleMilliseconds = convertCycleToMilliseconds(task.cycle);
        
        return now - createdAt > cycleMilliseconds;
    }
    
    function convertCycleToMilliseconds(cycle) {
        const minuteMs = 60 * 1000;
        const hourMs = 60 * minuteMs;
        const dayMs = 24 * hourMs;
        const weekMs = 7 * dayMs;
        const monthMs = 30 * dayMs;
        
        switch (cycle) {
            case '5m': return 5 * minuteMs;
            case '1h': return hourMs;
            case '4h': return 4 * hourMs;
            case '12h': return 12 * hourMs;
            case '1d': return dayMs;
            case '3d': return 3 * dayMs;
            case '1w': return weekMs;
            case '1m': return monthMs;
            case '3m': return 3 * monthMs;
            default: return 0;
        }
    }
    
    function showErrorMessage(message) {
        // You can implement a more sophisticated error notification here
        alert(message);
    }
});
