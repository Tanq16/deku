document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const dayViewBtn = document.getElementById('day-view');
    const weekViewBtn = document.getElementById('week-view');
    const monthViewBtn = document.getElementById('month-view');
    const prevPeriodBtn = document.getElementById('prev-period');
    const nextPeriodBtn = document.getElementById('next-period');
    const todayBtn = document.getElementById('today-btn');
    const currentPeriodEl = document.getElementById('current-period');
    const calendarView = document.getElementById('calendar-view');
    
    // State
    let currentDate = new Date();
    let currentView = 'month'; // default view

    function updateThemeIcon() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const icon = document.querySelector('#theme-toggle i');
        if (icon) {
            icon.className = currentTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }
    
    // Initialize
    init();
    
    function init() {
        setupEventListeners();
        renderCalendar();
        updateThemeIcon()
    }
    
    function setupEventListeners() {
        // View buttons
        dayViewBtn.addEventListener('click', () => switchView('day'));
        weekViewBtn.addEventListener('click', () => switchView('week'));
        monthViewBtn.addEventListener('click', () => switchView('month'));
        
        // Navigation buttons
        prevPeriodBtn.addEventListener('click', navigatePeriod.bind(null, -1));
        nextPeriodBtn.addEventListener('click', navigatePeriod.bind(null, 1));
        todayBtn.addEventListener('click', goToToday);
        
        // Theme toggle (reused from app.js)
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }
        
        // Mobile sidebar toggle (reused from app.js)
        const toggleSidebar = document.getElementById('toggle-sidebar');
        if (toggleSidebar) {
            toggleSidebar.addEventListener('click', function() {
                document.querySelector('.sidebar').classList.toggle('visible');
            });
        }
    }
    
    function switchView(view) {
        currentView = view;
        
        // Update active button
        dayViewBtn.classList.remove('active');
        weekViewBtn.classList.remove('active');
        monthViewBtn.classList.remove('active');
        
        if (view === 'day') dayViewBtn.classList.add('active');
        else if (view === 'week') weekViewBtn.classList.add('active');
        else monthViewBtn.classList.add('active');
        
        renderCalendar();
    }
    
    function navigatePeriod(direction) {
        if (currentView === 'day') {
            currentDate.setDate(currentDate.getDate() + direction);
        } else if (currentView === 'week') {
            currentDate.setDate(currentDate.getDate() + (7 * direction));
        } else { // month
            currentDate.setMonth(currentDate.getMonth() + direction);
        }
        renderCalendar();
    }
    
    function goToToday() {
        currentDate = new Date();
        renderCalendar();
    }
    
    function renderCalendar() {
        // Update current period display
        updatePeriodDisplay();
        
        // Load tasks and render them on the calendar
        fetch('/api/tasks')
            .then(response => response.json())
            .then(tasks => {
                calendarView.innerHTML = '';
                
                if (currentView === 'day') {
                    renderDayView(tasks);
                } else if (currentView === 'week') {
                    renderWeekView(tasks);
                } else {
                    renderMonthView(tasks);
                }
            })
            .catch(error => {
                console.error('Error loading tasks:', error);
                calendarView.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Failed to load tasks</p>
                    </div>
                `;
            });
    }
    
    function updatePeriodDisplay() {
        if (currentView === 'day') {
            currentPeriodEl.textContent = formatDate(currentDate, 'full');
        } else if (currentView === 'week') {
            const weekStart = new Date(currentDate);
            weekStart.setDate(currentDate.getDate() - currentDate.getDay());
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            currentPeriodEl.textContent = `${formatDate(weekStart, 'short')} - ${formatDate(weekEnd, 'short')}`;
        } else { // month
            currentPeriodEl.textContent = formatDate(currentDate, 'month');
        }
    }
    
    function renderDayView(tasks) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        // Filter tasks for this day
        const dayTasks = tasks.filter(task => {
            if (!task.dueAt) return false;
            const dueDate = new Date(task.dueAt);
            return dueDate >= dayStart && dueDate <= dayEnd;
        });
        
        // Sort tasks by due time
        dayTasks.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
        
        // Create time slots
        let html = `<div class="day-view">`;
        
        if (dayTasks.length === 0) {
            html += `<div class="no-tasks">No tasks scheduled for today</div>`;
        } else {
            dayTasks.forEach(task => {
                const dueDate = new Date(task.dueAt);
                const timeStr = formatTime(dueDate);
                
                html += `
                    <div class="day-task ${task.completedAt ? 'completed' : ''}">
                        <div class="day-task-time">${timeStr}</div>
                        <div class="day-task-text">${task.text}</div>
                    </div>
                `;
            });
        }
        
        html += `</div>`;
        calendarView.innerHTML = html;
    }
    
    function renderWeekView(tasks) {
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        // Filter tasks for this week
        const weekTasks = tasks.filter(task => {
            if (!task.dueAt) return false;
            const dueDate = new Date(task.dueAt);
            return dueDate >= weekStart && dueDate <= weekEnd;
        });
        
        // Group tasks by day
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        let html = `<div class="week-view">`;
        
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + i);
            
            const dayTasks = weekTasks.filter(task => {
                const dueDate = new Date(task.dueAt);
                return dueDate.getDay() === dayDate.getDay();
            });
            
            html += `
                <div class="week-day">
                    <div class="week-day-header">${days[i]} (${dayDate.getDate()})</div>
                    <div class="week-day-tasks">
                        ${dayTasks.length === 0 ? 
                            '<div class="no-tasks">No tasks</div>' : 
                            dayTasks.map(task => `
                                <div class="week-task ${task.completedAt ? 'completed' : ''}">
                                    <div class="week-task-time">${formatTime(new Date(task.dueAt))}</div>
                                    <div class="week-task-text">${task.text}</div>
                                </div>
                            `).join('')}
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        calendarView.innerHTML = html;
    }
    
    function renderMonthView(tasks) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        // Get first day of month (0-6, Sunday-Saturday)
        const firstDay = new Date(year, month, 1).getDay();
        
        // Get number of days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Get number of days from previous month to show
        const daysFromPrevMonth = firstDay;
        
        // Get number of days from next month to show (to complete the grid)
        const totalCells = Math.ceil((daysInMonth + daysFromPrevMonth) / 7) * 7;
        const daysFromNextMonth = totalCells - daysInMonth - daysFromPrevMonth;
        
        // Create date ranges for filtering tasks
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        
        // Filter tasks for this month
        const monthTasks = tasks.filter(task => {
            if (!task.dueAt) return false;
            const dueDate = new Date(task.dueAt);
            return dueDate >= monthStart && dueDate <= monthEnd;
        });
        
        // Group tasks by day
        const tasksByDay = {};
        monthTasks.forEach(task => {
            const dueDate = new Date(task.dueAt);
            const day = dueDate.getDate();
            
            if (!tasksByDay[day]) {
                tasksByDay[day] = [];
            }
            tasksByDay[day].push(task);
        });
        
        // Create calendar grid
        let html = `<div class="month-view">`;
        
        // Weekday headers
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        html += `<div class="month-weekdays">`;
        weekdays.forEach(day => {
            html += `<div class="month-weekday">${day}</div>`;
        });
        html += `</div>`;
        
        // Days grid
        html += `<div class="month-days">`;
        
        // Days from previous month (grayed out)
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = daysFromPrevMonth - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            html += `<div class="month-day other-month">${day}</div>`;
        }
        
        // Days of current month
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const hasTasks = tasksByDay[day] && tasksByDay[day].length > 0;
            const isToday = today.getFullYear() === year && 
                            today.getMonth() === month && 
                            today.getDate() === day;
            
            html += `
                <div class="month-day ${isToday ? 'today' : ''}">
                    <div class="month-day-number">${day}</div>
                    ${hasTasks ? 
                        `<div class="month-day-tasks">
                            ${tasksByDay[day].map(task => `
                                <div class="month-task ${task.completedAt ? 'completed' : ''}" 
                                    title="${formatTime(new Date(task.dueAt))} ${task.text}">
                                    ${formatTime(new Date(task.dueAt))} ${task.text}
                                </div>
                            `).join('')}
                        </div>` : ''}
                </div>
            `;
        }
        
        // Days from next month (grayed out)
        for (let day = 1; day <= daysFromNextMonth; day++) {
            html += `<div class="month-day other-month">${day}</div>`;
        }
        
        html += `</div></div>`;
        calendarView.innerHTML = html;
    }
    
    // Helper functions
    function formatDate(date, format) {
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        
        if (format === 'short') {
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } else if (format === 'month') {
            return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
        } else { // full
            return date.toLocaleDateString(undefined, options);
        }
    }
    
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    function isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }
    
    // Reused from app.js
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
});
