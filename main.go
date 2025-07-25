package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

//go:embed static templates
var content embed.FS

// CycleDurations maps cycle string values to time.Duration values
var CycleDurations = map[string]time.Duration{
	"1h":  1 * time.Hour,
	"4h":  4 * time.Hour,
	"12h": 12 * time.Hour,
	"1d":  24 * time.Hour,
	"3d":  72 * time.Hour,
	"1w":  7 * 24 * time.Hour,
	"1m":  30 * 24 * time.Hour,
	"3m":  90 * 24 * time.Hour,
	"":    0,
}

// For SSE
var (
	clients   = make(map[chan string]bool)
	clientMux = sync.Mutex{}
)

type Task struct {
	ID          string     `json:"id"`
	Text        string     `json:"text"`
	CreatedAt   time.Time  `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	Cycle       string     `json:"cycle"` // Keep the cycle value for frontend display
	DueAt       *time.Time `json:"dueAt,omitempty"`
}

type TaskStore struct {
	Tasks  []*Task `json:"tasks"`
	mutex  sync.RWMutex
	dbPath string
}

func NewTaskStore(dbPath string) (*TaskStore, error) {
	store := &TaskStore{
		Tasks:  []*Task{},
		dbPath: dbPath,
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Try to load existing tasks
	if _, err := os.Stat(dbPath); err == nil {
		data, err := os.ReadFile(dbPath)
		if err != nil {
			return nil, err
		}

		if len(data) > 0 {
			var storedData struct {
				Tasks []*Task `json:"tasks"`
			}
			if err := json.Unmarshal(data, &storedData); err != nil {
				log.Printf("Error parsing existing tasks file: %v. Starting with empty task list.", err)
			} else {
				store.Tasks = storedData.Tasks
			}
		}
	}

	// Save to ensure the file exists with proper structure
	if err := store.Save(); err != nil {
		return nil, err
	}
	notifyClients()
	return store, nil
}

// Save saves the tasks to the JSON file
func (ts *TaskStore) Save() error {
	data, err := json.MarshalIndent(map[string]interface{}{
		"tasks": ts.Tasks,
	}, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(ts.dbPath, data, 0644)
}

// calculateDueAt calculates the due time based on the cycle string
func calculateDueAt(createdAt time.Time, cycle string) *time.Time {
	if cycle == "" {
		return nil // No due date for tasks without cycles
	}

	duration, exists := CycleDurations[cycle]
	if !exists {
		// Default to 1 day if cycle is not recognized
		duration = 24 * time.Hour
	}

	if duration == 0 {
		return nil
	}

	dueTime := createdAt.Add(duration)
	return &dueTime
}

// AddTask adds a new task
func (ts *TaskStore) AddTask(text string, cycle string) (*Task, error) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	createdAt := time.Now()
	dueAt := calculateDueAt(createdAt, cycle)

	task := &Task{
		ID:        uuid.New().String(),
		Text:      text,
		CreatedAt: createdAt,
		Cycle:     cycle,
		DueAt:     dueAt,
	}

	ts.Tasks = append(ts.Tasks, task)

	if err := ts.Save(); err != nil {
		return nil, err
	}
	notifyClients()
	return task, nil
}

// GetAllTasks returns all tasks
func (ts *TaskStore) GetAllTasks() []*Task {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()

	tasksCopy := make([]*Task, len(ts.Tasks))
	copy(tasksCopy, ts.Tasks)

	return tasksCopy
}

// UpdateTaskStatus toggles task completion status
func (ts *TaskStore) UpdateTaskStatus(id string, complete bool) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	for _, task := range ts.Tasks {
		if task.ID == id {
			if task.CompletedAt != nil {
				task.CompletedAt = nil
			} else if complete {
				now := time.Now()
				task.CompletedAt = &now
			} else {
				task.CompletedAt = nil
			}
			err := ts.Save()
			if err == nil {
				notifyClients()
			}
			return err
		}
	}

	return fmt.Errorf("task not found")
}

// DeleteTask removes a task
func (ts *TaskStore) DeleteTask(id string) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	for i, task := range ts.Tasks {
		if task.ID == id {
			ts.Tasks = append(ts.Tasks[:i], ts.Tasks[i+1:]...)
			err := ts.Save()
			if err == nil {
				notifyClients()
			}
			return err
		}
	}

	return fmt.Errorf("task not found")
}

// Handle list all tasks
func handleListTasks(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		tasks := store.GetAllTasks()
		json.NewEncoder(w).Encode(tasks)
	}
}

// Handle add task
func handleAddTask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			Text  string `json:"text"`
			Cycle string `json:"cycle"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.Text == "" {
			http.Error(w, "Task text cannot be empty", http.StatusBadRequest)
			return
		}

		task, err := store.AddTask(data.Text, data.Cycle)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(task)
	}
}

// Handle delete task
func handleDeleteTask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			ID string `json:"id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.ID == "" {
			http.Error(w, "Task ID cannot be empty", http.StatusBadRequest)
			return
		}

		if err := store.DeleteTask(data.ID); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

// Handle complete task
func handleCompleteTask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			ID string `json:"id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.ID == "" {
			http.Error(w, "Task ID cannot be empty", http.StatusBadRequest)
			return
		}

		if err := store.UpdateTaskStatus(data.ID, true); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func handleTaskUpdates(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	messageChan := make(chan string)

	clientMux.Lock()
	clients[messageChan] = true
	clientMux.Unlock()

	defer func() {
		clientMux.Lock()
		delete(clients, messageChan)
		clientMux.Unlock()
		close(messageChan)
	}()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-messageChan:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			w.(http.Flusher).Flush()
		}
	}
}

func notifyClients() {
	clientMux.Lock()
	defer clientMux.Unlock()

	for client := range clients {
		select {
		case client <- "update":
		default:
		}
	}
}

func main() {
	log.Println("Starting deku task tracker...")
	store, err := NewTaskStore("data/tasks.json")
	if err != nil {
		log.Fatalf("Failed to create task store: %v", err)
	}

	http.HandleFunc("/api/tasks", handleListTasks(store))
	http.HandleFunc("/api/task/add", handleAddTask(store))
	http.HandleFunc("/api/task/delete", handleDeleteTask(store))
	http.HandleFunc("/api/task/complete", handleCompleteTask(store))

	// Serve static files from embedded filesystem
	staticFS, err := fs.Sub(content, "static")
	if err != nil {
		log.Fatalf("Failed to create static sub-filesystem: %v", err)
	}
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))

	// API for SSE updates
	http.HandleFunc("/api/updates", handleTaskUpdates)

	http.HandleFunc("/", serveEmbeddedTemplate("templates/home.html"))
	http.HandleFunc("/kanban", serveEmbeddedTemplate("templates/kanban.html"))
	http.HandleFunc("/calendar", serveEmbeddedTemplate("templates/calendar.html"))

	// Start the server
	log.Println("Server listening on port 8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// Helper function to serve HTML templates from embedded filesystem
func serveEmbeddedTemplate(templatePath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := content.ReadFile(templatePath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Could not read template file: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	}
}
