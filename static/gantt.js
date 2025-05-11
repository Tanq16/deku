document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const ganttContainer = document.getElementById('gantt-container');
    const currentMonthEl = document.getElementById('current-month');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const todayBtn = document.getElementById('today-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const toggleSidebar = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    
    // State
    let tasks = [];
    let currentDate = new Date();
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
        // Set up event listeners
        setupEventListeners();
        // Load tasks
        loadTasks();
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
        // Navigation buttons
        prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
        nextMonthBtn.addEventListener('click', () => navigateMonth(1));
        todayBtn.addEventListener('click', goToToday);
        
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
    
    function navigateMonth(direction) {
        currentDate.setMonth(currentDate.getMonth() + direction);
        renderGantt();
    }
    
    function goToToday() {
        currentDate = new Date();
        renderGantt();
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
                // Filter out completed tasks
                tasks = data.filter(task => !task.completedAt);
                renderGantt();
            })
            .catch(error => {
                console.error('Error loading tasks:', error);
                ganttContainer.innerHTML = `
                    <div class="empty-gantt">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Failed to load tasks</p>
                    </div>
                `;
            });
    }
    
    function renderGantt() {
        updateCurrentMonthDisplay();
        
        // Get the days in the current month
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Filter tasks for the current month
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        
        const relevantTasks = tasks.filter(task => {
            if (!task.dueAt) return false; // Skip tasks without due dates
            const dueDate = new Date(task.dueAt);
            
            // Check if task is due this month or spans this month
            const createdDate = new Date(task.createdAt);
            
            // Task is due this month or was created this month
            return (dueDate >= monthStart && dueDate <= monthEnd) || 
                   (createdDate <= monthEnd && dueDate >= monthStart);
        });
        
        // Sort tasks by due date
        relevantTasks.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
        
        // Today's date for highlighting
        const today = new Date();
        const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
        const todayDate = today.getDate();
        
        if (relevantTasks.length === 0) {
            ganttContainer.innerHTML = `
                <div class="empty-gantt">
                    <i class="fas fa-chart-gantt"></i>
                    <p>No tasks scheduled for this month</p>
                </div>
            `;
            return;
        }
        
        // Create Gantt Chart HTML
        let html = `<div class="gantt-header">`;
        
        // Task label header
        html += `<div class="gantt-header-cell">Task</div>`;
        
        // Day headers
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isToday = isCurrentMonth && day === todayDate;
            
            html += `
                <div class="gantt-header-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}">
                    ${day}
                </div>
            `;
        }
        
        html += `</div>`;
        
        // Task rows
        relevantTasks.forEach(task => {
            const dueDate = new Date(task.dueAt);
            const createdDate = new Date(task.createdAt);
            const isOverdue = dueDate < today && !task.completedAt;
            
            html += `<div class="gantt-row">`;
            
            // Task label
            html += `
                <div class="gantt-task-label" title="${task.text}">
                    ${task.text.length > 25 ? task.text.substring(0, 25) + '...' : task.text}
                </div>
            `;
            
            // Day cells
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isToday = isCurrentMonth && day === todayDate;
                
                html += `<div class="gantt-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}">`;
                
                // Check if task bar should appear in this cell
                if (shouldShowTaskBar(task, date)) {
                    const barWidth = calculateBarWidth(task, date, daysInMonth, month, year);
                    const barPosition = calculateBarPosition(task, date);
                    
                    if (barPosition === 0) {
                        html += `
                            <div class="gantt-task-bar ${isOverdue ? 'overdue' : ''}" 
                                style="width: ${barWidth}%; left: 0;">
                            </div>
                        `;
                    }
                }
                
                html += `</div>`;
            }
            
            html += `</div>`;
        });
        
        ganttContainer.innerHTML = html;
    }
    
    function updateCurrentMonthDisplay() {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June', 
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        currentMonthEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    
    function shouldShowTaskBar(task, date) {
        const taskDueDate = new Date(task.dueAt);
        const taskCreatedDate = new Date(task.createdAt);
        
        // Make sure dates are just dates without time
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dueOnly = new Date(taskDueDate.getFullYear(), taskDueDate.getMonth(), taskDueDate.getDate());
        const createdOnly = new Date(taskCreatedDate.getFullYear(), taskCreatedDate.getMonth(), taskCreatedDate.getDate());
        
        // Check if the current day is between creation and due date
        return dateOnly >= createdOnly && dateOnly <= dueOnly;
    }
    
    function calculateBarWidth(task, cellDate, daysInMonth, month, year) {
        const taskDueDate = new Date(task.dueAt);
        const taskCreatedDate = new Date(task.createdAt);
        
        // If created before this month, use 1st day of month as start
        const startDate = taskCreatedDate.getMonth() === month && taskCreatedDate.getFullYear() === year
            ? taskCreatedDate.getDate()
            : 1;
        
        // If due after this month, use last day of month as end
        const endDate = taskDueDate.getMonth() === month && taskDueDate.getFullYear() === year
            ? taskDueDate.getDate()
            : daysInMonth;
        
        // Duration is at least 1 day
        const duration = Math.max(1, endDate - startDate + 1);
        
        // Cell width is relative to days in month
        return Math.min(100, (duration / 1) * 100);
    }
    
    function calculateBarPosition(task, cellDate) {
        const taskCreatedDate = new Date(task.createdAt);
        
        // Return 0 if this is the first day of the task
        return taskCreatedDate.getDate() === cellDate.getDate() && 
              taskCreatedDate.getMonth() === cellDate.getMonth() && 
              taskCreatedDate.getFullYear() === cellDate.getFullYear() ? 0 : -1;
    }
});
