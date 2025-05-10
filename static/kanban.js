document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const kanbanBoard = document.getElementById('kanban-board');
    const themeToggle = document.getElementById('theme-toggle');
    const toggleSidebar = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    
    // State
    let tasks = [];
    let eventSource;

    // Server Side Event for updating content
    function setupSSE() {
        if (eventSource) eventSource.close();
        
        eventSource = new EventSource('/api/updates');
        eventSource.onmessage = function(e) {
            if (e.data === 'update') {
                loadTasks();
            }
        };
        eventSource.onerror = function() {
            // Try to reconnect after 1 second
            setTimeout(setupSSE, 1000);
        };
    }
    
    function updateThemeIcon() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const icon = document.querySelector('#theme-toggle i');
        if (icon) {
            icon.className = currentTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }
    
    // Initialize the app
    init();
    
    function init() {
        // Load theme preference
        loadTheme();
        // Load tasks
        loadTasks();
        // Set up event listeners
        setupEventListeners();
        // Setup SSE
        setupSSE();
        updateThemeIcon();
    }
    
    function loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    }
    
    function updateThemeIcon(theme) {
        const icon = themeToggle.querySelector('i');
        icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
    
    function setupEventListeners() {
        // Theme toggle
        themeToggle.addEventListener('click', toggleTheme);
        
        // Mobile sidebar toggle
        toggleSidebar.addEventListener('click', function() {
            sidebar.classList.toggle('visible');
        });
        
        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', function(event) {
            if (window.innerWidth <= 768 && 
                !sidebar.contains(event.target) && 
                !toggleSidebar.contains(event.target)) {
                sidebar.classList.remove('visible');
            }
        });
    }
    
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon();
        
        // Also update the icon in the sidebar if it exists
        const sidebarIcon = document.querySelector('.sidebar #theme-toggle i');
        if (sidebarIcon) {
            sidebarIcon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }
    
    function loadTasks() {
        fetch('/api/tasks')
            .then(response => response.json())
            .then(data => {
                // Sort tasks by due date (closest first)
                tasks = data.sort((a, b) => {
                    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
                    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
                    return aDue - bDue;
                });
                renderKanban();
            })
            .catch(error => {
                console.error('Error loading tasks:', error);
                kanbanBoard.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Failed to load tasks</p>
                    </div>
                `;
            });
    }
    
    function renderKanban() {
        // Define kanban columns
        const columns = [
            { id: 'upcoming', title: 'Upcoming', tasks: [] },
            { id: 'today', title: 'Today', tasks: [] },
            { id: 'overdue', title: 'Overdue', tasks: [] },
            { id: 'completed', title: 'Completed', tasks: [] }
        ];
        
        // Categorize tasks
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        
        tasks.forEach(task => {
            // Skip tasks without a due date
            if (!task.dueAt) return;
            
            const dueDate = new Date(task.dueAt);
            
            if (task.completedAt) {
                // Completed tasks
                columns[3].tasks.push(task);
            } else if (dueDate < now) {
                // Overdue tasks
                columns[2].tasks.push(task);
            } else if (dueDate <= today) {
                // Due today
                columns[1].tasks.push(task);
            } else {
                // Upcoming tasks
                columns[0].tasks.push(task);
            }
        });
        
        // Render kanban board
        kanbanBoard.innerHTML = columns.map(column => `
            <div class="kanban-column" id="column-${column.id}">
                <div class="kanban-column-header">
                    <span>${column.title}</span>
                    <span class="count">${column.tasks.length}</span>
                </div>
                <div class="kanban-column-body">
                    ${column.tasks.length === 0 ? 
                        `<div class="empty-column">No tasks in this column</div>` : 
                        column.tasks.map(task => createKanbanCard(task)).join('')}
                </div>
            </div>
        `).join('');
    }
    
    function createKanbanCard(task) {
        const isOverdue = task.dueAt && !task.completedAt && new Date(task.dueAt) < new Date();
        const dueText = task.dueAt ? getDueText(task.dueAt) : '';
        
        return `
            <div class="kanban-card ${isOverdue ? 'overdue' : ''}" data-id="${task.id}">
                <div class="kanban-card-title">${task.text}</div>
                ${task.dueAt ? `
                    <div class="kanban-card-date">
                        <i class="far fa-clock"></i> ${dueText}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    // Helper functions
    function getDueText(dueAt) {
        if (!dueAt) return '';
        
        const now = new Date();
        const dueDate = new Date(dueAt);
        const diffMs = dueDate - now;
        const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));
        
        if (diffMs < 0) {
            if (diffDays > 0) {
                return `Overdue by ${diffDays} day${diffDays > 1 ? 's' : ''}`;
            } else if (diffHours > 0) {
                return `Overdue by ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
            } else {
                return `Overdue by ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
            }
        } else if (diffDays > 0) {
            return `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        } else if (diffHours > 0) {
            return `Due in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
        } else {
            return `Due in ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
        }
    }
});
