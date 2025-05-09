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
        // Create task element directly without using template
        const taskElement = document.createElement('li');
        taskElement.className = 'task-item';
        taskElement.dataset.id = task.id;
        
        if (task.completedAt !== null) {
            taskElement.classList.add('task-completed');
        }
        
        // Create task content container
        const taskContent = document.createElement('div');
        taskContent.className = 'task-content';
        
        // Create checkbox container
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'task-checkbox-container';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completedAt !== null;
        checkbox.addEventListener('change', () => toggleTaskCompletion(task.id, checkbox.checked));
        
        checkboxContainer.appendChild(checkbox);
        
        // Create task details
        const taskDetails = document.createElement('div');
        taskDetails.className = 'task-details';
        
        const taskText = document.createElement('span');
        taskText.className = 'task-text';
        taskText.textContent = task.text;
        taskDetails.appendChild(taskText);
        
        if (task.cycle) {
            const cycleSpan = document.createElement('span');
            cycleSpan.className = 'task-cycle';
            cycleSpan.textContent = task.cycle;
            taskDetails.appendChild(cycleSpan);
            
            // Check if overdue
            if (!isTaskCompleted(task) && isTaskOverdue(task)) {
                const overdueSpan = document.createElement('span');
                overdueSpan.className = 'task-overdue';
                overdueSpan.textContent = 'Overdue';
                taskDetails.appendChild(overdueSpan);
            }
        }
        
        // Create actions
        const taskActions = document.createElement('div');
        taskActions.className = 'task-actions';
        
        if (!isSubtask) {
            const addSubtaskBtn = document.createElement('button');
            addSubtaskBtn.className = 'btn-add-subtask';
            addSubtaskBtn.title = 'Add Subtask';
            addSubtaskBtn.innerHTML = '<i class="fas fa-plus-square"></i>';
            addSubtaskBtn.addEventListener('click', () => showAddSubtaskForm(taskElement, task.id));
            taskActions.appendChild(addSubtaskBtn);
        }
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.title = 'Delete Task';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.addEventListener('click', () => deleteTask(task.id));
        taskActions.appendChild(deleteBtn);
        
        // Assemble task content
        taskContent.appendChild(checkboxContainer);
        taskContent.appendChild(taskDetails);
        taskContent.appendChild(taskActions);
        
        // Add subtasks list container
        const subtasksList = document.createElement('ul');
        subtasksList.className = 'subtasks-list';
        
        // Assemble full task element
        taskElement.appendChild(taskContent);
        taskElement.appendChild(subtasksList);
        
        return taskElement;
    }
    
    function showAddSubtaskForm(parentElement, parentId) {
        // Check if form already exists
        if (parentElement.querySelector('.subtask-form-container')) {
            return;
        }
        
        // Create form container
        const formContainer = document.createElement('div');
        formContainer.className = 'subtask-form-container';
        
        // Create form
        const form = document.createElement('form');
        form.className = 'subtask-form';
        
        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'subtask-input';
        input.placeholder = 'Add a subtask...';
        input.required = true;
        
        // Create cycle select
        const cycleSelect = document.createElement('select');
        cycleSelect.className = 'subtask-cycle';
        
        const cycleOptions = [
            { value: '', text: 'No cycle' },
            { value: '5m', text: '5m' },
            { value: '1h', text: '1h' },
            { value: '4h', text: '4h' },
            { value: '12h', text: '12h' },
            { value: '1d', text: '1d', selected: true },
            { value: '3d', text: '3d' },
            { value: '1w', text: '1w' },
            { value: '1m', text: '1m' },
            { value: '3m', text: '3m' }
        ];
        
        cycleOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            if (option.selected) {
                optionElement.selected = true;
            }
            cycleSelect.appendChild(optionElement);
        });
        
        // Create buttons
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'btn-primary';
        submitBtn.textContent = 'Add';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => formContainer.remove());
        
        // Assemble form
        form.appendChild(input);
        form.appendChild(cycleSelect);
        form.appendChild(submitBtn);
        form.appendChild(cancelBtn);
        
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            const text = input.value.trim();
            if (text) {
                addSubtask(parentId, text, cycleSelect.value);
                formContainer.remove();
            }
        });
        
        // Assemble container and add to parent
        formContainer.appendChild(form);
        parentElement.appendChild(formContainer);
        input.focus();
    }
    
    function handleAddTask(event) {
        event.preventDefault();
        
        const text = taskInput.value.trim();
        const cycle = taskCycle.value;
        
        if (text) {
            addTask(text, cycle);
            taskInput.value = '';
        }
    }
    
    function addTask(text, cycle) {
        const data = { text, cycle };
        
        fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(task => {
            tasks.push(task);
            renderTasks();
        })
        .catch(error => {
            console.error('Error adding task:', error);
            showErrorMessage('Failed to add task: ' + error.message);
        });
    }
    
    function addSubtask(parentId, text, cycle) {
        const data = { text, cycle };
        
        fetch(`/api/tasks/${parentId}/subtask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(subtask => {
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
            showErrorMessage('Failed to add subtask: ' + error.message);
        });
    }
    
    function toggleTaskCompletion(id, completed) {
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
            // Reload tasks to get updated state
            loadTasks();
        })
        .catch(error => {
            console.error('Error updating task status:', error);
            showErrorMessage('Failed to update task status: ' + error.message);
        });
    }
    
    function deleteTask(id) {
        fetch(`/api/tasks/${id}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            // Reload tasks to get updated state
            loadTasks();
        })
        .catch(error => {
            console.error('Error deleting task:', error);
            showErrorMessage('Failed to delete task: ' + error.message);
        });
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
        console.error(message);
        alert(message);
    }
});
